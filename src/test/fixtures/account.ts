/**
 * getStateInstance и getSettings (ОР-1 п. 1.3–1.7, П-1…П-4).
 *
 * Источник формы: `{"stateInstance":"authorized"}` и набор полей getSettings — [проверено]
 * на реальном инстансе 01.10.2026 (значения переключателей — как на проверенном инстансе).
 * Остальные значения `stateInstance` — [док GetStateInstance].
 */
import type { GetSettingsResponse, GetStateInstanceResponse, StateInstance } from '../../api/types';
import { OWN_WID, WEBHOOK_URL } from './constants';
import { jsonResponse, type MockHttpResponse } from './http';

// --- getStateInstance -------------------------------------------------------

export const stateAuthorized = { stateInstance: 'authorized' } satisfies GetStateInstanceResponse;
/** [док] */
export const stateNotAuthorized = {
  stateInstance: 'notAuthorized',
} satisfies GetStateInstanceResponse;
/** [док] */
export const stateStarting = { stateInstance: 'starting' } satisfies GetStateInstanceResponse;
/** [док] */
export const stateBlocked = { stateInstance: 'blocked' } satisfies GetStateInstanceResponse;
/** [док] Вход разрешён, баннер (п. 1.6). */
export const stateSuspended = { stateInstance: 'suspended' } satisfies GetStateInstanceResponse;
/** [док] */
export const statePendingPassword = {
  stateInstance: 'pendingPassword',
} satisfies GetStateInstanceResponse;

/** Все документированные состояния — для параметризованных тестов. */
export const allStates = {
  authorized: stateAuthorized,
  notAuthorized: stateNotAuthorized,
  starting: stateStarting,
  blocked: stateBlocked,
  suspended: stateSuspended,
  pendingPassword: statePendingPassword,
} as const satisfies Record<StateInstance, GetStateInstanceResponse>;

/**
 * Не по контракту (ВА-3): неизвестное значение и ответ без поля →
 * «Инстанс недоступен (статус: <значение | неизвестен>)…». Тип намеренно `unknown`.
 */
export const stateUnknownValue: unknown = { stateInstance: 'somethingNew' };
export const stateMissingField: unknown = {};

// --- getSettings ------------------------------------------------------------

/**
 * Как на проверенном инстансе [проверено]: П-1…П-4 не срабатывают, `outgoingWebhook=no`
 * (сработало бы только П-5 из Д-4).
 */
export const settingsOk = {
  webhookUrl: '',
  webhookUrlToken: '',
  delaySendMessagesMilliseconds: 500,
  markIncomingMessagesReaded: 'no',
  markIncomingMessagesReadedOnReply: 'no',
  outgoingWebhook: 'no',
  outgoingMessageWebhook: 'yes',
  outgoingAPIMessageWebhook: 'yes',
  incomingWebhook: 'yes',
  stateWebhook: 'no',
  editedMessageWebhook: 'no',
  deletedMessageWebhook: 'no',
  wid: OWN_WID,
  typeInstance: 'v3',
} satisfies GetSettingsResponse;

/** П-1: задан Webhook URL — опрос не запускается. */
export const settingsWebhookSet = {
  ...settingsOk,
  webhookUrl: WEBHOOK_URL,
} satisfies GetSettingsResponse;

/** П-2: выключены входящие. */
export const settingsIncomingOff = {
  ...settingsOk,
  incomingWebhook: 'no',
} satisfies GetSettingsResponse;

/** П-3: выключены уведомления об отправленных через API. */
export const settingsOutgoingApiOff = {
  ...settingsOk,
  outgoingAPIMessageWebhook: 'no',
} satisfies GetSettingsResponse;

/** П-4: выключены уведомления об отправленных с телефона. */
export const settingsOutgoingPhoneOff = {
  ...settingsOk,
  outgoingMessageWebhook: 'no',
} satisfies GetSettingsResponse;

/** П-2 + П-3 + П-4 одновременно (S-06). */
export const settingsAllWarnings = {
  ...settingsOk,
  incomingWebhook: 'no',
  outgoingAPIMessageWebhook: 'no',
  outgoingMessageWebhook: 'no',
} satisfies GetSettingsResponse;

/** П-1 + П-2 (S-06): П-1 остаётся блокирующим. */
export const settingsWebhookAndIncomingOff = {
  ...settingsWebhookSet,
  incomingWebhook: 'no',
} satisfies GetSettingsResponse;

/** Д-4 / П-5: статусы включены (на проверенном инстансе так не было). */
export const settingsStatusesOn = {
  ...settingsOk,
  outgoingWebhook: 'yes',
} satisfies GetSettingsResponse;

/**
 * Не по контракту (S-07): поля нет / `null` → «≠ "yes"» → предупреждение.
 * Тип намеренно `unknown`: такие ответы должны проходить рантайм-разбор.
 */
export const settingsMissingIncoming: unknown = Object.fromEntries(
  Object.entries(settingsOk).filter(([key]) => key !== 'incomingWebhook'),
);
export const settingsNullOutgoingPhone: unknown = { ...settingsOk, outgoingMessageWebhook: null };

// --- готовые HTTP-ответы ----------------------------------------------------

export const stateResponses = {
  authorized: jsonResponse(stateAuthorized),
  notAuthorized: jsonResponse(stateNotAuthorized),
  starting: jsonResponse(stateStarting),
  blocked: jsonResponse(stateBlocked),
  suspended: jsonResponse(stateSuspended),
  pendingPassword: jsonResponse(statePendingPassword),
  unknownValue: jsonResponse(stateUnknownValue),
  missingField: jsonResponse(stateMissingField),
} as const satisfies Record<string, MockHttpResponse>;

export const settingsResponses = {
  ok: jsonResponse(settingsOk),
  webhookSet: jsonResponse(settingsWebhookSet),
  incomingOff: jsonResponse(settingsIncomingOff),
  outgoingApiOff: jsonResponse(settingsOutgoingApiOff),
  outgoingPhoneOff: jsonResponse(settingsOutgoingPhoneOff),
  allWarnings: jsonResponse(settingsAllWarnings),
  webhookAndIncomingOff: jsonResponse(settingsWebhookAndIncomingOff),
  statusesOn: jsonResponse(settingsStatusesOn),
  missingIncoming: jsonResponse(settingsMissingIncoming),
  nullOutgoingPhone: jsonResponse(settingsNullOutgoingPhone),
} as const satisfies Record<string, MockHttpResponse>;
