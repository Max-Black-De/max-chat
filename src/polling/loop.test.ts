/**
 * Д-2: цикл опроса (§6.1) с моком `fetch` поверх настоящего клиента F1. Паузы — записываются
 * без ожидания (цикл и встроенные повторы delete). Только условные данные (НФТ-11).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGreenApiClient, GreenApiError, GreenApiErrorCode } from '../api';
import { deferred, type Deferred } from '../test/fixtures/greenApiMock';
import {
  API_TOKEN,
  ID_INSTANCE,
  PHONES,
  deleteResponses,
  deleteTooManyRequestsScenario,
  emptyReceiveResponses,
  errorResponses,
  foreignInstanceScenario,
  incomingText,
  networkError,
  networkTimeout,
  noiseThenReply,
  nonJsonReceiveResponses,
  notificationResponse,
  quota466Cases,
  receipt,
  receiveBackoffDelaysSec,
  timerRuleScenario,
  tooManyRequestsResponses,
  toFetchResult,
  unsafeReceiptIdResponse,
  type MockReply,
} from '../test/fixtures';
import {
  abortableSleep,
  backoffDelay,
  classifyReceiveError,
  runPollLoop,
  type PollStopReason,
} from './loop';

type Step = MockReply | { hang: true } | { deferred: Deferred };

interface Event {
  kind: 'fetch-start' | 'fetch-end' | 'sleep' | 'client-sleep' | 'handle';
  method?: string;
  receiptId?: string | undefined;
  ms?: number;
}

function harness(script: {
  receive: readonly Step[];
  delete?: readonly Step[];
  /** Сколько «длится» каждый запрос по часам цикла, мс (по умолчанию — мгновенно). */
  latencyMs?: number;
}) {
  const receive = [...script.receive];
  let clock = 0;
  const del = [...(script.delete ?? [])];
  const events: Event[] = [];
  const handled: unknown[] = [];
  const warnings: { message: string; data?: Record<string, unknown> }[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  let onIdle: () => void = () => undefined;
  const idle = new Promise<void>((r) => {
    onIdle = r;
  });

  const fetchImpl = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = input instanceof Request ? input.url : input.toString();
    const [, method = '?', receiptId] =
      /\/waInstance\d+\/([A-Za-z]+)\/[^/?]+(?:\/(\d+))?/.exec(url) ?? [];
    const isReceive = method === 'receiveNotification';
    events.push({ kind: 'fetch-start', method, receiptId });
    if (isReceive) {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
    }
    try {
      let step: Step | undefined = isReceive ? receive.shift() : del.shift();
      if (step === undefined) {
        if (!isReceive) step = deleteResponses.ok;
        else {
          onIdle();
          step = { hang: true };
        }
      }
      if ('deferred' in step) step = (await step.deferred.promise) as Step;
      if ('hang' in step) {
        await new Promise<never>((_r, reject) => {
          const abort = () => {
            reject(new DOMException('The operation was aborted.', 'AbortError'));
          };
          if (init.signal?.aborted) abort();
          init.signal?.addEventListener('abort', abort, { once: true });
        });
      }
      return await toFetchResult(step as MockReply);
    } finally {
      clock += script.latencyMs ?? 0;
      if (isReceive) inFlight--;
      events.push({ kind: 'fetch-end', method, receiptId });
    }
  };

  const client = createGreenApiClient({
    idInstance: ID_INSTANCE,
    apiTokenInstance: API_TOKEN,
    fetch: fetchImpl,
    sleep: (ms) => {
      events.push({ kind: 'client-sleep', ms });
      return Promise.resolve();
    },
  });
  const controller = new AbortController();
  let current = true;

  function run(
    options: {
      handle?: (body: unknown) => void | Promise<void>;
      sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
      now?: () => number;
    } = {},
  ): Promise<PollStopReason> {
    return runPollLoop({
      client,
      now: options.now ?? (() => clock),
      signal: controller.signal,
      isCurrent: () => current,
      handle:
        options.handle ??
        ((body) => {
          events.push({ kind: 'handle' });
          handled.push(body);
        }),
      sleep:
        options.sleep ??
        ((ms) => {
          events.push({ kind: 'sleep', ms });
          return Promise.resolve();
        }),
      warn: (message, data) => {
        warnings.push(data ? { message, data } : { message });
      },
    });
  }

  const of = (method: string) =>
    events.filter((e) => e.kind === 'fetch-start' && e.method === method);
  return {
    run,
    idle,
    events,
    handled,
    warnings,
    controller,
    client,
    receives: () => of('receiveNotification').length,
    deletes: () => of('deleteNotification').map((e) => Number(e.receiptId)),
    sleeps: () => events.filter((e) => e.kind === 'sleep').map((e) => e.ms),
    clientSleeps: () => events.filter((e) => e.kind === 'client-sleep').map((e) => e.ms),
    maxInFlight: () => maxInFlight,
    expireSession: () => {
      current = false;
    },
  };
}

