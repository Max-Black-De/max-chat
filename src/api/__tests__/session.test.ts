import { afterEach, describe, expect, it, vi } from 'vitest';
import { GreenApiErrorCode as C, GreenApiSessionError, isSessionInvalidError } from '../errors';
import { messageLength, type GreenApiClient } from '../client';
import { MAX_MESSAGE_LENGTH } from '../constants';
import type { GreenApiLogger } from '../clientTypes';
import {
  FAKE_TOKEN,
  blockRealNetwork,
  catchError,
  makeClient,
  mockFetch,
  recordingSleep,
  type MockReply,
  asGreenApiError,
  asSessionError,
  catchGreenApiError,
} from '../../test/apiHelpers';

blockRealNetwork();
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

type Call = (c: GreenApiClient, signal?: AbortSignal) => Promise<unknown>;
const opt = (signal?: AbortSignal) => (signal ? { signal } : {});
const CALLS: Record<string, Call> = {
  getStateInstance: (c, s) => c.getStateInstance(opt(s)),
  getSettings: (c, s) => c.getSettings(opt(s)),
  checkAccount: (c, s) => c.checkAccount('79991234567', opt(s)),
  sendMessage: (c, s) => c.sendMessage({ chatId: '10000002', message: 'x' }, opt(s)),
  receiveNotification: (c, s) => c.receiveNotification(opt(s)),
  deleteNotification: (c, s) => c.deleteNotification(1, opt(s)),
};
const NAMES = Object.keys(CALLS);
const run = (name: string): Call => {
  const f = CALLS[name];
  if (!f) throw new Error(name);
  return f;
};

describe('«сессия невалидна» — один класс для 401 / 403 / expired / deleted (EC-E2, EC-P13)', () => {
  const INVALID: [string, MockReply, C][] = [
    ['401 без тела', { status: 401, body: '' }, C.UNAUTHORIZED],
    ['403', { status: 403, body: '' }, C.FORBIDDEN],
    ['400 expired', { status: 400, body: 'Instance account is expired' }, C.INSTANCE_EXPIRED],
    ['400 deleted', { status: 400, body: 'Instance is deleted' }, C.INSTANCE_DELETED],
    [
      '200 {status:false} expired',
      { status: 200, body: { status: false, reason: 'Instance account is expired' } },
      C.INSTANCE_EXPIRED,
    ],
    [
      '500 {status:false} deleted',
      { status: 500, body: { status: false, reason: 'Instance is deleted' } },
      C.INSTANCE_DELETED,
    ],
  ];

  for (const name of NAMES) {
    it.each(INVALID)(
      `${name}: %s → GreenApiSessionError, retry none, 1 запрос`,
      async (_n, reply, code) => {
        const m = mockFetch(reply);
        const e = await catchError(run(name)(makeClient(m.fetch)));
        expect(e).toBeInstanceOf(GreenApiSessionError);
        expect(isSessionInvalidError(e)).toBe(true);
        const err = asSessionError(e);
        expect(err.code).toBe(code);
        expect(err.retry).toBe('none');
        expect(err.sessionInvalid).toBe(true);
        expect(err.toJSON()).toMatchObject({ sessionInvalid: true });
        expect(m.calls).toHaveLength(1);
      },
    );
  }

  it('403 `Your account is suspended`: на sendMessage — не сессия (свой текст п. 3.6), на прочих — сессия', async () => {
    const reply = { status: 403, body: 'Your account is suspended' };
    const eSend = await catchError(run('sendMessage')(makeClient(mockFetch(reply).fetch)));
    expect(asGreenApiError(eSend).code).toBe(C.ACCOUNT_SUSPENDED);
    expect(isSessionInvalidError(eSend)).toBe(false);
    for (const name of NAMES.filter((n) => n !== 'sendMessage')) {
      const e = await catchError(run(name)(makeClient(mockFetch(reply).fetch)));
      expect(isSessionInvalidError(e)).toBe(true);
    }
  });

  it.each<[string, MockReply]>([
    ['429', { status: 429 }],
    ['502', { status: 502 }],
    ['not ready', { status: 400, body: 'instance is starting or not authorized' }],
    ['webhook', { status: 400, body: 'custom webhook url is set' }],
    ['сеть', { throws: new TypeError('Failed to fetch') }],
  ])('%s — не «сессия невалидна»', async (_n, reply) => {
    const e = await catchError(run('getStateInstance')(makeClient(mockFetch(reply).fetch)));
    expect(isSessionInvalidError(e)).toBe(false);
  });
});

