import {
  GreenApiErrorCode,
  GreenApiQuotaError,
  createGreenApiError,
  isSessionInvalidCode,
  type GreenApiError,
  type RetryHint,
} from './errors';
import { redactSecret, truncate } from './mask';
import { parseQuota466Body } from './quota';
import type { GreenApiLogger, GreenApiTimers } from './clientTypes';
import type { GreenApiMethod } from './url';

/** Внутренний транспорт клиента: fetch + таймаут + AbortSignal + классификация ошибок. */

export interface TransportContext {
  fetch: typeof fetch;
  apiUrl: string;
  /** Нужен только для вычищения из текстов ответов. */
  secret: string;
  logger: GreenApiLogger | undefined;
  timers: GreenApiTimers;
  /** Сигнал сессии клиента: `close()` прерывает запросы, поздние ответы отбрасываются (EC-S7). */
  session: AbortSignal;
}

export interface TransportRequest {
  method: GreenApiMethod;
  http: 'GET' | 'POST' | 'DELETE';
  url: string;
  maskedUrl: string;
  body?: unknown;
  timeoutMs: number;
  signal: AbortSignal | undefined;
}

export interface TransportResponse {
  status: number;
  text: string;
  /** Значение `Retry-After`, если браузер его отдал (CORS: заголовок должен быть в Expose-Headers). */
  retryAfter: string | null;
}

/**
 * Рекомендация повтора для вызывающего кода (§5.4, §6.1 п. 2.4, НФТ-5, ВА-7, ВА-8, ВА-17):
 * - отмена (`ABORTED`, `SESSION_CLOSED`), «сессия невалидна» (401/403/expired/deleted) и
 *   проверки на клиенте — `none` для всех методов;
 * - sendMessage, checkAccount — никогда (`none`): 429 у sendMessage клиент уже повторил сам;
 * - «инстанс не готов» — `pause` (30 с), WEBHOOK_URL_SET (П-1) — `none` (опрос стоит до «Проверить снова»);
 * - deleteNotification — встроенные повторы уже сделаны, дальше — следующий receive (`none`);
 * - receiveNotification — **любая** прочая ошибка (404, прочие 400, 466, 469, неизвестные коды,
 *   сеть, 5xx, битый ответ) — `backoff`: опрос не должен тихо умирать (НФТ-5);
 * - getStateInstance, getSettings: сеть / таймаут / 429 / 499 / 5xx / битый ответ — `backoff`,
 *   прочее — `none`.
 */
export function retryHintFor(
  code: GreenApiErrorCode,
  method: GreenApiMethod | 'client',
): RetryHint {
  if (method === 'sendMessage' || method === 'checkAccount' || method === 'client') return 'none';
  switch (code) {
    case GreenApiErrorCode.ABORTED:
    case GreenApiErrorCode.SESSION_CLOSED:
    case GreenApiErrorCode.INVALID_ARGUMENT:
    case GreenApiErrorCode.CHAT_ID_NOT_ALLOWED:
    case GreenApiErrorCode.WEBHOOK_URL_SET:
      return 'none';
    case GreenApiErrorCode.INSTANCE_NOT_READY:
      return 'pause';
  }
  if (isSessionInvalidCode(code, method)) return 'none';
  if (method === 'deleteNotification') return 'none';
  if (method === 'receiveNotification') return 'backoff';
  switch (code) {
    case GreenApiErrorCode.RATE_LIMITED:
    case GreenApiErrorCode.NETWORK:
    case GreenApiErrorCode.TIMEOUT:
    case GreenApiErrorCode.SERVER:
    case GreenApiErrorCode.INVALID_JSON:
    case GreenApiErrorCode.UNEXPECTED_RESPONSE:
      return 'backoff';
    default:
      return 'none';
  }
}

/** Разбор `Retry-After`: секунды или HTTP-дата → мс; иначе undefined. */
export function parseRetryAfter(
  value: string | null,
  now: number = Date.now(),
): number | undefined {
  if (value === null) return undefined;
  const v = value.trim();
  if (/^\d+$/.test(v)) return Number(v) * 1000;
  // Отрицательные и дробные числа — невалидны (RFC 9110 §10.2.3), не принимать их за дату.
  if (/^[+-]?[\d.]+$/.test(v)) return undefined;
  const at = Date.parse(v);
  return Number.isNaN(at) ? undefined : Math.max(0, at - now);
}

function errorFor(
  ctx: TransportContext,
  req: Pick<TransportRequest, 'method' | 'maskedUrl'>,
  code: GreenApiErrorCode,
  extra: { httpStatus?: number; reason?: string; receiptId?: number; retryAfterMs?: number } = {},
): GreenApiError {
  return createGreenApiError({
    code,
    method: req.method,
    retry: retryHintFor(code, req.method),
    maskedUrl: req.maskedUrl,
    apiUrl: ctx.apiUrl,
    ...extra,
  });
}

