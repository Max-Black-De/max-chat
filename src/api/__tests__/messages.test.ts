import { blockRealNetwork } from '../../test/apiHelpers';
import { describe, expect, it } from 'vitest';
import { GreenApiError, GreenApiErrorCode as C, type GreenApiErrorCode } from '../errors';
import { GreenApiQuotaError } from '../errors';
import {
  AUTH_TEXTS,
  BANNER_TEXTS,
  CHECK_ACCOUNT_TEXTS,
  FALLBACK_TEXTS,
  INSTANCE_TEXTS,
  LOGIN_FORM_TEXTS,
  QUOTA_TEXTS,
  SEND_TEXTS,
  SETTINGS_TEXTS,
  describeError,
  isLoginAllowed,
  quotaText,
  shouldShowQuotaBanner,
  stateInstanceText,
  unreachableText,
  type ErrorContext,
} from '../messages';
import { PHONE_FORMAT_ERROR } from '../phone';
import type { QuotaSummary } from '../quota';

blockRealNetwork();

const err = (
  code: GreenApiErrorCode,
  extra: Partial<ConstructorParameters<typeof GreenApiError>[0]> = {},
) => new GreenApiError({ code, method: 'getStateInstance', retry: 'none', ...extra });

/**
 * Эталон — строки, скопированные из ТЗ v1.3.4 (вручную, посимвольно). Тест не читает файл ТЗ:
 * его нет в репозитории. Константы в messages.ts должны совпадать с эталоном посимвольно.
 */
const TZ = {
  // §4.1 п. 1.2 (ВА-2)
  required: 'Заполните поле',
  idDigits: 'ID инстанса — только цифры',
  apiUrl: 'Введите адрес вида https://3100.api.green-api.com',
  // §4.1 п. 1.5
  unauthorized: 'Неверный apiTokenInstance',
  forbidden: 'Неверный idInstance или адрес API',
  unreachable: 'Не удалось связаться с https://3100.api.green-api.com. Проверьте адрес API',
  // §4.1 п. 1.6 (ВА-3)
  notAuthorized: 'Инстанс не авторизован. Отсканируйте QR-код в личном кабинете',
  starting: 'Инстанс запускается, повторите через 1–5 минут',
  blocked: 'Аккаунт MAX заблокирован',
  suspended: 'На аккаунте временные ограничения: отправка только контактам',
  pendingPassword: 'Требуется пароль 2FA — завершите авторизацию в личном кабинете',
  unknownState:
    'Инстанс недоступен (статус: yellowCard). Проверьте инстанс в личном кабинете GREEN-API',
  missingState:
    'Инстанс недоступен (статус: неизвестен). Проверьте инстанс в личном кабинете GREEN-API',
  expired: 'Срок действия инстанса истёк. Продлите его в личном кабинете GREEN-API',
  deleted: 'Инстанс удалён. Создайте новый инстанс в личном кабинете GREEN-API',
  // Баннеры: §5.4, §4.4 п. 4.3, Р-12, Р-11
  notReadyBanner: 'Инстанс не авторизован или запускается',
  offline: 'Нет соединения с GREEN-API. Переподключаемся…',
  otherTab: 'Чат открыт в другой вкладке — получение сообщений идёт там',
  unsupported: 'Сообщение этого типа не поддерживается',
  // §4.1 П-1…П-5
  p1: 'В настройках инстанса указан Webhook URL — получать сообщения в этом окне невозможно. Очистите поле Webhook URL в личном кабинете и подождите около минуты.',
  p2: 'Выключено получение входящих сообщений — ответы собеседников не появятся. Включите „Получать уведомления о входящих сообщениях и файлах“ в личном кабинете (применяется до 5 минут).',
  p3: 'Выключены уведомления о сообщениях, отправленных через API — отправленные отсюда сообщения не будут подтверждены сервером и могут пропасть после очистки данных. Включите „Получать уведомления о сообщениях, отправленных через API“.',
  p4: 'Выключены уведомления о сообщениях, отправленных с телефона — то, что вы пишете в приложении MAX, не появится в этом чате. Включите „Получать уведомления о сообщениях, отправленных с телефона“.',
  p5: 'Статусы доставки и прочтения выключены — галочки у сообщений не отображаются. Чтобы видеть их, включите „Получать уведомления о статусах отправленных сообщений“ в личном кабинете.',
  // §4.2 п. 2.7–2.8 (ВА-7, ВА-10)
  phoneFormat: 'Введите номер в формате +7XXXXXXXXXX или +375XXXXXXXXX',
  notExists: 'На этом номере нет аккаунта MAX',
  tooManyChecks: 'Слишком много проверок номеров, повторите позже',
  badLen: 'Неверный номер: нужно 11 или 12 цифр',
  badDigits: 'Номер должен содержать только цифры',
  checkTimeout:
    'MAX не ответил вовремя при проверке номера. Нажмите «Создать» ещё раз через минуту',
  checkNet:
    'Не удалось проверить номер: нет связи с сервером GREEN-API. Проверьте соединение и нажмите «Создать» ещё раз',
  check429: 'Слишком много запросов. Подождите несколько секунд и нажмите «Создать» ещё раз',
  check5xx: 'Сервер GREEN-API временно не отвечает. Нажмите «Создать» ещё раз через минуту',
  // §4.2 п. 2.6 (ВА-7, Д-3/EC-I9)
  checkUnexpected: 'Не удалось проверить номер: неожиданный ответ сервера. Попробуйте позже',
  // §4.3 п. 3.4, 3.6 (ВА-9, ВА-10, ВА-20)
  sendSuspended: 'Аккаунт ограничен: отправка только контактам',
  sendUnknown:
    'Статус неизвестен: возможно, сообщение уже доставлено. Проверьте в MAX, прежде чем повторять',
  sendNotReady: 'Не отправлено: инстанс не авторизован или запускается',
  // п. 3.4 (v1.3.4): 429 после исчерпания автоповторов
  send429: 'Не отправлено: слишком много запросов. Повторите через несколько секунд',
  // §5.5 (ВА-12, ВА-13)
  qSend:
    'Не отправлено: исчерпан лимит бесплатного тарифа Developer — не больше 3 чатов в месяц, этот чат в него не входит. Напишите в уже используемый чат или смените тариф в личном кабинете GREEN-API',
  qCheckChats:
    'Нельзя начать новый чат: исчерпан лимит бесплатного тарифа Developer — не больше 3 чатов в месяц. Откройте уже созданный чат или смените тариф в личном кабинете GREEN-API',
  qCheckChecks:
    'Исчерпан месячный лимит проверок номеров (100 на тарифе Developer). Откройте уже созданный чат или повторите в следующем месяце',
  qBanner:
    'Лимит тарифа Developer исчерпан: новые чаты сверх 3 в месяц не работают — сообщения в них не отправляются и не приходят. Лимит обновляется 1-го числа',
} as const;