/** fetch, который НЕ уважает AbortSignal и отвечает, когда тест скажет (поздний ответ). */
function lateFetch(body: object) {
  const calls: string[] = [];
  let release: () => void = () => undefined;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const fn = async (input: RequestInfo | URL): Promise<Response> => {
    calls.push(String(input instanceof Request ? input.url : input));
    await gate;
    return new Response(JSON.stringify(body), { status: 200 });
  };
  return {
    fetch: fn,
    calls,
    release: () => {
      release();
    },
  };
}

describe('close(): ответы старой сессии отбрасываются (EC-S7, EC-P16)', () => {
  it.each(NAMES)(
    '%s: запрос в полёте + close() → SESSION_CLOSED (fetch уважает abort)',
    async (name) => {
      const m = mockFetch({ hang: true });
      const c = makeClient(m.fetch);
      const p = catchError(run(name)(c));
      await Promise.resolve();
      c.close();
      const e = asGreenApiError(await p);
      expect(e.code).toBe(C.SESSION_CLOSED);
      expect(e.retry).toBe('none');
      expect(c.isClosed()).toBe(true);
    },
  );

  it('поздний ответ после close() (fetch проигнорировал abort) не возвращается вызывающему', async () => {
    const f = lateFetch({ receiptId: 5, body: { typeWebhook: 'incomingMessageReceived' } });
    const lines: string[] = [];
    const logger: GreenApiLogger = {
      debug: (msg) => lines.push(msg),
      warn: (msg) => lines.push(msg),
    };
    const c = makeClient(f.fetch, { logger });
    const p = catchError(c.receiveNotification());
    await Promise.resolve();
    c.close();
    f.release();
    const e = asGreenApiError(await p);
    expect(e.code).toBe(C.SESSION_CLOSED);
    expect(e.receiptId).toBeUndefined();
    expect(lines).not.toContain('GREEN-API response');
  });

  it('после close() новые вызовы — SESSION_CLOSED без запроса; close() идемпотентен', async () => {
    const m = mockFetch({ body: { stateInstance: 'authorized' } });
    const c = makeClient(m.fetch);
    c.close();
    c.close();
    for (const name of NAMES) {
      const e = await catchGreenApiError(run(name)(c));
      expect(e.code).toBe(C.SESSION_CLOSED);
    }
    expect(m.calls).toHaveLength(0);
  });

  it('close() во время паузы автоповтора sendMessage 429 → SESSION_CLOSED, повтора нет', async () => {
    const m = mockFetch({ status: 429 }, { body: { idMessage: '1' } });
    const holder: { client?: GreenApiClient } = {};
    const sleep = (_ms: number, signal?: AbortSignal) =>
      new Promise<void>((_res, rej) => {
        signal?.addEventListener('abort', () => {
          rej(new Error('aborted'));
        });
        holder.client?.close();
      });
    const client = makeClient(m.fetch, { sleep });
    holder.client = client;
    const e = await catchGreenApiError(run('sendMessage')(client));
    expect(e.code).toBe(C.SESSION_CLOSED);
    expect(m.calls).toHaveLength(1);
  });

  it('close() во время паузы delete (sleep не уважает signal) → SESSION_CLOSED, повтора нет', async () => {
    const m = mockFetch({ status: 502 }, { body: { result: true } });
    const holder: { client?: GreenApiClient } = {};
    const sleep = () => {
      holder.client?.close();
      return Promise.resolve();
    };
    const client = makeClient(m.fetch, { sleep });
    holder.client = client;
    const e = await catchGreenApiError(run('deleteNotification')(client));
    expect(e.code).toBe(C.SESSION_CLOSED);
    expect(m.calls).toHaveLength(1);
  });

  it('новый клиент (новая сессия) не зависит от закрытого старого', async () => {
    const old = makeClient(mockFetch({ hang: true }).fetch);
    const pOld = catchError(old.receiveNotification());
    const fresh = makeClient(mockFetch({ body: { stateInstance: 'authorized' } }).fetch);
    old.close();
    expect(asGreenApiError(await pOld).code).toBe(C.SESSION_CLOSED);
    await expect(fresh.getStateInstance()).resolves.toEqual({ stateInstance: 'authorized' });
    expect(fresh.isClosed()).toBe(false);
  });

  it('внешний AbortSignal по-прежнему даёт ABORTED (не SESSION_CLOSED)', async () => {
    const c = makeClient(mockFetch({ hang: true }).fetch);
    const ctrl = new AbortController();
    const p = catchError(c.getSettings({ signal: ctrl.signal }));
    ctrl.abort();
    expect(asGreenApiError(await p).code).toBe(C.ABORTED);
  });
});

