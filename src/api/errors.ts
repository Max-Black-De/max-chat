import type { QuotaSummary } from './quota';
import type { GreenApiMethod } from './url';

/**
 * Коды ошибок клиента (§5.4, §5.5). Один класс `GreenApiError` с полем `code`
 * + подкласс `GreenApiQuotaError` для 466. Сообщения ошибок — технические,
 * на английском, без токена; тексты для пользователя — в `messages.ts`.
 */
export const GreenApiErrorCode = {
  /** fetch упал: нет сети, DNS, CORS (§4.1 п. 1.5). */
  NETWORK: 'NETWORK',
  /** Сработал внутренний таймаут запроса (Р-20: 30 с). */
  TIMEOUT: 'TIMEOUT',
  /** Запрос отменён внешним AbortSignal (выход, размонтирование). */
  ABORTED: 'ABORTED',
  /**
   * Клиент закрыт (`close()`: выход / смена учётных данных). Запрос старой сессии прерван, а
   * поздний ответ отброшен — его нельзя обрабатывать и удалять (EC-S7, EC-P16).
   */
  SESSION_CLOSED: 'SESSION_CLOSED',
  /** Тело ответа 2xx — не JSON. */
  INVALID_JSON: 'INVALID_JSON',
  /** JSON корректный, но структура не та, что ожидается для метода. */
  UNEXPECTED_RESPONSE: 'UNEXPECTED_RESPONSE',
  /** 401 — неверный apiTokenInstance. */
  UNAUTHORIZED: 'UNAUTHORIZED',
  /** 403 — неверный idInstance или адрес API. */
  FORBIDDEN: 'FORBIDDEN',
  /** 403 `Your account is suspended` (sendMessage, §4.3 п. 3.6). */
  ACCOUNT_SUSPENDED: 'ACCOUNT_SUSPENDED',
  /** 400 / {status:false} `instance is starting or not authorized` / `instance in starting process`. */
  INSTANCE_NOT_READY: 'INSTANCE_NOT_READY',
  /** 400 `Instance account is expired…` (§4.1 п. 1.6, ВА-3). */
  INSTANCE_EXPIRED: 'INSTANCE_EXPIRED',
  /** 400 `Instance is deleted` (§4.1 п. 1.6, ВА-3). */
  INSTANCE_DELETED: 'INSTANCE_DELETED',
  /** 400 `…custom webhook url is set…` (receive/delete) — П-1. */
  WEBHOOK_URL_SET: 'WEBHOOK_URL_SET',
  /** Прочие 400 (`Validation failed…` и т. п.) — текст показывается пользователю. */
  BAD_REQUEST: 'BAD_REQUEST',
  /** 404 — неверный метод (баг клиента). */
  NOT_FOUND: 'NOT_FOUND',
  /** 429 — превышен лимит частоты. */
  RATE_LIMITED: 'RATE_LIMITED',
  /** 466 — квота тарифа (см. `GreenApiQuotaError.quota`, §5.5). */
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
  /** 469 или `User get contact info limit reached` — лимит проверок номеров. */
  CHECK_LIMIT: 'CHECK_LIMIT',
  /** 400 `check phone number timeout limit exceeded` — MAX не ответил вовремя (ВА-10). */
  CHECK_TIMEOUT: 'CHECK_TIMEOUT',
  /** 499 / 5xx. */
  SERVER: 'SERVER',
  /** Прочие неуспешные HTTP-коды. */
  HTTP: 'HTTP',
  /** Аргументы не прошли проверку на клиенте (запрос не отправлялся). */
  INVALID_ARGUMENT: 'INVALID_ARGUMENT',
  /** chatId не входит в `allowedChatIds` (запрос не отправлялся). */
  CHAT_ID_NOT_ALLOWED: 'CHAT_ID_NOT_ALLOWED',
} as const;

export type GreenApiErrorCode = (typeof GreenApiErrorCode)[keyof typeof GreenApiErrorCode];

/**
 * Рекомендация вызывающему коду (§5.4, §5.5):
 * - `backoff` — повтор с экспоненциальной паузой 1→2→4…30 с;
 * - `pause` — пауза 30 с и повтор (инстанс стартует / не авторизован);
 * - `none` — без автоповтора: 401/403, 466, любая ошибка sendMessage и checkAccount,
 *   deleteNotification после встроенных повторов, валидация, отмена.
 */
export type RetryHint = 'backoff' | 'pause' | 'none';

export interface GreenApiErrorInit {
  code: GreenApiErrorCode;
  method: GreenApiMethod | 'client';
  retry: RetryHint;
  httpStatus?: number;
  /** Текст причины от сервера/клиента — уже без токена и обрезанный. */
  reason?: string;
  /** URL запроса с `***` вместо токена. */
  maskedUrl?: string;
  /** Нормализованный apiUrl (без токена) — для текста «Не удалось связаться с {apiUrl}». */
  apiUrl?: string;
  /** Для INVALID_JSON в receiveNotification: receiptId, если удалось извлечь, чтобы удалить уведомление (§5.4). */
  receiptId?: number;
  /** Для 429: пауза из заголовка `Retry-After`, мс (если заголовок доступен браузеру и разобран). */
  retryAfterMs?: number;
  /** Сколько HTTP-попыток сделал клиент (с учётом встроенных повторов sendMessage/deleteNotification). */
  attempts?: number;
}

