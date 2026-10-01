/**
 * Типы API-контракта GREEN-API (инстанс MAX, `typeInstance: "v3"`) — ТЗ v1.3.4, §5.
 *
 * Только типы, без логики. Значения с сервера приходят как `unknown` и должны
 * проходить рантайм-разбор (type guards, ТЗ §5.4 и Д-5) прежде чем считаться этими типами.
 *
 * Пометки в комментариях: [док] — по документации GREEN-API, [проверено] — на реальном
 * инстансе 01.10.2026, [не подтверждено] — требует проверки.
 */

// ---------------------------------------------------------------------------
// Базовые идентификаторы (§5.1)
// ---------------------------------------------------------------------------

/**
 * ID инстанса. Хранится **строкой** из формы входа (на реальном инстансе — 12 цифр,
 * в документации — «10 разрядов»). В уведомлениях `instanceData.idInstance` приходит
 * числом — сравнивать как строки: `String(instanceData.idInstance) === idInstance`.
 */
export type IdInstance = string;

/** Токен инстанса. Только в памяти и sessionStorage; не логируется (НФТ-3). */
export type ApiTokenInstance = string;

/**
 * ID чата MAX — **всегда строка**, к числу не приводить.
 * Личный чат — положительная числовая строка (`"10000000"`), группа — отрицательная.
 * Приложение никогда не формирует и не отправляет формат `номер@c.us` (Р-26, §5.5).
 */
export type ChatId = string;

/**
 * ID сообщения — **всегда строка**: бывают 18-значные, в Number теряют точность [проверено].
 * Уникален только в пределах чата; ключ дедупа — `${chatId}_${idMessage}` (§6.3).
 */
export type IdMessage = string;

/** Ключ дедупликации сообщения (§6.3). */
export type MessageKey = `${ChatId}_${IdMessage}`;

/** ID квитанции уведомления в очереди — целое число (передаётся в пути deleteNotification). */
export type ReceiptId = number;

/** UNIX-время в **секундах**. */
export type UnixSeconds = number;

/** Значение переключателей в настройках инстанса. */
export type YesNo = 'yes' | 'no';

/** Учётные данные, вводимые в форме входа (ОР-1, Р-1, Р-2). */
export interface Credentials {
  /** Без хвостового `/`. По умолчанию `https://api.green-api.com` (Р-1). */
  apiUrl: string;
  idInstance: IdInstance;
  apiTokenInstance: ApiTokenInstance;
}

// ---------------------------------------------------------------------------
// Методы (§5.2)
// URL: `{apiUrl}/waInstance{idInstance}/{method}/{apiTokenInstance}` — без префикса /v3.
// POST — `Content-Type: application/json`; все запросы с `credentials: 'omit'`.
// ---------------------------------------------------------------------------

/** Методы, которые вызывает приложение. Остальные (`setSettings`, `readChat`, `qr`, …) — нет. */
export type ApiMethodName =
  | 'getStateInstance'
  | 'getSettings'
  | 'checkAccount'
  | 'sendMessage'
  | 'receiveNotification'
  | 'deleteNotification'
  /** Только опциональный Д-7, за флагом `VITE_FEATURE_HISTORY`. */
  | 'getChatHistory';

export type HttpMethod = 'GET' | 'POST' | 'DELETE';

// --- getStateInstance: GET /getStateInstance/{token}, 1 rps -----------------

/** Состояния инстанса [док GetStateInstance]. Тексты для UI — ТЗ §4.1 п. 1.6. */
export type StateInstance =
  'notAuthorized' | 'authorized' | 'blocked' | 'starting' | 'suspended' | 'pendingPassword';

/** `{"stateInstance":"authorized"}` [проверено]. */
export interface GetStateInstanceResponse {
  stateInstance: StateInstance;
}

// --- getSettings: GET /getSettings/{token}, 1 rps, один раз после входа -----

/**
 * Настройки инстанса. Используются для предупреждений П-1…П-4 (и П-5 при Д-4), §4.1.
 * Обязательными помечены поля, на которых строятся проверки; остальные — справочно [док].
 * Сравнивать строго с `"yes"` (П-2…П-5: «≠ "yes"»).
 */
