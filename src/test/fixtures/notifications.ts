/**
 * Уведомления (body из receiveNotification) — §5.3, ОР-4, ОР-5, Д-3.
 *
 * Структура — как в спайке `notifications.jsonl` [проверено]: порядок ключей
 * `typeWebhook, instanceData, timestamp, idMessage, senderData, messageData`, все 8 полей
 * `senderData` всегда есть, `senderContactName` пустой, `isForwarded/forwardingScore` в данных
 * сообщения. Все значения условные (./constants).
 *
 * Пометки: [проверено] — форма наблюдалась в спайке; [док] — форма только из документации.
 * Личных входящих в спайке нет: форма личного входящего взята с групповых входящих
 * (поля совпадают) и из документации.
 */
import type {
  ExtendedTextMessageContent,
  FileMessageContent,
  IncomingMessageReceived,
  InstanceData,
  MessageData,
  NotificationBody,
  OutgoingAPIMessageReceived,
  OutgoingMessageReceived,
  OutgoingMessageStatusNotification,
  ReceivedNotification,
  SenderData,
  StateInstanceChangedNotification,
  TextMessageContent,
} from '../../api/types';
import {
  BASE_TIMESTAMP,
  CHAT_IDS,
  ID_INSTANCE_NUMBER,
  ID_MESSAGES,
  MEDIA_URL_BASE,
  NAMES,
  OWN_WID,
  PHONES,
} from './constants';

/** [проверено] `idInstance` — число, `typeInstance: "v3"`, `wid` с `@c.us`. */
export const instanceData = {
  idInstance: ID_INSTANCE_NUMBER,
  wid: OWN_WID,
  typeInstance: 'v3',
} satisfies InstanceData;

// --- senderData -------------------------------------------------------------------

/** Личный чат, входящее: `sender === chatId` [док; поля как в спайке]. */
export const senderPrimary = {
  chatId: CHAT_IDS.primary,
  chatName: NAMES.primary,
  chatType: 'user',
  sender: CHAT_IDS.primary,
  senderName: NAMES.primary,
  senderType: 'user',
  senderContactName: '',
  senderPhoneNumber: PHONES.primary,
} satisfies SenderData;

export const senderSecondary = {
  ...senderPrimary,
  chatId: CHAT_IDS.secondary,
  chatName: NAMES.secondary,
  sender: CHAT_IDS.secondary,
  senderName: NAMES.secondary,
  senderPhoneNumber: PHONES.secondary,
} satisfies SenderData;

/** Личный чат, которого нет в списке приложения (Р-5). */
export const senderUnknown = {
  ...senderPrimary,
  chatId: CHAT_IDS.unknown,
  chatName: NAMES.unknown,
  sender: CHAT_IDS.unknown,
  senderName: NAMES.unknown,
  senderPhoneNumber: 0,
} satisfies SenderData;

/** [док] `chatType: "bot"` — не показывается. */
export const senderBot = {
  ...senderPrimary,
  chatId: CHAT_IDS.bot,
  chatName: NAMES.bot,
  chatType: 'bot',
  sender: CHAT_IDS.bot,
  senderName: NAMES.bot,
  senderType: 'bot',
  senderPhoneNumber: 0,
} satisfies SenderData;

/**
 * [проверено] Исходящие (`outgoing*`): `chatId`/`chatName` — получатель, а `sender`,
 * `senderName`, `senderPhoneNumber` — собственный аккаунт инстанса.
 */
export const senderOwnToPrimary = {
  chatId: CHAT_IDS.primary,
  chatName: NAMES.primary,
  chatType: 'user',
  sender: CHAT_IDS.own,
  senderName: NAMES.own,
  senderType: 'user',
  senderContactName: '',
  senderPhoneNumber: PHONES.own,
} satisfies SenderData;

export const senderOwnToUnknown = {
  ...senderOwnToPrimary,
  chatId: CHAT_IDS.unknown,
  chatName: NAMES.unknown,
} satisfies SenderData;

