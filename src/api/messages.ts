import { GreenApiErrorCode, isGreenApiError, isQuotaError } from './errors';
import type { QuotaSummary } from './quota';
import type { StateInstanceResult } from './clientTypes';

type StateInstance = StateInstanceResult['stateInstance'];

/**
 * Тексты для пользователя — дословно из ТЗ v1.3.1 (§4.1–§4.5, §5.4, §5.5, Р-11, Р-12).
 * Тест `texts.test.ts` сверяет каждую строку с файлом ТЗ. Шаблоны с подстановкой —
 * функции; их неизменные части тоже в константах. Ни один текст не содержит токен;
 * `description` из 466 и `quotaExceeded` не используется (там чужие chatId).
 */

/** Форма входа (§4.1 п. 1.2, ВА-2). */
export const LOGIN_FORM_TEXTS = {
  required: 'Заполните поле',
  idInstanceDigits: 'ID инстанса — только цифры',
  apiUrlFormat: 'Введите адрес вида https://3100.api.green-api.com',
} as const;

/** Ошибки входа (§4.1 п. 1.5) и сессии (§5.4: 401 / 403). */
export const AUTH_TEXTS = {
  unauthorized: 'Неверный apiTokenInstance',
  forbidden: 'Неверный idInstance или адрес API',
  /** Части шаблона «Не удалось связаться с {apiUrl}. Проверьте адрес API». */
  unreachablePrefix: 'Не удалось связаться с ',
  unreachableSuffix: '. Проверьте адрес API',
} as const;

export function unreachableText(apiUrl: string): string {
  return `${AUTH_TEXTS.unreachablePrefix}${apiUrl}${AUTH_TEXTS.unreachableSuffix}`;
}

/** Тексты по stateInstance и 400 expired/deleted (§4.1 п. 1.6, ВА-3). */
export const INSTANCE_TEXTS = {
  notAuthorized: 'Инстанс не авторизован. Отсканируйте QR-код в личном кабинете',
  starting: 'Инстанс запускается, повторите через 1–5 минут',
  blocked: 'Аккаунт MAX заблокирован',
  suspended: 'На аккаунте временные ограничения: отправка только контактам',
  pendingPassword: 'Требуется пароль 2FA — завершите авторизацию в личном кабинете',
  /** Части шаблона «Инстанс недоступен (статус: <значение | неизвестен>). Проверьте…». */
  unknownPrefix: 'Инстанс недоступен (статус: ',
  unknownSuffix: '). Проверьте инстанс в личном кабинете GREEN-API',
  unknownStatus: 'неизвестен',
  expired: 'Срок действия инстанса истёк. Продлите его в личном кабинете GREEN-API',
  deleted: 'Инстанс удалён. Создайте новый инстанс в личном кабинете GREEN-API',
} as const;

/** Баннеры (§4.1 П-1…П-5, §5.4, §4.4 п. 4.3, Р-12) и заглушка Р-11. */
export const BANNER_TEXTS = {
  /** §5.4: 400 `instance is starting or not authorized` в работе и в checkAccount (п. 2.8). */
  instanceNotReady: 'Инстанс не авторизован или запускается',
  /** §4.4 п. 4.3 (ВА-24). */
  offline: 'Нет соединения с GREEN-API. Переподключаемся…',
  /** Р-12, ВА-16. */
  otherTab: 'Чат открыт в другой вкладке — получение сообщений идёт там',
  /** Р-11. */
  unsupportedMessage: 'Сообщение этого типа не поддерживается',
} as const;