export async function send(
  ctx: TransportContext,
  req: TransportRequest,
): Promise<TransportResponse> {
  const outer = req.signal;
  const session = ctx.session;
  // Функция, а не поле: значение меняется между await (TS сузил бы `session.aborted` до false).
  const isClosed = (): boolean => session.aborted;
  const closedError = () =>
    errorFor(ctx, req, GreenApiErrorCode.SESSION_CLOSED, { reason: 'client closed' });
  if (isClosed()) throw closedError();
  if (outer?.aborted)
    throw errorFor(ctx, req, GreenApiErrorCode.ABORTED, { reason: 'aborted before start' });

  const controller = new AbortController();
  let timedOut = false;
  const timer = ctx.timers.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, req.timeoutMs);
  const onOuterAbort = () => {
    controller.abort();
  };
  outer?.addEventListener('abort', onOuterAbort, { once: true });
  session.addEventListener('abort', onOuterAbort, { once: true });

  const started = Date.now();
  const init: RequestInit = { method: req.http, credentials: 'omit', signal: controller.signal };
  if (req.body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(req.body);
  }

  const failure = (phase: string): GreenApiError => {
    if (isClosed()) return closedError();
    if (outer?.aborted && !timedOut)
      return errorFor(ctx, req, GreenApiErrorCode.ABORTED, { reason: 'aborted by caller' });
    // Исходную ошибку fetch не прикладываем (cause): в некоторых средах её текст содержит URL с токеном.
    const err = timedOut
      ? errorFor(ctx, req, GreenApiErrorCode.TIMEOUT, {
          reason: `no response in ${req.timeoutMs} ms`,
        })
      : errorFor(ctx, req, GreenApiErrorCode.NETWORK, {
          reason: `network error or CORS (${phase})`,
        });
    ctx.logger?.warn?.('GREEN-API transport error', err.toJSON());
    return err;
  };

  try {
    let res: Response;
    try {
      res = await ctx.fetch(req.url, init);
    } catch {
      throw failure('request');
    }
    let text: string;
    try {
      text = await res.text();
    } catch {
      throw failure('body');
    }
    // Ответ пришёл после close() (fetch не уважил abort или успел раньше) — отбрасываем (EC-S7).
    if (isClosed()) throw closedError();
    ctx.logger?.debug?.('GREEN-API response', {
      method: req.method,
      http: req.http,
      url: req.maskedUrl,
      status: res.status,
      durationMs: Date.now() - started,
    });
    return { status: res.status, text, retryAfter: res.headers.get('Retry-After') };
  } finally {
    ctx.timers.clearTimeout(timer);
    outer?.removeEventListener('abort', onOuterAbort);
    session.removeEventListener('abort', onOuterAbort);
  }
}

// ---------- Разбор ответа ----------

export type ParsedJson = { ok: true; value: unknown } | { ok: false };

export function parseJson(text: string): ParsedJson {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false };
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Текст причины из тела ошибки: JSON-поля message/description/reason/error или сам текст. */
function extractReason(text: string, secret: string): string | undefined {
  let reason: string | undefined;
  const parsed = parseJson(text);
  if (parsed.ok && isRecord(parsed.value)) {
    for (const key of ['message', 'description', 'reason', 'error']) {
      const v = parsed.value[key];
      if (typeof v === 'string' && v.trim()) {
        reason = v;
        break;
      }
    }
  } else if (parsed.ok && typeof parsed.value === 'string') {
    reason = parsed.value;
  }
  reason ??= text;
  reason = reason.trim();
  return reason ? truncate(redactSecret(reason, secret)) : undefined;
}

/**
 * Классификация 400 / `{status:false, reason}` по тексту причины (§5.4, §4.2 п. 2.8).
 * Порядок важен: expired / deleted проверяются раньше широкого «not authorized», чтобы
 * «Instance account is expired… not authorized» не стал паузой вместо выхода (ВА-3).
 */
export function classifyReason(reason: string): GreenApiErrorCode {
  if (/custom webhook url is set/i.test(reason)) return GreenApiErrorCode.WEBHOOK_URL_SET;
  if (/account is expired/i.test(reason)) return GreenApiErrorCode.INSTANCE_EXPIRED;
  if (/instance is deleted/i.test(reason)) return GreenApiErrorCode.INSTANCE_DELETED;
  if (/instance (is starting|in starting process)|not authorized/i.test(reason))
    return GreenApiErrorCode.INSTANCE_NOT_READY;
  if (/get contact info limit reached/i.test(reason)) return GreenApiErrorCode.CHECK_LIMIT;
  if (/check phone number timeout limit exceeded/i.test(reason))
    return GreenApiErrorCode.CHECK_TIMEOUT;
  if (/account is suspended/i.test(reason)) return GreenApiErrorCode.ACCOUNT_SUSPENDED;
  return GreenApiErrorCode.BAD_REQUEST;
}