/** [проверено] Группа: `chatType: "group"`, `senderType: "user"`, номер участника обычно `0`. */
export const senderGroup = {
  chatId: CHAT_IDS.group,
  chatName: NAMES.group,
  chatType: 'group',
  sender: CHAT_IDS.groupMember,
  senderName: NAMES.groupMember,
  senderType: 'user',
  senderContactName: '',
  senderPhoneNumber: 0,
} satisfies SenderData;

/** [проверено] В одном групповом сообщении из 23 пришёл номер участника, а не `0`. */
export const senderGroupWithPhone = {
  ...senderGroup,
  senderPhoneNumber: PHONES.groupMember,
} satisfies SenderData;

/** [проверено] Канал: `chatType`/`senderType` — `channel`, `sender === chatId`, номер `0`. */
export const senderChannel = {
  chatId: CHAT_IDS.channel,
  chatName: NAMES.channel,
  chatType: 'channel',
  sender: CHAT_IDS.channel,
  senderName: NAMES.channel,
  senderType: 'channel',
  senderContactName: '',
  senderPhoneNumber: 0,
} satisfies SenderData;

// --- messageData --------------------------------------------------------------------

/** [проверено] `textMessage` (входящее и с телефона). */
export function textMessageData(text: string): TextMessageContent {
  return {
    typeMessage: 'textMessage',
    textMessageData: { textMessage: text, isForwarded: false, forwardingScore: 0 },
  } satisfies TextMessageContent;
}

/**
 * [проверено] Цитата: `textMessage` + `messageData.quotedMessage`, в котором есть
 * недокументированные `typeMessage`, `textMessage`, `isForwarded`, `forwardingScore`.
 * Показывается только собственный текст (Р-17).
 */
export function quotedTextMessageData(text: string, quotedText: string): TextMessageContent {
  return {
    typeMessage: 'textMessage',
    textMessageData: { textMessage: text, forwardingScore: 0, isForwarded: false },
    quotedMessage: {
      participant: CHAT_IDS.own,
      stanzaId: ID_MESSAGES.quotedStanza,
      typeMessage: 'textMessage',
      textMessage: quotedText,
      isForwarded: false,
      forwardingScore: 0,
    },
  } satisfies TextMessageContent;
}

/**
 * [проверено] `extendedTextMessage` так приходит `outgoingAPIMessageReceived`
 * (расходится с документацией, где `textMessage`); `previewType: "None"` в документации нет.
 */
export function apiExtendedTextMessageData(text: string): ExtendedTextMessageContent {
  return {
    typeMessage: 'extendedTextMessage',
    extendedTextMessageData: {
      text,
      description: '',
      title: '',
      previewType: 'None',
      jpegThumbnail: '',
      forwardingScore: 0,
      isForwarded: false,
    },
  } satisfies ExtendedTextMessageContent;
}

/** [док ExtendedTextMessage] Входящее со ссылкой: заполнены `title`/`description`. */
export function linkExtendedTextMessageData(text: string): ExtendedTextMessageContent {
  return {
    typeMessage: 'extendedTextMessage',
    extendedTextMessageData: {
      text,
      description: 'Описание тестовой страницы',
      title: 'Тестовая страница',
      jpegThumbnail: '',
      isForwarded: false,
      forwardingScore: 0,
    },
  } satisfies ExtendedTextMessageContent;
}

/** [док QuotedMessage] Вариант `typeMessage: "quotedMessage"` — в спайке не встречался. */
export function docQuotedMessageData(text: string): MessageData {
  return {
    typeMessage: 'quotedMessage',
    extendedTextMessageData: {
      text,
      stanzaId: ID_MESSAGES.quotedStanza,
      participant: CHAT_IDS.own,
    },
    quotedMessage: {
      stanzaId: ID_MESSAGES.quotedStanza,
      participant: CHAT_IDS.own,
      typeMessage: 'textMessage',
      textMessage: 'Цитируемое тестовое сообщение',
    },
  } satisfies MessageData;
}

/** [проверено] Изображение из канала (`fileMessageData`, `image/webp`). */
export const imageMessageData = {
  typeMessage: 'imageMessage',
  fileMessageData: {
    downloadUrl: `${MEDIA_URL_BASE}/test-image.webp`,
    caption: '',
    fileName: 'test-image.webp',
    jpegThumbnail: 'dGVzdA==',
    isAnimated: false,
    mimeType: 'image/webp',
    forwardingScore: 0,
    isForwarded: false,
  },
} satisfies FileMessageContent;