describe('константы текстов совпадают с ТЗ посимвольно', () => {
  it('форма входа и ошибки входа (п. 1.2, 1.5)', () => {
    expect(LOGIN_FORM_TEXTS.required).toBe(TZ.required);
    expect(LOGIN_FORM_TEXTS.idInstanceDigits).toBe(TZ.idDigits);
    expect(LOGIN_FORM_TEXTS.apiUrlFormat).toBe(TZ.apiUrl);
    expect(AUTH_TEXTS.unauthorized).toBe(TZ.unauthorized);
    expect(AUTH_TEXTS.forbidden).toBe(TZ.forbidden);
    expect(unreachableText('https://3100.api.green-api.com')).toBe(TZ.unreachable);
  });

  it('состояния инстанса и 400 expired/deleted (п. 1.6)', () => {
    expect(stateInstanceText('authorized')).toBeNull();
    expect(stateInstanceText('notAuthorized')).toBe(TZ.notAuthorized);
    expect(stateInstanceText('starting')).toBe(TZ.starting);
    expect(stateInstanceText('blocked')).toBe(TZ.blocked);
    expect(stateInstanceText('suspended')).toBe(TZ.suspended);
    expect(stateInstanceText('pendingPassword')).toBe(TZ.pendingPassword);
    expect(stateInstanceText('yellowCard')).toBe(TZ.unknownState);
    expect(stateInstanceText(undefined)).toBe(TZ.missingState);
    expect(stateInstanceText(null)).toBe(TZ.missingState);
    expect(stateInstanceText('')).toBe(TZ.missingState);
    expect(INSTANCE_TEXTS.expired).toBe(TZ.expired);
    expect(INSTANCE_TEXTS.deleted).toBe(TZ.deleted);
  });

  it('баннеры, П-1…П-5, Р-11', () => {
    expect(BANNER_TEXTS.instanceNotReady).toBe(TZ.notReadyBanner);
    expect(BANNER_TEXTS.offline).toBe(TZ.offline);
    expect(BANNER_TEXTS.otherTab).toBe(TZ.otherTab);
    expect(BANNER_TEXTS.unsupportedMessage).toBe(TZ.unsupported);
    expect(SETTINGS_TEXTS.webhookUrlSet).toBe(TZ.p1);
    expect(SETTINGS_TEXTS.incomingWebhookOff).toBe(TZ.p2);
    expect(SETTINGS_TEXTS.outgoingApiMessageWebhookOff).toBe(TZ.p3);
    expect(SETTINGS_TEXTS.outgoingMessageWebhookOff).toBe(TZ.p4);
    expect(SETTINGS_TEXTS.outgoingWebhookOff).toBe(TZ.p5);
  });

  it('checkAccount (п. 2.7–2.8)', () => {
    expect(PHONE_FORMAT_ERROR).toBe(TZ.phoneFormat);
    expect(CHECK_ACCOUNT_TEXTS.notExists).toBe(TZ.notExists);
    expect(CHECK_ACCOUNT_TEXTS.tooManyChecks).toBe(TZ.tooManyChecks);
    expect(CHECK_ACCOUNT_TEXTS.badPhoneLength).toBe(TZ.badLen);
    expect(CHECK_ACCOUNT_TEXTS.badPhoneDigits).toBe(TZ.badDigits);
    expect(CHECK_ACCOUNT_TEXTS.checkTimeout).toBe(TZ.checkTimeout);
    expect(CHECK_ACCOUNT_TEXTS.network).toBe(TZ.checkNet);
    expect(CHECK_ACCOUNT_TEXTS.rateLimited).toBe(TZ.check429);
    expect(CHECK_ACCOUNT_TEXTS.server).toBe(TZ.check5xx);
    expect(CHECK_ACCOUNT_TEXTS.unexpectedResponse).toBe(TZ.checkUnexpected);
  });

  it('sendMessage (п. 3.4, 3.6) и квота (§5.5)', () => {
    expect(SEND_TEXTS.suspended).toBe(TZ.sendSuspended);
    expect(SEND_TEXTS.statusUnknown).toBe(TZ.sendUnknown);
    expect(SEND_TEXTS.instanceNotReady).toBe(TZ.sendNotReady);
    expect(SEND_TEXTS.rateLimited).toBe(TZ.send429);
    expect(QUOTA_TEXTS.sendChats).toBe(TZ.qSend);
    expect(QUOTA_TEXTS.checkAccountChats).toBe(TZ.qCheckChats);
    expect(QUOTA_TEXTS.checkAccountChecks).toBe(TZ.qCheckChecks);
    expect(QUOTA_TEXTS.banner).toBe(TZ.qBanner);
  });
});

