import { describe, expect, it, vi } from 'vitest';
import { createGreenApiClient } from '../client';
import { GreenApiError } from '../errors';
import { describeError, type ErrorContext } from '../messages';
import { maskToken, redactSecret } from '../mask';
import {
  FAKE_CREDS,
  FAKE_TOKEN,
  catchError,
  makeClient,
  mockFetch,
  recordingLogger,
  type MockReply,
  blockRealNetwork,
  callAt,
} from '../../test/apiHelpers';

blockRealNetwork();

/** Все текстовые представления ошибки, которые могут оказаться в консоли/логах/UI. */
function allRenderings(e: unknown): string[] {
  const contexts: ErrorContext[] = ['login', 'session', 'checkAccount', 'send'];
  return [
    String(e),
    (e as Error).message,
    (e as Error).stack ?? '',
    JSON.stringify(e),
    ...contexts.map((c) => describeError(e, c)),
  ];
}

const ERROR_REPLIES: [string, MockReply][] = [
  ['401', { status: 401, body: '' }],
  ['403', { status: 403, body: '' }],
  [
    '400 с токеном в теле',
    { status: 400, body: `Validation failed for /getSettings/${FAKE_TOKEN}` },
  ],
  [
    '400 JSON с токеном',
    { status: 400, body: { message: `bad token ${encodeURIComponent(FAKE_TOKEN)}` } },
  ],
  ['429', { status: 429 }],
  [
    '466',
    { status: 466, body: { correspondentsStatus: { used: 3, total: 3, description: FAKE_TOKEN } } },
  ],
  [
    '500 с токеном',
    {
      status: 500,
      body: `crash at https://api.example.test/waInstance110000000042/x/${FAKE_TOKEN}`,
    },
  ],
  [
    'сеть (сообщение fetch содержит URL с токеном)',
    { throws: new TypeError(`fetch failed: https://x/${FAKE_TOKEN}`) },
  ],
  ['невалидный JSON с токеном', { status: 200, body: `<html>${FAKE_TOKEN}</html>` }],
  [
    '{status:false} с токеном',
    { status: 200, body: { status: false, reason: `oops ${FAKE_TOKEN}` } },
  ],
];

describe('маскирование токена (НФТ-3, §4.1 п. 1.10)', () => {
  it('maskToken не раскрывает ни одного символа', () => {
    expect(maskToken(FAKE_TOKEN)).toBe('***');
  });

  it('redactSecret убирает токен и его URL-кодированную форму', () => {
    const t = 'a/b c';
    expect(redactSecret(`x ${t} y ${encodeURIComponent(t)}`, t)).toBe('x *** y ***');
    expect(redactSecret('abc', '')).toBe('abc');
  });

  it.each(ERROR_REPLIES)(
    'ошибка «%s»: токена нет ни в одном представлении и в логах',
    async (_name, reply) => {
      const { logger, lines } = recordingLogger();
      const c = makeClient(mockFetch(reply).fetch, { logger });
      for (const call of [
        () => c.getSettings(),
        () => c.sendMessage({ chatId: '10000002', message: 'x' }),
      ]) {
        const e = await catchError(call());
        expect(e).toBeInstanceOf(GreenApiError);
        for (const s of allRenderings(e)) expect(s).not.toContain(FAKE_TOKEN);
      }
      expect(lines.length).toBeGreaterThan(0);
      for (const l of lines) expect(l).not.toContain(FAKE_TOKEN);
    },
  );

  it('таймаут: токена нет', async () => {
    vi.useFakeTimers();
    const c = makeClient(mockFetch({ hang: true }).fetch);
    const p = catchError(c.getStateInstance({ timeoutMs: 10 }));
    await vi.advanceTimersByTimeAsync(10);
    for (const s of allRenderings(await p)) expect(s).not.toContain(FAKE_TOKEN);
  });

  it('ошибка конфигурации (createGreenApiClient) не содержит токен', () => {
    let e: unknown;
    try {
      createGreenApiClient({ ...FAKE_CREDS, idInstance: 'bad' });
    } catch (err) {
      e = err;
    }
    expect(e).toBeInstanceOf(GreenApiError);
    for (const s of allRenderings(e)) expect(s).not.toContain(FAKE_TOKEN);
  });

  it('успешные запросы: в debug-логе только замаскированный URL', async () => {
    const { logger, lines } = recordingLogger();
    const c = makeClient(mockFetch({ body: { stateInstance: 'authorized' } }).fetch, { logger });
    await c.getStateInstance();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('/waInstance110000000042/getStateInstance/***');
    expect(lines[0]).not.toContain(FAKE_TOKEN);
  });

  it('клиент: toString, JSON.stringify, util.inspect, Object.keys не раскрывают токен', () => {
    const c = makeClient(mockFetch({ body: {} }).fetch);
    expect(String(c)).toBe(
      'GreenApiClient(https://api.example.test, waInstance110000000042, token=***)',
    );
    expect(JSON.stringify(c)).toBe(
      '{"apiUrl":"https://api.example.test","idInstance":"110000000042","apiTokenInstance":"***"}',
    );
    const inspectFn = (c as unknown as Record<symbol, () => string>)[
      Symbol.for('nodejs.util.inspect.custom')
    ];
    expect(inspectFn?.()).toBe(String(c));
    for (const k of Object.getOwnPropertyNames(c)) {
      expect(String((c as unknown as Record<string, unknown>)[k])).not.toContain(FAKE_TOKEN);
    }
    for (const k of Object.keys(c))
      expect(String((c as unknown as Record<string, unknown>)[k])).not.toContain(FAKE_TOKEN);
  });

  it('клиент по умолчанию ничего не пишет в console', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => undefined),
    );
    const c = makeClient(mockFetch({ status: 401 }).fetch);
    await catchError(c.getStateInstance());
    for (const s of spies) expect(s).not.toHaveBeenCalled();
  });

  it('токен уходит только в URL запроса, не в тело и не в заголовки', async () => {
    const m = mockFetch({ body: { idMessage: '1' } });
    await makeClient(m.fetch).sendMessage({ chatId: '10000002', message: 'x' });
    const { url, init } = callAt(m.calls, 0);
    expect(url).toContain(FAKE_TOKEN);
    expect(typeof init.body === 'string' ? init.body : '').not.toContain(FAKE_TOKEN);
    expect(JSON.stringify(init.headers ?? {})).not.toContain(FAKE_TOKEN);
  });
});