/** Прогнать сценарий до «очередь пуста, receive висит», затем выйти. */
async function drain(h: ReturnType<typeof harness>, run = h.run()) {
  await h.idle;
  h.controller.abort();
  return run;
}

const note = (id: number) => notificationResponse(receipt(incomingText, id));

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('runPollLoop: receive → handle → delete (§6.1)', () => {
  it.each(Object.entries(emptyReceiveResponses))(
    'пустой ответ (%s) после long polling → сразу следующий receive, delete не вызывается (EC-P1)',
    async (_name, reply) => {
      const h = harness({ receive: [reply, reply], latencyMs: 1500 });
      expect(await drain(h)).toBe('aborted');
      expect(h.receives()).toBe(3);
      expect(h.deletes()).toEqual([]);
      expect(h.handled).toEqual([]);
      expect(h.sleeps()).toEqual([]);
    },
  );

  it('пустой ответ быстрее 1 с → пауза 1 с после завершения запроса (§6.1 п. 2.2, v1.3.7)', async () => {
    const empty = emptyReceiveResponses.emptyBody;
    const h = harness({ receive: [empty, empty, note(40)] });
    await drain(h);
    expect(h.sleeps()).toEqual([1000, 1000]);
    expect(h.deletes()).toEqual([40]);
    // Каждая пауза — сразу после завершённого receive, до следующего.
    h.events.forEach((e, i) => {
      if (e.kind === 'sleep') expect(h.events[i - 1]).toMatchObject({ kind: 'fetch-end' });
    });
  });

  it.each([
    [999, [1000]],
    [1000, []],
  ])('граница: пустой ответ за %i мс → паузы %j', async (latencyMs, expected) => {
    const h = harness({ receive: [emptyReceiveResponses.jsonNull], latencyMs });
    await drain(h);
    expect(h.sleeps()).toEqual(expected);
  });

  it('пауза после быстрого пустого ответа — один таймер на 1 с (фейковые таймеры, EC-P17)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'Date'] });
    const original = Object.getOwnPropertyDescriptor(AbortSignal, 'timeout');
    // Без AbortSignal.timeout пауза — ровно один setTimeout, его видно фейковым таймерам.
    Object.defineProperty(AbortSignal, 'timeout', { value: undefined, configurable: true });
    try {
      const h = harness({ receive: [emptyReceiveResponses.emptyBody] });
      const run = h.run({ sleep: abortableSleep, now: () => Date.now() });
      await vi.waitFor(() => {
        expect(vi.getTimerCount()).toBe(1);
      });
      expect(h.receives()).toBe(1);
      await vi.advanceTimersByTimeAsync(999);
      expect(h.receives()).toBe(1);
      await vi.advanceTimersByTimeAsync(1);
      await vi.waitFor(() => {
        expect(h.receives()).toBe(2);
      });
      h.controller.abort();
      expect(await run).toBe('aborted');
    } finally {
      if (original) Object.defineProperty(AbortSignal, 'timeout', original);
    }
  });

  it('уведомление → handle(body) → delete с тем же receiptId → следующий receive', async () => {
    const h = harness({ receive: [note(41)] });
    await drain(h);
    expect(h.handled).toEqual([incomingText]);
    expect(h.deletes()).toEqual([41]);
    const order = h.events
      .filter((e) => e.kind === 'fetch-start' || e.kind === 'handle')
      .map((e) => e.method ?? e.kind);
    expect(order).toEqual([
      'receiveNotification',
      'handle',
      'deleteNotification',
      'receiveNotification',
    ]);
  });

  it('handle бросает исключение → delete всё равно, цикл жив, в лог — только имя ошибки (EC-P3)', async () => {
    const h = harness({ receive: [note(42), note(43)] });
    const run = h.run({
      handle: () => {
        throw new Error(`секрет ${String(PHONES.primary)} ${API_TOKEN}`);
      },
    });
    await drain(h, run);
    expect(h.deletes()).toEqual([42, 43]);
    expect(h.warnings).toEqual([
      { message: 'Notification handler failed', data: { error: 'Error' } },
      { message: 'Notification handler failed', data: { error: 'Error' } },
    ]);
  });

  it('асинхронный handle: delete только после его завершения', async () => {
    const h = harness({ receive: [note(44)] });
    let release: (() => void) | undefined;
    const run = h.run({
      handle: () =>
        new Promise<void>((r) => {
          release = r;
        }),
    });
    await vi.waitFor(() => {
      expect(release).toBeDefined();
    });
    await new Promise((r) => setTimeout(r, 5));
    expect(h.deletes()).toEqual([]);
    if (!release) throw new Error('unreachable');
    release();
    await drain(h, run);
    expect(h.deletes()).toEqual([44]);
  });

  it('EC-I7: чужой инстанс, свой — по порядку, всё удалено (сценарий QA)', async () => {
    const s = foreignInstanceScenario;
    const h = harness({ receive: s.receive });
    await drain(h);
    expect(h.deletes()).toEqual(s.expected.deleteReceiptIds);
    expect(h.handled).toHaveLength(3);
  });

  it('длинный хвост: 58 уведомлений шума + ответ разбираются без пауз (R-13)', async () => {
    const queue = noiseThenReply(58, 500);
    const h = harness({ receive: queue.map((n) => notificationResponse(n)) });
    await drain(h);
    expect(h.deletes()).toEqual(queue.map((n) => n.receiptId));
    expect(h.sleeps()).toEqual([]);
    expect(h.clientSleeps()).toEqual([]);
    expect(h.maxInFlight()).toBe(1);
  });
});