describe('describeError: вход (п. 1.5–1.6)', () => {
  const ctx: ErrorContext = 'login';
  it.each<[GreenApiErrorCode, string]>([
    [C.UNAUTHORIZED, TZ.unauthorized],
    [C.FORBIDDEN, TZ.forbidden],
    [C.INSTANCE_EXPIRED, TZ.expired],
    [C.INSTANCE_DELETED, TZ.deleted],
    [C.INSTANCE_NOT_READY, TZ.notReadyBanner],
  ])('%s → текст ТЗ', (code, text) => {
    expect(describeError(err(code), ctx)).toBe(text);
  });
  it('сеть / таймаут / CORS → «Не удалось связаться с {apiUrl}…»', () => {
    for (const code of [C.NETWORK, C.TIMEOUT]) {
      expect(describeError(err(code, { apiUrl: 'https://3100.api.green-api.com' }), ctx)).toBe(
        TZ.unreachable,
      );
    }
  });
  it('нет stateInstance в ответе → «статус: неизвестен»', () => {
    expect(describeError(err(C.UNEXPECTED_RESPONSE, { method: 'getStateInstance' }), ctx)).toBe(
      TZ.missingState,
    );
  });
});

describe('describeError: в работе (§5.4, ВА-3, ВА-4, ВА-19)', () => {
  const ctx: ErrorContext = 'session';
  it.each<[GreenApiErrorCode, string]>([
    [C.UNAUTHORIZED, TZ.unauthorized],
    [C.FORBIDDEN, TZ.forbidden],
    [C.ACCOUNT_SUSPENDED, TZ.forbidden],
    [C.INSTANCE_EXPIRED, TZ.expired],
    [C.INSTANCE_DELETED, TZ.deleted],
    [C.INSTANCE_NOT_READY, TZ.notReadyBanner],
    [C.WEBHOOK_URL_SET, TZ.p1],
    [C.NETWORK, TZ.offline],
    [C.TIMEOUT, TZ.offline],
  ])('%s → текст ТЗ', (code, text) => {
    expect(describeError(err(code), ctx)).toBe(text);
  });
});

