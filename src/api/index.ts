/**
 * api/ — тонкий клиент GREEN-API на `fetch` (задача F1, ТЗ §5).
 *
 * Будет содержать:
 * - построение URL `{apiUrl}/waInstance{idInstance}/{method}/{apiTokenInstance}` (без /v3),
 *   `credentials: 'omit'`, `Content-Type: application/json` для POST, без лишних заголовков;
 * - 6 методов: getStateInstance, getSettings, checkAccount, sendMessage,
 *   receiveNotification, deleteNotification (+ getChatHistory только для Д-7);
 * - маппинг ошибок §5.4 и разбор 466 / quotaExceeded §5.5 (без автоповтора);
 * - логгер, маскирующий сегмент токена в URL (НФТ-3, ОР-1 п. 1.10).
 *
 * Типы контракта — ./types, константы — ./constants.
 */
export type * from './types';
export * from './constants';