/** [проверено] Аудио из группы (`audio/ogg`), та же структура `fileMessageData`. */
export const audioMessageData = {
  typeMessage: 'audioMessage',
  fileMessageData: {
    downloadUrl: `${MEDIA_URL_BASE}/test-audio.ogg`,
    caption: '',
    fileName: 'test-audio.ogg',
    jpegThumbnail: '',
    isAnimated: false,
    mimeType: 'audio/ogg',
    forwardingScore: 0,
    isForwarded: false,
  },
} satisfies FileMessageContent;

/** [док] Стикер — структура как у файлов. */
export const stickerMessageData = {
  typeMessage: 'stickerMessage',
  fileMessageData: {
    downloadUrl: `${MEDIA_URL_BASE}/test-sticker.webp`,
    caption: '',
    fileName: 'test-sticker.webp',
    jpegThumbnail: '',
    isAnimated: true,
    mimeType: 'image/webp',
    forwardingScore: 0,
    isForwarded: false,
  },
} satisfies FileMessageContent;

/** [док EditedMessage] Только при `editedMessageWebhook=yes`; в MVP — заглушка. */
export const editedMessageData = {
  typeMessage: 'editedMessage',
  editedMessageData: { textMessage: 'Исправленный текст', stanzaId: ID_MESSAGES.incoming1 },
} satisfies MessageData;

// --- билдеры уведомлений -----------------------------------------------------------

export interface MessageNotificationOptions {
  idMessage?: string;
  timestamp?: number;
  senderData?: SenderData;
  messageData?: MessageData;
}

/** Входящее; по умолчанию — текст в основном личном чате. */
export function incomingMessage(options: MessageNotificationOptions = {}): IncomingMessageReceived {
  return {
    typeWebhook: 'incomingMessageReceived',
    instanceData,
    timestamp: options.timestamp ?? BASE_TIMESTAMP + 10,
    idMessage: options.idMessage ?? ID_MESSAGES.incoming1,
    senderData: options.senderData ?? senderPrimary,
    messageData: options.messageData ?? textMessageData('Тестовый ответ'),
  } satisfies IncomingMessageReceived;
}

/** [проверено] Отправлено с телефона: `textMessage`, 18-значный idMessage. */
export function outgoingPhoneMessage(
  options: MessageNotificationOptions = {},
): OutgoingMessageReceived {
  return {
    typeWebhook: 'outgoingMessageReceived',
    instanceData,
    timestamp: options.timestamp ?? BASE_TIMESTAMP + 20,
    idMessage: options.idMessage ?? ID_MESSAGES.phone1,
    senderData: options.senderData ?? senderOwnToPrimary,
    messageData: options.messageData ?? textMessageData('Тестовое сообщение с телефона'),
  } satisfies OutgoingMessageReceived;
}

/**
 * [проверено] Отправлено через API: `extendedTextMessage`, 13-значный idMessage,
 * `floor(idMessage / 1000) === timestamp`.
 */
export function outgoingApiMessage(
  options: MessageNotificationOptions = {},
): OutgoingAPIMessageReceived {
  const idMessage = options.idMessage ?? ID_MESSAGES.api1;
  return {
    typeWebhook: 'outgoingAPIMessageReceived',
    instanceData,
    timestamp: options.timestamp ?? Math.floor(Number(idMessage) / 1000),
    idMessage,
    senderData: options.senderData ?? senderOwnToPrimary,
    messageData: options.messageData ?? apiExtendedTextMessageData('Тестовое сообщение'),
  } satisfies OutgoingAPIMessageReceived;
}

/** Обёртка очереди `{ receiptId, body }`. */
export function receipt(body: NotificationBody, receiptId: number): ReceivedNotification {
  return { receiptId, body } satisfies ReceivedNotification;
}

// --- готовые уведомления: входящие (ОР-5) -------------------------------------------

/** V-01 / R-01: личный ответ получателя. */
export const incomingText = incomingMessage();

