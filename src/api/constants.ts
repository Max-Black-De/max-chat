/** Параметры API-контракта и опроса (ТЗ §5, Р-1, Р-20). */

/** Адрес API по умолчанию (Р-1). Может быть изменён после смоук-проверки A2. */
export const DEFAULT_API_URL = 'https://api.green-api.com';

/** `receiveTimeout` для receiveNotification, секунды (Р-20; допустимо 5…60). */
export const RECEIVE_TIMEOUT_SEC = 20;

/** Таймаут HTTP-запроса receiveNotification (AbortController), мс (Р-20, §6.1). */
export const RECEIVE_HTTP_TIMEOUT_MS = 30_000;

/** Максимальная длина текста сообщения [док SendMessage]; ТЗ §4.3 п. 3.5. */
export const MAX_MESSAGE_LENGTH = 4000;
