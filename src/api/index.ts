/**
 * api/ — клиент GREEN-API на `fetch` (задача F1, ТЗ §5). Чистый TypeScript, без React.
 *
 * - `createGreenApiClient` — 6 методов (§5.2), AbortSignal и таймаут у каждого вызова;
 * - ошибки `GreenApiError` / `GreenApiQuotaError` (§5.4, §5.5); встроенные повторы только у
 *   sendMessage (429, до 3 раз) и deleteNotification (до 3 раз), ВА-8, ВА-17;
 * - маскирование токена во всех текстах ошибок и логах (НФТ-3, ОР-1 п. 1.10);
 * - чистые функции: URL, маскирование, разбор 466 / quotaExceeded, нормализация номера (Р-10),
 *   тексты для UI.
 *
 * Типы контракта — ./types, константы — ./constants, опции клиента — ./clientTypes.
 */
export type * from './types';
export type * from './clientTypes';
export * from './constants';
export { createGreenApiClient, validateSendChatId, messageLength } from './client';
export type { GreenApiClient, SendMessageParams } from './client';
export {
  GreenApiError,
  GreenApiQuotaError,
  GreenApiSessionError,
  GreenApiErrorCode,
  createGreenApiError,
  isGreenApiError,
  isQuotaError,
  isSessionInvalidCode,
  isSessionInvalidError,
} from './errors';
export type { RetryHint, GreenApiErrorInit } from './errors';
export { parseQuota466Body, parseQuotaExceededNotification } from './quota';
export type { QuotaSummary, QuotaSource } from './quota';
export { maskToken, maskUrl, redactSecret, TOKEN_MASK } from './mask';
export {
  buildMethodUrl,
  buildMaskedUrl,
  normalizeApiUrl,
  validateApiUrl,
  validateCredentials,
} from './url';
export type { GreenApiMethod, BuildUrlParams, ApiUrlValidation } from './url';
export { parseRetryAfter, retryHintFor } from './http';
export {
  normalizePhone,
  isNormalizedPhone,
  toCheckAccountPhone,
  PHONE_FORMAT_ERROR,
} from './phone';
export {
  LOGIN_FORM_TEXTS,
  AUTH_TEXTS,
  INSTANCE_TEXTS,
  BANNER_TEXTS,
  SETTINGS_TEXTS,
  CHECK_ACCOUNT_TEXTS,
  SEND_TEXTS,
  QUOTA_TEXTS,
  FALLBACK_TEXTS,
  SERVER_REASON_MAX,
  WEBHOOK_URL_SET_TEXT,
  unreachableText,
  shouldShowQuotaBanner,
  quotaText,
  stateInstanceText,
  isLoginAllowed,
  describeError,
} from './messages';
export type { ErrorContext } from './messages';