describe('внешний signal отменён, пока читалось тело → ABORTED (EC-P16)', () => {
  /** fetch, у которого `text()` сам отменяет внешний signal и всё равно отдаёт тело. */
  function abortDuringBody(ctrl: AbortController, body: object) {
    const calls: string[] = [];
    const fn = (input: RequestInfo | URL): Promise<Response> => {
      calls.push(String(input instanceof Request ? input.url : input));
      const res = new Response(JSON.stringify(body), { status: 200 });
      Object.defineProperty(res, 'text', {
        value: () => {
          ctrl.abort();
          return Promise.resolve(JSON.stringify(body));
        },
      });
      return Promise.resolve(res);
    };
    return { fetch: fn, calls };
  }

  it.each<[string, object]>([
    ['receiveNotification', { receiptId: 5, body: { typeWebhook: 'incomingMessageReceived' } }],
    ['getStateInstance', { stateInstance: 'authorized' }],
    ['sendMessage', { idMessage: '1790000000123' }],
    ['deleteNotification', { result: true }],
  ])('%s: ответ после abort не обрабатывается', async (name, body) => {
    const ctrl = new AbortController();
    const f = abortDuringBody(ctrl, body);
    const c = makeClient(f.fetch);
    const e = await catchGreenApiError(run(name)(c, ctrl.signal));
    expect(e.code).toBe(C.ABORTED);
    expect(e.retry).toBe('none');
    expect(e.receiptId).toBeUndefined();
    expect(f.calls).toHaveLength(1);
  });

  it('fetch проигнорировал abort и ответил позже → ABORTED, receiptId не отдаётся', async () => {
    const f = lateFetch({ receiptId: 5, body: { typeWebhook: 'incomingMessageReceived' } });
    const ctrl = new AbortController();
    const c = makeClient(f.fetch);
    const p = catchError(c.receiveNotification({ signal: ctrl.signal }));
    await Promise.resolve();
    ctrl.abort();
    f.release();
    const e = asGreenApiError(await p);
    expect(e.code).toBe(C.ABORTED);
    expect(e.receiptId).toBeUndefined();
    expect(c.isClosed()).toBe(false);
  });
});

