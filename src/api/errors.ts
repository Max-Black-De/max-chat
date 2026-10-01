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
  /** 400 `Instance account is expired` / `Instance is deleted`. */
  INSTANCE_EXPIRED: 'INSTANCE_EXPIRED',
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
 * - `none` — без автоповтора (401/403, 466, sendMessage, валидация, отмена…).
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
      url: this.maskedUrl,
    };
  }
}

/** 466: квота тарифа Developer (§5.5). Автоповтора нет никогда. */
export class GreenApiQuotaError extends GreenApiError {
  override readonly name: string = 'GreenApiQuotaError';
  readonly quota: QuotaSummary;

  constructor(init: Omit<GreenApiErrorInit, 'code' | 'retry' | 'reason'>, quota: QuotaSummary) {
    // description из тела 466 содержит чужие chatId — в reason не кладём (§5.5).
    const reason = `quota=${quota.kind} method=${quota.method ?? '?'} used=${quota.used ?? '?'} total=${quota.total ?? '?'}`;
    super({ ...init, code: GreenApiErrorCode.QUOTA_EXCEEDED, retry: 'none', reason });
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
