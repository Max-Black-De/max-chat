/**
 * store/ — состояние приложения (задачи F2–F5, ТЗ Р-2, §6.3).
 *
 * Будет содержать:
 * - сессию: учётные данные — **только** в памяти и sessionStorage (Р-2, НФТ-3);
 * - чаты, сообщения (`messages[]` + индекс `chatId_idMessage → localId`) и кеш
 *   «номер → chatId» — в localStorage под ключами `maxchat:<idInstance>:…` (Р-2);
 * - reducer / actions: создание чата, оптимистичная отправка и слияние (§6.3),
 *   счётчики непрочитанных (ОР-5 п. 5.2), баннеры.
 *
 * Выбор реализации — Zustand с `persist` или Context + useReducer (Р-9) — за F3.
 * Токен в localStorage не пишется никогда.
 */

/** Префикс ключей localStorage (Р-2): `${STORAGE_PREFIX}:<idInstance>:<раздел>`. */
export const STORAGE_PREFIX = 'maxchat';
