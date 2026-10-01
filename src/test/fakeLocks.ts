/**
 * Фейковый Web Locks API (эксклюзивные замки, `ifAvailable`, `signal`) для тестов опроса:
 * один экземпляр — общий «браузер» для нескольких вкладок (Р-12, EC-S1).
 */
import type { LockManagerLike } from '../polling';

interface Waiter {
  callback: (lock: unknown) => Promise<unknown>;
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
  signal: AbortSignal | undefined;
}

export interface FakeLocks extends LockManagerLike {
  /** Кто держит замок: имя → признак. */
  held(name: string): boolean;
  /** Сколько вкладок ждут замок. */
  waiting(name: string): number;
}

export function createFakeLocks(): FakeLocks {
  const holders = new Set<string>();
  const queues = new Map<string, Waiter[]>();

  function grant(name: string, w: Waiter) {
    holders.add(name);
    const lock = { name, mode: 'exclusive' };
    void Promise.resolve()
      .then(() => w.callback(lock))
      .then(
        (v) => {
          w.resolve(v);
        },
        (e: unknown) => {
          w.reject(e);
        },
      )
      .finally(() => {
        holders.delete(name);
        const next = queues.get(name)?.shift();
        if (next) grant(name, next);
      });
  }

  return {
    request(name, options, callback) {
      return new Promise((resolve, reject) => {
        const w: Waiter = { callback, resolve, reject, signal: options.signal };
        if (options.signal?.aborted) {
          reject(new DOMException('aborted', 'AbortError'));
          return;
        }
        if (!holders.has(name)) {
          grant(name, w);
          return;
        }
        if (options.ifAvailable) {
          void Promise.resolve()
            .then(() => callback(null))
            .then(resolve, reject);
          return;
        }
        const q = queues.get(name) ?? [];
        q.push(w);
        queues.set(name, q);
        options.signal?.addEventListener(
          'abort',
          () => {
            const list = queues.get(name) ?? [];
            const i = list.indexOf(w);
            if (i >= 0) {
              list.splice(i, 1);
              reject(new DOMException('aborted', 'AbortError'));
            }
          },
          { once: true },
        );
      });
    },
    held: (name) => holders.has(name),
    waiting: (name) => queues.get(name)?.length ?? 0,
  };
}