describe('describeError: checkAccount (п. 2.8, ВА-7, ВА-10)', () => {
  const ctx: ErrorContext = 'checkAccount';
  const e = (code: GreenApiErrorCode, reason?: string) =>
    err(code, { method: 'checkAccount', ...(reason !== undefined ? { reason } : {}) });
  it.each<[GreenApiErrorCode, string | undefined, string]>([
    [C.INSTANCE_NOT_READY, undefined, TZ.notReadyBanner],
    [C.CHECK_LIMIT, undefined, TZ.tooManyChecks],
    [C.CHECK_TIMEOUT, undefined, TZ.checkTimeout],
    [C.BAD_REQUEST, 'bad phone number, valid 11 or 12 digits', TZ.badLen],
    [C.BAD_REQUEST, "'phoneNumber' must contain only digits", TZ.badDigits],
    [
      C.BAD_REQUEST,
      'Validation failed: something',
      'Ошибка в запросе: Validation failed: something',
    ],
    [C.NETWORK, undefined, TZ.checkNet],
    [C.TIMEOUT, undefined, TZ.checkNet],
    [C.RATE_LIMITED, undefined, TZ.check429],
    [C.SERVER, undefined, TZ.check5xx],
    [C.UNAUTHORIZED, undefined, TZ.unauthorized],
    [C.INSTANCE_EXPIRED, undefined, TZ.expired],
    [C.UNEXPECTED_RESPONSE, 'exist=true with missing or malformed chatId', TZ.checkUnexpected],
    [C.INVALID_JSON, 'body is not JSON', TZ.checkUnexpected],
  ])('%s %j → текст ТЗ', (code, reason, text) => {
    expect(describeError(e(code, reason), ctx)).toBe(text);
  });
  it('текст сервера в «Ошибка в запросе: …» — не больше 200 символов', () => {
    const t = describeError(e(C.BAD_REQUEST, 'x'.repeat(500)), ctx);
    expect(t.startsWith('Ошибка в запросе: ')).toBe(true);
    expect(t.length).toBeLessThanOrEqual('Ошибка в запросе: '.length + 200 + 1);
  });
});

describe('describeError: sendMessage (п. 3.4, 3.6)', () => {
  const ctx: ErrorContext = 'send';
  it.each<[GreenApiErrorCode, string]>([
    [C.ACCOUNT_SUSPENDED, TZ.sendSuspended],
    [C.INSTANCE_NOT_READY, TZ.sendNotReady],
    [C.NETWORK, TZ.sendUnknown],
    [C.TIMEOUT, TZ.sendUnknown],
    [C.SERVER, TZ.sendUnknown],
    [C.UNAUTHORIZED, TZ.unauthorized],
    [C.FORBIDDEN, TZ.forbidden],
  ])('%s → текст ТЗ', (code, text) => {
    expect(describeError(err(code, { method: 'sendMessage' }), ctx)).toBe(text);
  });
  it('400 валидации → «Не отправлено: ошибка в запросе (<текст сервера>)»', () => {
    expect(
      describeError(
        err(C.BAD_REQUEST, { method: 'sendMessage', reason: 'Validation failed' }),
        ctx,
      ),
    ).toBe('Не отправлено: ошибка в запросе (Validation failed)');
  });
  it('429 после исчерпания автоповторов — текст п. 3.4 (v1.3.4)', () => {
    expect(describeError(err(C.RATE_LIMITED, { method: 'sendMessage' }), ctx)).toBe(TZ.send429);
  });
});

describe('квота: тексты и баннер (§5.5, ВА-12, ВА-13)', () => {
  const chats: QuotaSummary = { kind: 'chats', source: 'fallback' };
  const checks: QuotaSummary = { kind: 'checks', source: 'fallback' };
  const q = (method: 'sendMessage' | 'checkAccount', quota: QuotaSummary) =>
    new GreenApiQuotaError({ method, httpStatus: 466 }, quota);
  it('тексты по месту и виду', () => {
    expect(describeError(q('sendMessage', chats), 'send')).toBe(TZ.qSend);
    expect(describeError(q('checkAccount', chats), 'checkAccount')).toBe(TZ.qCheckChats);
    expect(describeError(q('checkAccount', checks), 'checkAccount')).toBe(TZ.qCheckChecks);
    expect(quotaText(chats, 'notification')).toBe(TZ.qBanner);
  });
  it('баннер — только для chats', () => {
    expect(shouldShowQuotaBanner(chats)).toBe(true);
    expect(shouldShowQuotaBanner(checks)).toBe(false);
  });
});

describe('вход разрешён', () => {
  it('authorized и suspended — да, прочие — нет', () => {
    expect(isLoginAllowed('authorized')).toBe(true);
    expect(isLoginAllowed('suspended')).toBe(true);
    expect(isLoginAllowed('starting')).toBe(false);
    expect(describeError(new Error('x'), 'session')).toBe(FALLBACK_TEXTS.unknown);
  });
});
