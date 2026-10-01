import { describe, expect, it, vi } from 'vitest';
import { GreenApiError, GreenApiErrorCode as C, type GreenApiErrorCode } from '../errors';
import type { GreenApiClient } from '../client';
import {
  catchError,
  makeClient,
  mockFetch,
  type MockReply,
  blockRealNetwork,
  callAt,
} from './helpers';

blockRealNetwork();

type Call = (c: GreenApiClient, signal?: AbortSignal) => Promise<unknown>;
const METHODS: Record<string, Call> = {
  getStateInstance: (c, signal) => c.getStateInstance(signal ? { signal } : {}),
  getSettings: (c, signal) => c.getSettings(signal ? { signal } : {}),
  checkAccount: (c, signal) => c.checkAccount('79991234567', signal ? { signal } : {}),
  sendMessage: (c, signal) =>
    c.sendMessage({ chatId: '10000002', message: 'x' }, signal ? { signal } : {}),
  receiveNotification: (c, signal) => c.receiveNotification(signal ? { signal } : {}),
  deleteNotification: (c, signal) => c.deleteNotification(1, signal ? { signal } : {}),
};

function method(name: string): Call {
  const fn = METHODS[name];
  if (!fn) throw new Error(`unknown method ${name}`);
  return fn;
}

async function errorOf(
  reply: MockReply,
  call: Call = method('getStateInstance'),
): Promise<GreenApiError> {
  const e = await catchError(call(makeClient(mockFetch(reply).fetch)));
  expect(e).toBeInstanceOf(GreenApiError);
  return e as GreenApiError;
}

describe('маппинг HTTP-кодов (§5.4)', () => {
  const cases: [number, string, GreenApiErrorCode][] = [
    [401, '', C.UNAUTHORIZED],
    [403, '', C.FORBIDDEN],
    [403, 'Your account is suspended', C.ACCOUNT_SUSPENDED],
    [400, 'instance is starting or not authorized', C.INSTANCE_NOT_READY],
    [400, 'instance in starting process try later', C.INSTANCE_NOT_READY],
    [
      400,
      'Message cannot be received because custom webhook url is set. Please clear webhook url',
      C.WEBHOOK_URL_SET,
    ],
    [400, 'Instance account is expired', C.INSTANCE_EXPIRED],
    [400, 'Instance is deleted', C.INSTANCE_EXPIRED],
    [
      400,
      "Validation failed. Details: 'message' length must be less than or equal to 4000",
      C.BAD_REQUEST,
    ],
    [400, 'check phone number timeout limit exceeded', C.CHECK_LIMIT],
    [404, '', C.NOT_FOUND],
    [429, 'Too Many Requests', C.RATE_LIMITED],
    [469, 'User get contact info limit reached', C.CHECK_LIMIT],
    [499, '', C.SERVER],
    [500, 'request entity too large', C.SERVER],
    [502, '<html>Bad Gateway</html>', C.SERVER],
    [503, '', C.SERVER],
    [418, '', C.HTTP],
  ];
  it.each(cases)('HTTP %i %j → %s', async (status, body, code) => {
    const e = await errorOf({ status, body });
    expect(e.code).toBe(code);
    expect(e.httpStatus).toBe(status);
    expect(e.method).toBe('getStateInstance');
    expect(e.maskedUrl).toContain('/getStateInstance/***');
    if (body) expect(e.reason).toBe(body);
  });

  it('reason извлекается из JSON-тела ошибки', async () => {
    const e = await errorOf({ status: 400, body: { message: 'Validation failed: chatId' } });
    expect(e.reason).toBe('Validation failed: chatId');
  });

  it('длинный reason обрезается', async () => {
    const e = await errorOf({ status: 400, body: 'x'.repeat(1000) });
    expect(e.reason?.length ?? 0).toBeLessThanOrEqual(301);
  });

  it('{status:false, reason} в 200 (CheckAccount) → по тексту причины', async () => {
    const e1 = await errorOf(
      { body: { status: false, reason: 'instance is starting or not authorized' } },
      METHODS.checkAccount,
    );
    expect(e1.code).toBe(C.INSTANCE_NOT_READY);
    expect(e1.httpStatus).toBe(200);
    const e2 = await errorOf(
      { body: { status: false, reason: 'User get contact info limit reached' } },
      METHODS.checkAccount,
    );
    expect(e2.code).toBe(C.CHECK_LIMIT);
    expect(e2.retry).toBe('none');
  });
});

