/**
 * receiveNotification и deleteNotification (§5.2, §6.1, ВА-17, ВА-18).
 *
 * «Пустой ответ» receive: точный вид [не подтверждено] — в спайке пустые ответы не
 * логировались, известно только, что это HTTP 2xx с пустым телом или JSON-«ложным»
 * значением. Клиент считает «нет уведомления» пустое тело, `null` и JSON без `receiptId`.
 * Ответ delete — [док DeleteNotification].
 */
import type {
  DeleteNotificationResponse,
  NotificationBody,
  ReceivedNotification,
} from '../../api/types';
import { errorResponses } from './errors';
import { emptyResponse, jsonResponse, rawJsonResponse, type MockHttpResponse } from './http';
import { incomingText, receipt } from './notifications';

/** Ответ receive с уведомлением. */
export function notificationResponse(notification: ReceivedNotification): MockHttpResponse {
  return jsonResponse(notification);
}

/** Ответ receive с body вне контракта (битое или неизвестное уведомление). */
export function rawNotificationResponse(body: unknown, receiptId: number): MockHttpResponse {
  return jsonResponse({ receiptId, body });
}

/** Ответ receive для body с receiptId. */
export function bodyResponse(body: NotificationBody, receiptId: number): MockHttpResponse {
  return notificationResponse(receipt(body, receiptId));
}

/** R-04: все варианты «нет уведомления» — следующий receive, delete не вызывается. */
export const emptyReceiveResponses = {
  emptyBody: emptyResponse(200),
  jsonNull: jsonResponse(null),
  /** [не подтверждено] JSON-«ложное» значение. */
  jsonFalse: jsonResponse(false),
  emptyObject: jsonResponse({}),
  /** Body без receiptId — удалять нечего. */
  noReceiptId: jsonResponse({ body: incomingText }),
  /** 204 без тела. */
  noContent: emptyResponse(204),
} as const satisfies Record<string, MockHttpResponse>;

/** Непустой ответ receive, который не разбирается как JSON (ТЗ §5.4). */
export const nonJsonReceiveResponses = {
  /**
   * §5.4, ВА-18: весь ответ — не JSON, `receiptId` нет, удалять нечего → ошибка,
   * backoff 1 → … → 30 с, в лог только код и длина.
   */
  html: errorResponses.htmlInsteadOfJson200,
  /**
   * §5.4 «Невалидный JSON или неожиданная структура body»: тело оборвано, но ведущий
   * `receiptId` (1) читается → залогировать тип, удалить уведомление **без паузы**
   * и продолжать цикл. Это не ветка ВА-18: backoff здесь нет.
   */
  truncatedJson: errorResponses.truncatedJson200,
} as const satisfies Record<string, MockHttpResponse>;

/** [док] Удалено. */
export const deleteOk = { result: true, reason: '' } satisfies DeleteNotificationResponse;

/** [док] `false`: уже удалено или не тот receiptId — считать удалённым (§5.4). */
export const deleteResultFalse = {
  result: false,
  reason: 'notification not found',
} satisfies DeleteNotificationResponse;

export const deleteResponses = {
  ok: jsonResponse(deleteOk),
  resultFalse: jsonResponse(deleteResultFalse),
  findUnAcked500: errorResponses.findUnAcked500.json,
  findUnAcked500Text: errorResponses.findUnAcked500.text,
  receiptIdNotNumber400: errorResponses.receiptIdNotNumber400.json,
  customWebhook400: errorResponses.customWebhook400.json,
} as const satisfies Record<string, MockHttpResponse>;

/**
 * EC-I3: `receiptId` больше `Number.MAX_SAFE_INTEGER` (2^53 + 2). Величина реальных
 * `receiptId` не подтверждена. Ожидание: удалить нельзя → ошибка формата и backoff,
 * без бесконечного быстрого цикла. Тело — сырая строка: `JSON.stringify` числа не сохранит.
 */
export const unsafeReceiptIdResponse = rawJsonResponse(
  `{"receiptId":9007199254740994,"body":${JSON.stringify(incomingText)}}`,
);
/** Граница: 2^53 − 1 — ещё safe integer, удаляется как обычно. */
export const maxSafeReceiptIdResponse = notificationResponse(
  receipt(incomingText, Number.MAX_SAFE_INTEGER),
);