/** Проверки getSettings (§4.1, П-1…П-5). */
export const SETTINGS_TEXTS = {
  webhookUrlSet:
    'В настройках инстанса указан Webhook URL — получать сообщения в этом окне невозможно. Очистите поле Webhook URL в личном кабинете и подождите около минуты.',
  incomingWebhookOff:
    'Выключено получение входящих сообщений — ответы собеседников не появятся. Включите „Получать уведомления о входящих сообщениях и файлах“ в личном кабинете (применяется до 5 минут).',
  outgoingApiMessageWebhookOff:
    'Выключены уведомления о сообщениях, отправленных через API — отправленные отсюда сообщения не будут подтверждены сервером и могут пропасть после очистки данных. Включите „Получать уведомления о сообщениях, отправленных через API“.',
  outgoingMessageWebhookOff:
    'Выключены уведомления о сообщениях, отправленных с телефона — то, что вы пишете в приложении MAX, не появится в этом чате. Включите „Получать уведомления о сообщениях, отправленных с телефона“.',
  outgoingWebhookOff:
    'Статусы доставки и прочтения выключены — галочки у сообщений не отображаются. Чтобы видеть их, включите „Получать уведомления о статусах отправленных сообщений“ в личном кабинете.',
} as const;

/** П-1 (обратная совместимость имени). */
export const WEBHOOK_URL_SET_TEXT = SETTINGS_TEXTS.webhookUrlSet;

/** checkAccount (§4.2 п. 2.7–2.8, ВА-7, ВА-10). */
export const CHECK_ACCOUNT_TEXTS = {
  notExists: 'На этом номере нет аккаунта MAX',
  tooManyChecks: 'Слишком много проверок номеров, повторите позже',
  badPhoneLength: 'Неверный номер: нужно 11 или 12 цифр',
  badPhoneDigits: 'Номер должен содержать только цифры',
  checkTimeout:
    'MAX не ответил вовремя при проверке номера. Нажмите «Создать» ещё раз через минуту',
  /** Префикс шаблона «Ошибка в запросе: <текст сервера, до 200 символов>». */
  badRequestPrefix: 'Ошибка в запросе: ',
  network:
    'Не удалось проверить номер: нет связи с сервером GREEN-API. Проверьте соединение и нажмите «Создать» ещё раз',
  rateLimited: 'Слишком много запросов. Подождите несколько секунд и нажмите «Создать» ещё раз',
  server: 'Сервер GREEN-API временно не отвечает. Нажмите «Создать» ещё раз через минуту',
} as const;

/** Максимум символов текста сервера в «Ошибка в запросе: …» (п. 2.8). */
export const SERVER_REASON_MAX = 200;

/** sendMessage (§4.3 п. 3.4, 3.6, ВА-9, ВА-10, ВА-20). */
export const SEND_TEXTS = {
  suspended: 'Аккаунт ограничен: отправка только контактам',
  statusUnknown:
    'Статус неизвестен: возможно, сообщение уже доставлено. Проверьте в MAX, прежде чем повторять',
  instanceNotReady: 'Не отправлено: инстанс не авторизован или запускается',
  /** Части шаблона «Не отправлено: ошибка в запросе (<текст сервера>)». */
  badRequestPrefix: 'Не отправлено: ошибка в запросе (',
  badRequestSuffix: ')',
} as const;

/** Квота Developer (§5.5, ВА-12, ВА-13). */
export const QUOTA_TEXTS = {
  /** 466 на sendMessage (`chats`) — под пузырём + баннер. */
  sendChats:
    'Не отправлено: исчерпан лимит бесплатного тарифа Developer — не больше 3 чатов в месяц, этот чат в него не входит. Напишите в уже используемый чат или смените тариф в личном кабинете GREEN-API',
  /** 466 на checkAccount (`chats`) — в диалоге «Новый чат» + баннер (ВА-12). */
  checkAccountChats:
    'Нельзя начать новый чат: исчерпан лимит бесплатного тарифа Developer — не больше 3 чатов в месяц. Откройте уже созданный чат или смените тариф в личном кабинете GREEN-API',
  /** 466 на checkAccount (`checks`) — в диалоге «Новый чат», без баннера. */
  checkAccountChecks:
    'Исчерпан месячный лимит проверок номеров (100 на тарифе Developer). Откройте уже созданный чат или повторите в следующем месяце',
  /** Единый баннер квоты для всех событий `chats` (ВА-13). */
  banner:
    'Лимит тарифа Developer исчерпан: новые чаты сверх 3 в месяц не работают — сообщения в них не отправляются и не приходят. Лимит обновляется 1-го числа',
} as const;

