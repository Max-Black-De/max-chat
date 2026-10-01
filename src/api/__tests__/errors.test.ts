import { describe, expect, it, vi } from 'vitest';
import {
  GreenApiError,
  GreenApiErrorCode as C,
  isSessionInvalidError,
  type GreenApiErrorCode,
} from '../errors';
import { classifyReason, retryHintFor } from '../http';
import type { GreenApiClient } from '../client';
import {
  catchError,
  makeClient,
  mockFetch,
  type MockReply,
  blockRealNetwork,
  callAt,
} from '../../test/apiHelpers';

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
    [400, 'Instance is deleted', C.INSTANCE_DELETED],
    [
      400,
      "Validation failed. Details: 'message' length must be less than or equal to 4000",
      C.BAD_REQUEST,
    ],
    [400, 'check phone number timeout limit exceeded', C.CHECK_TIMEOUT],
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

describe('{status:false, reason} при любом HTTP-коде (ВА-11)', () => {
  it.each([200, 400, 500])('HTTP %i со status:false → по тексту причины', async (status) => {
    const e1 = await errorOf(
      { status, body: { status: false, reason: 'User get contact info limit reached' } },
      METHODS.checkAccount,
    );
    expect(e1.code).toBe(C.CHECK_LIMIT);
    expect(e1.httpStatus).toBe(status);
    const e2 = await errorOf(
      { status, body: { status: false, reason: 'check phone number timeout limit exceeded' } },
      METHODS.checkAccount,
    );
    expect(e2.code).toBe(C.CHECK_TIMEOUT);
  });
});