/** Ошибка для неуспешного HTTP-статуса (не 2xx). */
export function httpError(
  ctx: TransportContext,
  req: Pick<TransportRequest, 'method' | 'maskedUrl'>,
  res: TransportResponse,
): GreenApiError {
  const { status } = res;
  if (status === 466) {
    const parsed = parseJson(res.text);
    const quota = parseQuota466Body(parsed.ok ? parsed.value : undefined, req.method);
    ctx.logger?.warn?.('GREEN-API quota exceeded (466)', {
      method: req.method,
      url: req.maskedUrl,
      quota: { ...quota },
    });
    return new GreenApiQuotaError(
      {
        method: req.method,
        httpStatus: 466,
        maskedUrl: req.maskedUrl,
        apiUrl: ctx.apiUrl,
        // send/checkAccount — без автоповтора (§5.5); receive — backoff, опрос не умирает (НФТ-5).
        retry: retryHintFor(GreenApiErrorCode.QUOTA_EXCEEDED, req.method),
      },
      quota,
    );
  }
  const reason = extractReason(res.text, ctx.secret);
  const extra: { httpStatus: number; reason?: string; retryAfterMs?: number } = {
    httpStatus: status,
  };
  if (reason !== undefined) extra.reason = reason;
  let code: GreenApiErrorCode;
  if (status === 401) {
    // §5.4 (ВА-4): 401 — всегда «сессия невалидна», тело (`{status:false, reason:"not authorized"}`)
    // код не перекрывает.
    code = GreenApiErrorCode.UNAUTHORIZED;
  } else if (status === 403) {
    // §5.4 (ВА-19): 403 — «сессия невалидна»; исключение — `Your account is suspended` (на
    // sendMessage сессия жива, п. 3.6; на прочих методах ACCOUNT_SUSPENDED тоже невалидна).
    code =
      reason && /suspended/i.test(reason)
        ? GreenApiErrorCode.ACCOUNT_SUSPENDED
        : GreenApiErrorCode.FORBIDDEN;
  } else if (status === 400) {
    code = classifyReason(reason ?? '');
  } else {
    code = codeForOtherStatus(res, reason, extra);
  }
  const err = errorFor(ctx, req, code, extra);
  ctx.logger?.warn?.('GREEN-API error', err.toJSON());
  return err;
}

/**
 * Прочие коды (не 400/401/403/466). `{status:false, reason}` с известной причиной разбирается
 * и здесь (ВА-11: «тело разбирать при любом коде»), иначе — по HTTP-коду.
 */
function codeForOtherStatus(
  res: TransportResponse,
  reason: string | undefined,
  extra: { retryAfterMs?: number },
): GreenApiErrorCode {
  const { status } = res;
  const parsed = parseJson(res.text);
  if (parsed.ok && isRecord(parsed.value) && parsed.value.status === false && reason) {
    const byReason = classifyReason(reason);
    if (byReason !== GreenApiErrorCode.BAD_REQUEST) return byReason;
  }
  if (status === 404) return GreenApiErrorCode.NOT_FOUND;
  if (status === 429) {
    const ms = parseRetryAfter(res.retryAfter);
    if (ms !== undefined) extra.retryAfterMs = ms;
    return GreenApiErrorCode.RATE_LIMITED;
  }
  if (status === 469) return GreenApiErrorCode.CHECK_LIMIT;
  if (status === 499 || status >= 500) return GreenApiErrorCode.SERVER;
  return GreenApiErrorCode.HTTP;
}

/** Ошибка формата/структуры 2xx-ответа. */
export function responseError(
  ctx: TransportContext,
  req: Pick<TransportRequest, 'method' | 'maskedUrl'>,
  code: typeof GreenApiErrorCode.INVALID_JSON | typeof GreenApiErrorCode.UNEXPECTED_RESPONSE,
  httpStatus: number,
  reason: string,
  receiptId?: number,
): GreenApiError {
  const err = errorFor(
    ctx,
    req,
    code,
    receiptId !== undefined ? { httpStatus, reason, receiptId } : { httpStatus, reason },
  );
  // В лог — только тип проблемы, без текста тела (§5.4: «без токена и текста»).
  ctx.logger?.warn?.('GREEN-API bad response', err.toJSON());
  return err;
}

/** `{status:false, reason}` в 2xx-ответе (CheckAccount и др.) → ошибка по тексту причины. */
export function statusFalseError(
  ctx: TransportContext,
  req: Pick<TransportRequest, 'method' | 'maskedUrl'>,
  httpStatus: number,
  value: unknown,
): GreenApiError | null {
  if (!isRecord(value) || value.status !== false) return null;
  const raw = typeof value.reason === 'string' ? value.reason : '';
  const reason = truncate(redactSecret(raw, ctx.secret));
  const err = errorFor(ctx, req, classifyReason(reason), { httpStatus, reason });
  ctx.logger?.warn?.('GREEN-API error', err.toJSON());
  return err;
}