/**
 * Тексты, которых в ТЗ нет (решение фронтенда, вынесено в отчёт как неясность).
 * Не участвуют в посимвольной сверке с ТЗ.
 */
export const FALLBACK_TEXTS = {
  /** sendMessage 429 после 3 автоповторов: в п. 3.4 сказано только «не отправлено». */
  sendRateLimited: 'Не отправлено: слишком много запросов. Повторите через несколько секунд',
  sendGeneric: 'Не отправлено',
  generic: 'Ошибка сервера GREEN-API, повторите позже',
  aborted: 'Запрос отменён',
  chatIdNotAllowed: 'Отправка в этот чат запрещена настройками приложения',
  invalidArgument: 'Некорректные данные запроса',
  unknown: 'Неизвестная ошибка',
} as const;

/** Показывать ли баннер квоты: только для `chats` (ВА-13). */
export function shouldShowQuotaBanner(quota: QuotaSummary): boolean {
  return quota.kind === 'chats';
}

/** Текст квоты по месту (§5.5). `notification` — баннер. */
export function quotaText(
  quota: QuotaSummary,
  where: 'send' | 'checkAccount' | 'notification',
): string {
  if (where === 'notification') return QUOTA_TEXTS.banner;
  if (where === 'checkAccount')
    return quota.kind === 'checks' ? QUOTA_TEXTS.checkAccountChecks : QUOTA_TEXTS.checkAccountChats;
  return QUOTA_TEXTS.sendChats;
}

/**
 * Текст по stateInstance при входе (§4.1 п. 1.6). `null` для `authorized`.
 * `undefined`/`null`/пустая строка — «статус: неизвестен».
 */
export function stateInstanceText(state: StateInstance | null | undefined): string | null {
  switch (state) {
    case 'authorized':
      return null;
    case 'notAuthorized':
      return INSTANCE_TEXTS.notAuthorized;
    case 'starting':
      return INSTANCE_TEXTS.starting;
    case 'blocked':
      return INSTANCE_TEXTS.blocked;
    case 'suspended':
      return INSTANCE_TEXTS.suspended;
    case 'pendingPassword':
      return INSTANCE_TEXTS.pendingPassword;
    default: {
      const value =
        state === undefined || state === null || state === ''
          ? INSTANCE_TEXTS.unknownStatus
          : state;
      return `${INSTANCE_TEXTS.unknownPrefix}${value}${INSTANCE_TEXTS.unknownSuffix}`;
    }
  }
}

/** Разрешён ли вход при данном stateInstance (§4.1 п. 1.6: `suspended` — вход с баннером). */
export function isLoginAllowed(state: StateInstance): boolean {
  return state === 'authorized' || state === 'suspended';
}

/** Контекст, в котором показывается ошибка. */
export type ErrorContext = 'login' | 'session' | 'checkAccount' | 'send';

function serverReason(reason: string | undefined, max: number): string {
  const r = (reason ?? '').trim();
  return r.length > max ? `${r.slice(0, max)}…` : r;
}

/** Тексты, общие для всех контекстов (401/403/expired/deleted). null — не применимо. */
function authText(code: GreenApiErrorCode): string | null {
  const C = GreenApiErrorCode;
  if (code === C.UNAUTHORIZED) return AUTH_TEXTS.unauthorized;
  if (code === C.FORBIDDEN) return AUTH_TEXTS.forbidden;
  if (code === C.INSTANCE_EXPIRED) return INSTANCE_TEXTS.expired;
  if (code === C.INSTANCE_DELETED) return INSTANCE_TEXTS.deleted;
  return null;
}

/**
 * Текст ошибки для пользователя по контексту (§4.1 п. 1.5–1.6, §4.2 п. 2.8, §4.3 п. 3.4–3.6,
 * §5.4, §5.5). Никогда не возвращает токен.
 */