describe('runPollLoop: ошибки receive (§5.4)', () => {
  it.each([
    ['сеть', networkError],
    ['таймаут', networkTimeout],
    ['429', tooManyRequestsResponses.noRetryAfter],
    ['502', errorResponses.badGateway502],
    ['непустой не-JSON без receiptId (ВА-18, EC-P2)', nonJsonReceiveResponses.html],
    ['receiptId вне safe integer (EC-I3)', unsafeReceiptIdResponse],
  ])('%s → backoff 1 → 2 → 4 с, сброс после успеха (EC-P8)', async (_name, reply) => {
    const h = harness({ receive: [reply, reply, reply, note(45), reply] });
    await drain(h);
    expect(h.sleeps()).toEqual([1000, 2000, 4000, 1000]);
    expect(h.deletes()).toEqual([45]);
    expect(h.maxInFlight()).toBe(1);
  });

  it('серия ошибок: 1 → 2 → 4 → 8 → 16 → 30 → 30 с', async () => {
    const h = harness({ receive: receiveBackoffDelaysSec.map(() => networkError) });
    await drain(h);
    expect(h.sleeps()).toEqual(receiveBackoffDelaysSec.map((s) => s * 1000));
  });

  it('466 на receive → backoff, опрос не останавливается', async () => {
    const reply = quota466Cases.correspondentsStatus.response;
    const h = harness({ receive: [reply, note(46)] });
    await drain(h);
    expect(h.sleeps()).toEqual([1000]);
    expect(h.deletes()).toEqual([46]);
  });

  it.each([
    ['instance is starting', errorResponses.starting400.json],
    ['instance in starting process', errorResponses.startingProcess400.text],
  ])('400 %s → пауза 30 с и повтор (EC-P11)', async (_name, reply) => {
    const h = harness({ receive: [reply, note(47)] });
    await drain(h);
    expect(h.sleeps()).toEqual([30_000]);
    expect(h.deletes()).toEqual([47]);
  });

  it('тело не JSON, но receiptId извлечён → delete без паузы (§5.4)', async () => {
    const h = harness({ receive: [nonJsonReceiveResponses.truncatedJson] });
    await drain(h);
    expect(h.deletes()).toEqual([1]);
    expect(h.sleeps()).toEqual([]);
    expect(h.handled).toEqual([]);
    expect(h.warnings).toEqual([
      { message: 'GREEN-API notification is not JSON, deleted', data: { type: 'invalidJson' } },
    ]);
  });

  it('400 custom webhook url на receive → стоп, новых запросов нет (EC-P12)', async () => {
    const h = harness({ receive: [errorResponses.customWebhook400.json, note(48)] });
    expect(await h.run()).toBe('webhookUrlSet');
    expect(h.receives()).toBe(1);
    expect(h.deletes()).toEqual([]);
  });

  it.each([
    ['401', errorResponses.unauthorized401],
    ['403', { ...errorResponses.unauthorized401, status: 403 }],
    ['expired', errorResponses.expired400.json],
    ['deleted', errorResponses.deleted400.json],
  ])('%s → стоп sessionInvalid (EC-P13)', async (_name, reply) => {
    const h = harness({ receive: [reply, note(49)] });
    expect(await h.run()).toBe('sessionInvalid');
    expect(h.receives()).toBe(1);
  });

  it('в лог ошибок receive — только код, метод, статус и пауза', async () => {
    const h = harness({ receive: [errorResponses.badGateway502] });
    await drain(h);
    expect(h.warnings).toEqual([
      {
        message: 'GREEN-API receiveNotification failed',
        data: {
          code: GreenApiErrorCode.SERVER,
          method: 'receiveNotification',
          httpStatus: 502,
          retryInMs: 1000,
        },
      },
    ]);
  });
});

