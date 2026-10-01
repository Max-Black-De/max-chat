/**
 * Q2 (Д3), только моки: то, чего нет в тестах Фронтенда (`src/api/__tests__`).
 * - Р-27 / EC-T6: 429 без CORS-заголовков в браузере — `TypeError`, ветка «сеть», без автоповтора;
 * - EC-T7 / edge-cases §3 п. 3: `Retry-After` без `Access-Control-Expose-Headers` браузер
 *   не отдаёт → запасные паузы 1 → 2 → 4 с (а не значение заголовка).
 * Ответы мока проходят через `toBrowserFetchResult` — тот же вид, что увидит страница.
 */
import { describe, expect, it, vi } from 'vitest';
import { CHECK_ACCOUNT_TEXTS, describeError, GreenApiErrorCode, SEND_TEXTS } from '../../api';
import { blockRealNetwork, catchGreenApiError, makeClient, recordingSleep } from '../apiHelpers';
import {
  CHAT_IDS,
  PHONES,
  browserVisibleHeaders,
  sendMessageResponses,
  toBrowserFetchResult,
  tooManyRequests,
  tooManyRequestsResponses,
  type MockReply,
} from '../fixtures';

blockRealNetwork();

function scriptedFetch(...replies: MockReply[]) {
  const queue = [...replies];
  const fn = vi.fn(() => {
    const reply = queue.length > 1 ? queue.shift() : queue[0];
    if (!reply) throw new Error('нет ответа в сценарии');
    return toBrowserFetchResult(reply);
  });
  return { fetch: fn as unknown as typeof fetch, fn };
}

const SEND = { chatId: CHAT_IDS.primary, message: 'Тестовое сообщение' };

describe('Р-27: 429 без CORS — ветка «сеть», без автоповтора', () => {
  it.each([
    ['без Retry-After', tooManyRequestsResponses.noCors],
    ['с Retry-After', tooManyRequestsResponses.noCorsRetryAfter2s],
  ])(
    'sendMessage, 429 %s без ACAO → NETWORK, 1 запрос, пауз нет, «Статус неизвестен…»',
    async (_n, reply) => {
      const m = scriptedFetch(reply, sendMessageResponses.sent);
      const s = recordingSleep();
      const e = await catchGreenApiError(makeClient(m.fetch, { sleep: s.sleep }).sendMessage(SEND));
      expect(e.code).toBe(GreenApiErrorCode.NETWORK);
      expect(m.fn).toHaveBeenCalledTimes(1);
      expect(s.delays).toEqual([]);
      expect(describeError(e, 'send')).toBe(SEND_TEXTS.statusUnknown);
    },
  );

  it('checkAccount, 429 без ACAO → NETWORK, 1 запрос, текст «сеть/таймаут», не про 429', async () => {
    const m = scriptedFetch(tooManyRequestsResponses.noCors);
    const e = await catchGreenApiError(makeClient(m.fetch).checkAccount(PHONES.primary));
    expect(e.code).toBe(GreenApiErrorCode.NETWORK);
    expect(m.fn).toHaveBeenCalledTimes(1);
    const text = describeError(e, 'checkAccount');
    expect(text).toBe(CHECK_ACCOUNT_TEXTS.network);
    expect(text).not.toBe(CHECK_ACCOUNT_TEXTS.rateLimited);
  });
});

describe('EC-T7: Retry-After не виден странице без Expose-Headers', () => {
  it('эмуляция браузера: без Expose-Headers Retry-After скрыт, с ним — виден', () => {
    expect(browserVisibleHeaders(tooManyRequestsResponses.retryAfterHidden)).not.toHaveProperty(
      'Retry-After',
    );
    expect(browserVisibleHeaders(tooManyRequestsResponses.retryAfter2s)).toHaveProperty(
      'Retry-After',
      '2',
    );
  });

  it('sendMessage: 429 ×4 с Retry-After: 5, но без Expose-Headers → паузы 1 → 2 → 4 с, «не отправлено»', async () => {
    const hidden = tooManyRequests({ retryAfter: '5', exposeRetryAfter: false });
    const m = scriptedFetch(hidden, hidden, hidden, hidden);
    const s = recordingSleep();
    const e = await catchGreenApiError(makeClient(m.fetch, { sleep: s.sleep }).sendMessage(SEND));
    expect(e.code).toBe(GreenApiErrorCode.RATE_LIMITED);
    expect(m.fn).toHaveBeenCalledTimes(4);
    expect(s.delays).toEqual([1000, 2000, 4000]);
    expect(describeError(e, 'send')).toBe(SEND_TEXTS.rateLimited);
  });

  it('sendMessage: 429 с Retry-After: 2 и Expose-Headers → пауза 2 с, затем успех', async () => {
    const m = scriptedFetch(tooManyRequestsResponses.retryAfter2s, sendMessageResponses.sent);
    const s = recordingSleep();
    await makeClient(m.fetch, { sleep: s.sleep }).sendMessage(SEND);
    expect(s.delays).toEqual([2000]);
    expect(m.fn).toHaveBeenCalledTimes(2);
  });
});