describe('сеть, таймаут, отмена, JSON', () => {
  it('fetch бросил TypeError (сеть / CORS) → NETWORK, apiUrl в ошибке', async () => {
    const e = await errorOf({ throws: new TypeError('Failed to fetch') });
    expect(e.code).toBe(C.NETWORK);
    expect(e.apiUrl).toBe('https://api.example.test');
    expect(e.httpStatus).toBeUndefined();
  });

  it('ошибка при чтении тела → NETWORK', async () => {
    const broken = vi.fn(() =>
      Promise.resolve({
        status: 200,
        text: () => Promise.reject(new TypeError('network')),
      } as unknown as Response),
    );
    const e = await catchError(makeClient(broken).getSettings());
    expect((e as GreenApiError).code).toBe(C.NETWORK);
  });

  it('таймаут → TIMEOUT (по timeoutMs вызова)', async () => {
    vi.useFakeTimers();
    const c = makeClient(mockFetch({ hang: true }).fetch);
    const p = catchError(c.getStateInstance({ timeoutMs: 1000 }));
    await vi.advanceTimersByTimeAsync(1000);
    const e = (await p) as GreenApiError;
    expect(e.code).toBe(C.TIMEOUT);
    expect(e.retry).toBe('backoff');
  });

  it('таймаут по умолчанию — 30 с (Р-20)', async () => {
    vi.useFakeTimers();
    const c = makeClient(mockFetch({ hang: true }).fetch);
    let settled = false;
    const p = catchError(c.getSettings()).finally(() => (settled = true));
    await vi.advanceTimersByTimeAsync(29_999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(((await p) as GreenApiError).code).toBe(C.TIMEOUT);
  });

  it('receiveNotification: HTTP-таймаут не меньше receiveTimeout + 10 с', async () => {
    vi.useFakeTimers();
    const c = makeClient(mockFetch({ hang: true }).fetch, { timeoutMs: 5000 });
    let settled = false;
    const p = catchError(c.receiveNotification({ receiveTimeout: 20 })).finally(
      () => (settled = true),
    );
    await vi.advanceTimersByTimeAsync(29_999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(((await p) as GreenApiError).code).toBe(C.TIMEOUT);
  });

  it.each(Object.keys(METHODS))('%s: AbortSignal во время запроса → ABORTED', async (name) => {
    const ctrl = new AbortController();
    const c = makeClient(mockFetch({ hang: true }).fetch);
    const p = catchError(method(name)(c, ctrl.signal));
    await Promise.resolve();
    ctrl.abort();
    const e = (await p) as GreenApiError;
    expect(e.code).toBe(C.ABORTED);
    expect(e.retry).toBe('none');
  });

  it.each(Object.keys(METHODS))('%s: уже отменённый signal → ABORTED без запроса', async (name) => {
    const m = mockFetch({ body: {} });
    const ctrl = new AbortController();
    ctrl.abort();
    const e = (await catchError(method(name)(makeClient(m.fetch), ctrl.signal))) as GreenApiError;
    expect(e.code).toBe(C.ABORTED);
    expect(m.calls).toHaveLength(0);
  });

  it('signal передаётся в fetch (отмена реально обрывает запрос)', async () => {
    const m = mockFetch({ body: { stateInstance: 'authorized' } });
    const ctrl = new AbortController();
    await makeClient(m.fetch).getStateInstance({ signal: ctrl.signal });
    expect(callAt(m.calls, 0).init.signal).toBeInstanceOf(AbortSignal);
  });

  it('невалидный JSON в 2xx → INVALID_JSON', async () => {
    const e = await errorOf({ body: '<html>oops</html>' });
    expect(e.code).toBe(C.INVALID_JSON);
    expect(e.httpStatus).toBe(200);
  });

  it('пустое тело 2xx (кроме receive) → UNEXPECTED_RESPONSE', async () => {
    const e = await errorOf({ body: '' });
    expect(e.code).toBe(C.UNEXPECTED_RESPONSE);
  });

  it('JSON-массив вместо объекта → UNEXPECTED_RESPONSE', async () => {
    const e = await errorOf({ body: [1, 2] }, METHODS.getSettings);
    expect(e.code).toBe(C.UNEXPECTED_RESPONSE);
  });
});

describe('рекомендации повтора (retry)', () => {
  it('sendMessage: никакого автоповтора ни при сети, ни при 5xx, ни при 429 (§5.4, §4.3 п. 3.4)', async () => {
    for (const reply of [
      { throws: new TypeError('x') },
      { status: 502 },
      { status: 500 },
      { status: 429 },
      { status: 400, body: 'instance is starting or not authorized' },
    ] as MockReply[]) {
      const e = await errorOf(reply, METHODS.sendMessage);
      expect(e.retry).toBe('none');
    }
  });

  it('receive/delete: сеть, 429, 5xx → backoff; не авторизован → pause; 401/403/webhook → none', async () => {
    for (const call of [method('receiveNotification'), method('deleteNotification')]) {
      expect((await errorOf({ throws: new TypeError('x') }, call)).retry).toBe('backoff');
      expect((await errorOf({ status: 429 }, call)).retry).toBe('backoff');
      expect((await errorOf({ status: 502 }, call)).retry).toBe('backoff');
      expect(
        (await errorOf({ status: 400, body: 'instance is starting or not authorized' }, call))
          .retry,
      ).toBe('pause');
      expect((await errorOf({ status: 401 }, call)).retry).toBe('none');
      expect((await errorOf({ status: 403 }, call)).retry).toBe('none');
      expect((await errorOf({ status: 400, body: 'custom webhook url is set' }, call)).retry).toBe(
        'none',
      );
    }
  });

  it('checkAccount: сеть/5xx — без автоповтора (квота 100/мес), 469 — без автоповтора', async () => {
    expect((await errorOf({ throws: new TypeError('x') }, METHODS.checkAccount)).retry).toBe(
      'none',
    );
    expect((await errorOf({ status: 502 }, METHODS.checkAccount)).retry).toBe('none');
    expect((await errorOf({ status: 469 }, METHODS.checkAccount)).retry).toBe('none');
  });

  it('клиент сам ничего не повторяет: ровно один fetch на вызов', async () => {
    const m = mockFetch({ status: 502 });
    await catchError(makeClient(m.fetch).receiveNotification());
    expect(m.calls).toHaveLength(1);
  });
});