describe('runPollLoop: delete (§5.4, ВА-17)', () => {
  it('429 ×4 на delete → 3 повтора в клиенте (1, 2, 4 с), затем следующий receive (EC-P4)', async () => {
    const s = deleteTooManyRequestsScenario;
    const h = harness({ receive: s.receive, delete: s.delete });
    await drain(h);
    expect(h.deletes()).toEqual(s.expected.deleteReceiptIds);
    expect(h.clientSleeps()).toEqual(s.expected.deleteDelaysSec.map((x) => x * 1000));
    expect(h.sleeps()).toEqual([]);
    expect(h.receives()).toBe(2);
    expect(h.warnings.map((w) => w.message)).toEqual(['GREEN-API deleteNotification failed']);
  });

  it.each([
    ['result:false', deleteResponses.resultFalse],
    ['500 findUnAckedMessage', deleteResponses.findUnAcked500],
  ])('«уже удалено» (%s) → сразу следующий receive (EC-P5)', async (_name, reply) => {
    const h = harness({ receive: [note(50), note(51)], delete: [reply] });
    await drain(h);
    expect(h.deletes()).toEqual([50, 51]);
    expect(h.warnings).toEqual([]);
  });

  it('466 на delete → backoff перед следующим receive (событие очереди, §5.4, v1.3.7)', async () => {
    const quota = quota466Cases.correspondentsStatus.response;
    const h = harness({ receive: [note(55), note(56)], delete: [quota] });
    await drain(h);
    expect(h.deletes()).toEqual([55, 56]);
    expect(h.clientSleeps()).toEqual([]);
    expect(h.sleeps()).toEqual([1000]);
    expect(h.warnings.map((w) => w.message)).toEqual(['GREEN-API deleteNotification failed']);
  });

  it('400 custom webhook url на delete → стоп (EC-P12)', async () => {
    const h = harness({
      receive: [note(52), note(53)],
      delete: [deleteResponses.customWebhook400],
    });
    expect(await h.run()).toBe('webhookUrlSet');
    expect(h.receives()).toBe(1);
  });

  it('401 на delete → стоп sessionInvalid', async () => {
    const h = harness({ receive: [note(54)], delete: [errorResponses.unauthorized401] });
    expect(await h.run()).toBe('sessionInvalid');
    expect(h.receives()).toBe(1);
  });
});

