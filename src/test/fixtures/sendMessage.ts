/**
 * sendMessage (ОР-3, §6.3, ВА-8, ВА-20).
 * Форма запроса и ответа — [проверено]: `idMessage` из ответа совпадает с `idMessage`
 * в `outgoingAPIMessageReceived`. Ошибки — в ./errors, 466 — в ./quota.
 */
import type { SendMessageRequest, SendMessageResponse } from '../../api/types';
import { CHAT_IDS, FORBIDDEN_C_US_CHAT_ID, ID_MESSAGES } from './constants';
import { jsonResponse, type MockHttpResponse } from './http';

export const sendMessageRequest = {
  chatId: CHAT_IDS.primary,
  message: 'Тестовое сообщение',
} satisfies SendMessageRequest;

/**
 * Негатив Q-13 (Р-26 п. 2, §5.5): такой запрос приложение **не должно** отправлять.
 * Тип совпадает с контрактом (chatId — просто string), поэтому ловится только рантайм-проверкой.
 */
export const sendMessageRequestForbiddenCUs = {
  chatId: FORBIDDEN_C_US_CHAT_ID,
  message: 'Тестовое сообщение',
} satisfies SendMessageRequest;

export const sendMessageRequestNewRecipient = {
  chatId: CHAT_IDS.newRecipient,
  message: 'Тестовое сообщение',
} satisfies SendMessageRequest;

/** [проверено] 13-значный idMessage (миллисекунды). */
export const messageSent = { idMessage: ID_MESSAGES.api1 } satisfies SendMessageResponse;
export const messageSent2 = { idMessage: ID_MESSAGES.api2 } satisfies SendMessageResponse;
/** Для гонки §6.3: уведомление с этим idMessage приходит раньше ответа. */
export const messageSentRace = { idMessage: ID_MESSAGES.apiRace } satisfies SendMessageResponse;
/** 18-значный idMessage в ответе — проверка, что строка не теряет точность (M-05). */
export const messageSentLongId = {
  idMessage: ID_MESSAGES.incoming1,
} satisfies SendMessageResponse;

export const sendMessageResponses = {
  sent: jsonResponse(messageSent),
  sent2: jsonResponse(messageSent2),
  sentRace: jsonResponse(messageSentRace),
  sentLongId: jsonResponse(messageSentLongId),
} as const satisfies Record<string, MockHttpResponse>;
