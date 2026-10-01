/**
 * polling/ — фоновый цикл receive → handle → delete (задача F5, ТЗ §6.1, Р-12, Р-20).
 *
 * Будет содержать:
 * - захват Web Lock `maxchat-poll-<idInstance>`; не захвачен → баннер «Чат открыт в другой
 *   вкладке», опрос не запускается;
 * - строго один receiveNotification в полёте (`receiveTimeout=20`, AbortController 30 с);
 * - delete после каждого уведомления, даже если обработчик бросил исключение;
 * - backoff 1 → 2 → 4 → … → 30 с при сети / 429 / 5xx; пауза 30 с при «instance is starting»;
 *   остановка при 401 и при заданном webhookUrl (П-1);
 * - остановка по выходу / размонтированию: abort() и освобождение lock.
 */

/** Префикс имени Web Lock опроса (Р-12): `${POLL_LOCK_PREFIX}${idInstance}`. */
export const POLL_LOCK_PREFIX = 'maxchat-poll-';

/** Экспоненциальная пауза при ошибках опроса: от 1 с до 30 с (Р-20). */
export const BACKOFF_INITIAL_MS = 1_000;
export const BACKOFF_MAX_MS = 30_000;

/** Пауза опроса при `instance is starting or not authorized` (§5.4). */
export const NOT_AUTHORIZED_PAUSE_MS = 30_000;
