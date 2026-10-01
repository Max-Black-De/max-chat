import { describe, expect, it, vi } from 'vitest';
import { createGreenApiClient } from '../client';
import { DEFAULT_API_URL } from '../constants';
import { GreenApiErrorCode, type GreenApiError } from '../errors';
import { maskUrl } from '../mask';
import {
  FAKE_CREDS,
  FAKE_TOKEN,
  blockRealNetwork,
  callAt,
  catchError,
  makeClient,
  mockFetch,
} from './helpers';

blockRealNetwork();

describe('конфигурация клиента (A2, тестировщик)', () => {
  it('apiUrl по умолчанию — https://api.green-api.com (Р-1)', async () => {
    const m = mockFetch({ body: { stateInstance: 'authorized' } });
    const c = createGreenApiClient({
      idInstance: FAKE_CREDS.idInstance,
      apiTokenInstance: FAKE_TOKEN,
      fetch: m.fetch,
    });
    expect(c.apiUrl).toBe(DEFAULT_API_URL);
    await c.getStateInstance();
    expect(callAt(m.calls, 0).url.startsWith(`${DEFAULT_API_URL}/waInstance`)).toBe(true);
  });

  it('GET-запросы — без Content-Type и любых заголовков, без тела (нет лишнего preflight)', async () => {
    const m = mockFetch(
      { body: { stateInstance: 'authorized' } },
      { body: { webhookUrl: '' } },
      { body: '' },
    );
    const c = makeClient(m.fetch);
    await c.getStateInstance();
    await c.getSettings();
    await c.receiveNotification();
    expect(m.calls).toHaveLength(3);
    for (const { init } of m.calls) {
      expect(init.method).toBe('GET');
      expect(init.headers).toBeUndefined();
      expect(init.body).toBeUndefined();
      expect(init.credentials).toBe('omit');
    }
  });

  it('DELETE — без заголовков и тела; POST — только Content-Type: application/json', async () => {
    const m = mockFetch({ body: { result: true, reason: '' } }, { body: { idMessage: '1' } });
    const c = makeClient(m.fetch);
    await c.deleteNotification(1);
    await c.sendMessage({ chatId: '10000002', message: 'x' });
    expect(callAt(m.calls, 0).init.headers).toBeUndefined();
    expect(callAt(m.calls, 0).init.body).toBeUndefined();
    expect(callAt(m.calls, 1).init.headers).toEqual({ 'Content-Type': 'application/json' });
  });

  it('инъекция таймеров: таймаут идёт через переданный setTimeout с нужной длительностью', async () => {
    const pending: { fn: () => void; ms: number }[] = [];
    const timers = {
      setTimeout: vi.fn((fn: () => void, ms: number) => pending.push({ fn, ms })),
      clearTimeout: vi.fn(),
    };
    const c = makeClient(mockFetch({ hang: true }).fetch, { timers });
    const p = catchError(c.sendMessage({ chatId: '10000002', message: 'x' }, { timeoutMs: 1234 }));
    await Promise.resolve();
    expect(pending.map((t) => t.ms)).toEqual([1234]);
    pending[0]?.fn();
    expect(((await p) as GreenApiError).code).toBe(GreenApiErrorCode.TIMEOUT);
    expect(timers.clearTimeout).toHaveBeenCalledTimes(1);
  });

  it('таймауты: per-call > конфиг > умолчание; receive — не меньше receiveTimeout + 10 с', async () => {
    const seen: number[] = [];
    const timers = {
      setTimeout: (_fn: () => void, ms: number) => seen.push(ms),
      clearTimeout: () => undefined,
    };
    const m = mockFetch({ body: { stateInstance: 'authorized' } });
    const c1 = makeClient(m.fetch, { timers });
    await c1.getStateInstance();
    await c1.getStateInstance({ timeoutMs: 5000 });
    const c2 = makeClient(mockFetch({ body: '' }).fetch, { timers, timeoutMs: 8000 });
    await c2.receiveNotification(); // 20 с + 10 с > 8 с
    await c2.receiveNotification({ receiveTimeout: 20, timeoutMs: 45_000 });
    await c2.receiveNotification({ receiveTimeout: 60 });
    expect(seen).toEqual([30_000, 5000, 30_000, 45_000, 70_000]);
  });

  it('maskUrl маскирует токен в произвольном URL', () => {
    expect(maskUrl(`https://h/waInstance1/getSettings/${FAKE_TOKEN}`, FAKE_TOKEN)).toBe(
      'https://h/waInstance1/getSettings/***',
    );
  });
});
