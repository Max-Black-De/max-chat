/**
 * polling/ — фоновый цикл receive → handle → delete (задача F5, ТЗ §6.1, Р-12, Р-20).
 *
 * - `runPollLoop` — строго один receiveNotification в полёте (`receiveTimeout=20`, таймаут
 *   запроса 30 с — в клиенте F1); delete после каждого уведомления, даже если обработчик бросил
 *   исключение; backoff 1 → 2 → 4 → … → 30 с при сети / 429 / 5xx; пауза 30 с при
 *   «instance is starting»; остановка при 401/403 и при заданном webhookUrl (П-1); отмена по
 *   выходу / размонтированию, поздние ответы не обрабатываются и не удаляются (EC-S7, EC-P16);
 * - `holdPollLock` — Web Lock `maxchat-poll-<idInstance>`: занят → вкладка только на чтение и
 *   ждёт замок, затем опрашивает сама (Р-12, ВА-16, EC-S4);
 * - `abortableSleep` — пауза одним таймером после завершения запроса (EC-P17).
 *
 * React-обвязка — `src/ui/polling/Poller.tsx`.
 */
export {
  POLL_LOCK_PREFIX,
  BACKOFF_INITIAL_MS,
  BACKOFF_MAX_MS,
  NOT_AUTHORIZED_PAUSE_MS,
} from './constants';
export {
  abortableSleep,
  backoffDelay,
  classifyReceiveError,
  runPollLoop,
  type PollLoopOptions,
  type PollSleep,
  type PollStopReason,
  type PollWarn,
  type ReceiveErrorAction,
} from './loop';
export { holdPollLock, pollLockName, type LockManagerLike, type PollLockCallbacks } from './lock';
