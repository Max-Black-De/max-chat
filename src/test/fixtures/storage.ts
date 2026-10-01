/**
 * EC-D8 (Р-2): данные для проверок сбоев localStorage.
 *
 * Схема разделов store — задача F3; здесь только префикс ключа по ТЗ Р-2
 * (`maxchat:<idInstance>:v1:…`) и заведомо испорченные значения. Имена разделов — [предложение],
 * сверить с F3.
 */
import { FOREIGN_ID_INSTANCE, ID_INSTANCE } from './constants';

export const STORAGE_KEY_PREFIX = `maxchat:${ID_INSTANCE}:v1:`;
export const FOREIGN_STORAGE_KEY_PREFIX = `maxchat:${FOREIGN_ID_INSTANCE}:v1:`;

/** Повреждённые значения раздела: каждое пропускается, раздел начинается пустым. */
export const corruptedStorageValues = {
  truncatedJson: '{"chats":[{"chatId":"10000000"',
  notJson: 'не json',
  jsonNull: 'null',
  jsonNumber: '42',
  jsonString: '"строка"',
  wrongShape: '{"chats":42}',
  emptyString: '',
} as const satisfies Record<string, string>;

/** Ключ старой схемы без версии — не читается как v1 (миграции в MVP нет). */
export const legacyStorageKey = `maxchat:${ID_INSTANCE}:chats`;

/**
 * Ошибки `setItem` для мока Storage: `QuotaExceededError` (переполнение) и
 * `SecurityError` (запрет хранилища в приватном режиме / политикой браузера).
 * Имена — как у `DOMException` в браузере.
 */
export const storageErrorNames = ['QuotaExceededError', 'SecurityError'] as const;
