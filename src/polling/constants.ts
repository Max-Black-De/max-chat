/** Префикс имени Web Lock опроса (Р-12): `${POLL_LOCK_PREFIX}${idInstance}`. */
export const POLL_LOCK_PREFIX = 'maxchat-poll-';

/** Экспоненциальная пауза при ошибках опроса: от 1 с до 30 с (Р-20). */
export const BACKOFF_INITIAL_MS = 1_000;
export const BACKOFF_MAX_MS = 30_000;

/** Пауза опроса при `instance is starting or not authorized` (§5.4). */
export const NOT_AUTHORIZED_PAUSE_MS = 30_000;