/** V-02 [док]: ссылка. */
export const incomingLink = incomingMessage({
  idMessage: ID_MESSAGES.incoming2,
  timestamp: BASE_TIMESTAMP + 11,
  messageData: linkExtendedTextMessageData('Посмотри https://example.test/page'),
});

/** V-03 [проверено на группах]: ответ с цитатой. */
export const incomingQuoted = incomingMessage({
  idMessage: ID_MESSAGES.incoming3,
  timestamp: BASE_TIMESTAMP + 12,
  messageData: quotedTextMessageData('Тестовый ответ на цитату', 'Тестовое сообщение'),
});

/** V-04 [док]: `typeMessage: "quotedMessage"`. */
export const incomingDocQuoted = incomingMessage({
  idMessage: '100000000000000004',
  timestamp: BASE_TIMESTAMP + 13,
  messageData: docQuotedMessageData('Тестовый ответ (вариант документации)'),
});

/** V-11: нетекстовые в известном чате → заглушка. */
export const incomingImage = incomingMessage({
  idMessage: '100000000000000005',
  messageData: imageMessageData,
});
export const incomingAudio = incomingMessage({
  idMessage: '100000000000000006',
  messageData: audioMessageData,
});
export const incomingSticker = incomingMessage({
  idMessage: '100000000000000007',
  messageData: stickerMessageData,
});
export const incomingEdited = incomingMessage({
  idMessage: '100000000000000008',
  messageData: editedMessageData,
});

/** M-21 / Р-16: HTML, форматирование MAX и переносы — показываются как текст. */
export const incomingHtml = incomingMessage({
  idMessage: '100000000000000009',
  messageData: textMessageData('<b>x</b><img src=x onerror=alert(1)>\n*жирный*'),
});

/** V-05 / V-06: входящее во второй известный чат. */
export const incomingSecondary = incomingMessage({
  idMessage: '100000000000000010',
  senderData: senderSecondary,
});

/** V-22 / Р-15: `chatName` меняется — заголовок обновляется; пустой — не обновляется. */
export const incomingRenamed = incomingMessage({
  idMessage: '100000000000000011',
  senderData: { ...senderPrimary, chatName: 'Тестовый Пользователь (новое имя)' },
});
export const incomingEmptyChatName = incomingMessage({
  idMessage: '100000000000000012',
  senderData: { ...senderPrimary, chatName: '' },
});

// --- исходящие (ОР-3, §6.3) -------------------------------------------------------------

/** M-06: подтверждение отправки из приложения (тот же idMessage, что в ответе sendMessage). */
export const outgoingApi = outgoingApiMessage();

/** M-07: гонка — уведомление раньше ответа sendMessage. */
export const outgoingApiRace = outgoingApiMessage({ idMessage: ID_MESSAGES.apiRace });

/** M-09: отправлено через API из другого клиента (ключа в индексе нет). */
export const outgoingApiOtherClient = outgoingApiMessage({ idMessage: ID_MESSAGES.api2 });

/** M-20: с телефона. */
export const outgoingPhone = outgoingPhoneMessage();

/** V-17: исходящие в неизвестный чат — не показываются. */
export const outgoingPhoneToUnknown = outgoingPhoneMessage({
  idMessage: '100000000000000102',
  senderData: senderOwnToUnknown,
});
export const outgoingApiToUnknown = outgoingApiMessage({
  idMessage: '1790000180000',
  senderData: senderOwnToUnknown,
});

// --- шум и неизвестные чаты (Р-5, Д-3 #2) ---------------------------------------------

/** V-13 [проверено]: группа. */
export const groupText = incomingMessage({
  idMessage: ID_MESSAGES.group1,
  senderData: senderGroup,
  messageData: textMessageData('Тестовое сообщение в группе'),
});

/** [проверено] Группа с цитатой и номером участника. */
export const groupQuotedWithPhone = incomingMessage({
  idMessage: '100000000000000202',
  senderData: senderGroupWithPhone,
  messageData: quotedTextMessageData('Тестовый ответ в группе', 'Тестовая цитата'),
});

/** [проверено] Аудио в группе. */
export const groupAudio = incomingMessage({
  idMessage: '100000000000000203',
  senderData: senderGroup,
  messageData: audioMessageData,
});

