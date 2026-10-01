/**
 * Последовательности ответов для одного эндпоинта (ответ N — на N-й вызов).
 * Используются для автоповторов и backoff (ВА-7, ВА-8, ВА-17, Р-20).
 * Правило для тестов: число вызовов мока должно совпасть с `expectedCalls`.
 */
import { checkAccountResponses } from './checkAccount';
import { errorResponses, tooManyRequests, tooManyRequestsResponses } from './errors';
import { networkError, networkTimeout, type MockReply } from './http';
import { deleteResponses } from './receive';
import { sendMessageResponses } from './sendMessage';

export interface ReplySequence {
  replies: readonly MockReply[];
  /** Сколько вызовов должно случиться. */
  expectedCalls: number;
  /** Паузы между вызовами, секунды (для фейковых таймеров). */
  expectedDelaysSec: readonly number[];
  /** Итоговый результат для UI. */
  outcome: string;
}

/** ВА-8, M-19: sendMessage при 429. */
export const sendMessage429Sequences = {
  /** 429 → 429 → 200: «отправлено», один пузырь, 3 вызова; паузы 1 и 2 с. */
  twiceThenOk: {
    replies: [
      tooManyRequestsResponses.noRetryAfter,
      tooManyRequestsResponses.noRetryAfter,
      sendMessageResponses.sent,
    ],
    expectedCalls: 3,
    expectedDelaysSec: [1, 2],
    outcome: 'sent',
  },
  /** 4 × 429: «не отправлено», ровно 4 вызова; паузы 1, 2, 4 с. */
  fourTimes: {
    replies: [
      tooManyRequestsResponses.noRetryAfter,
      tooManyRequestsResponses.noRetryAfter,
      tooManyRequestsResponses.noRetryAfter,
      tooManyRequestsResponses.noRetryAfter,
    ],
    expectedCalls: 4,
    expectedDelaysSec: [1, 2, 4],
    outcome: 'error',
  },
  /** Retry-After: 2 → пауза 2 с, затем 200. */
  retryAfterThenOk: {
    replies: [tooManyRequestsResponses.retryAfter2s, sendMessageResponses.sent],
    expectedCalls: 2,
    expectedDelaysSec: [2],
    outcome: 'sent',
  },
  /** Retry-After: 120 → пауза не больше 30 с. */
  retryAfterCapped: {
    replies: [tooManyRequestsResponses.retryAfter120s, sendMessageResponses.sent],
    expectedCalls: 2,
    expectedDelaysSec: [30],
    outcome: 'sent',
  },
  /** Retry-After: 5, 7, 1, затем 429 → 4 вызова, паузы из заголовка. */
  retryAfterFourTimes: {
    replies: [
      tooManyRequests({ retryAfter: '5' }),
      tooManyRequests({ retryAfter: '7' }),
      tooManyRequests({ retryAfter: '1' }),
      tooManyRequests({ retryAfter: '1' }),
    ],
    expectedCalls: 4,
    expectedDelaysSec: [5, 7, 1],
    outcome: 'error',
  },
  /** Мусор в Retry-After → запасная пауза 1 с. */
  retryAfterGarbageThenOk: {
    replies: [tooManyRequestsResponses.retryAfterGarbage, sendMessageResponses.sent],
    expectedCalls: 2,
    expectedDelaysSec: [1],
    outcome: 'sent',
  },
  /** 429 → 502: автоповтор после 429, но 502 уже без автоповтора → «не отправлено», 2 вызова. */
  thenBadGateway: {
    replies: [tooManyRequestsResponses.noRetryAfter, errorResponses.badGateway502],
    expectedCalls: 2,
    expectedDelaysSec: [1],
    outcome: 'error',
  },
} as const satisfies Record<string, ReplySequence>;

