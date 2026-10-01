/**
 * Квота тарифа Developer: HTTP 466 и уведомление `quotaExceeded` (§5.5, ВА-12, ВА-13).
 *
 * Всё здесь — по документации [док 466-error-example-body, QuotaExceeded]: реальных 466
 * и `quotaExceeded` в спайке нет (0 из 39). Таблица и пример документации расходятся,
 * поэтому есть все три формата тела. `used`/`total` в таблице — string, в примерах —
 * number; по ВА-13 полей может не быть вовсе (в лог — `?`).
 *
 * В `description` — условные chatId (`QUOTA_DESCRIPTION_CHAT_IDS`): по ним тесты проверяют,
 * что `description` не попадает ни в интерфейс, ни в лог (Q-12).
 */
import type {
  Error466CorrespondentsStatusBody,
  Error466InvokeStatusBody,
  QuotaExceededNotification,
  QuotaInfo,
  QuotaKind,
  ReceivedNotification,
} from '../../api/types';
import { BASE_TIMESTAMP, CHAT_IDS } from './constants';
import { instanceData } from './notifications';
import {
  emptyResponse,
  htmlResponse,
  jsonResponse,
  textResponse,
  type MockHttpResponse,
} from './http';

/** Условные chatId в `description` — не должны утекать в UI и лог. */
export const QUOTA_DESCRIPTION_CHAT_IDS = [
  CHAT_IDS.primary,
  CHAT_IDS.group,
  CHAT_IDS.channel,
] as const;

const CHATS_DESCRIPTION = `Monthly quota has been exceeded. You can only send or receive messages from following chats: ${QUOTA_DESCRIPTION_CHAT_IDS.join(', ')}`;
const CHECKS_DESCRIPTION = 'Monthly quota has been exceeded. Please change your tariff';

// --- QuotaInfo ------------------------------------------------------------------

/** Квота метода checkAccount (числа, как в примере). `QUOTE_EXCEEDED` — как в документации. */
export const checkAccountQuota = {
  method: 'checkAccount',
  used: 100,
  total: 100,
  status: 'QUOTE_EXCEEDED',
  description: CHECKS_DESCRIPTION,
} satisfies QuotaInfo;

/** То же, `used/total` строками (как в таблице документации). */
export const checkAccountQuotaStrings = {
  ...checkAccountQuota,
  used: '100',
  total: '100',
} satisfies QuotaInfo;

/** Квота чатов (числа). */
export const correspondentsQuota = {
  method: 'correspondents',
  used: 3,
  total: 3,
  status: 'CORRESPONDENTS_QUOTA_EXCEEDED',
  description: CHATS_DESCRIPTION,
} satisfies QuotaInfo;

export const correspondentsQuotaStrings = {
  ...correspondentsQuota,
  used: '3',
  total: '3',
} satisfies QuotaInfo;

/**
 * Квота метода sendMessage в форме `invokeStatus` — гипотетический вариант (Q-03):
 * тело не даёт вида `checks` (метод не checkAccount) → вид по методу запроса.
 */
export const sendMessageInvokeQuota = {
  method: 'sendMessage',
  used: 3,
  total: 3,
  status: 'QUOTE_EXCEEDED',
  description: CHATS_DESCRIPTION,
} satisfies QuotaInfo;

/**
 * Без `used`/`total` (ВА-13). Сейчас `QuotaInfo` требует оба поля, поэтому объект не
 * типизирован как `QuotaInfo` — см. отчёт о расхождениях типов.
 */
function withoutUsedTotal(info: QuotaInfo): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(info).filter(([key]) => key !== 'used' && key !== 'total'),
  );
}

// --- тела 466 -------------------------------------------------------------------

/** Формат 1: `invokeStatus`. */
export const body466InvokeStatus = {
  invokeStatus: checkAccountQuota,
} satisfies Error466InvokeStatusBody;
export const body466InvokeStatusStrings = {
  invokeStatus: checkAccountQuotaStrings,
} satisfies Error466InvokeStatusBody;
export const body466InvokeStatusSendMessage = {
  invokeStatus: sendMessageInvokeQuota,
} satisfies Error466InvokeStatusBody;

/** Формат 2: `correspondentsStatus` (по таблице документации). */
export const body466CorrespondentsStatus = {
  correspondentsStatus: correspondentsQuota,
} satisfies Error466CorrespondentsStatusBody;
export const body466CorrespondentsStatusStrings = {
  correspondentsStatus: correspondentsQuotaStrings,
} satisfies Error466CorrespondentsStatusBody;

/** Формат 3: тело в форме уведомления `quotaExceeded` (по примеру документации), без timestamp. */
export const body466QuotaExceeded = {
  typeWebhook: 'quotaExceeded',
  instanceData,
  quotaData: correspondentsQuota,
} satisfies QuotaExceededNotification;
export const body466QuotaExceededStrings = {
  ...body466QuotaExceeded,
  quotaData: correspondentsQuotaStrings,
} satisfies QuotaExceededNotification;

/** Без used/total — вне текущего типа (ВА-13). */
export const body466InvokeStatusNoUsedTotal: unknown = {
  invokeStatus: withoutUsedTotal(checkAccountQuota),
};
export const body466CorrespondentsStatusNoUsedTotal: unknown = {
  correspondentsStatus: withoutUsedTotal(correspondentsQuota),
};
export const body466QuotaExceededNoUsedTotal: unknown = {
  ...body466QuotaExceeded,
  quotaData: withoutUsedTotal(correspondentsQuota),
};

