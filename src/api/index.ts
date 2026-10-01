/**
 * api/ — клиент GREEN-API на `fetch` (задача F1, ТЗ §5). Чистый TypeScript, без React.
 *
 * - `createGreenApiClient` — 6 методов (§5.2), AbortSignal и таймаут у каждого вызова;
 * - ошибки `GreenApiError` / `GreenApiQuotaError` (§5.4, §5.5), без автоповтора;
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
  GreenApiErrorCode,
  isGreenApiError,
  isQuotaError,
} from './errors';
export type { RetryHint, GreenApiErrorInit } from './errors';
export { parseQuota466Body, parseQuotaExceededNotification } from './quota';
export type { QuotaSummary, QuotaSource } from './quota';
export { maskToken, maskUrl, redactSecret, TOKEN_MASK } from './mask';
export { buildMethodUrl, buildMaskedUrl, normalizeApiUrl, validateCredentials } from './url';
export type { GreenApiMethod, BuildUrlParams } from './url';
export {
  normalizePhone,
  isNormalizedPhone,
  toCheckAccountPhone,
  PHONE_FORMAT_ERROR,
} from './phone';
export {
  QUOTA_TEXTS,
  WEBHOOK_URL_SET_TEXT,
  quotaText,
  stateInstanceText,
  isLoginAllowed,
  describeError,
} from './messages';
export type { ErrorContext } from './messages';
