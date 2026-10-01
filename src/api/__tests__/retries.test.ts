import { afterEach, describe, expect, it, vi } from 'vitest';
import { GreenApiErrorCode as C, type GreenApiError } from '../errors';
import { parseRetryAfter } from '../http';
import { createGreenApiClient } from '../client';
import {
  DELETE_RETRY_DELAYS_MS,
  RETRY_AFTER_MAX_MS,
  SEND_RATE_LIMIT_RETRY_DELAYS_MS,
} from '../constants';
import {
  blockRealNetwork,
  catchError,
  FAKE_CREDS,
  makeClient,
  mockFetch,
  recordingSleep,
  type MockReply,
} from '../../test/apiHelpers';

blockRealNetwork();
afterEach(() => {
  vi.useRealTimers();
});

const CHAT = '100000000001';
const OK_SEND = { body: { idMessage: 'BAE5000000000001' } };
const send = (c: ReturnType<typeof makeClient>, signal?: AbortSignal) =>
  c.sendMessage({ chatId: CHAT, message: 'привет' }, signal ? { signal } : {});

describe('константы повторов (ВА-8, ВА-17)', () => {
  it('паузы 1 → 2 → 4 с, Retry-After не больше 30 с', () => {
    expect(SEND_RATE_LIMIT_RETRY_DELAYS_MS).toEqual([1000, 2000, 4000]);
    expect(DELETE_RETRY_DELAYS_MS).toEqual([1000, 2000, 4000]);
    expect(RETRY_AFTER_MAX_MS).toBe(30_000);
  });
});

describe('parseRetryAfter', () => {
  it('секунды → мс; HTTP-дата → мс до неё; мусор / нет заголовка → undefined', () => {
    expect(parseRetryAfter('3')).toBe(3000);
    expect(parseRetryAfter(' 0 ')).toBe(0);
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter('soon')).toBeUndefined();
    expect(parseRetryAfter('-1')).toBeUndefined();
    const now = Date.parse('2026-10-01T10:00:00Z');
    expect(parseRetryAfter('Thu, 01 Oct 2026 10:00:05 GMT', now)).toBe(5000);
    expect(parseRetryAfter('Thu, 01 Oct 2026 09:59:00 GMT', now)).toBe(0);
  });
});

