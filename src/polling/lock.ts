/**
 * Web Lock опроса (Р-12, ВА-16, EC-S1, EC-S4): опрашивает только вкладка, владеющая замком
 * `maxchat-poll-<idInstance>`. Остальные ждут его и сами становятся опрашивающими, когда
 * владелец закрыт. Без Web Locks API (EC-S5) вызывающий код опрашивает без замка.
 */
import { POLL_LOCK_PREFIX } from './constants';

/** Подмножество `LockManager`, которое нужно опросу (в тестах — фейк). */
export interface LockManagerLike {
  request(
    name: string,
    options: { ifAvailable?: boolean; signal?: AbortSignal },
    callback: (lock: unknown) => Promise<unknown>,
  ): Promise<unknown>;
}

export function pollLockName(idInstance: string): string {
  return `${POLL_LOCK_PREFIX}${idInstance}`;
}

export interface PollLockCallbacks {
  /** Замок у другой вкладки: вкладка только на чтение, ждём (EC-S4). */
  onWaiting: () => void;
  /** Замок наш: можно опрашивать. `afterWaiting` — вкладка ждала и теперь перехватила (ВА-16). */
  onAcquired: (afterWaiting: boolean) => void;
}

function untilAborted(signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    if (signal.aborted) resolve();
    else
      signal.addEventListener(
        'abort',
        () => {
          resolve();
        },
        { once: true },
      );
  });
}

/**
 * Держать замок, пока не отменён `signal` (выход, размонтирование, смена сессии). Сначала —
 * попытка без ожидания (`ifAvailable`); занят — `onWaiting` и ожидание в очереди замка.
 * Промис завершается, когда замок отпущен или ожидание отменено; не бросает исключение.
 */
export async function holdPollLock(
  locks: LockManagerLike,
  idInstance: string,
  signal: AbortSignal,
  callbacks: PollLockCallbacks,
): Promise<void> {
  const aborted = () => signal.aborted;
  if (aborted()) return;
  const name = pollLockName(idInstance);
  const result = { acquired: false };
  try {
    await locks.request(name, { ifAvailable: true }, async (lock) => {
      if (lock === null || aborted()) return;
      result.acquired = true;
      callbacks.onAcquired(false);
      await untilAborted(signal);
    });
    if (result.acquired || aborted()) return;
    callbacks.onWaiting();
    await locks.request(name, { signal }, async () => {
      if (aborted()) return;
      callbacks.onAcquired(true);
      await untilAborted(signal);
    });
  } catch {
    // AbortError: ожидание замка отменено выходом или размонтированием — это норма.
  }
}