/** ВА-8, ВА-20: 499 / 5xx / сеть / таймаут на sendMessage — без автоповтора. */
export const sendMessageNoRetrySequences = {
  clientClosed: {
    replies: [errorResponses.clientClosed499, sendMessageResponses.sent],
    expectedCalls: 1,
    expectedDelaysSec: [],
    outcome: 'error',
  },
  internal: {
    replies: [errorResponses.internal500.json, sendMessageResponses.sent],
    expectedCalls: 1,
    expectedDelaysSec: [],
    outcome: 'error',
  },
  badGateway: {
    replies: [errorResponses.badGateway502, sendMessageResponses.sent],
    expectedCalls: 1,
    expectedDelaysSec: [],
    outcome: 'error',
  },
  network: {
    replies: [networkError, sendMessageResponses.sent],
    expectedCalls: 1,
    expectedDelaysSec: [],
    outcome: 'error',
  },
  timeout: {
    replies: [networkTimeout, sendMessageResponses.sent],
    expectedCalls: 1,
    expectedDelaysSec: [],
    outcome: 'error',
  },
  /**
   * Р-27: 429 без CORS-заголовков → в браузере `TypeError`, ветка «сеть»: без автоповтора,
   * текст «Статус неизвестен…» (ВА-20). Playwright — ответ без ACAO; Vitest — `toFetchResult`.
   */
  tooManyRequestsNoCors: {
    replies: [tooManyRequestsResponses.noCors, sendMessageResponses.sent],
    expectedCalls: 1,
    expectedDelaysSec: [],
    outcome: 'error',
  },
  tooManyRequestsNoCorsRetryAfter: {
    replies: [tooManyRequestsResponses.noCorsRetryAfter2s, sendMessageResponses.sent],
    expectedCalls: 1,
    expectedDelaysSec: [],
    outcome: 'error',
  },
} as const satisfies Record<string, ReplySequence>;

/** ВА-7, C-19: checkAccount — без автоповтора ни при какой ошибке. Второй ответ не должен быть запрошен. */
export const checkAccountNoRetrySequences = {
  tooManyRequests: {
    replies: [tooManyRequestsResponses.noRetryAfter, checkAccountResponses.exists],
    expectedCalls: 1,
    expectedDelaysSec: [],
    outcome: 'error-429',
  },
  tooManyRequestsRetryAfter: {
    replies: [tooManyRequestsResponses.retryAfter2s, checkAccountResponses.exists],
    expectedCalls: 1,
    expectedDelaysSec: [],
    outcome: 'error-429',
  },
  clientClosed: {
    replies: [errorResponses.clientClosed499, checkAccountResponses.exists],
    expectedCalls: 1,
    expectedDelaysSec: [],
    outcome: 'error-5xx',
  },
  internal: {
    replies: [errorResponses.internal500.json, checkAccountResponses.exists],
    expectedCalls: 1,
    expectedDelaysSec: [],
    outcome: 'error-5xx',
  },
  badGateway: {
    replies: [errorResponses.badGateway502, checkAccountResponses.exists],
    expectedCalls: 1,
    expectedDelaysSec: [],
    outcome: 'error-5xx',
  },
  network: {
    replies: [networkError, checkAccountResponses.exists],
    expectedCalls: 1,
    expectedDelaysSec: [],
    outcome: 'error-network',
  },
  timeout: {
    replies: [networkTimeout, checkAccountResponses.exists],
    expectedCalls: 1,
    expectedDelaysSec: [],
    outcome: 'error-network',
  },
  /** Р-27: 429 без CORS → текст про сеть, не про 429. */
  tooManyRequestsNoCors: {
    replies: [tooManyRequestsResponses.noCors, checkAccountResponses.exists],
    expectedCalls: 1,
    expectedDelaysSec: [],
    outcome: 'error-network',
  },
} as const satisfies Record<string, ReplySequence>;

/** ВА-17: delete при сети/499/5xx — до 3 повторов (1 → 2 → 4 с), затем следующий receive. */
export const deleteRetrySequences = {
  networkThenOk: {
    replies: [networkError, deleteResponses.ok],
    expectedCalls: 2,
    expectedDelaysSec: [1],
    outcome: 'deleted',
  },
  /** ТЗ v1.3.4 §5.4: 429 на delete входит в те же 3 повтора. */
  tooManyRequestsAllFail: {
    replies: [
      tooManyRequestsResponses.noRetryAfter,
      tooManyRequestsResponses.noRetryAfter,
      tooManyRequestsResponses.noRetryAfter,
      tooManyRequestsResponses.noRetryAfter,
    ],
    expectedCalls: 4,
    expectedDelaysSec: [1, 2, 4],
    outcome: 'next-receive',
  },
  allFail: {
    replies: [
      errorResponses.badGateway502,
      errorResponses.badGateway502,
      errorResponses.badGateway502,
      errorResponses.badGateway502,
    ],
    expectedCalls: 4,
    expectedDelaysSec: [1, 2, 4],
    outcome: 'next-receive',
  },
  findUnAcked: {
    replies: [deleteResponses.findUnAcked500],
    expectedCalls: 1,
    expectedDelaysSec: [],
    outcome: 'deleted',
  },
} as const satisfies Record<string, ReplySequence>;

/** R-07, Р-20: backoff опроса при сети/429/5xx — 1 → 2 → 4 → 8 → 16 → 30 → 30 с. */
export const receiveBackoffDelaysSec = [1, 2, 4, 8, 16, 30, 30] as const;
