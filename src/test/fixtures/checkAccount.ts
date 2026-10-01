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
import { jsonResponse, type MockHttpResponse } from './http';

/** Тело запроса: `phoneNumber` — **число** (C-05). */
export const checkAccountRequest = { phoneNumber: PHONES.primary } satisfies CheckAccountRequest;
export const checkAccountRequestNewRecipient = {
  phoneNumber: PHONES.newRecipient,
} satisfies CheckAccountRequest;
export const checkAccountRequestBelarus = {
  phoneNumber: PHONES.belarus,
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

export const checkAccountResponses = {
  exists: jsonResponse(accountExists),
  existsFromCache: jsonResponse(accountExistsFromCache),
  existsSameChatOtherNumber: jsonResponse(accountExistsSameChatOtherNumber),
  existsSecondary: jsonResponse(accountExistsSecondary),
  existsNewRecipient: jsonResponse(accountExistsNewRecipient),
  notExists: jsonResponse(accountNotExists),
  statusFalseStarting200: jsonResponse(checkStatusFalseStarting, 200),
  statusFalseStarting400: jsonResponse(checkStatusFalseStarting, 400),
  statusFalseLimit200: jsonResponse(checkStatusFalseLimit, 200),
  statusFalseLimit400: jsonResponse(checkStatusFalseLimit, 400),
} as const satisfies Record<string, MockHttpResponse>;