/** Нераспознанный JSON → вид по методу. */
export const body466Unrecognized: unknown = { error: 'quota', code: 466 };

// --- HTTP-ответы 466 и ожидаемый вид квоты ----------------------------------------

export interface Quota466Case {
  response: MockHttpResponse;
  /** Вид квоты по §5.5, если 466 пришёл на sendMessage. */
  kindOnSendMessage: QuotaKind;
  /** Вид квоты по §5.5, если 466 пришёл на checkAccount. */
  kindOnCheckAccount: QuotaKind;
}

/**
 * Все варианты 466 с ожидаемым видом квоты (§5.5 «Вид квоты»):
 * - `checks` — `invokeStatus.method === "checkAccount"` или нераспознанное тело на checkAccount;
 * - `chats` — `correspondentsStatus`, `quotaData.method === "correspondents"` или
 *   нераспознанное тело на sendMessage.
 * Тексты: `chats` на send — под пузырём + баннер; `chats` на checkAccount — текст ВА-12
 * в диалоге + баннер; `checks` — только текст в диалоге, баннера нет (ВА-13).
 */
export const quota466Cases = {
  invokeStatusCheckAccount: {
    response: jsonResponse(body466InvokeStatus, 466),
    kindOnSendMessage: 'checks',
    kindOnCheckAccount: 'checks',
  },
  invokeStatusCheckAccountStrings: {
    response: jsonResponse(body466InvokeStatusStrings, 466),
    kindOnSendMessage: 'checks',
    kindOnCheckAccount: 'checks',
  },
  invokeStatusCheckAccountNoUsedTotal: {
    response: jsonResponse(body466InvokeStatusNoUsedTotal, 466),
    kindOnSendMessage: 'checks',
    kindOnCheckAccount: 'checks',
  },
  invokeStatusSendMessage: {
    response: jsonResponse(body466InvokeStatusSendMessage, 466),
    kindOnSendMessage: 'chats',
    kindOnCheckAccount: 'checks',
  },
  correspondentsStatus: {
    response: jsonResponse(body466CorrespondentsStatus, 466),
    kindOnSendMessage: 'chats',
    kindOnCheckAccount: 'chats',
  },
  correspondentsStatusStrings: {
    response: jsonResponse(body466CorrespondentsStatusStrings, 466),
    kindOnSendMessage: 'chats',
    kindOnCheckAccount: 'chats',
  },
  correspondentsStatusNoUsedTotal: {
    response: jsonResponse(body466CorrespondentsStatusNoUsedTotal, 466),
    kindOnSendMessage: 'chats',
    kindOnCheckAccount: 'chats',
  },
  quotaExceededBody: {
    response: jsonResponse(body466QuotaExceeded, 466),
    kindOnSendMessage: 'chats',
    kindOnCheckAccount: 'chats',
  },
  quotaExceededBodyStrings: {
    response: jsonResponse(body466QuotaExceededStrings, 466),
    kindOnSendMessage: 'chats',
    kindOnCheckAccount: 'chats',
  },
  quotaExceededBodyNoUsedTotal: {
    response: jsonResponse(body466QuotaExceededNoUsedTotal, 466),
    kindOnSendMessage: 'chats',
    kindOnCheckAccount: 'chats',
  },
  unrecognizedJson: {
    response: jsonResponse(body466Unrecognized, 466),
    kindOnSendMessage: 'chats',
    kindOnCheckAccount: 'checks',
  },
  plainText: {
    response: textResponse('Quota exceeded', 466),
    kindOnSendMessage: 'chats',
    kindOnCheckAccount: 'checks',
  },
  html: {
    response: htmlResponse('<html><body>466</body></html>', 466),
    kindOnSendMessage: 'chats',
    kindOnCheckAccount: 'checks',
  },
  emptyBody: {
    response: emptyResponse(466),
    kindOnSendMessage: 'chats',
    kindOnCheckAccount: 'checks',
  },
} as const satisfies Record<string, Quota466Case>;

// --- уведомление quotaExceeded в очереди (ОР-3 п. 3.8, Q-09, Q-10) -----------------

/** [док] Пример без `timestamp`. */
export const quotaExceededNotification = {
  typeWebhook: 'quotaExceeded',
  instanceData,
  quotaData: correspondentsQuota,
} satisfies QuotaExceededNotification;

/** [док] По таблице `timestamp` есть. */
export const quotaExceededNotificationWithTimestamp = {
  ...quotaExceededNotification,
  timestamp: BASE_TIMESTAMP + 900,
} satisfies QuotaExceededNotification;

export const quotaExceededNotificationStrings = {
  ...quotaExceededNotification,
  quotaData: correspondentsQuotaStrings,
} satisfies QuotaExceededNotification;

/** Без used/total (ВА-13) — вне текущего типа. */
export const quotaExceededNotificationNoUsedTotal: unknown = {
  ...quotaExceededNotification,
  quotaData: withoutUsedTotal(correspondentsQuota),
};

/** Q-10: серия `quotaExceeded` с растущим `used` — один баннер, все удалены. */
export function quotaExceededSeries(count: number, firstReceiptId = 900): ReceivedNotification[] {
  return Array.from({ length: count }, (_, index) => ({
    receiptId: firstReceiptId + index,
    body: {
      ...quotaExceededNotificationWithTimestamp,
      timestamp: BASE_TIMESTAMP + 900 + index,
      quotaData: { ...correspondentsQuota, used: 3 + index },
    } satisfies QuotaExceededNotification,
  }));
}
