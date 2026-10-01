/**
 * Мок GREEN-API для тестов UI и сессии: ответы по имени метода из URL.
 * Значения условные (НФТ-11), токен фиктивный.
 */
import { vi } from 'vitest';
import type { ApiMethodName } from '../api/types';

export const TEST_ID_INSTANCE = '1101000000';
export const TEST_TOKEN = 'test0token0000000000000000000000000000000000000000';
export const TEST_API_URL = 'https://api.green-api.com';

export type Reply =
  | { status?: number; body?: unknown; headers?: Record<string, string> }
  | { throws: unknown }
  | { hang: true }
  /** Ответ, который тест отпустит сам: `release(reply)`. */
  | { deferred: Deferred };

export interface Deferred {
  promise: Promise<Exclude<Reply, { deferred: Deferred }>>;
  release: (reply: Exclude<Reply, { deferred: Deferred }>) => void;
}

export function deferred(): Deferred {
  let release: Deferred['release'] = () => undefined;
  const promise = new Promise<Exclude<Reply, { deferred: Deferred }>>((r) => {
    release = r;
  });
  return { promise, release };
}

export interface Call {
  method: string;
  url: string;
  init: RequestInit;
}

const OK_SETTINGS = {
  webhookUrl: '',
  incomingWebhook: 'yes',
  outgoingWebhook: 'no',
  outgoingAPIMessageWebhook: 'yes',
  outgoingMessageWebhook: 'yes',
  stateWebhook: 'no',
};

export const DEFAULT_ROUTES: Partial<Record<ApiMethodName, Reply[]>> = {
  getStateInstance: [{ body: { stateInstance: 'authorized' } }],
  getSettings: [{ body: OK_SETTINGS }],
};

export { OK_SETTINGS };

/**
 * fetch по маршрутам: для каждого метода — очередь ответов, последний повторяется.
 * Метод без маршрута — 500 (и тест это увидит в `calls`).
 */
export function routeFetch(routes: Partial<Record<ApiMethodName, Reply[]>> = DEFAULT_ROUTES) {
  const calls: Call[] = [];
  const queues = new Map<string, Reply[]>(
    Object.entries(routes).map(([k, v]) => [k, [...v]] as const),
  );
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = input instanceof Request ? input.url : input.toString();
    const method = /\/waInstance\d+\/([A-Za-z]+)\//.exec(url)?.[1] ?? '?';
    calls.push({ method, url, init });
    const q = queues.get(method) ?? [];
    let reply: Reply = (q.length > 1 ? q.shift() : q[0]) ?? { status: 500 };
    if ('deferred' in reply) reply = await reply.deferred.promise;
    const signal = init.signal;
    if ('throws' in reply) throw reply.throws;
    if ('hang' in reply) {
      await new Promise<never>((_r, reject) => {
        const onAbort = () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        };
        if (signal?.aborted) onAbort();
        signal?.addEventListener('abort', onAbort, { once: true });
      });
      throw new Error('unreachable');
    }
    const status = reply.status ?? 200;
    const text =
      reply.body === undefined
        ? ''
        : typeof reply.body === 'string'
          ? reply.body
          : JSON.stringify(reply.body);
    return new Response(text, { status, ...(reply.headers ? { headers: reply.headers } : {}) });
  });
  return {
    fetch: fetchImpl as unknown as typeof fetch,
    calls,
    callsOf: (m: ApiMethodName) => calls.filter((c) => c.method === m),
    /** Подменить очередь ответов метода на лету. */
    set: (m: ApiMethodName, replies: Reply[]) => {
      queues.set(m, [...replies]);
    },
  };
}

/** sessionStorage / localStorage в памяти; `failWrites` — эмуляция QuotaExceededError. */
export function memoryStorage(initial: Record<string, string> = {}, failWrites = false) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (failWrites) throw new DOMException('quota', 'QuotaExceededError');
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
  };
}
