import { GreenApiError, GreenApiErrorCode } from './errors';
import {
  httpError,
  parseJson,
  responseError,
  send,
  statusFalseError,
  type TransportContext,
} from './http';
import { maskToken } from './mask';
import type {
  DeleteNotificationResult,
  GreenApiClientConfig,
  InstanceSettings,
  RawReceivedNotification,
  ReceiveOptions,
  RequestOptions,
  StateInstanceResult,
} from './clientTypes';
import {
  DEFAULT_API_URL,
  MAX_MESSAGE_LENGTH,
  RECEIVE_HTTP_TIMEOUT_MS,
  RECEIVE_TIMEOUT_MARGIN_MS,
  RECEIVE_TIMEOUT_SEC,
  REQUEST_TIMEOUT_MS,
  RETRY_AFTER_MAX_MS,
  SEND_RATE_LIMIT_RETRY_DELAYS_MS,
  DELETE_RETRY_DELAYS_MS,
} from './constants';
import { toCheckAccountPhone } from './phone';
import type { CheckAccountResponse, SendMessageRequest, SendMessageResponse } from './types';
import {
  buildMaskedUrl,
  buildMethodUrl,
  normalizeApiUrl,
  validateApiUrl,
  validateCredentials,
  type BuildUrlParams,
  type GreenApiMethod,
} from './url';

/** Параметры sendMessage — контракт `SendMessageRequest` (§5.2). */
export type SendMessageParams = SendMessageRequest;

/** Публичный интерфейс клиента (6 методов §5.2). Все методы принимают AbortSignal. */
export interface GreenApiClient {
  readonly apiUrl: string;
  readonly idInstance: string;
  /** GET getStateInstance → `{stateInstance}` (§4.1 п. 1.3). */
  getStateInstance(options?: RequestOptions): Promise<StateInstanceResult>;
  /** GET getSettings → настройки для П-1…П-5 (§4.1). */
  getSettings(options?: RequestOptions): Promise<InstanceSettings>;
  /** POST checkAccount `{phoneNumber: <integer>}`; номер — уже нормализованный (Р-10): 7XXXXXXXXXX или 375XXXXXXXXX. */
  checkAccount(
    phoneNumber: string | number,
    options?: RequestOptions,
  ): Promise<Required<CheckAccountResponse>>;
  /**
   * POST sendMessage `{chatId, message}`; `@c.us` запрещён. 429 — до 3 автоповторов
   * (min(Retry-After, 30 с) или 1 → 2 → 4 с); прочие ошибки — без автоповтора (ВА-8).
   */
  sendMessage(params: SendMessageParams, options?: RequestOptions): Promise<SendMessageResponse>;
  /** GET receiveNotification?receiveTimeout=N → уведомление или `null` («пустой ответ», §5.2). */
  receiveNotification(options?: ReceiveOptions): Promise<RawReceivedNotification | null>;
  /** DELETE deleteNotification/{receiptId}; «уже удалено» → `alreadyDeleted: true` без исключения (§5.4). */
  deleteNotification(
    receiptId: number,
    options?: RequestOptions,
  ): Promise<DeleteNotificationResult>;
  /**
   * Закрыть сессию (выход / смена учётных данных, EC-S7): прервать все запросы и паузы повторов,
   * отбрасывать поздние ответы (`SESSION_CLOSED`), новые вызовы — сразу `SESSION_CLOSED`.
   * Идемпотентно. Для новых учётных данных создаётся новый клиент.
   */
  close(): void;
  /** `true` после `close()`. */
  isClosed(): boolean;
  toString(): string;
  toJSON(): { apiUrl: string; idInstance: string; apiTokenInstance: string };
}

const INSPECT = Symbol.for('nodejs.util.inspect.custom');

