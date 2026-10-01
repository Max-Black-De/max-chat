import { beforeEach, vi } from 'vitest';
import { createGreenApiClient } from '../api/client';
import { GreenApiError, GreenApiQuotaError, GreenApiSessionError } from '../api/errors';
import { ID_INSTANCE } from './fixtures/constants';
import type { GreenApiClientConfig, GreenApiLogger } from '../api/clientTypes';

/**
 * Общие помощники тестов клиента GREEN-API (fetch-мок, логгер, пауза), см. `src/api/__tests__`.
 * Условные учётные данные: токен — явная заглушка, не похожая на секрет (публичный репозиторий,
 * gitleaks и verify:dist, НФТ-11). Значение то же, что у F2; idInstance — общий `ID_INSTANCE` из `src/test/fixtures`.
 */
export const FAKE_TOKEN = 'TEST-TOKEN-placeholder-not-a-secret';
export const FAKE_CREDS = {
  apiUrl: 'https://api.example.test/',
  idInstance: ID_INSTANCE,
  apiTokenInstance: FAKE_TOKEN,
} as const;

export type MockReply =
  | {
      status?: number;
      body?: string | object | null;
      delayMs?: number;
      headers?: Record<string, string>;
    }
  | { throws: unknown }
  | { hang: true };

export interface RecordedCall {
  url: string;
  init: RequestInit;
}

/** fetch-мок с очередью ответов. Последний ответ повторяется, если очередь кончилась. */
export function mockFetch(...replies: MockReply[]) {
  const calls: RecordedCall[] = [];
  const queue = [...replies];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    calls.push({ url: input instanceof Request ? input.url : input.toString(), init: init ?? {} });
    const reply = (queue.length > 1 ? queue.shift() : queue[0]) ?? { status: 500 };
    const signal = init?.signal;
    if ('throws' in reply) throw reply.throws;
    const abortable = (ms: number | undefined) =>
      new Promise<void>((resolve, reject) => {
        const onAbort = () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        };
        if (signal?.aborted) {
          onAbort();
          return;
        }
        signal?.addEventListener('abort', onAbort, { once: true });
        if (ms !== undefined) setTimeout(resolve, ms);
      });
    if ('hang' in reply) {
      await abortable(undefined);
    } else if (reply.delayMs) {
      await abortable(reply.delayMs);
    }
    if ('hang' in reply) throw new Error('unreachable');
    const { status = 200, body = '', headers } = reply;
    const text = body === null ? 'null' : typeof body === 'string' ? body : JSON.stringify(body);
    return new Response(status === 204 ? null : text, headers ? { status, headers } : { status });
  });
  return { fetch: fn as unknown as typeof fetch, calls };
}

export function recordingLogger() {
  const lines: string[] = [];
  const logger: GreenApiLogger = {
    debug: (m, d) => lines.push(`DEBUG ${m} ${JSON.stringify(d)}`),
    warn: (m, d) => lines.push(`WARN ${m} ${JSON.stringify(d)}`),
  };
  return { logger, lines };
}

/**
 * Инъектируемая пауза для встроенных повторов: не ждёт реально, записывает длительности,
 * уважает AbortSignal (уже отменённый — отказ).
 */
export function recordingSleep() {
  const delays: number[] = [];
  const sleep = (ms: number, signal?: AbortSignal): Promise<void> => {
    delays.push(ms);
    return signal?.aborted ? Promise.reject(new Error('aborted')) : Promise.resolve();
  };
  return { sleep, delays };
}

/** Клиент на моках. По умолчанию паузы повторов мгновенные (`recordingSleep`). */
export function makeClient<H = ReturnType<typeof globalThis.setTimeout>>(
  fetchImpl: typeof fetch,
  extra: Partial<GreenApiClientConfig<H>> = {},
) {
  return createGreenApiClient<H>({
    ...FAKE_CREDS,
    fetch: fetchImpl,
    sleep: recordingSleep().sleep,
    ...extra,
  });
}

/** Ловит отклонённый промис и возвращает ошибку (падает, если промис выполнился). */
export async function catchError(p: Promise<unknown>): Promise<unknown> {
  try {
    await p;
  } catch (e) {
    return e;
  }
  throw new Error('Expected promise to reject');
}

function expectInstance<T>(e: unknown, cls: abstract new (...args: never[]) => T, name: string): T {
  if (e instanceof cls) return e;
  throw new Error(`Expected ${name}, got ${e instanceof Error ? e.name : typeof e}`);
}

/** Значение — `GreenApiError` (проверка `instanceof`, без приведения типов). */
export function asGreenApiError(e: unknown): GreenApiError {
  return expectInstance(e, GreenApiError, 'GreenApiError');
}

export function asQuotaError(e: unknown): GreenApiQuotaError {
  return expectInstance(e, GreenApiQuotaError, 'GreenApiQuotaError');
}

export function asSessionError(e: unknown): GreenApiSessionError {
  return expectInstance(e, GreenApiSessionError, 'GreenApiSessionError');
}

/** Ловит отклонённый промис и проверяет, что это `GreenApiError` (падает иначе). */
export async function catchGreenApiError(p: Promise<unknown>): Promise<GreenApiError> {
  return asGreenApiError(await catchError(p));
}

/** То же для 466: `GreenApiQuotaError`. */
export async function catchQuotaError(p: Promise<unknown>): Promise<GreenApiQuotaError> {
  return asQuotaError(await catchError(p));
}

/** Реальная сеть в тестах запрещена: любой непомоканный глобальный fetch падает. */
export function blockRealNetwork(): void {
  beforeEach(() => {
    vi.stubGlobal('fetch', () => {
      throw new Error('Real network access is forbidden in unit tests — pass a mocked fetch');
    });
  });
}

/** i-й записанный вызов fetch (падает, если его нет). */
export function callAt(calls: readonly RecordedCall[], i: number): RecordedCall {
  const c = calls[i];
  if (!c) throw new Error(`fetch call #${i} was not made`);
  return c;
}

/** Тело записанного запроса как строка (клиент всегда шлёт JSON-строку). */
export function bodyText(call: RecordedCall): string {
  return typeof call.init.body === 'string' ? call.init.body : '';
}