export interface GetSettingsResponse {
  /** П-1: должен быть `""`, иначе HTTP API (receiveNotification) не работает. */
  webhookUrl: string;
  /** П-2: входящие сообщения. */
  incomingWebhook: YesNo;
  /** П-3: сообщения, отправленные через API. */
  outgoingAPIMessageWebhook: YesNo;
  /** П-4: сообщения, отправленные с телефона. */
  outgoingMessageWebhook: YesNo;
  /** П-5 / Д-4: статусы доставки и прочтения. На проверенном инстансе — `"no"`. */
  outgoingWebhook: YesNo;
  /** `stateInstanceChanged`. В MVP не используется (Р-14). */
  stateWebhook: YesNo;
  wid?: string;
  webhookUrlToken?: string;
  delaySendMessagesMilliseconds?: number;
  markIncomingMessagesReaded?: YesNo;
  markIncomingMessagesReadedOnReply?: YesNo;
  editedMessageWebhook?: YesNo;
  deletedMessageWebhook?: YesNo;
  /** `"v3"` для MAX. */
  typeInstance?: string;
}

// --- checkAccount: POST /checkAccount/{token}, 10 rps, 100/мес на Developer --

/**
 * Тело запроса. `phoneNumber` — **целое число** (не строка): 11 цифр с `7`
 * или 12 цифр с `375` после нормализации (Р-10) [док CheckAccount].
 */
export interface CheckAccountRequest {
  phoneNumber: number;
}

/**
 * `{"exist":true,"chatId":"10000000","fromCache":false}` [проверено];
 * `{"exist":false,"chatId":"","fromCache":false}` [док].
 */
export interface CheckAccountResponse {
  exist: boolean;
  /** Пустая строка при `exist: false`. */
  chatId: ChatId;
  fromCache?: boolean;
}

// --- sendMessage: POST /sendMessage/{token}, 50 rps, квота 3 чата/мес --------

/**
 * Тело запроса. `chatId` — только из CheckAccount или кеша; строка с `@` (`…@c.us`)
 * не отправляется (§5.5, покрывается unit-тестом в Q2). Поля API `typingTime`,
 * `quotedMessageId` вне скоупа и не используются.
 */
export interface SendMessageRequest {
  chatId: ChatId;
  /** UTF-8, 1…4000 символов (`MAX_MESSAGE_LENGTH` из ./constants). */
  message: string;
}

/** `{"idMessage":"1790000000000"}` [проверено: совпадает с idMessage в outgoingAPIMessageReceived]. */
export interface SendMessageResponse {
  idMessage: IdMessage;
}

// --- receiveNotification: GET /receiveNotification/{token}?receiveTimeout=20 --

/** Query-параметры. `receiveTimeout` — 5…60 с; в приложении 20 (Р-20). */
export interface ReceiveNotificationQuery {
  receiveTimeout: number;
}

/** Уведомление из очереди. */
export interface ReceivedNotification {
  receiptId: ReceiptId;
  body: NotificationBody;
}

/**
 * Ответ receiveNotification. «Нет уведомления» — пустое тело, `null` или JSON без
 * `receiptId` (точный вид [не подтверждено], §5.2). Разбор приводит всё это к `null`.
 */
export type ReceiveNotificationResponse = ReceivedNotification | null;

// --- deleteNotification: DELETE /deleteNotification/{token}/{receiptId} ------

/**
 * `{"result":true,"reason":""}` [док]. `result: false` (уже удалено / не тот receiptId)
 * и 500 `…findUnAckedMessage…` считаются «удалено» (§5.4).
 */
export interface DeleteNotificationResponse {
  result: boolean;
  reason: string;
}

// --- getChatHistory (только Д-7): POST /getChatHistory/{token}, 1 rps --------

export interface GetChatHistoryRequest {
  chatId: ChatId;
  /** В приложении 50 (по умолчанию в API — 100). */
  count?: number;
}

/** Статус исходящего в истории (в отличие от вебхука статусов, здесь есть `sent`). */
export type HistoryStatusMessage = 'sent' | 'delivered' | 'read';