describe('runPollLoop: отмена и поздние ответы (§6.1 п. 3, EC-S7, EC-P16)', () => {
  it('abort во время receive → стоп, новых запросов нет', async () => {
    const h = harness({ receive: [] });
    const run = h.run();
    await h.idle;
    h.controller.abort();
    expect(await run).toBe('aborted');
    expect(h.receives()).toBe(1);
    await new Promise((r) => setTimeout(r, 10));
    expect(h.receives()).toBe(1);
  });

  it('ответ, пришедший после abort, не обрабатывается и не удаляется (L-26)', async () => {
    const d = deferred();
    const h = harness({ receive: [{ deferred: d }] });
    const run = h.run();
    await vi.waitFor(() => {
      expect(h.receives()).toBe(1);
    });
    h.controller.abort();
    d.release(note(77));
    expect(await run).toBe('aborted');
    expect(h.handled).toEqual([]);
    expect(h.deletes()).toEqual([]);
    expect(h.receives()).toBe(1);
  });

  it('смена сессии во время receive (isCurrent → false) → не обрабатывать и не удалять', async () => {
    const d = deferred();
    const h = harness({ receive: [{ deferred: d }] });
    const run = h.run();
    await vi.waitFor(() => {
      expect(h.receives()).toBe(1);
    });
    h.expireSession();
    d.release(note(78));
    expect(await run).toBe('aborted');
    expect(h.handled).toEqual([]);
    expect(h.deletes()).toEqual([]);
  });

  it('закрытый клиент (выход) → SESSION_CLOSED → стоп без запросов', async () => {
    const h = harness({ receive: [note(79)] });
    h.client.close();
    expect(await h.run()).toBe('aborted');
    expect(h.receives()).toBe(0);
  });

  it('abort во время backoff → стоп без нового receive', async () => {
    const h = harness({ receive: [networkError, note(80)] });
    const run = h.run({ sleep: abortableSleep });
    await vi.waitFor(() => {
      expect(h.events.some((e) => e.kind === 'fetch-end')).toBe(true);
    });
    h.controller.abort();
    expect(await run).toBe('aborted');
    expect(h.receives()).toBe(1);
  });

  it('уже отменённый signal → ни одного запроса', async () => {
    const h = harness({ receive: [note(81)] });
    h.controller.abort();
    expect(await h.run()).toBe('aborted');
    expect(h.receives()).toBe(0);
  });
});

describe('правило таймеров (EC-P17, R-22)', () => {
  it('пауза backoff — только после завершения fetch; setInterval не вызывается', async () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    const s = timerRuleScenario;
    const h = harness({ receive: s.receive });
    await drain(h);
    expect(h.sleeps()).toEqual(s.expected.receiveBackoffSec.map((x) => x * 1000));
    expect(h.deletes()).toEqual(s.expected.deleteReceiptIds);
    // Перед каждой паузой — завершённый receive, и нового receive в полёте нет.
    h.events.forEach((e, i) => {
      if (e.kind !== 'sleep') return;
      const before = h.events.slice(0, i).filter((x) => x.method === 'receiveNotification');
      expect(before.at(-1)?.kind).toBe('fetch-end');
    });
    expect(setIntervalSpy).not.toHaveBeenCalled();
  });
});

describe('backoffDelay / classifyReceiveError / abortableSleep', () => {
  it('backoffDelay: 1, 2, 4, 8, 16, 30, 30 с; отрицательное и дробное — как 0 и floor', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 50].map(backoffDelay)).toEqual([
      1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000,
    ]);
    expect(backoffDelay(-3)).toBe(1000);
    expect(backoffDelay(1.7)).toBe(2000);
  });

  it('classifyReceiveError: не GreenApiError → backoff; ABORTED → стоп', () => {
    expect(classifyReceiveError(new TypeError('x'))).toEqual({ kind: 'backoff' });
    expect(
      classifyReceiveError(
        new GreenApiError({
          code: GreenApiErrorCode.ABORTED,
          method: 'receiveNotification',
          retry: 'none',
        }),
      ),
    ).toEqual({ kind: 'stop', reason: 'aborted' });
    expect(
      classifyReceiveError(
        new GreenApiError({
          code: GreenApiErrorCode.INVALID_JSON,
          method: 'receiveNotification',
          retry: 'backoff',
        }),
      ),
    ).toEqual({ kind: 'backoff' });
  });

  it('abortableSleep: ждёт и отменяется', async () => {
    const t0 = Date.now();
    await abortableSleep(20);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(15);
    const ac = new AbortController();
    const p = abortableSleep(60_000, ac.signal);
    ac.abort();
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
    await expect(abortableSleep(10, ac.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('abortableSleep без AbortSignal.timeout — один setTimeout', async () => {
    vi.useFakeTimers();
    const original = Object.getOwnPropertyDescriptor(AbortSignal, 'timeout');
    Object.defineProperty(AbortSignal, 'timeout', { value: undefined, configurable: true });
    try {
      let done = false;
      const p = abortableSleep(1000).then(() => {
        done = true;
      });
      expect(vi.getTimerCount()).toBe(1);
      await vi.advanceTimersByTimeAsync(999);
      expect(done).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await p;
      expect(done).toBe(true);
      const ac = new AbortController();
      const q = abortableSleep(1000, ac.signal);
      ac.abort();
      await expect(q).rejects.toMatchObject({ name: 'AbortError' });
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      if (original) Object.defineProperty(AbortSignal, 'timeout', original);
    }
  });
});
