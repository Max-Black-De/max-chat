import { describe, expect, it, vi } from 'vitest';
import {
  CHECK_ACCOUNT_TEXTS,
  PHONE_FORMAT_ERROR,
  QUOTA_TEXTS,
  createGreenApiClient,
  type GreenApiClient,
} from '../../api';
import { createInitialChatsState, type ChatsState } from '../chats';
import { resolveNewChat } from '../newChat';
import { SESSION_TEXTS } from '../texts';
import {
  TEST_API_URL,
  TEST_ID_INSTANCE,
  TEST_TOKEN,
  routeFetch,
  type Reply,
} from '../../test/fixtures/greenApiMock';
import {
  TEST_CHAT_ID,
  TEST_CHAT_ID_2,
  TEST_PHONE,
  TEST_PHONE_2,
  chatFixture,
} from '../../test/fixtures/chats';

function clientFor(replies: Reply[]) {
  const api = routeFetch({ checkAccount: replies });
  const sleep = vi.fn(() => Promise.resolve());
  const client = createGreenApiClient({
    apiUrl: TEST_API_URL,
    idInstance: TEST_ID_INSTANCE,
    apiTokenInstance: TEST_TOKEN,
    fetch: api.fetch,
    sleep,
  });
  return { api, client, sleep };
}

const empty: ChatsState = createInitialChatsState();

async function run(
  input: string,
  replies: Reply[],
  state: Pick<ChatsState, 'chats' | 'phoneCache'> = empty,
) {
  const { api, client, sleep } = clientFor(replies);
  const result = await resolveNewChat(input, { state, client, canWrite: true });
  return { result, api, sleep };
}

describe('нормализация и формат (Р-10, п. 2.2–2.3, EC-I8)', () => {
  it.each(['+7 (999) 000-00-01', '8 999 000 00 01', '79990000001', ' 7-999-000-00-01 '])(
    '%s → 79990000001, checkAccount с числом в теле',
    async (input) => {
      const { result, api } = await run(input, [
        { body: { exist: true, chatId: TEST_CHAT_ID, fromCache: false } },
      ]);
      expect(result).toEqual({
        ok: true,
        phone: TEST_PHONE,
        chatId: TEST_CHAT_ID,
        fromCache: false,
      });
      expect(api.calls).toHaveLength(1);
      expect(api.calls[0]?.init.method).toBe('POST');
      expect(api.calls[0]?.init.body).toBe('{"phoneNumber":79990000001}');
    },
  );

  it('+375 — 12 цифр проходят', async () => {
    const { result } = await run('+375 29 000-00-01', [
      { body: { exist: true, chatId: TEST_CHAT_ID } },
    ]);
    expect(result).toMatchObject({ ok: true, phone: '375290000001' });
  });

  it.each([
    '',
    '123',
    '+1 999 000-00-00',
    '7999000000',
    '899900000001',
    '+380 99 000 00 00',
    'abc',
  ])('невалидный «%s» — ошибка формата, запроса нет', async (input) => {
    const { result, api } = await run(input, []);
    expect(result).toEqual({ ok: false, reason: 'format', error: PHONE_FORMAT_ERROR });
    expect(api.calls).toHaveLength(0);
  });
});

describe('кеш «номер → chatId» (п. 2.4, EC-D10, НФТ-6)', () => {
  it('номер в кеше (другим написанием) — checkAccount не вызывается', async () => {
    const state = { chats: [], phoneCache: { [TEST_PHONE]: TEST_CHAT_ID } };
    const { result, api } = await run('8 (999) 000-00-01', [], state);
    expect(result).toEqual({ ok: true, phone: TEST_PHONE, chatId: TEST_CHAT_ID, fromCache: true });
    expect(api.calls).toHaveLength(0);
  });

  it('чат с этим номером есть, а кеша нет — тоже без checkAccount', async () => {
    const { result, api } = await run(TEST_PHONE_2, [], {
      chats: [chatFixture({ chatId: TEST_CHAT_ID_2, phone: TEST_PHONE_2 })],
      phoneCache: {},
    });
    expect(result).toMatchObject({ ok: true, chatId: TEST_CHAT_ID_2, fromCache: true });
    expect(api.calls).toHaveLength(0);
  });
});