describe('sendMessage: 429 → автоповтор до 3 раз (п. 3.4, ВА-8)', () => {
  it('429, 429, 200 → успех; паузы 1 и 2 с; 3 запроса с тем же телом', async () => {
    const m = mockFetch({ status: 429 }, { status: 429 }, OK_SEND);
    const s = recordingSleep();
    const r = await send(makeClient(m.fetch, { sleep: s.sleep }));
    expect(r.idMessage).toBe('BAE5000000000001');
    expect(m.calls).toHaveLength(3);
    expect(s.delays).toEqual([1000, 2000]);
    const bodies = m.calls.map((c) => c.init.body);
    expect(new Set(bodies).size).toBe(1);
  });

  it('4 раза 429 → RATE_LIMITED, retry none, attempts 4, паузы 1 → 2 → 4 с', async () => {
    const m = mockFetch({ status: 429 });
    const s = recordingSleep();
    const e = (await catchError(send(makeClient(m.fetch, { sleep: s.sleep })))) as GreenApiError;
    expect(e.code).toBe(C.RATE_LIMITED);
    expect(e.retry).toBe('none');
    expect(e.attempts).toBe(4);
    expect(m.calls).toHaveLength(4);
    expect(s.delays).toEqual([1000, 2000, 4000]);
  });

  it('пауза = min(Retry-After, 30 с); нет заголовка или мусор — 1 → 2 → 4 с (п. 3.4, EC-T7)', async () => {
    const m = mockFetch(
      { status: 429, headers: { 'Retry-After': '7' } },
      { status: 429, headers: { 'Retry-After': '31' } },
      { status: 429, headers: { 'Retry-After': 'later' } },
      OK_SEND,
    );
    const s = recordingSleep();
    await send(makeClient(m.fetch, { sleep: s.sleep }));
    expect(s.delays).toEqual([7000, 30_000, 4000]);
  });

  it('Retry-After ровно 30 с и 0 с — как есть', async () => {
    const m = mockFetch(
      { status: 429, headers: { 'Retry-After': '30' } },
      { status: 429, headers: { 'Retry-After': '0' } },
      OK_SEND,
    );
    const s = recordingSleep();
    await send(makeClient(m.fetch, { sleep: s.sleep }));
    expect(s.delays).toEqual([30_000, 0]);
  });

  it('Retry-After 120 с и HTTP-дата через час → пауза 30 с, а не 1 → 2 → 4 с', async () => {
    const later = new Date(Date.now() + 3_600_000).toUTCString();
    const m = mockFetch(
      { status: 429, headers: { 'Retry-After': '120' } },
      { status: 429, headers: { 'Retry-After': later } },
      { status: 429 },
      OK_SEND,
    );
    const s = recordingSleep();
    await send(makeClient(m.fetch, { sleep: s.sleep }));
    expect(s.delays).toEqual([30_000, 30_000, 4000]);
  });

  it('retryAfterMs попадает в ошибку 429', async () => {
    const m = mockFetch({ status: 429, headers: { 'Retry-After': '2' } });
    const e = (await catchError(send(makeClient(m.fetch)))) as GreenApiError;
    expect(e.retryAfterMs).toBe(2000);
  });

  it.each<[string, MockReply, C]>([
    ['сеть', { throws: new TypeError('Failed to fetch') }, C.NETWORK],
    ['499', { status: 499 }, C.SERVER],
    ['500', { status: 500 }, C.SERVER],
    ['502', { status: 502 }, C.SERVER],
    ['466', { status: 466 }, C.QUOTA_EXCEEDED],
    ['400', { status: 400, body: 'Validation failed' }, C.BAD_REQUEST],
    ['403 suspended', { status: 403, body: 'Your account is suspended' }, C.ACCOUNT_SUSPENDED],
  ])('%s → без автоповтора: 1 запрос, ошибка наверх', async (_n, reply, code) => {
    const m = mockFetch(reply, OK_SEND);
    const s = recordingSleep();
    const e = (await catchError(send(makeClient(m.fetch, { sleep: s.sleep })))) as GreenApiError;
    expect(e.code).toBe(code);
    expect(e.retry).toBe('none');
    expect(e.attempts).toBe(1);
    expect(m.calls).toHaveLength(1);
    expect(s.delays).toEqual([]);
  });

  it('таймаут → TIMEOUT без автоповтора', async () => {
    vi.useFakeTimers();
    const m = mockFetch({ hang: true }, OK_SEND);
    const p = catchError(
      makeClient(m.fetch).sendMessage({ chatId: CHAT, message: 'x' }, { timeoutMs: 500 }),
    );
    await vi.advanceTimersByTimeAsync(500);
    const e = (await p) as GreenApiError;
    expect(e.code).toBe(C.TIMEOUT);
    expect(m.calls).toHaveLength(1);
  });

  it('429, затем 502 → ошибка SERVER на 2-й попытке, дальше не повторяет', async () => {
    const m = mockFetch({ status: 429 }, { status: 502 }, OK_SEND);
    const e = (await catchError(send(makeClient(m.fetch)))) as GreenApiError;
    expect(e.code).toBe(C.SERVER);
    expect(e.attempts).toBe(2);
    expect(m.calls).toHaveLength(2);
  });

  it('AbortSignal во время паузы → ABORTED, новых запросов нет', async () => {
    const m = mockFetch({ status: 429 }, OK_SEND);
    const ctrl = new AbortController();
    const sleep = (_ms: number, signal?: AbortSignal) =>
      new Promise<void>((_resolve, reject) => {
        signal?.addEventListener('abort', () => {
          reject(new Error('aborted'));
        });
        ctrl.abort();
      });
    const e = (await catchError(
      send(makeClient(m.fetch, { sleep }), ctrl.signal),
    )) as GreenApiError;
    expect(e.code).toBe(C.ABORTED);
    expect(e.retry).toBe('none');
    expect(m.calls).toHaveLength(1);
  });

  it('пауза по умолчанию — через инъектируемые timers (fake timers), отмена во время паузы', async () => {
    vi.useFakeTimers();
    const m = mockFetch({ status: 429 }, OK_SEND);
    const c = createGreenApiClient({ ...FAKE_CREDS, fetch: m.fetch });
    let done = false;
    const p = send(c).finally(() => (done = true));
    await vi.advanceTimersByTimeAsync(999);
    expect(done).toBe(false);
    expect(m.calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    await p;
    expect(m.calls).toHaveLength(2);

    const m2 = mockFetch({ status: 429 }, OK_SEND);
    const ctrl = new AbortController();
    const p2 = catchError(
      send(createGreenApiClient({ ...FAKE_CREDS, fetch: m2.fetch }), ctrl.signal),
    );
    await vi.advanceTimersByTimeAsync(500);
    ctrl.abort();
    const e = (await p2) as GreenApiError;
    expect(e.code).toBe(C.ABORTED);
    expect(m2.calls).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('deleteNotification: до 3 повторов 1 → 2 → 4 с (§5.4, ВА-17)', () => {
  const del = (c: ReturnType<typeof makeClient>, signal?: AbortSignal) =>
    c.deleteNotification(7, signal ? { signal } : {});

  it.each<[string, MockReply]>([
    ['сеть', { throws: new TypeError('Failed to fetch') }],
    ['499', { status: 499 }],
    ['502', { status: 502 }],
    ['429', { status: 429 }],
  ])('%s, затем 200 → успех после повтора', async (_n, reply) => {
    const m = mockFetch(reply, { body: { result: true } });
    const s = recordingSleep();
    const r = await del(makeClient(m.fetch, { sleep: s.sleep }));
    expect(r).toEqual({ result: true, reason: '', alreadyDeleted: false });
    expect(m.calls).toHaveLength(2);
    expect(s.delays).toEqual([1000]);
  });

  it('4 раза 502 → SERVER, retry none, attempts 4, паузы 1 → 2 → 4 с', async () => {
    const m = mockFetch({ status: 502 });
    const s = recordingSleep();
    const e = (await catchError(del(makeClient(m.fetch, { sleep: s.sleep })))) as GreenApiError;
    expect(e.code).toBe(C.SERVER);
    expect(e.retry).toBe('none');
    expect(e.attempts).toBe(4);
    expect(m.calls).toHaveLength(4);
    expect(s.delays).toEqual([1000, 2000, 4000]);
  });

  it('таймаут повторяется', async () => {
    vi.useFakeTimers();
    const m = mockFetch({ hang: true }, { body: { result: true } });
    const p = makeClient(m.fetch).deleteNotification(7, { timeoutMs: 100 });
    await vi.advanceTimersByTimeAsync(100);
    await expect(p).resolves.toMatchObject({ result: true });
    expect(m.calls).toHaveLength(2);
  });

  it.each<[string, MockReply, C]>([
    ['401', { status: 401 }, C.UNAUTHORIZED],
    ['403', { status: 403 }, C.FORBIDDEN],
    ['webhook', { status: 400, body: 'custom webhook url is set' }, C.WEBHOOK_URL_SET],
    [
      'not ready',
      { status: 400, body: 'instance is starting or not authorized' },
      C.INSTANCE_NOT_READY,
    ],
  ])('%s → без повтора', async (_n, reply, code) => {
    const m = mockFetch(reply, { body: { result: true } });
    const e = (await catchError(del(makeClient(m.fetch)))) as GreenApiError;
    expect(e.code).toBe(code);
    expect(m.calls).toHaveLength(1);
  });

  it('500 findUnAckedMessage → «удалено» сразу, без повтора', async () => {
    const m = mockFetch({ status: 500, body: 'error findUnAckedMessage: not found' });
    const r = await del(makeClient(m.fetch));
    expect(r.alreadyDeleted).toBe(true);
    expect(m.calls).toHaveLength(1);
  });

  it('AbortSignal во время паузы → ABORTED', async () => {
    const m = mockFetch({ status: 502 }, { body: { result: true } });
    const ctrl = new AbortController();
    const sleep = (_ms: number, signal?: AbortSignal) =>
      new Promise<void>((_resolve, reject) => {
        signal?.addEventListener('abort', () => {
          reject(new Error('aborted'));
        });
        ctrl.abort();
      });
    const e = (await catchError(del(makeClient(m.fetch, { sleep }), ctrl.signal))) as GreenApiError;
    expect(e.code).toBe(C.ABORTED);
    expect(m.calls).toHaveLength(1);
  });
});
