/**
 * Обезличенные фикстуры уведомлений (НФТ-9, НФТ-11).
 *
 * Структура (ключи, типы, длины id, порядок полей) взята из реальных ответов
 * spike/notifications.jsonl (01.10.2026); все значения заменены условными:
 * idInstance, wid, chatId, sender, имена, номера, тексты, ссылки, id сообщений
 * и timestamp. Реальных данных в файле нет.
 *
 * `satisfies` проверяет, что типы src/api/types.ts соответствуют реальным структурам.
 */
import type { QuotaExceededNotification, QuotaInfo, ReceivedNotification } from '../../api/types';

export const FAKE_ID_INSTANCE = '110000000042';
/** Условный личный chatId собеседника. */
export const FAKE_PERSONAL_CHAT_ID = '10000002';

export const incomingGroupText = {
  receiptId: 1001,
  body: {
    typeWebhook: 'incomingMessageReceived',
    instanceData: {
      idInstance: 110000000042,
      wid: '79990000000@c.us',
      typeInstance: 'v3',
    },
    timestamp: 1790000000,
    idMessage: '117900000000000000',
    senderData: {
      chatId: '-10000000000001',
      chatName: 'Тестовая группа',
      chatType: 'group',
      sender: '20000001',
      senderName: 'Участник группы',
      senderType: 'user',
      senderContactName: '',
      senderPhoneNumber: 0,
    },
    messageData: {
      typeMessage: 'textMessage',
      textMessageData: {
        textMessage: 'Тестовое сообщение 1 с *форматированием*\nи переносом',
        forwardingScore: 0,
        isForwarded: false,
      },
    },
  },
} satisfies ReceivedNotification;

export const outgoingPhoneText = {
  receiptId: 1002,
  body: {
    typeWebhook: 'outgoingMessageReceived',
    instanceData: {
      idInstance: 110000000042,
      wid: '79990000000@c.us',
      typeInstance: 'v3',
    },
    timestamp: 1790000060,
    idMessage: '117900000600000000',
    senderData: {
      chatId: '10000002',
      chatName: 'Тестовый собеседник',
      chatType: 'user',
      sender: '10000099',
      senderName: 'Тестовый аккаунт',
      senderType: 'user',
      senderContactName: '',
      senderPhoneNumber: 79990000000,
    },
    messageData: {
      typeMessage: 'textMessage',
      textMessageData: {
        textMessage: 'Тестовое сообщение 2 с *форматированием*\nи переносом',
        forwardingScore: 0,
        isForwarded: false,
      },
    },
  },
} satisfies ReceivedNotification;

export const incomingGroupTextQuoted = {
  receiptId: 1003,
  body: {
    typeWebhook: 'incomingMessageReceived',
    instanceData: {
      idInstance: 110000000042,
      wid: '79990000000@c.us',
      typeInstance: 'v3',
    },
    timestamp: 1790000120,
    idMessage: '117900001200000000',
    senderData: {
      chatId: '-10000000000001',
      chatName: 'Тестовая группа',
      chatType: 'group',
      sender: '20000002',
      senderName: 'Участник группы',
      senderType: 'user',
      senderContactName: '',
      senderPhoneNumber: 0,
    },
    messageData: {
      typeMessage: 'textMessage',
      textMessageData: {
        textMessage: 'Тестовое сообщение 3 с *форматированием*\nи переносом',
        forwardingScore: 0,
        isForwarded: false,
      },
      quotedMessage: {
        participant: '20000009',
        stanzaId: '117900000000000001',
        typeMessage: 'textMessage',
        textMessage: 'Цитируемый текст',
        isForwarded: false,
        forwardingScore: 0,
      },
    },
  },
} satisfies ReceivedNotification;

export const outgoingApiExtendedText = {
  receiptId: 1004,
  body: {
    typeWebhook: 'outgoingAPIMessageReceived',
    instanceData: {
      idInstance: 110000000042,
      wid: '79990000000@c.us',
      typeInstance: 'v3',
    },
    timestamp: 1790000180,
    idMessage: '1790000180123',
    senderData: {
      chatId: '10000002',
      chatName: 'Тестовый собеседник',
      chatType: 'user',
      sender: '10000099',
      senderName: 'Тестовый аккаунт',
      senderType: 'user',
      senderContactName: '',
      senderPhoneNumber: 79990000000,
    },
    messageData: {
      typeMessage: 'extendedTextMessage',
      extendedTextMessageData: {
        text: 'Тестовое сообщение 4 с *форматированием*\nи переносом',
        description: '',
        title: '',
        previewType: 'None',
        jpegThumbnail: '',
        forwardingScore: 0,
        isForwarded: false,
      },
    },
  },
} satisfies ReceivedNotification;