export class GreenApiError extends Error {
  override readonly name: string = 'GreenApiError';
  readonly code: GreenApiErrorCode;
  readonly method: GreenApiMethod | 'client';
  readonly retry: RetryHint;
  readonly httpStatus: number | undefined;
  readonly reason: string | undefined;
  readonly maskedUrl: string | undefined;
  readonly apiUrl: string | undefined;
  readonly receiptId: number | undefined;
  readonly retryAfterMs: number | undefined;
  attempts: number;

  constructor(init: GreenApiErrorInit) {
    const status = init.httpStatus !== undefined ? ` HTTP ${init.httpStatus}` : '';
    const reason = init.reason ? `: ${init.reason}` : '';
    super(`[${init.code}] ${init.method}${status}${reason}`);
    this.code = init.code;
    this.method = init.method;
    this.retry = init.retry;
    this.httpStatus = init.httpStatus;
    this.reason = init.reason;
    this.maskedUrl = init.maskedUrl;
    this.apiUrl = init.apiUrl;
    this.receiptId = init.receiptId;
    this.retryAfterMs = init.retryAfterMs;
    this.attempts = init.attempts ?? 1;
  }

  /** Безопасное представление для логов (без токена). */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      method: this.method,
      httpStatus: this.httpStatus,
      retry: this.retry,
      reason: this.reason,
      attempts: this.attempts,
      url: this.maskedUrl,
    };
  }
}

/**
 * «Сессия невалидна» (§5.4, ВА-3, ВА-4, ВА-19; EC-E2, EC-P13): 401, 403 (кроме
 * `Your account is suspended` на sendMessage), 400 `Instance account is expired…` /
 * `Instance is deleted`. Один класс для всех — вызывающий код (F2/F5) по `isSessionInvalidError`
 * останавливает опрос, очищает sessionStorage и выходит на экран входа; `code` остаётся
 * конкретным (UNAUTHORIZED / FORBIDDEN / ACCOUNT_SUSPENDED / INSTANCE_EXPIRED / INSTANCE_DELETED),
 * чтобы показать нужный текст. Автоповтора нет.
 */
export class GreenApiSessionError extends GreenApiError {
  override readonly name: string = 'GreenApiSessionError';
  readonly sessionInvalid = true as const;

  override toJSON(): Record<string, unknown> {
    return { ...super.toJSON(), sessionInvalid: true };
  }
}

/** Делает ли код с данным методом сессию невалидной (EC-P13). */
export function isSessionInvalidCode(
  code: GreenApiErrorCode,
  method: GreenApiMethod | 'client',
): boolean {
  switch (code) {
    case GreenApiErrorCode.UNAUTHORIZED:
    case GreenApiErrorCode.FORBIDDEN:
    case GreenApiErrorCode.INSTANCE_EXPIRED:
    case GreenApiErrorCode.INSTANCE_DELETED:
      return true;
    case GreenApiErrorCode.ACCOUNT_SUSPENDED:
      // 403 suspended на sendMessage — свой текст (п. 3.6), сессия жива; на прочих методах — как 403.
      return method !== 'sendMessage';
    default:
      return false;
  }
}

/** Создаёт `GreenApiSessionError` для кодов «сессия невалидна», иначе `GreenApiError`. */
export function createGreenApiError(init: GreenApiErrorInit): GreenApiError {
  return isSessionInvalidCode(init.code, init.method)
    ? new GreenApiSessionError({ ...init, retry: 'none' })
    : new GreenApiError(init);
}

/** 466: квота тарифа Developer (§5.5). У sendMessage и checkAccount автоповтора нет никогда. */
export class GreenApiQuotaError extends GreenApiError {
  override readonly name: string = 'GreenApiQuotaError';
  readonly quota: QuotaSummary;

  /**
   * `retry` по умолчанию `none`: у sendMessage и checkAccount автоповтора нет никогда (§5.5).
   * Для receiveNotification транспорт передаёт `backoff` (НФТ-5).
   */
  constructor(
    init: Omit<GreenApiErrorInit, 'code' | 'retry' | 'reason'> & { retry?: RetryHint },
    quota: QuotaSummary,
  ) {
    // description из тела 466 содержит чужие chatId — в reason не кладём (§5.5).
    const reason = `quota=${quota.kind} method=${quota.method ?? '?'} used=${quota.used ?? '?'} total=${quota.total ?? '?'}`;
    super({ ...init, code: GreenApiErrorCode.QUOTA_EXCEEDED, retry: init.retry ?? 'none', reason });
    this.quota = quota;
  }

  override toJSON(): Record<string, unknown> {
    return { ...super.toJSON(), quota: { ...this.quota } };
  }
}

export function isGreenApiError(e: unknown): e is GreenApiError {
  return e instanceof GreenApiError;
}

export function isQuotaError(e: unknown): e is GreenApiQuotaError {
  return e instanceof GreenApiQuotaError;
}

export function isSessionInvalidError(e: unknown): e is GreenApiSessionError {
  return e instanceof GreenApiSessionError;
}
