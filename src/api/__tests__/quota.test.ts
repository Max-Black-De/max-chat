import { describe, expect, it } from 'vitest';
import { GreenApiErrorCode, GreenApiQuotaError, isQuotaError } from '../errors';
import { QUOTA_TEXTS, describeError, quotaText } from '../messages';
import { parseQuota466Body, parseQuotaExceededNotification } from '../quota';
import {
  incomingPersonalText,
  quota466Bodies,
  quotaExceededNotification,
} from './fixtures/notifications';
import { catchError, makeClient, mockFetch, recordingLogger, blockRealNetwork } from './helpers';

blockRealNetwork();

const send = (body: unknown) => {
  const m = mockFetch({
    status: 466,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  const { logger, lines } = recordingLogger();
  const c = makeClient(m.fetch, { logger });
  return { m, lines, run: () => catchError(c.sendMessage({ chatId: '10000002', message: 'x' })) };
};
const check = (body: unknown) => {
  const m = mockFetch({
    status: 466,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  const { logger, lines } = recordingLogger();
  const c = makeClient(m.fetch, { logger });
  return { m, lines, run: () => catchError(c.checkAccount('79991234567')) };
};

describe('parseQuota466Body: три формата (§5.5)', () => {
  it('1) invokeStatus checkAccount → checks', () => {
    expect(parseQuota466Body(quota466Bodies.invokeStatusCheckAccount, 'checkAccount')).toEqual({
      kind: 'checks',
      source: 'invokeStatus',
      method: 'checkAccount',
      used: 100,
      total: 100,
      status: 'QUOTE_EXCEEDED',
    });
  });

  it('2) correspondentsStatus (used/total строками) → chats, числа', () => {
    expect(parseQuota466Body(quota466Bodies.correspondentsStatusStrings, 'sendMessage')).toEqual({
      kind: 'chats',
      source: 'correspondentsStatus',
      method: 'correspondents',
      used: 3,
      total: 3,
      status: 'CORRESPONDENTS_QUOTA_EXCEEDED',
    });
  });

  it('3) тело в форме уведомления quotaData → chats', () => {
    expect(
      parseQuota466Body(quota466Bodies.quotaDataNotificationShape, 'sendMessage'),
    ).toMatchObject({
      kind: 'chats',
      source: 'quotaData',
      used: 3,
      total: 3,
    });
  });

  it('description никогда не попадает в результат', () => {
    for (const b of Object.values(quota466Bodies)) {
      expect(JSON.stringify(parseQuota466Body(b, 'sendMessage'))).not.toMatch(
        /description|following chats/,
      );
    }
  });

  it.each([undefined, null, 'text', {}, { foo: 1 }, []])(
    'нераспознанное тело %j → по методу',
    (body) => {
      expect(parseQuota466Body(body, 'checkAccount')).toEqual({
        kind: 'checks',
        source: 'fallback',
      });
      expect(parseQuota466Body(body, 'sendMessage')).toEqual({ kind: 'chats', source: 'fallback' });
    },
  );

  it('мусорные used/total отбрасываются', () => {
    expect(
      parseQuota466Body({ correspondentsStatus: { used: 'много', total: null } }, 'sendMessage'),
    ).toEqual({
      kind: 'chats',
      source: 'correspondentsStatus',
    });
  });
});

describe('466 в клиенте', () => {
  it.each(Object.entries(quota466Bodies))(
    'sendMessage + %s → GreenApiQuotaError(chats), без автоповтора',
    async (name, body) => {
      const t = send(body);
      const e = await t.run();
      expect(e).toBeInstanceOf(GreenApiQuotaError);
      const q = e as GreenApiQuotaError;
      expect(q.code).toBe(GreenApiErrorCode.QUOTA_EXCEEDED);
      expect(q.httpStatus).toBe(466);
      expect(q.retry).toBe('none');
      // invokeStatus с method=checkAccount на sendMessage — формально «checks»; остальные — chats.
      expect(q.quota.kind).toBe(name === 'invokeStatusCheckAccount' ? 'checks' : 'chats');
      expect(t.m.calls).toHaveLength(1);
    },
  );

  it.each(Object.entries(quota466Bodies))(
    'checkAccount + %s → GreenApiQuotaError',
    async (_name, body) => {
      const t = check(body);
      const e = (await t.run()) as GreenApiQuotaError;
      expect(isQuotaError(e)).toBe(true);
      expect(e.retry).toBe('none');
      expect(t.m.calls).toHaveLength(1);
    },
  );

  it('466 с не-JSON телом: sendMessage → chats, checkAccount → checks', async () => {
    expect(((await send('Quota exceeded').run()) as GreenApiQuotaError).quota).toEqual({
      kind: 'chats',
      source: 'fallback',
    });
    expect(((await check('').run()) as GreenApiQuotaError).quota).toEqual({
      kind: 'checks',
      source: 'fallback',
    });
  });

  it('description и чужие chatId не попадают в message, toJSON и логи', async () => {
    const t = send(quota466Bodies.correspondentsStatusStrings);
    const e = (await t.run()) as GreenApiQuotaError;
    const dumps = [e.message, String(e), JSON.stringify(e), ...t.lines];
    for (const d of dumps) {
      expect(d).not.toMatch(/following chats|-10000000000001/);
    }
    expect(t.lines.join('\n')).toMatch(/"used":3,"total":3/);
  });

  it('тексты для пользователя (§5.5)', async () => {
    const eSend = await send(quota466Bodies.correspondentsStatusStrings).run();
    const eCheck = await check(quota466Bodies.invokeStatusCheckAccount).run();
    expect(describeError(eSend, 'send')).toBe(QUOTA_TEXTS.sendChats);
    expect(describeError(eCheck, 'checkAccount')).toBe(QUOTA_TEXTS.checkAccountChecks);
    expect(describeError(eSend, 'send')).toMatch(
      /^Не отправлено: исчерпан лимит бесплатного тарифа Developer/,
    );
    expect(describeError(eCheck, 'checkAccount')).toMatch(
      /^Исчерпан месячный лимит проверок номеров \(100/,
    );
  });
});

describe('уведомление quotaExceeded (§5.5)', () => {
  it('разбирается, timestamp не требуется, description не возвращается', () => {
    const q = parseQuotaExceededNotification(quotaExceededNotification.body);
    expect(q).toEqual({
      kind: 'chats',
      source: 'quotaData',
      method: 'correspondents',
      used: 3,
      total: 3,
      status: 'CORRESPONDENTS_QUOTA_EXCEEDED',
    });
    expect(quotaText(q ?? { kind: 'chats', source: 'fallback' }, 'notification')).toBe(
      QUOTA_TEXTS.banner,
    );
  });

  it('без quotaData — всё равно квота чатов', () => {
    expect(parseQuotaExceededNotification({ typeWebhook: 'quotaExceeded' })).toEqual({
      kind: 'chats',
      source: 'fallback',
    });
  });

  it('прочие уведомления и мусор → null', () => {
    expect(parseQuotaExceededNotification(incomingPersonalText.body)).toBeNull();
    expect(parseQuotaExceededNotification(null)).toBeNull();
    expect(parseQuotaExceededNotification('quotaExceeded')).toBeNull();
  });

  it('приходит через receiveNotification как обычное уведомление', async () => {
    const c = makeClient(mockFetch({ body: quotaExceededNotification }).fetch);
    const r = await c.receiveNotification();
    expect(r?.receiptId).toBe(1102);
    expect(parseQuotaExceededNotification(r?.body)).toMatchObject({ kind: 'chats', used: 3 });
  });
});