describe('ответы checkAccount (п. 2.6–2.8, §5.5, ВА-7, ВА-10)', () => {
  it('exist:false — «На этом номере нет аккаунта MAX»', async () => {
    const { result } = await run(TEST_PHONE, [
      { body: { exist: false, chatId: '', fromCache: false } },
    ]);
    expect(result).toEqual({
      ok: false,
      reason: 'notExists',
      error: 'На этом номере нет аккаунта MAX',
      phone: TEST_PHONE,
    });
  });

  it.each<[string, unknown]>([
    ['chatId пустой', { exist: true, chatId: '' }],
    ['chatId числом', { exist: true, chatId: 10000000 }],
    ['chatId с @c.us', { exist: true, chatId: `${TEST_CHAT_ID}@c.us` }],
    ['chatId не из цифр', { exist: true, chatId: 'abc' }],
    ['нет поля exist', {}],
    ['нет chatId', { exist: true }],
  ])('EC-I9: %s — текст п. 2.6, без повтора', async (_n, body) => {
    const { result, api } = await run(TEST_PHONE, [{ body }]);
    expect(result).toEqual({
      ok: false,
      reason: 'api',
      error: 'Не удалось проверить номер: неожиданный ответ сервера. Попробуйте позже',
      phone: TEST_PHONE,
    });
    expect(api.calls).toHaveLength(1);
  });

  it('группа: chatId с ведущим «-» допустим', async () => {
    const { result } = await run(TEST_PHONE, [{ body: { exist: true, chatId: '-10000000' } }]);
    expect(result).toMatchObject({ ok: true, chatId: '-10000000' });
  });

  it.each<[string, Reply, string]>([
    [
      '466 checks (invokeStatus)',
      {
        status: 466,
        body: {
          invokeStatus: { method: 'checkAccount', used: 100, total: 100, status: 'QUOTE_EXCEEDED' },
        },
      },
      QUOTA_TEXTS.checkAccountChecks,
    ],
    ['466 нераспознанное тело', { status: 466, body: 'x' }, QUOTA_TEXTS.checkAccountChecks],
    [
      '466 chats (correspondentsStatus)',
      {
        status: 466,
        body: {
          correspondentsStatus: { method: 'correspondents', used: 3, total: 3, status: 'X' },
        },
      },
      QUOTA_TEXTS.checkAccountChats,
    ],
    [
      '466 chats (quotaData)',
      {
        status: 466,
        body: {
          typeWebhook: 'quotaExceeded',
          quotaData: { method: 'correspondents', status: 'CORRESPONDENTS_QUOTA_EXCEEDED' },
        },
      },
      QUOTA_TEXTS.checkAccountChats,
    ],
    ['469', { status: 469 }, 'Слишком много проверок номеров, повторите позже'],
    [
      'limit reached',
      { status: 400, body: { status: false, reason: 'User get contact info limit reached' } },
      'Слишком много проверок номеров, повторите позже',
    ],
    [
      'timeout limit exceeded (EC-Q6)',
      { status: 400, body: { status: false, reason: 'check phone number timeout limit exceeded' } },
      'MAX не ответил вовремя при проверке номера. Нажмите «Создать» ещё раз через минуту',
    ],
    [
      '400 bad phone number',
      { status: 400, body: { status: false, reason: 'bad phone number, valid 11 or 12 digits' } },
      'Неверный номер: нужно 11 или 12 цифр',
    ],
    [
      '400 only digits',
      { status: 400, body: { status: false, reason: "'phoneNumber' must contain only digits" } },
      'Номер должен содержать только цифры',
    ],
    [
      '400 прочее',
      { status: 400, body: { status: false, reason: 'Validation failed: x' } },
      'Ошибка в запросе: Validation failed: x',
    ],
    [
      'status:false not ready при 200',
      { status: 200, body: { status: false, reason: 'instance is starting or not authorized' } },
      'Инстанс не авторизован или запускается',
    ],
    ['429', { status: 429, headers: { 'Retry-After': '1' } }, CHECK_ACCOUNT_TEXTS.rateLimited],
    ['499', { status: 499 }, CHECK_ACCOUNT_TEXTS.server],
    ['502', { status: 502 }, CHECK_ACCOUNT_TEXTS.server],
    ['сеть', { throws: new TypeError('Failed to fetch') }, CHECK_ACCOUNT_TEXTS.network],
  ])(
    '%s → текст ТЗ, один запрос, без автоповтора (EC-Q2, EC-Q6, EC-Q7)',
    async (_n, reply, text) => {
      const { result, api, sleep } = await run(TEST_PHONE, [
        reply,
        { body: { exist: true, chatId: TEST_CHAT_ID } },
      ]);
      expect(result).toEqual({ ok: false, reason: 'api', error: text, phone: TEST_PHONE });
      expect(api.calls).toHaveLength(1);
      expect(sleep).not.toHaveBeenCalled();
    },
  );

  it('номер и chatId из текста сервера не попадают в текст ошибки', async () => {
    const { result } = await run(TEST_PHONE, [
      {
        status: 400,
        body: { status: false, reason: `Validation failed: ${TEST_PHONE} / ${TEST_CHAT_ID}` },
      },
    ]);
    expect(result).toMatchObject({
      ok: false,
      error: 'Ошибка в запросе: Validation failed: <id> / <id>',
    });
  });

  it('прерванный запрос (выход) — reason aborted, без текста', async () => {
    const { client } = clientFor([{ hang: true }]);
    const ctrl = new AbortController();
    const p = resolveNewChat(TEST_PHONE, {
      state: empty,
      client,
      canWrite: true,
      signal: ctrl.signal,
    });
    ctrl.abort();
    expect(await p).toEqual({ ok: false, reason: 'aborted', error: '', phone: TEST_PHONE });
  });

  it('клиент закрыт (выход во время запроса) — aborted', async () => {
    const { client } = clientFor([{ hang: true }]);
    const p = resolveNewChat(TEST_PHONE, { state: empty, client, canWrite: true });
    client.close();
    expect((await p).ok).toBe(false);
    expect(await p).toMatchObject({ reason: 'aborted' });
  });
});

describe('вкладка только на чтение (Р-12, EC-S4)', () => {
  it('canWrite=false или нет клиента — без запроса, подсказка', async () => {
    const checkAccount = vi.fn<GreenApiClient['checkAccount']>();
    for (const deps of [
      { canWrite: false, client: { checkAccount } },
      { canWrite: true, client: null },
    ]) {
      const r = await resolveNewChat(TEST_PHONE, { state: empty, ...deps });
      expect(r).toEqual({ ok: false, reason: 'readOnly', error: SESSION_TEXTS.otherTabReadOnly });
    }
    expect(checkAccount).not.toHaveBeenCalled();
  });
});