export interface ChatHistoryItem {
  type: 'incoming' | 'outgoing';
  idMessage: IdMessage;
  timestamp: UnixSeconds;
  typeMessage: string;
  chatId: ChatId;
  /** Текст для `textMessage` / `extendedTextMessage`. */
  textMessage?: string;
  /** Только для `outgoing`; используется, только если сделан Д-4. */
  statusMessage?: HistoryStatusMessage;
  /** Только для `outgoing`. */
  sendByApi?: boolean;
}

/** Массив по **убыванию** времени [док GetChatHistory]. */
export type GetChatHistoryResponse = ChatHistoryItem[];

/** Сводная карта методов: HTTP-метод, тело/параметры запроса и успешный ответ. */
export interface ApiMethods {
  getStateInstance: { http: 'GET'; request: undefined; response: GetStateInstanceResponse };
  getSettings: { http: 'GET'; request: undefined; response: GetSettingsResponse };
  checkAccount: { http: 'POST'; request: CheckAccountRequest; response: CheckAccountResponse };
  sendMessage: { http: 'POST'; request: SendMessageRequest; response: SendMessageResponse };
  receiveNotification: {
    http: 'GET';
    request: ReceiveNotificationQuery;
    response: ReceiveNotificationResponse;
  };
  deleteNotification: {
    http: 'DELETE';
    request: { receiptId: ReceiptId };
    response: DeleteNotificationResponse;
  };
  getChatHistory: {
    http: 'POST';
    request: GetChatHistoryRequest;
    response: GetChatHistoryResponse;
  };
}

// ---------------------------------------------------------------------------
// Ошибки (§5.4, §5.5)
// ---------------------------------------------------------------------------

/**
 * Ответ-«ошибка» с HTTP 200/400, например
 * `{"status":false,"reason":"instance is starting or not authorized"}` или
 * `{"status":false,"reason":"User get contact info limit reached"}` (checkAccount) [док].
 */
export interface StatusFalseResponse {
  status: false;
  reason: string;
}

/** Известные строки `reason` / тела ошибок, на которые опирается маппинг (§5.4). */
export type KnownErrorReason =
  | 'instance is starting or not authorized'
  | 'instance in starting process try later'
  | 'User get contact info limit reached'
  | 'Your account is suspended';

/** HTTP-статусы с особой обработкой (§5.4). */
export type KnownErrorHttpStatus = 400 | 401 | 403 | 429 | 466 | 469 | 499 | 500 | 502;

/**
 * Квота тарифа Developer в теле 466 / уведомлении quotaExceeded (§5.5).
 * `used` и `total` в таблице документации — string, в примерах — number: принимать оба.
 * `description` пользователю не показывать и не логировать (там чужие chatId);
 * в лог — только `method`, `used`, `total`, `status`.
 */
export interface QuotaInfo {
  /** `"checkAccount"`, `"correspondents"` и др. */
  method: string;
  /** Приходит не всегда (формат 466 не подтверждён) — в логе тогда `?`. */
  used?: number | string;
  total?: number | string;
  /** Например `"QUOTE_EXCEEDED"` (так в документации) или `"CORRESPONDENTS_QUOTA_EXCEEDED"`. */
  status: string;
  /** Список чужих chatId — пользователю и в лог не показывается (§5.5). Может отсутствовать. */
  description?: string;
}

/** 466, вариант 1 — квота метода (например, 100 checkAccount в месяц). */
export interface Error466InvokeStatusBody {
  invokeStatus: QuotaInfo;
}

/** 466, вариант 2 — квота чатов, по таблице документации. */
export interface Error466CorrespondentsStatusBody {
  correspondentsStatus: QuotaInfo;
}

/**
 * Тело HTTP 466 — три варианта из документации (§5.5); реальное тело [не подтверждено].
 * Вариант 3 — тело в форме уведомления `quotaExceeded`.
 * Нераспознанное тело — вид квоты определяется по методу запроса.
 */
export type Error466Body =
  Error466InvokeStatusBody | Error466CorrespondentsStatusBody | QuotaExceededNotification;

/**
 * Вид квоты (§5.5): `checks` — лимит checkAccount, `chats` — лимит 3 чатов в месяц.
 */
