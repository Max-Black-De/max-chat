import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BANNER_TEXTS,
  createGreenApiClient,
  FALLBACK_TEXTS,
  MAX_MESSAGE_LENGTH,
  QUOTA_TEXTS,
  SEND_TEXTS,
} from '../../api';
import { COUNTER_VISIBLE_FROM, checkComposerText, composerCounter, sendChatMessage } from '..';
import { messageTexts } from '../../test/fixtures/inputs';
import { errorResponses, tooManyRequestsResponses } from '../../test/fixtures/errors';
import { sendMessageResponses } from '../../test/fixtures/sendMessage';
import { quota466Cases } from '../../test/fixtures/quota';
import { ID_MESSAGES } from '../../test/fixtures/constants';
import { TEST_CHAT_ID, TEST_PHONE } from '../../test/fixtures/chats';
import {
  TEST_API_URL,
  TEST_ID_INSTANCE,
  TEST_TOKEN,
  routeFetch,
  type Reply,
} from '../../test/fixtures/greenApiMock';

describe('checkComposerText (п. 3.5, EC-U1, EC-U2)', () => {
  it.each([
    ['', false],
    [messageTexts.onlySpaces, false],
    [messageTexts.onlyNewlines, false],
    [' \t\n ', false],
    [messageTexts.plain, true],
    [messageTexts.surroundingSpaces, true],
    [messageTexts.max4000, true],
    [messageTexts.over4000, false],
    [messageTexts.emoji4000, true],
    [messageTexts.emoji4001, false],
  ])('%#: canSend = %s', (text, canSend) => {
    expect(checkComposerText(text).canSend).toBe(canSend);
  });

  it('длина — text.length (UTF-16): emoji = 2, ZWJ-семья = 8', () => {
    expect(checkComposerText('😀').length).toBe(2);
    expect(checkComposerText(messageTexts.zwjFamily).length).toBe(8);
    expect(checkComposerText(messageTexts.emoji4001)).toMatchObject({
      length: 4001,
      tooLong: true,
      blank: false,
    });
  });

  it('счётчик «N/4000», виден ближе к лимиту', () => {
    expect(composerCounter(4001)).toBe('4001/4000');
    expect(COUNTER_VISIBLE_FROM).toBeLessThan(MAX_MESSAGE_LENGTH);
    expect(COUNTER_VISIBLE_FROM).toBeGreaterThan(MAX_MESSAGE_LENGTH / 2);
  });
});

describe('sendChatMessage (п. 3.2–3.6) — только моки', () => {
  const sleep = vi.fn(() => Promise.resolve());
  afterEach(() => {
    sleep.mockClear();
  });

  function client(replies: Reply[]) {
    const api = routeFetch({ sendMessage: replies });
    const c = createGreenApiClient({
      idInstance: TEST_ID_INSTANCE,
      apiTokenInstance: TEST_TOKEN,
      apiUrl: TEST_API_URL,
      fetch: api.fetch,
      sleep,
    });
    return { api, c };
  }

  it('200: idMessage; тело — chatId из checkAccount и текст как есть (без trim)', async () => {
    const { api, c } = client([sendMessageResponses.sent]);
    const text = messageTexts.surroundingSpaces;
    await expect(sendChatMessage(c, TEST_CHAT_ID, text)).resolves.toEqual({
      ok: true,
      idMessage: ID_MESSAGES.api1,
    });
    const [call] = api.callsOf('sendMessage');
    const body = call?.init.body;
    if (typeof body !== 'string') throw new Error('тело sendMessage — не строка');
    expect(JSON.parse(body)).toEqual({ chatId: TEST_CHAT_ID, message: text });
    expect(body).not.toContain('@c.us');
  });

  it('EC-T7 / EC-Q8: 429 — до 3 автоповторов, затем текст п. 3.4', async () => {
    const { api, c } = client([tooManyRequestsResponses.noRetryAfter]);
    await expect(sendChatMessage(c, TEST_CHAT_ID, 'a')).resolves.toEqual({
      ok: false,
      errorText: SEND_TEXTS.rateLimited,
    });
    expect(api.callsOf('sendMessage')).toHaveLength(4);
    expect(sleep.mock.calls.map((args: unknown[]) => args[0])).toEqual([1000, 2000, 4000]);
  });

  it('429, затем 200 — успех после автоповтора', async () => {
    const { api, c } = client([tooManyRequestsResponses.noRetryAfter, sendMessageResponses.sent]);
    await expect(sendChatMessage(c, TEST_CHAT_ID, 'a')).resolves.toMatchObject({ ok: true });
    expect(api.callsOf('sendMessage')).toHaveLength(2);
  });

  it.each<[string, Reply, string]>([
    ['EC-S9: 403 suspended (json)', errorResponses.suspended403.json, SEND_TEXTS.suspended],
    ['EC-S9: 403 suspended (text)', errorResponses.suspended403.text, SEND_TEXTS.suspended],
    ['400 not authorized (json)', errorResponses.starting400.json, SEND_TEXTS.instanceNotReady],
    ['400 not authorized (text)', errorResponses.starting400.text, SEND_TEXTS.instanceNotReady],
    ['500', errorResponses.internal500.json, SEND_TEXTS.statusUnknown],
    ['499', errorResponses.clientClosed499, SEND_TEXTS.statusUnknown],
    ['502 html', errorResponses.badGateway502, SEND_TEXTS.statusUnknown],
    ['сеть', { throws: new TypeError('Failed to fetch') }, SEND_TEXTS.statusUnknown],
    [
      '400 валидации',
      errorResponses.badRequestData400.json,
      `${SEND_TEXTS.badRequestPrefix}bad request data${SEND_TEXTS.badRequestSuffix}`,
    ],
    ['EC-Q1: 466', quota466Cases.correspondentsStatus.response, QUOTA_TEXTS.sendChats],
  ])('%s → свой текст, без автоповтора', async (_name, reply, text) => {
    const { api, c } = client([reply, sendMessageResponses.sent]);
    await expect(sendChatMessage(c, TEST_CHAT_ID, 'a')).resolves.toEqual({
      ok: false,
      errorText: text,
    });
    expect(api.callsOf('sendMessage')).toHaveLength(1);
  });

  it('текст сервера под пузырём не содержит номер и chatId', async () => {
    const { c } = client([{ status: 400, body: `bad chatId ${TEST_CHAT_ID} for ${TEST_PHONE}` }]);
    const result = await sendChatMessage(c, TEST_CHAT_ID, 'a');
    expect(result.ok).toBe(false);
    const text = result.ok ? '' : result.errorText;
    expect(text.startsWith(SEND_TEXTS.badRequestPrefix)).toBe(true);
    expect(text).not.toContain(TEST_CHAT_ID);
    expect(text).not.toContain(TEST_PHONE);
    expect(text).not.toContain(TEST_TOKEN);
  });

  it('EC-I4: chatId с «@» не отправляется', async () => {
    const { api, c } = client([sendMessageResponses.sent]);
    const result = await sendChatMessage(c, `${TEST_PHONE}@c.us`, 'a');
    expect(result.ok).toBe(false);
    expect(api.callsOf('sendMessage')).toHaveLength(0);
  });

  it('без клиента (сессии нет) — «Не отправлено», запроса нет', async () => {
    await expect(sendChatMessage(null, TEST_CHAT_ID, 'a')).resolves.toEqual({
      ok: false,
      errorText: FALLBACK_TEXTS.sendGeneric,
    });
  });

  it('заглушка Р-11 — текст из api', () => {
    expect(BANNER_TEXTS.unsupportedMessage).toBe('Сообщение этого типа не поддерживается');
  });
});
