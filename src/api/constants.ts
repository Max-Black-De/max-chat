/** Параметры API-контракта и опроса (ТЗ §5, Р-1, Р-20). */

/** Адрес API по умолчанию (Р-1). Может быть изменён после смоук-проверки A2. */
export const DEFAULT_API_URL = 'https://api.green-api.com';

/** `receiveTimeout` для receiveNotification, секунды (Р-20; допустимо 5…60). */
export const RECEIVE_TIMEOUT_SEC = 20;

/** Таймаут HTTP-запроса receiveNotification (AbortController), мс (Р-20, §6.1). */
export const RECEIVE_HTTP_TIMEOUT_MS = 30_000;

/** Максимальная длина текста сообщения [док SendMessage]; ТЗ §4.3 п. 3.5. */
export const MAX_MESSAGE_LENGTH = 4000;

/** Таймаут HTTP-запроса по умолчанию для остальных методов, мс (Р-20). С запасом на CORS-preflight POST/DELETE (~260 мс, A2). */
export const REQUEST_TIMEOUT_MS = 30_000;

/** Минимальный запас HTTP-таймаута receiveNotification сверх `receiveTimeout`, мс (анализ §3.5). */
export const RECEIVE_TIMEOUT_MARGIN_MS = 10_000;

/** Таймаут getSettings при входе: опрос стартует по ответу, ошибке или через 10 с (§4.1 п. 1.4, ВА-1). */
export const SETTINGS_TIMEOUT_MS = 10_000;

/** sendMessage при 429: до 3 автоповторов с паузами 1 → 2 → 4 с (п. 3.4, ВА-8). */
export const SEND_RATE_LIMIT_RETRY_DELAYS_MS: readonly number[] = [1_000, 2_000, 4_000];

/** Потолок паузы по `Retry-After`: пауза = min(Retry-After, 30 с) (п. 3.4, ВА-8, EC-T7). */
export const RETRY_AFTER_MAX_MS = 30_000;

/** deleteNotification при сети / таймауте / 429 / 499 / 5xx: до 3 повторов 1 → 2 → 4 с (§5.4, ВА-17). */
export const DELETE_RETRY_DELAYS_MS: readonly number[] = [1_000, 2_000, 4_000];
