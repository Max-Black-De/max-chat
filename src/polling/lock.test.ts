import { describe, expect, it, vi } from 'vitest';
import { ID_INSTANCE } from '../test/fixtures';
import { createFakeLocks } from '../test/fakeLocks';
import { holdPollLock, pollLockName } from './lock';

const NAME = pollLockName(ID_INSTANCE);

function tab(locks: ReturnType<typeof createFakeLocks>) {
  const ac = new AbortController();
  const log: string[] = [];
  const done = holdPollLock(locks, ID_INSTANCE, ac.signal, {
    onWaiting: () => log.push('waiting'),
    onAcquired: (after) => log.push(after ? 'acquired-after-wait' : 'acquired'),
  });
  return { ac, log, done };
}

describe('holdPollLock (Р-12, ВА-16, EC-S1, EC-S4)', () => {
  it('имя замка — maxchat-poll-<idInstance>', () => {
    expect(NAME).toBe(`maxchat-poll-${ID_INSTANCE}`);
  });

  it('первая вкладка берёт замок, вторая ждёт и перехватывает после закрытия первой', async () => {
    const locks = createFakeLocks();
    const a = tab(locks);
    await vi.waitFor(() => {
      expect(a.log).toEqual(['acquired']);
    });
    const b = tab(locks);
    await vi.waitFor(() => {
      expect(b.log).toEqual(['waiting']);
    });
    expect(locks.waiting(NAME)).toBe(1);

    a.ac.abort(); // закрыли первую вкладку
    await a.done;
    await vi.waitFor(() => {
      expect(b.log).toEqual(['waiting', 'acquired-after-wait']);
    });
    expect(locks.held(NAME)).toBe(true);
    b.ac.abort();
    await b.done;
    expect(locks.held(NAME)).toBe(false);
  });

  it('ожидающая вкладка вышла — ожидание снято, замок первой не тронут', async () => {
    const locks = createFakeLocks();
    const a = tab(locks);
    await vi.waitFor(() => {
      expect(a.log).toEqual(['acquired']);
    });
    const b = tab(locks);
    await vi.waitFor(() => {
      expect(locks.waiting(NAME)).toBe(1);
    });
    b.ac.abort();
    await b.done;
    expect(locks.waiting(NAME)).toBe(0);
    expect(b.log).toEqual(['waiting']);
    expect(locks.held(NAME)).toBe(true);
    a.ac.abort();
    await a.done;
  });

  it('разные инстансы — разные замки (EC-S3)', async () => {
    const locks = createFakeLocks();
    const a = tab(locks);
    const ac = new AbortController();
    const log: string[] = [];
    const other = holdPollLock(locks, '1101000001', ac.signal, {
      onWaiting: () => log.push('waiting'),
      onAcquired: () => log.push('acquired'),
    });
    await vi.waitFor(() => {
      expect(log).toEqual(['acquired']);
      expect(a.log).toEqual(['acquired']);
    });
    a.ac.abort();
    ac.abort();
    await Promise.all([a.done, other]);
  });

  it('уже отменённый signal — замок не запрашивается', async () => {
    const locks = createFakeLocks();
    const request = vi.spyOn(locks, 'request');
    const ac = new AbortController();
    ac.abort();
    await holdPollLock(locks, ID_INSTANCE, ac.signal, {
      onWaiting: () => undefined,
      onAcquired: () => undefined,
    });
    expect(request).not.toHaveBeenCalled();
  });

  it('ошибка LockManager не бросается наружу', async () => {
    const ac = new AbortController();
    const onAcquired = vi.fn();
    await holdPollLock(
      { request: () => Promise.reject(new DOMException('denied', 'SecurityError')) },
      ID_INSTANCE,
      ac.signal,
      { onWaiting: vi.fn(), onAcquired },
    );
    expect(onAcquired).not.toHaveBeenCalled();
  });
});