export function describeError(error: unknown, context: ErrorContext): string {
  if (!isGreenApiError(error)) return FALLBACK_TEXTS.unknown;
  if (isQuotaError(error))
    return quotaText(error.quota, context === 'checkAccount' ? 'checkAccount' : 'send');
  const C = GreenApiErrorCode;
  const code = error.code;
  if (code === C.ABORTED || code === C.SESSION_CLOSED) return FALLBACK_TEXTS.aborted;
  if (code === C.CHAT_ID_NOT_ALLOWED) return FALLBACK_TEXTS.chatIdNotAllowed;

  switch (context) {
    case 'login':
    case 'session': {
      const auth = authText(code);
      if (auth) return auth;
      if (code === C.ACCOUNT_SUSPENDED) return AUTH_TEXTS.forbidden; // прочие 403 (ВА-19)
      if (code === C.INSTANCE_NOT_READY) return BANNER_TEXTS.instanceNotReady;
      if (code === C.WEBHOOK_URL_SET) return SETTINGS_TEXTS.webhookUrlSet;
      if (code === C.NETWORK || code === C.TIMEOUT)
        return context === 'login' ? unreachableText(error.apiUrl ?? '') : BANNER_TEXTS.offline;
      if (
        context === 'login' &&
        error.method === 'getStateInstance' &&
        code === C.UNEXPECTED_RESPONSE
      )
        return stateInstanceText(undefined) ?? FALLBACK_TEXTS.generic;
      return code === C.INVALID_ARGUMENT ? FALLBACK_TEXTS.invalidArgument : FALLBACK_TEXTS.generic;
    }
    case 'checkAccount': {
      const auth = authText(code);
      if (auth) return auth;
      switch (code) {
        case C.INSTANCE_NOT_READY:
          return BANNER_TEXTS.instanceNotReady;
        case C.CHECK_LIMIT:
          return CHECK_ACCOUNT_TEXTS.tooManyChecks;
        case C.CHECK_TIMEOUT:
          return CHECK_ACCOUNT_TEXTS.checkTimeout;
        case C.INVALID_ARGUMENT:
          return CHECK_ACCOUNT_TEXTS.badPhoneLength;
        case C.BAD_REQUEST: {
          const reason = error.reason ?? '';
          if (/bad phone number/i.test(reason)) return CHECK_ACCOUNT_TEXTS.badPhoneLength;
          if (/must contain only digits/i.test(reason)) return CHECK_ACCOUNT_TEXTS.badPhoneDigits;
          return `${CHECK_ACCOUNT_TEXTS.badRequestPrefix}${serverReason(reason, SERVER_REASON_MAX)}`;
        }
        case C.NETWORK:
        case C.TIMEOUT:
          return CHECK_ACCOUNT_TEXTS.network;
        case C.RATE_LIMITED:
          return CHECK_ACCOUNT_TEXTS.rateLimited;
        case C.SERVER:
          return CHECK_ACCOUNT_TEXTS.server;
        default:
          return FALLBACK_TEXTS.generic;
      }
    }
    case 'send': {
      if (code === C.ACCOUNT_SUSPENDED) return SEND_TEXTS.suspended;
      const auth = authText(code);
      if (auth) return auth;
      switch (code) {
        case C.INSTANCE_NOT_READY:
          return SEND_TEXTS.instanceNotReady;
        case C.BAD_REQUEST:
          return `${SEND_TEXTS.badRequestPrefix}${serverReason(error.reason, SERVER_REASON_MAX)}${SEND_TEXTS.badRequestSuffix}`;
        case C.NETWORK:
        case C.TIMEOUT:
        case C.SERVER:
        case C.INVALID_JSON:
        case C.UNEXPECTED_RESPONSE:
          return SEND_TEXTS.statusUnknown;
        case C.RATE_LIMITED:
          return FALLBACK_TEXTS.sendRateLimited;
        case C.INVALID_ARGUMENT:
          return FALLBACK_TEXTS.invalidArgument;
        default:
          return FALLBACK_TEXTS.sendGeneric;
      }
    }
  }
}