/** V-14 [проверено]: канал, изображение с 13-значным idMessage. */
export const channelImage = incomingMessage({
  idMessage: ID_MESSAGES.channel1,
  senderData: senderChannel,
  messageData: imageMessageData,
});

/** V-15: личный чат не из списка. */
export const unknownChatText = incomingMessage({
  idMessage: '100000000000000013',
  senderData: senderUnknown,
});

/** V-16 [док]: бот. */
export const botText = incomingMessage({ idMessage: '100000000000000014', senderData: senderBot });

// --- статусы и служебные (Р-14) — [док], в спайке не встречались ---------------------

/** `chatId` — на верхнем уровне body, не в `senderData`. */
export function outgoingStatus(
  status: OutgoingMessageStatusNotification['status'],
  idMessage: string = ID_MESSAGES.api1,
): OutgoingMessageStatusNotification {
  return {
    typeWebhook: 'outgoingMessageStatus',
    chatId: CHAT_IDS.primary,
    instanceData,
    timestamp: BASE_TIMESTAMP + 30,
    idMessage,
    status,
    ...(status === 'failed' ? { description: 'Тестовая причина ошибки' } : {}),
  } satisfies OutgoingMessageStatusNotification;
}

export const statusDelivered = outgoingStatus('delivered');
export const statusRead = outgoingStatus('read');
export const statusFailed = outgoingStatus('failed');
export const statusNoAccount = outgoingStatus('noAccount');

export const stateChangedAuthorized = {
  typeWebhook: 'stateInstanceChanged',
  instanceData,
  timestamp: BASE_TIMESTAMP + 40,
  stateInstance: 'authorized',
} satisfies StateInstanceChangedNotification;

export const stateChangedNotAuthorized = {
  ...stateChangedAuthorized,
  stateInstance: 'notAuthorized',
} satisfies StateInstanceChangedNotification;

// --- вне контракта: неизвестные и битые (Д-3 #3, §5.4) -------------------------------

/** Любое неизвестное уведомление: такого типа нет в `NotificationBody`. */
export interface UnknownNotificationBody {
  typeWebhook: string;
  [key: string]: unknown;
}

/** V-19: неизвестный `typeWebhook` — удалить, цикл не должен встать. */
export const unknownTypeWebhooks = {
  incomingCall: {
    typeWebhook: 'incomingCall',
    instanceData,
    timestamp: BASE_TIMESTAMP + 50,
    idMessage: '100000000000000015',
    from: CHAT_IDS.primary,
  },
  deletedMessage: {
    typeWebhook: 'deletedMessage',
    instanceData,
    timestamp: BASE_TIMESTAMP + 51,
    idMessage: '100000000000000016',
    senderData: senderPrimary,
  },
  somethingNew: { typeWebhook: 'somethingNew', instanceData, timestamp: BASE_TIMESTAMP + 52 },
} as const satisfies Record<string, UnknownNotificationBody>;

/**
 * V-12 / E-11: битые body. Тип `unknown` — приложение получает их как `unknown`
 * и обязано удалить уведомление без исключения.
 */
export const brokenBodies: Record<string, unknown> = {
  nullBody: null,
  stringBody: 'not an object',
  arrayBody: [],
  noTypeWebhook: { instanceData, timestamp: BASE_TIMESTAMP + 60 },
  noMessageData: {
    ...incomingMessage({ idMessage: '100000000000000017' }),
    messageData: undefined,
  },
  noTextMessageData: {
    ...incomingMessage({ idMessage: '100000000000000018' }),
    messageData: { typeMessage: 'textMessage' },
  },
  textMessageNotString: {
    ...incomingMessage({ idMessage: '100000000000000019' }),
    messageData: { typeMessage: 'textMessage', textMessageData: { textMessage: 123 } },
  },
  extendedDataNull: {
    ...incomingMessage({ idMessage: '100000000000000020' }),
    messageData: { typeMessage: 'extendedTextMessage', extendedTextMessageData: null },
  },
  unknownTypeMessage: {
    ...incomingMessage({ idMessage: '100000000000000021' }),
    messageData: { typeMessage: 'pollMessage', pollMessageData: {} },
  },
  /** idMessage числом вместо строки. */
  numericIdMessage: { ...incomingMessage(), idMessage: Number(ID_MESSAGES.incoming1) },
  noSenderData: { ...incomingMessage({ idMessage: '100000000000000022' }), senderData: undefined },
};