describe('HTTP-код × reason: 401/403 важнее тела (§5.4, ВА-4, ВА-11, ВА-19)', () => {
  const NOT_AUTH = 'not authorized';
  const NOT_READY = 'instance is starting or not authorized';
  const EXPIRED = 'Instance account is expired, instance is not authorized';
  const DELETED = 'Instance is deleted. Not authorized';
  const SUSPENDED = 'Your account is suspended';
  const WEBHOOK = 'Message cannot be received because custom webhook url is set';
  type Row = [number, string | null, GreenApiErrorCode, boolean];
  // [HTTP, reason в {status:false, reason} (null — пустое тело), код, сессия невалидна]
  const rows: Row[] = [
    [401, null, C.UNAUTHORIZED, true],
    [401, NOT_AUTH, C.UNAUTHORIZED, true],
    [401, NOT_READY, C.UNAUTHORIZED, true],
    [401, EXPIRED, C.UNAUTHORIZED, true],
    [401, WEBHOOK, C.UNAUTHORIZED, true],
    [403, null, C.FORBIDDEN, true],
    [403, NOT_AUTH, C.FORBIDDEN, true],
    [403, NOT_READY, C.FORBIDDEN, true],
    [403, DELETED, C.FORBIDDEN, true],
    [403, SUSPENDED, C.ACCOUNT_SUSPENDED, true], // не sendMessage — как 403 (ВА-19)
    [400, NOT_AUTH, C.INSTANCE_NOT_READY, false],
    [400, NOT_READY, C.INSTANCE_NOT_READY, false],
    [400, EXPIRED, C.INSTANCE_EXPIRED, true],
    [400, DELETED, C.INSTANCE_DELETED, true],
    [400, WEBHOOK, C.WEBHOOK_URL_SET, false],
    [200, NOT_AUTH, C.INSTANCE_NOT_READY, false],
    [200, NOT_READY, C.INSTANCE_NOT_READY, false],
    [200, EXPIRED, C.INSTANCE_EXPIRED, true],
    [200, DELETED, C.INSTANCE_DELETED, true],
    [200, WEBHOOK, C.WEBHOOK_URL_SET, false],
    // ВА-11: известная причина в {status:false} разбирается и на прочих кодах.
    [500, NOT_READY, C.INSTANCE_NOT_READY, false],
    [500, EXPIRED, C.INSTANCE_EXPIRED, true],
    [500, null, C.SERVER, false],
  ];
  it.each(rows)(
    'HTTP %i, reason %j → %s (сессия невалидна: %s)',
    async (status, reason, code, invalid) => {
      const body = reason === null ? '' : { status: false, reason };
      for (const name of ['getStateInstance', 'receiveNotification', 'checkAccount']) {
        const e = await errorOf({ status, body }, method(name));
        expect(e.code, name).toBe(code);
        expect(isSessionInvalidError(e), name).toBe(invalid);
        if (invalid) expect(e.retry, name).toBe('none');
      }
    },
  );

  it('401 {status:false, reason:"not authorized"} в опросе — выход, а не пауза', async () => {
    const e = await errorOf(
      { status: 401, body: { status: false, reason: NOT_AUTH } },
      method('receiveNotification'),
    );
    expect(e.code).toBe(C.UNAUTHORIZED);
    expect(e.retry).toBe('none');
    expect(isSessionInvalidError(e)).toBe(true);
  });

  it('403 suspended на sendMessage — свой код, сессия жива (п. 3.6, §5.4)', async () => {
    for (const body of [SUSPENDED, { status: false, reason: SUSPENDED }]) {
      const e = await errorOf({ status: 403, body }, method('sendMessage'));
      expect(e.code).toBe(C.ACCOUNT_SUSPENDED);
      expect(isSessionInvalidError(e)).toBe(false);
    }
  });

  it('403 не-suspended на sendMessage — сессия невалидна', async () => {
    const e = await errorOf(
      { status: 403, body: { status: false, reason: NOT_AUTH } },
      method('sendMessage'),
    );
    expect(e.code).toBe(C.FORBIDDEN);
    expect(isSessionInvalidError(e)).toBe(true);
  });

  it('classifyReason: expired / deleted раньше широкого «not authorized»', () => {
    expect(classifyReason(EXPIRED)).toBe(C.INSTANCE_EXPIRED);
    expect(classifyReason(DELETED)).toBe(C.INSTANCE_DELETED);
    expect(classifyReason(NOT_AUTH)).toBe(C.INSTANCE_NOT_READY);
    expect(classifyReason('instance in starting process try later')).toBe(C.INSTANCE_NOT_READY);
    expect(classifyReason(`${WEBHOOK}. not authorized`)).toBe(C.WEBHOOK_URL_SET);
    expect(classifyReason('Validation failed')).toBe(C.BAD_REQUEST);
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

  it('receive, getStateInstance, getSettings: сеть, 429, 5xx → backoff; не авторизован → pause; 401/403/webhook → none', async () => {
    for (const call of [
      method('receiveNotification'),
      method('getStateInstance'),
      method('getSettings'),
    ]) {
      expect((await errorOf({ throws: new TypeError('x') }, call)).retry).toBe('backoff');
      expect((await errorOf({ status: 429 }, call)).retry).toBe('backoff');
      expect((await errorOf({ status: 499 }, call)).retry).toBe('backoff');
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

  it('receiveNotification: любая ошибка, кроме невалидной сессии и П-1, → backoff (НФТ-5, §6.1 п. 2.4)', async () => {
    const call = method('receiveNotification');
    for (const reply of [
      { status: 404 },
      { status: 400, body: 'Validation failed' },
      { status: 400, body: '' },
      { status: 405 },
      { status: 418 },
      { status: 466, body: { correspondentsStatus: { method: 'correspondents' } } },
      { status: 469 },
      { status: 200, body: 'not json' },
      { status: 200, body: { status: false, reason: 'something new' } },
      { status: 200, body: { receiptId: 'x' } },
      { status: 302 },
    ] satisfies MockReply[]) {
      const e = await errorOf(reply, call);
      expect(e.retry, JSON.stringify(reply)).toBe('backoff');
    }
    for (const reply of [
      { status: 401 },
      { status: 403 },
      { status: 403, body: 'Your account is suspended' },
      { status: 400, body: 'Instance account is expired' },
      { status: 400, body: 'Instance is deleted' },
      { status: 400, body: 'custom webhook url is set' },
    ] satisfies MockReply[]) {
      expect((await errorOf(reply, call)).retry, JSON.stringify(reply)).toBe('none');
    }
    expect(
      (await errorOf({ status: 400, body: 'instance is starting or not authorized' }, call)).retry,
    ).toBe('pause');
  });

  it('receiveNotification: отмена и закрытие клиента → none (опрос остановлен намеренно)', async () => {
    const ac = new AbortController();
    ac.abort();
    const e = await errorOf({ body: '' }, (c) => c.receiveNotification({ signal: ac.signal }));
    expect(e.code).toBe(C.ABORTED);
    expect(e.retry).toBe('none');
    const c = makeClient(mockFetch({ body: '' }).fetch);
    c.close();
    const closed = await catchError(c.receiveNotification());
    expect(closed).toBeInstanceOf(GreenApiError);
    expect((closed as GreenApiError).retry).toBe('none');
  });

  it('retryHintFor: таблица для receive и getStateInstance', () => {
    expect(retryHintFor(C.NOT_FOUND, 'receiveNotification')).toBe('backoff');
    expect(retryHintFor(C.BAD_REQUEST, 'receiveNotification')).toBe('backoff');
    expect(retryHintFor(C.HTTP, 'receiveNotification')).toBe('backoff');
    expect(retryHintFor(C.QUOTA_EXCEEDED, 'receiveNotification')).toBe('backoff');
    expect(retryHintFor(C.CHECK_LIMIT, 'receiveNotification')).toBe('backoff');
    expect(retryHintFor(C.UNAUTHORIZED, 'receiveNotification')).toBe('none');
    expect(retryHintFor(C.ACCOUNT_SUSPENDED, 'receiveNotification')).toBe('none');
    expect(retryHintFor(C.WEBHOOK_URL_SET, 'receiveNotification')).toBe('none');
    expect(retryHintFor(C.ABORTED, 'receiveNotification')).toBe('none');
    expect(retryHintFor(C.SESSION_CLOSED, 'receiveNotification')).toBe('none');
    expect(retryHintFor(C.INSTANCE_NOT_READY, 'receiveNotification')).toBe('pause');
    expect(retryHintFor(C.NOT_FOUND, 'getStateInstance')).toBe('none');
    expect(retryHintFor(C.QUOTA_EXCEEDED, 'sendMessage')).toBe('none');
    expect(retryHintFor(C.QUOTA_EXCEEDED, 'checkAccount')).toBe('none');
  });

  it('deleteNotification: после встроенных повторов — none (дальше следующий receive, ВА-17); не авторизован → pause', async () => {
    const call = method('deleteNotification');
    expect((await errorOf({ throws: new TypeError('x') }, call)).retry).toBe('none');
    expect((await errorOf({ status: 502 }, call)).retry).toBe('none');
    expect(
      (await errorOf({ status: 400, body: 'instance is starting or not authorized' }, call)).retry,
    ).toBe('pause');
  });

  it('checkAccount: никогда не повторяется — ни сеть, ни таймаут, ни 429/499/5xx, ни 469/not-ready (ВА-7)', async () => {
    for (const reply of [
      { throws: new TypeError('x') },
      { status: 429 },
      { status: 499 },
      { status: 502 },
      { status: 469 },
      { status: 400, body: 'instance is starting or not authorized' },
    ] as MockReply[]) {
      const m = mockFetch(reply);
      const e = (await catchError(
        makeClient(m.fetch).checkAccount('79991234567'),
      )) as GreenApiError;
      expect(e.retry).toBe('none');
      expect(m.calls).toHaveLength(1);
    }
  });

  it('receive/getState/getSettings клиент сам не повторяет: ровно один fetch на вызов', async () => {
    for (const run of [
      (c: ReturnType<typeof makeClient>) => c.receiveNotification(),
      (c: ReturnType<typeof makeClient>) => c.getStateInstance(),
      (c: ReturnType<typeof makeClient>) => c.getSettings(),
    ]) {
      const m = mockFetch({ status: 502 });
      await catchError(run(makeClient(m.fetch)));
      expect(m.calls).toHaveLength(1);
    }
  });
});
