import { describe, expect, it } from 'vitest';
import { GreenApiErrorCode } from '../errors';
import { describeError, type ErrorContext } from '../messages';
import { PERSONAL_DATA_MASK, redactPersonalData } from '../mask';
import { CHAT_IDS, PHONES, incomingText, outgoingApi } from '../../test/fixtures';
import {
  FAKE_TOKEN,
  blockRealNetwork,
  catchGreenApiError,
  makeClient,
  mockFetch,
  recordingLogger,
  type MockReply,
} from '../../test/apiHelpers';

blockRealNetwork();

/**
 * Номер телефона, chatId и токен не попадают ни в лог, ни в тексты ошибок (§5.4, НФТ-3):
 * в лог пишутся только метод, код, статус и маскированный URL, а причина от сервера
 * очищается от номеров и chatId (`redactPersonalData`).
 */
const PHONE = String(PHONES.primary);
const SECRETS = [PHONE, `+${PHONE}`, CHAT_IDS.primary, CHAT_IDS.group, FAKE_TOKEN];

function renderings(e: unknown): string[] {
  const contexts: ErrorContext[] = ['login', 'session', 'checkAccount', 'send'];
  return [
    String(e),
    (e as Error).message,
    (e as Error).stack ?? '',
    JSON.stringify(e),
    ...contexts.map((c) => describeError(e, c)),
  ];
}

function expectClean(texts: string[]) {
  const all = texts.join('\n');
  for (const s of SECRETS) expect(all).not.toContain(s);
}

describe('redactPersonalData', () => {
  it.each([
    [`chat ${PHONE}@c.us not found`, `chat ${PERSONAL_DATA_MASK} not found`],
    [`phone +${PHONE}`, `phone ${PERSONAL_DATA_MASK}`],
    [`group ${CHAT_IDS.group}@g.us`, `group ${PERSONAL_DATA_MASK}`],
    [
      `chats: ${CHAT_IDS.primary}, ${CHAT_IDS.channel}`,
      `chats: ${PERSONAL_DATA_MASK}, ${PERSONAL_DATA_MASK}`,
    ],
    ['Instance account is expired', 'Instance account is expired'],
    ['Too many requests, retry after 60', 'Too many requests, retry after 60'],
  ])('%s → %s', (input, expected) => {
    expect(redactPersonalData(input)).toBe(expected);
  });
});

describe('receiveNotification: номер и chatId из тела уведомления не логируются', () => {
  it.each([
    ['входящее', incomingText],
    ['исходящее через API', outgoingApi],
  ])('%s: в логе только метод/статус/URL', async (_name, body) => {
    const { logger, lines } = recordingLogger();
    const m = mockFetch({ body: { receiptId: 5, body } });
    const n = await makeClient(m.fetch, { logger }).receiveNotification();
    expect(n?.receiptId).toBe(5);
    expect(lines.length).toBeGreaterThan(0);
    expectClean(lines);
  });

  it.each<[string, MockReply, string]>([
    [
      'обрезанный JSON с номером',
      {
        body: `{"receiptId":9,"body":{"senderData":{"chatId":"${CHAT_IDS.primary}","senderPhoneNumber":${PHONE}`,
      },
      GreenApiErrorCode.INVALID_JSON,
    ],
    [
      '500 с номером и chatId в тексте',
      { status: 500, body: `Internal error for ${PHONE}@c.us in chat ${CHAT_IDS.group}@g.us` },
      GreenApiErrorCode.SERVER,
    ],
    [
      '200 {status:false} с chatId в причине',
      {
        body: {
          status: false,
          reason: `You can only send or receive messages from following chats: ${CHAT_IDS.primary}, ${CHAT_IDS.group}`,
        },
      },
      GreenApiErrorCode.BAD_REQUEST,
    ],
  ])('%s → ошибка без номера и chatId (и в логе тоже)', async (_name, reply, code) => {
    const { logger, lines } = recordingLogger();
    const e = await catchGreenApiError(
      makeClient(mockFetch(reply).fetch, { logger }).receiveNotification(),
    );
    expect(e.code).toBe(code);
    expectClean([...renderings(e), JSON.stringify(e.toJSON()), e.reason ?? '', ...lines]);
  });

  it('body — не объект (строка с номером): уведомление отдаётся как есть для удаления, лог чист', async () => {
    const { logger, lines } = recordingLogger();
    const m = mockFetch({ body: `{"receiptId":9,"body":"${PHONE} ${CHAT_IDS.primary}"}` });
    const n = await makeClient(m.fetch, { logger }).receiveNotification();
    expect(n?.receiptId).toBe(9);
    expectClean(lines);
  });

  it('битый JSON с ведущим receiptId: receiptId сохраняется для удаления, номера нет', async () => {
    const e = await catchGreenApiError(
      makeClient(
        mockFetch({ body: `{"receiptId":9,"body":{"senderPhoneNumber":${PHONE},` }).fetch,
      ).receiveNotification(),
    );
    expect(e.receiptId).toBe(9);
    expectClean(renderings(e));
  });
});

describe('checkAccount / sendMessage: номер и chatId из запроса не попадают в ошибки и лог', () => {
  const replies: [string, MockReply][] = [
    ['500', { status: 500, body: 'Internal error' }],
    [
      '400 с номером в причине',
      { status: 400, body: { message: `Validation failed: ${PHONE}@c.us` } },
    ],
    ['200 битый JSON', { body: `{"exist":true,"chatId":"${CHAT_IDS.primary}"` }],
    ['466', { status: 466, body: '' }],
  ];

  it.each(replies)('checkAccount, %s', async (_name, reply) => {
    const { logger, lines } = recordingLogger();
    const e = await catchGreenApiError(
      makeClient(mockFetch(reply).fetch, { logger }).checkAccount(PHONE),
    );
    expectClean([...renderings(e), ...lines]);
  });

  it.each(replies)('sendMessage, %s', async (_name, reply) => {
    const { logger, lines } = recordingLogger();
    const e = await catchGreenApiError(
      makeClient(mockFetch(reply).fetch, { logger }).sendMessage({
        chatId: CHAT_IDS.primary,
        message: `Позвоните на ${PHONE}`,
      }),
    );
    expectClean([...renderings(e), ...lines]);
  });

  it('успешные checkAccount и sendMessage: в логе нет номера и chatId', async () => {
    const { logger, lines } = recordingLogger();
    const m = mockFetch(
      { body: { exist: true, chatId: CHAT_IDS.primary } },
      { body: { idMessage: '100000000000000999' } },
    );
    const c = makeClient(m.fetch, { logger });
    await c.checkAccount(PHONE);
    await c.sendMessage({ chatId: CHAT_IDS.primary, message: 'x' });
    expectClean(lines);
  });
});
