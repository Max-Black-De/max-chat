/**
 * store/ — состояние приложения (ТЗ Р-2, Р-9, §6.3).
 *
 * F2: сессия (`session.ts` — чистый редьюсер, `sessionController.ts` — эффекты), учётные
 * данные в sessionStorage (`sessionCredentials.ts`), общая обёртка localStorage с версией схемы
 * и режимами «только память» / «только чтение» (`storage.ts`), восстановление «отправляется»
 * (`sendingRecovery.ts`). Чаты, сообщения и кеш «номер → chatId» — F3–F5 поверх `AppStorage`.
 *
 * Стор (Р-9): Context + `useReducer` (обоснование — README.md рядом). Токен в localStorage
 * не пишется никогда.
 */
export { STORAGE_PREFIX } from './constants';
export * from './session';
export * from './sessionController';
export * from './sessionCredentials';
export * from './storage';
export * from './loginForm';
export * from './sendingRecovery';
export * from './texts';
export * from './chats';
export * from './chatsStorage';
export * from './messagesStorage';
export * from './newChat';
export * from './phoneFormat';
export * from './privacy';
