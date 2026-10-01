import type { LockManagerLike, PollSleep, PollWarn } from '../../polling';

/** Зависимости опроса F5 (`SessionProviderDeps.polling`; в тестах — фейки). */
export interface PollingDeps {
  /** `false` — не опрашивать (тесты, которые сами вызывают receive через клиент). По умолчанию `true`. */
  enabled?: boolean;
  /** Web Locks API; `null` — недоступен. По умолчанию `navigator.locks` (если поддерживается). */
  locks?: LockManagerLike | null;
  sleep?: PollSleep;
  warn?: PollWarn;
}

/**
 * Замки для опроса: явно переданные (тесты), иначе `navigator.locks`, если API есть и не
 * выключен `locksSupported: false`. `null` — опрос без замка (EC-S5).
 */
export function resolvePollLocks(deps: {
  locksSupported?: boolean;
  polling?: PollingDeps;
}): LockManagerLike | null {
  if (deps.polling?.locks !== undefined) return deps.polling.locks;
  if (deps.locksSupported === false) return null;
  // `navigator.locks` нет в незащищённом контексте (`http://<IP>`, EC-S5).
  const supported =
    typeof navigator !== 'undefined' && 'locks' in navigator && Boolean(navigator.locks);
  return supported ? navigator.locks : null;
}
