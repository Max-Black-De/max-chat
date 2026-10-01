/**
 * Сценарии цикла опроса (Р-20, §6.1) для unit-теста `polling/` на фейковых таймерах.
 * Тест цикла — план Д-2, пишется в Д-3 (F5). Здесь только данные и ожидания: ответы
 * receive и delete по порядку вызовов и что должно получиться. Только моки (Р-26, Р-27).
 */
import { networkError, networkTimeout, type MockReply } from './http';
import { deleteRetrySequences } from './sequences';
import {
  foreignInstanceIncoming,
  foreignInstanceOutgoingApi,
  incomingText,
  lateSessionNotification,
  receipt,
} from './notifications';
import { emptyReceiveResponses, notificationResponse } from './receive';

/** Параметры цикла из ТЗ §6.1 п. 1 и Р-20. */
export const POLLING = {
  receiveTimeoutSec: 20,
  /** Таймаут запроса клиента (`AbortController`), от начала `fetch`. */
  requestTimeoutSec: 30,
  backoffDelaysSec: [1, 2, 4, 8, 16, 30, 30],
  deleteRetryDelaysSec: [1, 2, 4],
} as const;

export interface PollingScenario {
  /** EC-ID и сценарии чек-листа. */
  refs: readonly string[];
  /** Ответы receive по порядку; после них — пустые ответы. */
  receive: readonly MockReply[];
  /** Ответы delete по порядку; если не задано — `deleteResponses.ok` на каждый вызов. */
  delete?: readonly MockReply[];
  expected: {
    /** `receiptId`, для которых должен быть вызван delete (по порядку, с повторами). */
    deleteReceiptIds: readonly number[];
    /** Паузы перед повторами delete, секунды. */
    deleteDelaysSec?: readonly number[];
    /** Паузы backoff перед следующими receive, секунды. */
    receiveBackoffSec?: readonly number[];
    /** idMessage, которые попали в ленту. */
    shownIdMessages: readonly string[];
    /** После сценария цикл продолжает опрос (следующий receive). */
    continuesPolling: boolean;
  };
}

/** ТЗ v1.3.4 §5.4, EC-P4: 429 ×4 на delete — 3 повтора (1, 2, 4 с), затем следующий receive. */
export const deleteTooManyRequestsScenario = {
  refs: ['EC-P4', 'E-10 г)'],
  receive: [notificationResponse(receipt(incomingText, 61))],
  delete: deleteRetrySequences.tooManyRequestsAllFail.replies,
  expected: {
    deleteReceiptIds: [61, 61, 61, 61],
    deleteDelaysSec: POLLING.deleteRetryDelaysSec,
    shownIdMessages: [incomingText.idMessage],
    continuesPolling: true,
  },
} as const satisfies PollingScenario;

/** EC-I7 (Р-5): чужой idInstance — не показывать, но удалить, иначе очередь встанет. */
export const foreignInstanceScenario = {
  refs: ['EC-I7', 'V-23'],
  receive: [
    notificationResponse(receipt(foreignInstanceIncoming, 62)),
    notificationResponse(receipt(foreignInstanceOutgoingApi, 63)),
    notificationResponse(receipt(incomingText, 64)),
  ],
  expected: {
    deleteReceiptIds: [62, 63, 64],
    shownIdMessages: [incomingText.idMessage],
    continuesPolling: true,
  },
} as const satisfies PollingScenario;

/**
 * EC-S7 / EC-I7, L-26: ответ receive приходит после «Выйти». Тест держит промис `fetch`,
 * выходит, затем отпускает ответ: ничего не показано, delete для 77 не вызван,
 * нового receive старой сессии нет.
 */
export const lateAfterLogoutScenario = {
  refs: ['EC-S7', 'EC-I7', 'L-26'],
  receive: [notificationResponse(lateSessionNotification)],
  expected: {
    deleteReceiptIds: [],
    shownIdMessages: [],
    continuesPolling: false,
  },
} as const satisfies PollingScenario;

/**
 * EC-P17, R-22: правило таймеров. Сеть падает дважды, затем приходит уведомление.
 * Проверки на фейковых таймерах:
 * - пауза backoff ставится только **после** того, как промис `fetch` завершился
 *   (до этого `vi.getTimerCount()` не растёт, кроме таймаута запроса);
 * - `setInterval` не вызывается ни разу;
 * - ни один `setTimeout` не ставится из колбэка другого `setTimeout`.
 */
export const timerRuleScenario = {
  refs: ['EC-P17', 'R-22', 'R-07'],
  receive: [networkError, networkError, notificationResponse(receipt(incomingText, 65))],
  expected: {
    deleteReceiptIds: [65],
    receiveBackoffSec: [1, 2],
    shownIdMessages: [incomingText.idMessage],
    continuesPolling: true,
  },
} as const satisfies PollingScenario;

/**
 * EC-P17: receive обрывается своим таймаутом 30 с. Backoff после таймаута тоже не
 * должен ставиться из колбэка таймера (безопаснее `AbortSignal.timeout()`).
 */
export const timerRuleAfterTimeoutScenario = {
  refs: ['EC-P17', 'R-22'],
  receive: [networkTimeout, emptyReceiveResponses.emptyBody],
  expected: {
    deleteReceiptIds: [],
    receiveBackoffSec: [1],
    shownIdMessages: [],
    continuesPolling: true,
  },
} as const satisfies PollingScenario;

/** Ожидания по таймерам для EC-P17 (общие для двух сценариев выше). */
export const TIMER_RULES = {
  setIntervalCalls: 0,
  /** Глубина вложенности `setTimeout` в колбэке `setTimeout`. */
  maxNestedTimeoutDepth: 0,
  backoffAfterFetchSettles: true,
} as const;

export const pollingScenarios = {
  deleteTooManyRequests: deleteTooManyRequestsScenario,
  foreignInstance: foreignInstanceScenario,
  lateAfterLogout: lateAfterLogoutScenario,
  timerRule: timerRuleScenario,
  timerRuleAfterTimeout: timerRuleAfterTimeoutScenario,
} as const satisfies Record<string, PollingScenario>;