export const incomingChannelImage = {
  receiptId: 1005,
  body: {
    typeWebhook: 'incomingMessageReceived',
    instanceData: {
      idInstance: 110000000042,
      wid: '79990000000@c.us',
      typeInstance: 'v3',
    },
    timestamp: 1790000240,
    idMessage: '117900002400000000',
    senderData: {
      chatId: '-20000000000003',
      chatName: 'Тестовый канал',
      chatType: 'channel',
      sender: '-20000000000003',
      senderName: 'Тестовый канал',
      senderType: 'channel',
      senderContactName: '',
      senderPhoneNumber: 0,
    },
    messageData: {
      typeMessage: 'imageMessage',
      fileMessageData: {
        downloadUrl: 'https://example.invalid/media/file-5.webp',
        caption: 'Тестовая подпись',
        fileName: 'file-5.webp',
        jpegThumbnail: '',
        isAnimated: false,
        mimeType: 'image/webp',
        forwardingScore: 0,
        isForwarded: false,
      },
    },
  },
} satisfies ReceivedNotification;

export const incomingGroupAudio = {
  receiptId: 1006,
  body: {
    typeWebhook: 'incomingMessageReceived',
    instanceData: {
      idInstance: 110000000042,
      wid: '79990000000@c.us',
      typeInstance: 'v3',
    },
    timestamp: 1790000300,
    idMessage: '117900003000000000',
    senderData: {
      chatId: '-10000000000001',
      chatName: 'Тестовая группа',
      chatType: 'group',
      sender: '20000003',
      senderName: 'Участник группы',
      senderType: 'user',
      senderContactName: '',
      senderPhoneNumber: 79990000001,
    },
    messageData: {
      typeMessage: 'audioMessage',
      fileMessageData: {
        downloadUrl: 'https://example.invalid/media/file-6.oga',
        caption: '',
        fileName: 'file-6.oga',
        jpegThumbnail: '',
        isAnimated: false,
        mimeType: 'audio/ogg',
        forwardingScore: 0,
        isForwarded: false,
      },
    },
  },
} satisfies ReceivedNotification;

// ---------- Синтетические, по документации (на инстансе не наблюдались) ----------

/** Личное входящее — формат из документации (ТЗ §5.3, §4.4). */
export const incomingPersonalText = {
  receiptId: 1101,
  body: {
    typeWebhook: 'incomingMessageReceived',
    instanceData: { idInstance: 110000000042, wid: '79990000000@c.us', typeInstance: 'v3' },
    timestamp: 1790000400,
    idMessage: '117900004000000000',
    senderData: {
      chatId: '10000002',
      chatName: 'Тестовый собеседник',
      chatType: 'user',
      sender: '10000002',
      senderName: 'Тестовый собеседник',
      senderType: 'user',
      senderContactName: '',
      senderPhoneNumber: 79991234567,
    },
    messageData: {
      typeMessage: 'textMessage',
      textMessageData: { textMessage: 'Ответ собеседника', isForwarded: false, forwardingScore: 0 },
    },
  },
} satisfies ReceivedNotification;

/** quotaExceeded по примеру документации (ТЗ §5.5, вариант 3); timestamp отсутствует. */
export const quotaExceededNotification = {
  receiptId: 1102,
  body: {
    typeWebhook: 'quotaExceeded',
    instanceData: { idInstance: 110000000042, wid: '79990000000@c.us', typeInstance: 'v3' },
    quotaData: {
      method: 'correspondents',
      used: 3,
      total: 3,
      status: 'CORRESPONDENTS_QUOTA_EXCEEDED',
      description:
        'Monthly quota has been exceeded. You can only send or receive messages from following chats: 10000002, -10000000000001, -20000000000003',
    },
  } satisfies QuotaExceededNotification,
};

/** Тела ответа 466 в трёх форматах (ТЗ §5.5). Списки chatId — условные. */
export const quota466Bodies = {
  invokeStatusCheckAccount: {
    invokeStatus: {
      method: 'checkAccount',
      used: 100,
      total: 100,
      status: 'QUOTE_EXCEEDED',
      description: 'Monthly quota has been exceeded. Upgrade your plan',
    },
  },
  /** used/total строками — так в таблице документации. */
  correspondentsStatusStrings: {
    correspondentsStatus: {
      method: 'correspondents',
      used: '3',
      total: '3',
      status: 'CORRESPONDENTS_QUOTA_EXCEEDED',
      description:
        'Monthly quota has been exceeded. You can only send or receive messages from following chats: 10000002, -10000000000001',
    },
  },
  quotaDataNotificationShape: quotaExceededNotification.body,
  /** Без used / total / description (в документации поля описаны не во всех форматах). */
  correspondentsStatusMinimal: {
    correspondentsStatus: {
      method: 'correspondents',
      status: 'CORRESPONDENTS_QUOTA_EXCEEDED',
    } satisfies QuotaInfo,
  },
  invokeStatusMinimal: {
    invokeStatus: { method: 'checkAccount', status: 'QUOTE_EXCEEDED' } satisfies QuotaInfo,
  },
} as const;

/** quotaExceeded без used / total / description. */
export const quotaExceededNotificationMinimal = {
  receiptId: 1103,
  body: {
    typeWebhook: 'quotaExceeded',
    instanceData: { idInstance: 110000000042, wid: '79990000000@c.us', typeInstance: 'v3' },
    quotaData: { method: 'correspondents', status: 'CORRESPONDENTS_QUOTA_EXCEEDED' },
  } satisfies QuotaExceededNotification,
};