/** `{"receiptId": <int>` в самом начале тела — для удаления уведомления с битым JSON (§5.4, ВА-18). */
const LEADING_RECEIPT_ID = /^\s*\{\s*"receiptId"\s*:\s*(\d{1,15})(?![\d.eE])/;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function invalidArgument(
  method: GreenApiMethod | 'client',
  reason: string,
  code: GreenApiErrorCode = GreenApiErrorCode.INVALID_ARGUMENT,
): GreenApiError {
  return new GreenApiError({ code, method, retry: 'none', reason });
}

/** Длина текста для лимита 4000 — `text.length` (UTF-16, emoji = 2), п. 3.5 (ВА-14). */
export function messageLength(text: string): number {
  return text.length;
}

/** Проверка chatId для sendMessage (§5.5): только цифры личного чата. Возвращает текст проблемы или null. */
export function validateSendChatId(chatId: unknown): string | null {
  if (typeof chatId !== 'string' || chatId.length === 0) return 'chatId must be a non-empty string';
  if (chatId.includes('@'))
    return "chatId with '@' (e.g. phone@c.us) is forbidden: use chatId from checkAccount (TZ §5.5, R-26)";
  if (!/^\d{1,20}$/.test(chatId))
    return 'chatId must contain only digits (personal chats only; groups/channels are out of scope)';
  return null;
}

/**
 * chatId из ответа checkAccount (п. 2.6, EC-I9): непустая строка `^-?\d+$`.
 * Не строка (в том числе число), `…@c.us`, нецифровые символы — `false`.
 */
export function isCheckAccountChatId(chatId: unknown): chatId is string {
  return typeof chatId === 'string' && /^-?\d+$/.test(chatId);
}

/**
 * Создаёт клиент. Токен хранится только в замыкании: у объекта клиента нет
 * поля с токеном, `toString`/`toJSON`/`util.inspect` возвращают `***`.
 */
export function createGreenApiClient(config: GreenApiClientConfig): GreenApiClient {
  const credsIn = { ...config, apiUrl: config.apiUrl ?? DEFAULT_API_URL };
  const problem = validateCredentials(credsIn);
  if (problem) throw invalidArgument('client', problem);

  const checkedUrl = validateApiUrl(credsIn.apiUrl);
  const apiUrl = checkedUrl.ok ? checkedUrl.apiUrl : normalizeApiUrl(credsIn.apiUrl);
  const idInstance = config.idInstance;
  const creds = { apiUrl, idInstance, apiTokenInstance: config.apiTokenInstance };
  const defaultTimeout = config.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const allowed = config.allowedChatIds ? new Set(config.allowedChatIds) : null;
  const fetchImpl =
    config.fetch ??
    ((input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init));
  const timers = config.timers ?? {
    setTimeout: (fn: () => void, ms: number) => globalThis.setTimeout(fn, ms),
    clearTimeout: (id: unknown) => {
      globalThis.clearTimeout(id as ReturnType<typeof globalThis.setTimeout>);
    },
  };
  const sleep =
    config.sleep ??
    ((ms: number, signal?: AbortSignal) =>
      new Promise<void>((resolve, reject) => {
        if (signal?.aborted) {
          reject(new Error('aborted'));
          return;
        }
        const onAbort = () => {
          timers.clearTimeout(id);
          reject(new Error('aborted'));
        };
        const id = timers.setTimeout(() => {
          signal?.removeEventListener('abort', onAbort);
          resolve();
        }, ms);
        signal?.addEventListener('abort', onAbort, { once: true });
      }));
  const sessionCtrl = new AbortController();
  const ctx: TransportContext = {
    fetch: fetchImpl,
    apiUrl,
    secret: config.apiTokenInstance,
    logger: config.logger,
    timers,
    session: sessionCtrl.signal,
  };

  async function call(
    method: GreenApiMethod,
    http: 'GET' | 'POST' | 'DELETE',
    options: RequestOptions | undefined,
    extra: { body?: unknown; url?: BuildUrlParams; timeoutMs?: number } = {},
  ) {
    const url = buildMethodUrl(creds, method, extra.url);
    const maskedUrl = buildMaskedUrl(creds, method, extra.url);
    const res = await send(ctx, {
      method,
      http,
      url,
      maskedUrl,
      body: extra.body,
      timeoutMs: extra.timeoutMs ?? options?.timeoutMs ?? defaultTimeout,
      signal: options?.signal,
    });
    return { res, req: { method, maskedUrl } };
  }

  /**
   * Встроенные повторы (sendMessage 429, deleteNotification). Пауза — через `sleep`,
   * отмена `signal` во время паузы → ABORTED. `attempts` у итоговой ошибки — число попыток.
   */
  async function withRetries<T>(
    attempt: () => Promise<T>,
    isRetryable: (e: GreenApiError) => boolean,
    delays: readonly number[],
    signal: AbortSignal | undefined,
    delayFor: (e: GreenApiError, i: number) => number = (_e, i) => delays[i] ?? 0,
  ): Promise<T> {
    for (let i = 0; ; i++) {
      try {
        return await attempt();
      } catch (e) {
        if (!(e instanceof GreenApiError)) throw e;
        e.attempts = i + 1;
        if (i >= delays.length || !isRetryable(e)) throw e;
        const ms = delayFor(e, i);
        config.logger?.debug?.('GREEN-API retry', {
          method: e.method,
          code: e.code,
          attempt: i + 1,
          delayMs: ms,
        });
        // Пауза прерывается и внешним signal, и close() клиента.
        const pause = new AbortController();
        const stop = () => {
          pause.abort();
        };
        if (signal?.aborted || sessionCtrl.signal.aborted) stop();
        signal?.addEventListener('abort', stop, { once: true });
        sessionCtrl.signal.addEventListener('abort', stop, { once: true });
        try {
          await sleep(ms, pause.signal);
        } catch {
          const closed = sessionCtrl.signal.aborted;
          const aborted = new GreenApiError({
            code: closed ? GreenApiErrorCode.SESSION_CLOSED : GreenApiErrorCode.ABORTED,
            method: e.method,
            retry: 'none',
            reason: closed ? 'client closed during retry pause' : 'aborted during retry pause',
            apiUrl,
            attempts: i + 1,
            ...(e.maskedUrl !== undefined ? { maskedUrl: e.maskedUrl } : {}),
          });
          throw aborted;
        } finally {
          signal?.removeEventListener('abort', stop);
          sessionCtrl.signal.removeEventListener('abort', stop);
        }
        if (sessionCtrl.signal.aborted)
          throw new GreenApiError({
            code: GreenApiErrorCode.SESSION_CLOSED,
            method: e.method,
            retry: 'none',
            reason: 'client closed during retry pause',
            apiUrl,
            attempts: i + 1,
          });
      }
    }
  }

  /** Общий путь: 2xx + непустой JSON-объект, иначе типизированная ошибка. */
  async function callJson(
    method: GreenApiMethod,
    http: 'GET' | 'POST' | 'DELETE',
    options: RequestOptions | undefined,
    extra: { body?: unknown } = {},
  ) {
    const { res, req } = await call(method, http, options, extra);
    if (res.status < 200 || res.status >= 300) throw httpError(ctx, req, res);
    if (!res.text.trim())
      throw responseError(
        ctx,
        req,
        GreenApiErrorCode.UNEXPECTED_RESPONSE,
        res.status,
        'empty body',
      );
    const parsed = parseJson(res.text);
    if (!parsed.ok)
      throw responseError(ctx, req, GreenApiErrorCode.INVALID_JSON, res.status, 'body is not JSON');
    const sf = statusFalseError(ctx, req, res.status, parsed.value);
    if (sf) throw sf;
    if (!isRecord(parsed.value))
      throw responseError(
        ctx,
        req,
        GreenApiErrorCode.UNEXPECTED_RESPONSE,
        res.status,
        'body is not an object',
      );
    return { value: parsed.value, req, status: res.status };
  }

  async function deleteOnce(
    receiptId: number,
    options: RequestOptions | undefined,
  ): Promise<DeleteNotificationResult> {
    const { res, req } = await call('deleteNotification', 'DELETE', options, {
      url: { pathSuffix: [receiptId] },
    });
    // 500 «…findUnAckedMessage…» — уведомление не найдено: считать удалённым (§5.4).
    if (res.status >= 500 && res.text.includes('findUnAckedMessage')) {
      return {
        result: false,
        reason: 'notification not found (findUnAckedMessage)',
        alreadyDeleted: true,
      };
    }
    if (res.status < 200 || res.status >= 300) throw httpError(ctx, req, res);
    const parsed = parseJson(res.text);
    if (!parsed.ok)
      throw responseError(ctx, req, GreenApiErrorCode.INVALID_JSON, res.status, 'body is not JSON');
    const v = parsed.value;
    const sf = statusFalseError(ctx, req, res.status, v);
    if (sf) throw sf;
    if (!isRecord(v) || typeof v.result !== 'boolean') {
      throw responseError(
        ctx,
        req,
        GreenApiErrorCode.UNEXPECTED_RESPONSE,
        res.status,
        'missing result',
      );
    }
    const reason = typeof v.reason === 'string' ? v.reason : '';
    return { result: v.result, reason, alreadyDeleted: !v.result };
  }

  const client: GreenApiClient = {
    apiUrl,
    idInstance,

    async getStateInstance(options) {
      const { value, req, status } = await callJson('getStateInstance', 'GET', options);
      const state = value.stateInstance;
      if (typeof state !== 'string' || !state)
        throw responseError(
          ctx,
          req,
          GreenApiErrorCode.UNEXPECTED_RESPONSE,
          status,
          'missing stateInstance',
        );
      return { stateInstance: state };
    },

    async getSettings(options) {
      const { value } = await callJson('getSettings', 'GET', options);
      return { ...value };
    },

    async checkAccount(phoneNumber, options) {
      const phone = toCheckAccountPhone(phoneNumber);
      if (phone === null)
        throw invalidArgument(
          'checkAccount',
          'phoneNumber must be 7XXXXXXXXXX (11 digits) or 375XXXXXXXXX (12 digits)',
        );
      const { value, req, status } = await callJson('checkAccount', 'POST', options, {
        body: { phoneNumber: phone },
      });
      const exist = value.exist;
      if (typeof exist !== 'boolean')
        throw responseError(
          ctx,
          req,
          GreenApiErrorCode.UNEXPECTED_RESPONSE,
          status,
          'missing exist',
        );
      const fromCache = value.fromCache === true;
      if (!exist) return { exist: false, chatId: '', fromCache };
      // п. 2.6 (ВА-7, EC-I9): chatId — только непустая строка из цифр (у групп — ведущий `-`).
      // Число, `@c.us`, буквы, пустая строка — неожиданный ответ: без кеша и без повтора.
      const chatId = value.chatId;
      if (!isCheckAccountChatId(chatId))
        throw responseError(
          ctx,
          req,
          GreenApiErrorCode.UNEXPECTED_RESPONSE,
          status,
          'exist=true with missing or malformed chatId',
        );
      return { exist: true, chatId, fromCache };
    },

    async sendMessage(params, options) {
      const chatProblem = validateSendChatId(params.chatId);
      if (chatProblem) throw invalidArgument('sendMessage', chatProblem);
      if (allowed && !allowed.has(params.chatId)) {
        throw invalidArgument(
          'sendMessage',
          'chatId is not in allowedChatIds',
          GreenApiErrorCode.CHAT_ID_NOT_ALLOWED,
        );
      }
      const message = params.message;
      if (typeof message !== 'string' || !message.trim())
        throw invalidArgument('sendMessage', 'message is empty');
      if (messageLength(message) > MAX_MESSAGE_LENGTH)
        throw invalidArgument(
          'sendMessage',
          `message is longer than ${MAX_MESSAGE_LENGTH} characters`,
        );
      // 429 — запрос отклонён, дубля нет: до 3 автоповторов (min(Retry-After, 30 с) или 1 → 2 → 4 с), ВА-8.
      // Прочие ошибки (сеть, таймаут, 499, 5xx, 466…) — сразу наверх, без автоповтора.
      const { value, req, status } = await withRetries(
        () =>
          callJson('sendMessage', 'POST', options, { body: { chatId: params.chatId, message } }),
        (e) => e.code === GreenApiErrorCode.RATE_LIMITED,
        SEND_RATE_LIMIT_RETRY_DELAYS_MS,
        options?.signal,
        // Retry-After прочитан → min(RA, 30 с); нет заголовка или не разобран → 1 → 2 → 4 с (EC-T7).
        (e, i) =>
          e.retryAfterMs !== undefined
            ? Math.min(e.retryAfterMs, RETRY_AFTER_MAX_MS)
            : (SEND_RATE_LIMIT_RETRY_DELAYS_MS[i] ?? 0),
      );
      const id = value.idMessage;
      // idMessage — строка; число принимаем только если оно точно представимо (§5.1).
      const idMessage =
        typeof id === 'string'
          ? id
          : typeof id === 'number' && Number.isSafeInteger(id)
            ? String(id)
            : '';
      if (!idMessage)
        throw responseError(
          ctx,
          req,
          GreenApiErrorCode.UNEXPECTED_RESPONSE,
          status,
          'missing idMessage',
        );
      return { idMessage };
    },

    async receiveNotification(options) {
      const receiveTimeout = options?.receiveTimeout ?? RECEIVE_TIMEOUT_SEC;
      if (!Number.isInteger(receiveTimeout) || receiveTimeout < 5 || receiveTimeout > 60) {
        throw invalidArgument('receiveNotification', 'receiveTimeout must be an integer 5..60');
      }
      // HTTP-таймаут всегда больше long-polling (анализ §3.5): не меньше receiveTimeout + 10 с.
      // По умолчанию RECEIVE_HTTP_TIMEOUT_MS (30 с); per-call/конфиг можно задать, но не меньше receiveTimeout + запас.
      const timeoutMs = Math.max(
        options?.timeoutMs ?? config.timeoutMs ?? RECEIVE_HTTP_TIMEOUT_MS,
        receiveTimeout * 1000 + RECEIVE_TIMEOUT_MARGIN_MS,
      );
      const { res, req } = await call('receiveNotification', 'GET', options, {
        url: { query: { receiveTimeout } },
        timeoutMs,
      });
      if (res.status < 200 || res.status >= 300) throw httpError(ctx, req, res);
      // «Пустой ответ»: пустое тело, null/ложное значение, нет receiptId (§5.2).
      if (!res.text.trim()) return null;
      const parsed = parseJson(res.text);
      if (!parsed.ok) {
        // receiptId — только ведущий ключ объекта (ВА-18): вложенный `"receiptId"` из body не берём.
        const m = LEADING_RECEIPT_ID.exec(res.text);
        // В лог — только код и длина тела (ВА-18).
        throw responseError(
          ctx,
          req,
          GreenApiErrorCode.INVALID_JSON,
          res.status,
          `body is not JSON (length ${res.text.length})`,
          m?.[1] ? Number(m[1]) : undefined,
        );
      }
      const v = parsed.value;
      // `{status:false, reason}` — ошибка при любом HTTP-коде (ВА-11).
      const sf = statusFalseError(ctx, req, res.status, v);
      if (sf) throw sf;
      if (!isRecord(v) || v.receiptId === undefined || v.receiptId === null) return null;
      const rid = v.receiptId;
      const receiptId =
        typeof rid === 'number'
          ? rid
          : typeof rid === 'string' && /^\d{1,15}$/.test(rid)
            ? Number(rid)
            : NaN;
      if (!Number.isSafeInteger(receiptId) || receiptId < 0) {
        throw responseError(
          ctx,
          req,
          GreenApiErrorCode.UNEXPECTED_RESPONSE,
          res.status,
          'invalid receiptId',
        );
      }
      return { receiptId, body: v.body };
    },

    async deleteNotification(receiptId, options) {
      if (!Number.isSafeInteger(receiptId) || receiptId < 0)
        throw invalidArgument('deleteNotification', 'receiptId must be a non-negative integer');
      // Сеть / таймаут / 429 / 499 / 5xx: до 3 повторов 1 → 2 → 4 с, затем ошибка наверх (§5.4, ВА-17).
      return withRetries(
        () => deleteOnce(receiptId, options),
        (e) =>
          e.code === GreenApiErrorCode.NETWORK ||
          e.code === GreenApiErrorCode.TIMEOUT ||
          e.code === GreenApiErrorCode.SERVER ||
          e.code === GreenApiErrorCode.RATE_LIMITED,
        DELETE_RETRY_DELAYS_MS,
        options?.signal,
      );
    },

    close() {
      sessionCtrl.abort();
    },
    isClosed() {
      return sessionCtrl.signal.aborted;
    },

    toString() {
      return `GreenApiClient(${apiUrl}, waInstance${idInstance}, token=${maskToken(config.apiTokenInstance)})`;
    },
    toJSON() {
      return { apiUrl, idInstance, apiTokenInstance: maskToken(config.apiTokenInstance) };
    },
  };

  Object.defineProperty(client, INSPECT, { value: () => client.toString(), enumerable: false });
  return Object.freeze(client);
}