// --- краевые случаи (Д-3, §6.2, §6.3) ------------------------------------------------

/**
 * V-09 / Д-3 #1: два 18-значных idMessage, которые отличаются на 1.
 * `Number()` превращает их в одно число — значит, хранить можно только строкой.
 */
export const precisionPair = [
  incomingMessage({ idMessage: ID_MESSAGES.incoming1, timestamp: BASE_TIMESTAMP + 70 }),
  incomingMessage({
    idMessage: ID_MESSAGES.incoming2,
    timestamp: BASE_TIMESTAMP + 71,
    messageData: textMessageData('Второе тестовое сообщение'),
  }),
] as const;

/** V-08: одинаковый idMessage в разных чатах — это два разных сообщения. */
export const sameIdDifferentChats = [
  incomingMessage({ idMessage: ID_MESSAGES.incoming1, senderData: senderPrimary }),
  incomingMessage({ idMessage: ID_MESSAGES.incoming1, senderData: senderSecondary }),
] as const;

/** V-07 / Д-3 #5: одно и то же уведомление дважды (разные receiptId). */
export const duplicateDelivery = [receipt(incomingText, 101), receipt(incomingText, 102)] as const;

/** M-06: дубль подтверждения отправки через API (наблюдение руководителя, в спайке не воспроизводится). */
export const duplicateOutgoingApi = [receipt(outgoingApi, 103), receipt(outgoingApi, 104)] as const;

/**
 * V-21 / Д-3 #12 [проверено: инверсия на 2 с]: порядок очереди ≠ порядок timestamp.
 * Ожидаемый порядок в ленте: B (t+100), A (t+102), C (t+102, пришло позже A).
 */
export const timestampInversion = [
  receipt(
    incomingMessage({
      idMessage: '100000000000000031',
      timestamp: BASE_TIMESTAMP + 102,
      messageData: textMessageData('A'),
    }),
    111,
  ),
  receipt(
    incomingMessage({
      idMessage: '100000000000000032',
      timestamp: BASE_TIMESTAMP + 100,
      messageData: textMessageData('B'),
    }),
    112,
  ),
  receipt(
    incomingMessage({
      idMessage: '100000000000000033',
      timestamp: BASE_TIMESTAMP + 102,
      messageData: textMessageData('C'),
    }),
    113,
  ),
] as const;

/**
 * R-13 / Д-3 #2 [проверено: 33 из 39 — шум]: `noiseCount` уведомлений из группы и канала,
 * за ними — личный ответ. Всё должно быть удалено, показан только личный ответ.
 */
export function noiseThenReply(noiseCount = 30, firstReceiptId = 200): ReceivedNotification[] {
  const noise = Array.from({ length: noiseCount }, (_, index) =>
    receipt(
      index % 3 === 2
        ? incomingMessage({
            idMessage: String(1790000400000 + index * 1000),
            timestamp: BASE_TIMESTAMP + 200 + index,
            senderData: senderChannel,
            messageData: imageMessageData,
          })
        : incomingMessage({
            idMessage: String(100000000000000400n + BigInt(index)),
            timestamp: BASE_TIMESTAMP + 200 + index,
            senderData: senderGroup,
            messageData: textMessageData(`Тестовый шум ${String(index)}`),
          }),
      firstReceiptId + index,
    ),
  );
  return [
    ...noise,
    receipt(
      incomingMessage({ idMessage: '100000000000000499', timestamp: BASE_TIMESTAMP + 300 }),
      firstReceiptId + noiseCount,
    ),
  ];
}

/** R-12 / Р-13: очередь, накопившаяся до входа (известные и неизвестные чаты вперемешку). */
export const queueBeforeLogin = [
  receipt(groupText, 301),
  receipt(incomingText, 302),
  receipt(unknownChatText, 303),
  receipt(outgoingPhone, 304),
  receipt(channelImage, 305),
] as const;
