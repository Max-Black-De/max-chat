/**
 * checkAccount (ОР-2 п. 2.4–2.11, ВА-7, ВА-10, ВА-11).
 *
 * `{"exist":true,"chatId":"…","fromCache":false}` — форма [проверено]; `fromCache:true`,
 * `exist:false` и `{"status":false,"reason":…}` — [док CheckAccount]. HTTP-код для
 * `status:false` в документации не указан (ВА-11) — есть варианты 200 и 400.
 * Ошибки 400/429/469/5xx — в ./errors, 466 — в ./quota.
 */
import type {
  CheckAccountRequest,
  CheckAccountResponse,
  StatusFalseResponse,
} from '../../api/types';
import { CHAT_IDS, PHONES } from './constants';
import { emptyResponse, jsonResponse, type MockHttpResponse } from './http';

/** Тело запроса: `phoneNumber` — **число** (C-05). */
export const checkAccountRequest = { phoneNumber: PHONES.primary } satisfies CheckAccountRequest;
export const checkAccountRequestNewRecipient = {
  phoneNumber: PHONES.newRecipient,
} satisfies CheckAccountRequest;
export const checkAccountRequestBelarus = {
  phoneNumber: PHONES.belarus,
} satisfies CheckAccountRequest;
/** EC-I8, §3 п. 6 edge-cases: KZ-номер — только моки (реальная проверка = новый получатель). */
export const checkAccountRequestKazakhstan = {
  phoneNumber: PHONES.kazakhstan,
} satisfies CheckAccountRequest;

/** [проверено] Номер существует, ответ не из кеша сервера. */
export const accountExists = {
  exist: true,
  chatId: CHAT_IDS.primary,
  fromCache: false,
} satisfies CheckAccountResponse;

/** [док] То же из кеша сервера (`fromCache:true`) — для приложения разницы нет. */
export const accountExistsFromCache = {
  exist: true,
  chatId: CHAT_IDS.primary,
  fromCache: true,
} satisfies CheckAccountResponse;

/** C-09: другой номер → тот же chatId — дубль чата не создаётся. */
export const accountExistsSameChatOtherNumber = {
  exist: true,
  chatId: CHAT_IDS.primary,
  fromCache: false,
} satisfies CheckAccountResponse;

/** Второй известный чат. */
export const accountExistsSecondary = {
  exist: true,
  chatId: CHAT_IDS.secondary,
  fromCache: false,
} satisfies CheckAccountResponse;

/** Р-26 п. 5 / Q-15: «новый получатель» — дальше sendMessage на моке даёт 466. */
export const accountExistsNewRecipient = {
  exist: true,
  chatId: CHAT_IDS.newRecipient,
  fromCache: false,
} satisfies CheckAccountResponse;

/** [док] Нет аккаунта MAX (C-10). */
export const accountNotExists = {
  exist: false,
  chatId: '',
  fromCache: false,
} satisfies CheckAccountResponse;

/** [док] Инстанс не авторизован (C-11). */
export const checkStatusFalseStarting = {
  status: false,
  reason: 'instance is starting or not authorized',
} satisfies StatusFalseResponse;

/** [док] Лимит проверок со стороны MAX → как 469 (C-13). */
export const checkStatusFalseLimit = {
  status: false,
  reason: 'User get contact info limit reached',
} satisfies StatusFalseResponse;

/** [вывод] KZ-номер найден: ответ той же формы, что и для РФ. */
export const accountExistsKazakhstan = {
  exist: true,
  chatId: CHAT_IDS.kazakhstan,
  fromCache: false,
} satisfies CheckAccountResponse;

export const checkAccountResponses = {
  exists: jsonResponse(accountExists),
  existsFromCache: jsonResponse(accountExistsFromCache),
  existsSameChatOtherNumber: jsonResponse(accountExistsSameChatOtherNumber),
  existsSecondary: jsonResponse(accountExistsSecondary),
  existsNewRecipient: jsonResponse(accountExistsNewRecipient),
  notExists: jsonResponse(accountNotExists),
  existsKazakhstan: jsonResponse(accountExistsKazakhstan),
  /** KZ-номер без аккаунта MAX — тот же `exist:false`, текст C-10. */
  notExistsKazakhstan: jsonResponse(accountNotExists),
  statusFalseStarting200: jsonResponse(checkStatusFalseStarting, 200),
  statusFalseStarting400: jsonResponse(checkStatusFalseStarting, 400),
  statusFalseLimit200: jsonResponse(checkStatusFalseLimit, 200),
  statusFalseLimit400: jsonResponse(checkStatusFalseLimit, 400),
} as const satisfies Record<string, MockHttpResponse>;

/**
 * EC-I9 (ТЗ п. 2.6): неожиданные формы ответа checkAccount — в документации не описаны.
 * Ожидание для всех: «Не удалось проверить номер: неожиданный ответ сервера. Попробуйте позже»,
 * чат не создаётся, кеш не пишется, автоповтора нет. Типизированы как `unknown`: вне контракта.
 */
export const checkAccountUnexpectedBodies = {
  existTrueEmptyChatId: { exist: true, chatId: '', fromCache: false },
  existTrueNoChatId: { exist: true, fromCache: false },
  existTrueNumericChatId: { exist: true, chatId: Number(CHAT_IDS.primary), fromCache: false },
  existTrueNullChatId: { exist: true, chatId: null, fromCache: false },
  existTrueCUsChatId: { exist: true, chatId: `${String(PHONES.primary)}@c.us`, fromCache: false },
  existTrueNonDigitChatId: { exist: true, chatId: 'abc', fromCache: false },
  existTrueSpacedChatId: { exist: true, chatId: ' 10000000', fromCache: false },
  noExistField: { chatId: CHAT_IDS.primary, fromCache: false },
  existAsString: { exist: 'true', chatId: CHAT_IDS.primary, fromCache: false },
  emptyObject: {},
  jsonNull: null,
  jsonArray: [],
} as const satisfies Record<string, unknown>;

export const checkAccountUnexpectedResponses = {
  ...(Object.fromEntries(
    Object.entries(checkAccountUnexpectedBodies).map(([name, body]) => [name, jsonResponse(body)]),
  ) as Record<keyof typeof checkAccountUnexpectedBodies, MockHttpResponse>),
  /** 200 с пустым телом. */
  emptyBody: emptyResponse(200),
} satisfies Record<string, MockHttpResponse>;

/**
 * Контроль к EC-I9: валидные формы, которые **не** должны давать «неожиданный ответ».
 * У групп допустим ведущий `-` (ТЗ п. 2.6), хотя группы вне скоупа.
 */
export const checkAccountValidEdgeBodies = {
  groupLikeChatId: { exist: true, chatId: CHAT_IDS.group, fromCache: false },
  existFalseNoChatId: { exist: false },
} as const satisfies Record<string, unknown>;
