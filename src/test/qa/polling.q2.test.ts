/**
 * Q2 (Д3), только моки: цикл опроса на сценариях `src/test/fixtures/polling.ts`, которых нет в
 * `src/polling/loop.test.ts` (там уже есть deleteTooManyRequests, foreignInstance, timerRule и
 * поздний ответ после abort):
 * - EC-P17 после таймаута запроса 30 с: backoff не создаётся `setTimeout` в той же задаче,
 *   что и колбэк таймаута (иначе растёт цепочка таймеров Chrome), `setInterval` нет; время в
 *   тесте стоит, поэтому пустой receive после паузы — «быстрый» и по §6.1 п. 2.2 получает вторую
 *   паузу 1 с: ровно две паузы — ожидаемо;
 * - §6.1 п. 2.2 (v1.3.7): пустой ответ быстрее 1 с → пауза 1 с перед следующим receive
 *   (регресс BUG-Q2-02, исправлено в 319cb40).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGreenApiClient } from '../../api';
import { runPollLoop } from '../../polling';
import {
  API_TOKEN,
  FAST_EMPTY_RECEIVE_MS,
  ID_INSTANCE,
  POLLING,
  fastEmptyReceiveScenario,
  timerRuleAfterTimeoutScenario,
  toFetchResult,
  type MockReply,
} from '../fixtures';

type Step = MockReply | { hang: true };

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

/** Сброс очереди микрозадач без таймеров (`vi.waitFor` сам ставит setTimeout). */
async function flushMicrotasks(rounds = 50) {
  for (let i = 0; i < rounds; i++) await Promise.resolve();
}

function scriptedLoop(steps: readonly Step[], options: { msPerReceive?: number } = {}) {
  const queue = [...steps];
  const controller = new AbortController();
  const methods: string[] = [];
  const sleeps: number[] = [];
  let idle: () => void = () => undefined;
  const drained = new Promise<void>((r) => {
    idle = r;
  });
  const scheduled: { fn: () => void; ms: number }[] = [];

  const fetchImpl = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = input instanceof Request ? input.url : input.toString();
    const method = /\/waInstance\d+\/([A-Za-z]+)\//.exec(url)?.[1] ?? '?';
    methods.push(method);
    if (method !== 'receiveNotification')
      return toFetchResult({
        status: 200,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
        body: '{"result":true}',
      });
    if (options.msPerReceive) vi.setSystemTime(Date.now() + options.msPerReceive);
    let step = queue.shift();
    if (step === undefined) {
      idle();
      step = { hang: true };
    }
    if ('hang' in step) {
      await new Promise<never>((_r, reject) => {
        const abort = () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        };
        if (init.signal?.aborted) abort();
        init.signal?.addEventListener('abort', abort, { once: true });
      });
    }
    return toFetchResult(step as MockReply);
  };

  const client = createGreenApiClient({
    idInstance: ID_INSTANCE,
    apiTokenInstance: API_TOKEN,
    fetch: fetchImpl,
    timers: {
      setTimeout: (fn: () => void, ms: number) => scheduled.push({ fn, ms }),
      clearTimeout: () => undefined,
    },
  });
  return { client, controller, methods, sleeps, scheduled, drained };
}

describe('EC-P17: backoff после таймаута запроса', () => {
  it('таймаут receive 30 с → пауза 1 с через AbortSignal.timeout, не setTimeout в задаче таймера', async () => {
    const s = timerRuleAfterTimeoutScenario;
    const h = scriptedLoop([{ hang: true }, ...s.receive.slice(1)]);
    const sleepTimers: AbortController[] = [];
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => {
      const c = new AbortController();
      sleepTimers.push(c);
      return c.signal;
    });
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');

    const run = runPollLoop({
      client: h.client,
      handle: () => undefined,
      signal: h.controller.signal,
    });
    await flushMicrotasks();
    const requestTimeout = h.scheduled.find((t) => t.ms === POLLING.requestTimeoutSec * 1000);
    if (!requestTimeout) throw new Error('таймаут запроса 30 с не запланирован');

    // «Задача таймера»: колбэк таймаута и все микрозадачи после него.
    setTimeoutSpy.mockClear();
    const scheduledBefore = h.scheduled.length;
    requestTimeout.fn();
    await flushMicrotasks();
    expect(setTimeoutSpy).not.toHaveBeenCalled();
    expect(h.scheduled.length).toBe(scheduledBefore);
    expect(timeoutSpy.mock.calls.map((c) => c[0])).toEqual([
      s.expected.receiveBackoffSec[0] * 1000,
    ]);

    // Пауза закончилась → пустой receive. Время стоит, ответ «быстрый» → вторая пауза 1 с
    // (§6.1 п. 2.2, v1.3.7), тоже через AbortSignal.timeout. Ждём её без таймеров:
    // vi.waitFor ставит setTimeout/setInterval и сломал бы проверки ниже.
    sleepTimers[0]?.abort(new DOMException('timeout', 'TimeoutError'));
    for (let i = 0; i < 20 && timeoutSpy.mock.calls.length < 2; i++) await flushMicrotasks();
    expect(timeoutSpy.mock.calls.map((c) => c[0])).toEqual(
      s.expected.receiveBackoffSec.map((x) => x * 1000),
    );
    expect(h.scheduled.length).toBe(scheduledBefore + 1); // только таймаут 30 с второго receive
    sleepTimers[1]?.abort(new DOMException('timeout', 'TimeoutError'));
    await h.drained;
    h.controller.abort();
    expect(await run).toBe('aborted');
    expect(h.methods.filter((m) => m === 'deleteNotification')).toEqual([]);
    expect(setIntervalSpy).not.toHaveBeenCalled();
  });
});

describe('§6.1 п. 2.2 (v1.3.7): защита от холостого цикла', () => {
  // Регресс BUG-Q2-02, исправлено в 319cb40.
  it('BUG-Q2-02: пустой ответ быстрее 1 с → пауза 1 с перед следующим receive', async () => {
    const s = fastEmptyReceiveScenario;
    const h = scriptedLoop(s.receive);
    const run = runPollLoop({
      client: h.client,
      handle: () => undefined,
      signal: h.controller.signal,
      sleep: (ms) => {
        h.sleeps.push(ms);
        return Promise.resolve();
      },
    });
    await h.drained;
    h.controller.abort();
    await run;
    expect(h.sleeps).toEqual(s.expected.receiveBackoffSec.map((x) => x * 1000));
  });

  it('пустой ответ через ≥ 1 с (сервер держал receiveTimeout) → сразу следующий receive, без паузы', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const s = fastEmptyReceiveScenario;
    const h = scriptedLoop(s.receive, { msPerReceive: FAST_EMPTY_RECEIVE_MS + 500 });
    const run = runPollLoop({
      client: h.client,
      handle: () => undefined,
      signal: h.controller.signal,
      sleep: (ms) => {
        h.sleeps.push(ms);
        return Promise.resolve();
      },
    });
    await h.drained;
    h.controller.abort();
    await run;
    expect(h.sleeps).toEqual([]);
    expect(h.methods.filter((m) => m === 'deleteNotification')).toHaveLength(1);
  });
});