describe('токен не попадает в ошибки и логи, включая TypeError fetch с URL, cause и stack (EC-X1, EC-T6)', () => {
  const tokenUrl = `https://api.example.test/waInstance110000000042/getSettings/${FAKE_TOKEN}`;
  const fetchErrors: [string, unknown][] = [
    ['TypeError с URL', new TypeError(`Failed to fetch ${tokenUrl}`)],
    [
      'TypeError с cause',
      Object.assign(new TypeError('fetch failed'), {
        cause: new Error(`connect ECONNREFUSED ${tokenUrl}`),
      }),
    ],
    ['DOMException', new DOMException(`NetworkError at ${tokenUrl}`, 'NetworkError')],
    ['не Error', { message: tokenUrl, url: tokenUrl }],
    ['строка', tokenUrl],
  ];

  it.each(fetchErrors)('%s', async (_n, thrown) => {
    const consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((k) =>
      vi.spyOn(console, k).mockImplementation(() => undefined),
    );
    // Логгер, который пишет прямо в console — как сделает F2/F5.
    const logger: GreenApiLogger = {
      debug: (msg, data) => {
        console.warn(msg, data);
      },
      warn: (msg, data) => {
        console.warn(msg, data);
      },
    };
    const c = makeClient(mockFetch({ throws: thrown }).fetch, { logger });
    for (const name of NAMES) {
      const e = await catchGreenApiError(run(name)(c));
      expect(e.code).toBe(C.NETWORK);
      expect('cause' in e).toBe(false);
      const views = [
        String(e),
        e.message,
        e.stack ?? '',
        JSON.stringify(e),
        JSON.stringify(e.toJSON()),
      ];
      for (const v of views) expect(v).not.toContain(FAKE_TOKEN);
      for (const v of Object.values(e)) expect(String(v)).not.toContain(FAKE_TOKEN);
    }
    let logged = 0;
    for (const spy of consoleSpies) {
      for (const args of spy.mock.calls) {
        logged++;
        expect(JSON.stringify(args)).not.toContain(FAKE_TOKEN);
      }
    }
    expect(logged).toBeGreaterThan(0);
  });

  it('sendMessage 429 с повторами: ни одна строка лога не содержит токен', async () => {
    const lines: string[] = [];
    const logger: GreenApiLogger = {
      debug: (m, d) => lines.push(`${m} ${JSON.stringify(d)}`),
      warn: (m, d) => lines.push(`${m} ${JSON.stringify(d)}`),
    };
    const s = recordingSleep();
    const c = makeClient(mockFetch({ status: 429 }).fetch, { logger, sleep: s.sleep });
    await catchError(run('sendMessage')(c));
    expect(lines.some((l) => l.startsWith('GREEN-API retry'))).toBe(true);
    for (const l of lines) expect(l).not.toContain(FAKE_TOKEN);
  });
});

describe('форматы (EC-I3, EC-U2)', () => {
  it('receiptId > 2^53 → UNEXPECTED_RESPONSE с backoff, без попытки удалить', async () => {
    const m = mockFetch({ body: '{"receiptId":9007199254740994,"body":{}}' });
    const e = await catchGreenApiError(makeClient(m.fetch).receiveNotification());
    expect(e.code).toBe(C.UNEXPECTED_RESPONSE);
    expect(e.retry).toBe('backoff');
    expect(e.receiptId).toBeUndefined();
  });

  it('text.length: ZWJ-семья = 8, суррогатная пара = 2; 4000 можно, 4001 нельзя', async () => {
    expect(messageLength('👨‍👩‍👧')).toBe(8);
    expect(messageLength('😀')).toBe(2);
    expect(messageLength('я')).toBe(1);
    const m = mockFetch({ body: { idMessage: '1' } });
    const c = makeClient(m.fetch);
    const ok = 'a'.repeat(MAX_MESSAGE_LENGTH - 2) + '😀';
    expect(ok.length).toBe(4000);
    await c.sendMessage({ chatId: '10000002', message: ok });
    const tooLong = 'a'.repeat(MAX_MESSAGE_LENGTH - 1) + '😀';
    const e = await catchGreenApiError(c.sendMessage({ chatId: '10000002', message: tooLong }));
    expect(e.code).toBe(C.INVALID_ARGUMENT);
    expect(m.calls).toHaveLength(1);
  });
});