export type QuotaKind = 'checks' | 'chats';

// ---------------------------------------------------------------------------
// Уведомления — body из receiveNotification (§5.3)
// ---------------------------------------------------------------------------

export interface InstanceData {
  /** Приходит **числом** (12 цифр на реальном инстансе, < 2^53). Сравнивать как строки. */
  idInstance: number;
  /** Аккаунт инстанса, вида `"79990000000@c.us"` — не чат. */
  wid: string;
  /** `"v3"` для MAX. */
  typeInstance: string;
}

/** Тип чата. `group`/`channel` — не показываются, удаляются (Р-5). */
export type ChatType = 'user' | 'group' | 'channel' | 'bot';

/** Тип отправителя: в группах `user`, в каналах `channel` [проверено]. */
export type SenderType = 'user' | 'group' | 'channel' | 'bot';

/**
 * Все 8 полей приходят всегда [проверено].
 * В исходящих (`outgoing*`) `chatId`/`chatName` — чат получателя, а `sender`, `senderName`,
 * `senderPhoneNumber` — собственный аккаунт инстанса.
 */
export interface SenderData {
  chatId: ChatId;
  /** Р-15: непустой `chatName` личного чата заменяет заголовок. */
  chatName: string;
  chatType: ChatType;
  sender: string;
  senderName: string;
  senderType: SenderType;
  /** Во всех наблюдавшихся записях пустой. */
  senderContactName: string;
  /** Число; `0`, если скрыт (каналы — всегда `0`, группы — почти всегда). */
  senderPhoneNumber: number;
}

// --- messageData: размеченное объединение по typeMessage ---------------------

export interface ForwardInfo {
  isForwarded?: boolean;
  forwardingScore?: number;
}

/** `messageData.textMessageData` — текст в `textMessage`. */
export interface TextMessageData extends ForwardInfo {
  textMessage: string;
}

/**
 * Цитата рядом с `textMessage` (`messageData.quotedMessage`). Цитируемый фрагмент
 * не показывается (Р-17). Поля кроме `stanzaId`/`participant` — недокументированные [проверено].
 */
export interface QuotedMessageRef extends ForwardInfo {
  stanzaId: IdMessage;
  participant: string;
  typeMessage?: string;
  textMessage?: string;
}

/**
 * `messageData.extendedTextMessageData` — текст в `text`.
 * Так приходит `outgoingAPIMessageReceived` [проверено, расходится с документацией].
 */
export interface ExtendedTextMessageData extends ForwardInfo {
  text: string;
  title?: string;
  description?: string;
  jpegThumbnail?: string;
  /** `"None"` [проверено], в документации нет. */
  previewType?: string;
  /** Для варианта `typeMessage: "quotedMessage"` [док QuotedMessage]. */
  stanzaId?: IdMessage;
  participant?: string;
}

/** Файлы и медиа — вне скоупа, показываются заглушкой (Р-11). */
export interface FileMessageData extends ForwardInfo {
  downloadUrl?: string;
  caption?: string;
  fileName?: string;
  mimeType?: string;
  jpegThumbnail?: string;
  isAnimated?: boolean;
}

/** Только при `editedMessageWebhook=yes`; в MVP — заглушка (§5.3 п. 4). */
export interface EditedMessageData {
  textMessage: string;
  stanzaId: IdMessage;
}

export interface TextMessageContent {
  typeMessage: 'textMessage';
  textMessageData: TextMessageData;
  /** Есть, если сообщение — ответ с цитатой; игнорируется (Р-17). */
  quotedMessage?: QuotedMessageRef;
}

export interface ExtendedTextMessageContent {
  typeMessage: 'extendedTextMessage';
  extendedTextMessageData: ExtendedTextMessageData;
}

/** Вариант цитаты из документации, на инстансе не встречался [не подтверждено]. */
export interface QuotedMessageContent {
  typeMessage: 'quotedMessage';
  extendedTextMessageData: ExtendedTextMessageData;
  quotedMessage?: QuotedMessageRef;
}

export type FileTypeMessage =
  'imageMessage' | 'videoMessage' | 'documentMessage' | 'audioMessage' | 'stickerMessage';

