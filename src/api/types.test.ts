/**
 * Проверка, что типы контракта принимают формы из ТЗ §5 (значения условные, НФТ-11).
 * Основная проверка — на этапе `tsc` (satisfies / expectTypeOf); рантайм-часть — дымовая.
 */
import { describe, expect, expectTypeOf, it } from 'vitest';
import type {
  CheckAccountResponse,
  DeleteNotificationResponse,
  Error466Body,
  GetSettingsResponse,
  GetStateInstanceResponse,
  IdMessage,
  MessageKey,
  NotificationBody,
  ReceivedNotification,
  SendMessageRequest,
  SendMessageResponse,
  TypeWebhook,
} from './types';

const instanceData = {
  idInstance: 1101000000,
  wid: '79990000000@c.us',
  typeInstance: 'v3',
} as const;

const incoming = {
  receiptId: 1,
  body: {
    typeWebhook: 'incomingMessageReceived',
    instanceData,
    timestamp: 1790000000,
    idMessage: '100000000000000001',
    senderData: {
      chatId: '10000000',
      chatName: 'Имя Собеседника',
      chatType: 'user',
      sender: '10000000',
      senderName: 'Имя Собеседника',
      senderType: 'user',
      senderContactName: '',
      senderPhoneNumber: 79990000001,
    },
    messageData: {
      typeMessage: 'textMessage',
      textMessageData: { textMessage: 'Текст', isForwarded: false, forwardingScore: 0 },
    },
  },
} satisfies ReceivedNotification;

const outgoingApi = {
  typeWebhook: 'outgoingAPIMessageReceived',
  instanceData,
  timestamp: 1790000000,
  idMessage: '1790000000000',
  senderData: {
    chatId: '10000000',
    chatName: 'Имя Собеседника',
    chatType: 'user',
    sender: '20000000',
    senderName: 'Мой аккаунт',
    senderType: 'user',
    senderContactName: '',
    senderPhoneNumber: 79990000000,
  },
  messageData: {
    typeMessage: 'extendedTextMessage',
    extendedTextMessageData: {
      text: 'Тест',
      title: '',
      description: '',
      previewType: 'None',
      jpegThumbnail: '',
      isForwarded: false,
      forwardingScore: 0,
    },
  },
} satisfies NotificationBody;

const quotaExceeded = {
  typeWebhook: 'quotaExceeded',
  instanceData,
  quotaData: {
    method: 'correspondents',
    used: 3,
    total: 3,
    status: 'CORRESPONDENTS_QUOTA_EXCEEDED',
    description: 'Monthly quota has been exceeded.',
  },
} satisfies NotificationBody;

describe('API contract types (§5)', () => {
  it('describe method request/response shapes', () => {
    const state = { stateInstance: 'authorized' } satisfies GetStateInstanceResponse;
    const settings = {
      webhookUrl: '',
      incomingWebhook: 'yes',
      outgoingWebhook: 'no',
      outgoingAPIMessageWebhook: 'yes',
      outgoingMessageWebhook: 'yes',
      stateWebhook: 'no',
    } satisfies GetSettingsResponse;
    const check = {
      exist: true,
      chatId: '10000000',
      fromCache: false,
    } satisfies CheckAccountResponse;
    const send = { chatId: check.chatId, message: 'Тест' } satisfies SendMessageRequest;
    const sent = { idMessage: '1790000000000' } satisfies SendMessageResponse;
    const deleted = { result: true, reason: '' } satisfies DeleteNotificationResponse;

    expect([state, settings, check, send, sent, deleted]).toHaveLength(6);
  });

  it('keep chatId and idMessage as strings', () => {
    expectTypeOf<SendMessageRequest['chatId']>().toEqualTypeOf<string>();
    expectTypeOf<IdMessage>().toEqualTypeOf<string>();
    expectTypeOf<`10000000_1790000000000`>().toExtend<MessageKey>();
    expect(typeof incoming.body.idMessage).toBe('string');
  });

  it('discriminate notification bodies by typeWebhook', () => {
    const bodies: NotificationBody[] = [incoming.body, outgoingApi, quotaExceeded];
    const types: TypeWebhook[] = bodies.map((body) => body.typeWebhook);
    expect(types).toEqual([
      'incomingMessageReceived',
      'outgoingAPIMessageReceived',
      'quotaExceeded',
    ]);

    // Сужение по typeWebhook и typeMessage должно давать доступ к полям нужной формы.
    const apiText = (body: NotificationBody): string | undefined => {
      if (body.typeWebhook !== 'outgoingAPIMessageReceived') return undefined;
      expectTypeOf(body.senderData.chatId).toEqualTypeOf<string>();
      return body.messageData.typeMessage === 'extendedTextMessage'
        ? body.messageData.extendedTextMessageData.text
        : undefined;
    };
    expect(apiText(outgoingApi)).toBe('Тест');
    expect(apiText(quotaExceeded)).toBeUndefined();
  });

  it('accept all three documented 466 body variants (§5.5)', () => {
    const quota = {
      method: 'checkAccount',
      used: '100',
      total: 100,
      status: 'QUOTE_EXCEEDED',
      description: '',
    };
    const variants: Error466Body[] = [
      { invokeStatus: quota },
      { correspondentsStatus: { ...quota, method: 'correspondents' } },
      quotaExceeded,
    ];
    expect(variants).toHaveLength(3);
  });
});