export interface FileMessageContent {
  typeMessage: FileTypeMessage;
  fileMessageData: FileMessageData;
}

export interface EditedMessageContent {
  typeMessage: 'editedMessage';
  editedMessageData: EditedMessageData;
}

/**
 * Известные варианты `messageData`. Любой другой `typeMessage` (и отсутствие ожидаемого
 * поля) при разборе даёт заглушку (Р-11, §5.3 п. 4–5) — без исключения.
 */
export type MessageData =
  | TextMessageContent
  | ExtendedTextMessageContent
  | QuotedMessageContent
  | FileMessageContent
  | EditedMessageContent;

export type TypeMessage = MessageData['typeMessage'];

/** typeMessage, из которых извлекается текст (ОР-5 п. 5.1, §5.3). */
export type TextTypeMessage = 'textMessage' | 'extendedTextMessage' | 'quotedMessage';

// --- typeWebhook: размеченное объединение -----------------------------------

interface NotificationBase<T extends string> {
  typeWebhook: T;
  instanceData: InstanceData;
  timestamp: UnixSeconds;
}

interface MessageNotificationBase<T extends string> extends NotificationBase<T> {
  idMessage: IdMessage;
  senderData: SenderData;
  messageData: MessageData;
}

/** Входящее. Показывается слева, если `chatType === "user"` и чат известен (§5.3). */
export type IncomingMessageReceived = MessageNotificationBase<'incomingMessageReceived'>;

/** Отправлено с телефона / других клиентов. Справа (Р-3); текст как `textMessage` [проверено]. */
export type OutgoingMessageReceived = MessageNotificationBase<'outgoingMessageReceived'>;

/**
 * Отправлено через API (в т. ч. этим приложением). Справа, слияние с оптимистичным
 * по `chatId_idMessage` (§6.3); текст как `extendedTextMessage` [проверено].
 */
export type OutgoingAPIMessageReceived = MessageNotificationBase<'outgoingAPIMessageReceived'>;

/** Статусы исходящих [док OutgoingMessageStatus]. `sent` в вебхуке нет. */
export type OutgoingMessageStatusValue =
  'delivered' | 'read' | 'failed' | 'noAccount' | 'notInGroup';

/**
 * В MVP удаляется без обработки (Р-14); в Д-4 — статус у сообщения.
 * `chatId` — **на верхнем уровне body**, не в `senderData`.
 */
export interface OutgoingMessageStatusNotification extends NotificationBase<'outgoingMessageStatus'> {
  chatId: ChatId;
  idMessage: IdMessage;
  status: OutgoingMessageStatusValue;
  description?: string;
}

/** В MVP удаляется без обработки (Р-14). */
export interface StateInstanceChangedNotification extends NotificationBase<'stateInstanceChanged'> {
  stateInstance: StateInstance;
}

/**
 * Квота тарифа исчерпана — баннер (§5.5, обязательно в MVP). В примере документации
 * нет `timestamp`, хотя в таблице он есть — не требовать.
 */
export interface QuotaExceededNotification {
  typeWebhook: 'quotaExceeded';
  instanceData: InstanceData;
  timestamp?: UnixSeconds;
  /** Для квоты чатов: `method: "correspondents"`, `status: "CORRESPONDENTS_QUOTA_EXCEEDED"`. */
  quotaData: QuotaInfo;
}

/**
 * Известные типы body. Неизвестный или непарсящийся `typeWebhook` — ветка «unknown»
 * рантайм-разбора (Д-5): уведомление **обязательно удаляется** (§5.3, §5.4).
 */
export type NotificationBody =
  | IncomingMessageReceived
  | OutgoingMessageReceived
  | OutgoingAPIMessageReceived
  | OutgoingMessageStatusNotification
  | StateInstanceChangedNotification
  | QuotaExceededNotification;

export type TypeWebhook = NotificationBody['typeWebhook'];

/** Уведомления с сообщением (`idMessage` + `senderData` + `messageData`). */
export type MessageNotification =
  IncomingMessageReceived | OutgoingMessageReceived | OutgoingAPIMessageReceived;
