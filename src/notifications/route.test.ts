import { describe, expect, it } from 'vitest';
import {
  CHAT_IDS,
  ID_INSTANCE,
  ID_MESSAGES,
  NAMES,
  PHONES,
  botText,
  brokenBodies,
  channelImage,
  foreignInstanceIncoming,
  foreignInstanceOutgoingApi,
  groupQuotedWithPhone,
  groupText,
  incomingEmptyChatName,
  incomingImage,
  incomingMessage,
  incomingText,
  outgoingApi,
  outgoingPhone,
  ownInstanceAsString,
  quotaExceededNotification,
  quotaExceededNotificationNoUsedTotal,
  senderGroup,
  stateChangedAuthorized,
  statusDelivered,
  unknownChatText,
  unknownTypeWebhooks,
} from '../test/fixtures';
import { notificationTypeForLog, routeNotification } from './route';

const ctx = { idInstance: ID_INSTANCE };
const route = (body: unknown) => routeNotification(body, ctx);

describe('routeNotification (§5.3)', () => {
  it('входящее из личного чата → сообщение слева, имя чата (Р-15)', () => {
    expect(route(incomingText)).toEqual({
      kind: 'message',
      type: 'incomingMessageReceived',
      chatName: NAMES.primary,
      message: {
        chatId: CHAT_IDS.primary,
        idMessage: incomingText.idMessage,
        source: 'incoming',
        text: 'Тестовый ответ',
        timestamp: incomingText.timestamp,
      },
    });
  });

  it('исходящее с телефона (textMessage) и через API (extendedTextMessage, EC-N8)', () => {
    const phone = route(outgoingPhone);
    expect(phone).toMatchObject({
      kind: 'message',
      chatName: NAMES.primary,
      message: { source: 'outgoingPhone', text: 'Тестовое сообщение с телефона' },
    });
    const api = route(outgoingApi);
    expect(api).toMatchObject({
      kind: 'message',
      message: {
        chatId: CHAT_IDS.primary,
        idMessage: ID_MESSAGES.api1,
        source: 'outgoingApi',
        text: 'Тестовое сообщение',
      },
    });
  });

  it('в результате нет senderPhoneNumber, sender и senderName (Р-11, v1.3.6)', () => {
    for (const body of [incomingText, outgoingPhone, outgoingApi]) {
      const json = JSON.stringify(route(body));
      expect(json).not.toContain(String(PHONES.primary));
      expect(json).not.toContain(String(PHONES.own));
      expect(json).not.toContain('senderPhoneNumber');
      expect(json).not.toContain(NAMES.own);
    }
  });

  it('неизвестный личный чат → сообщение (известность проверяет лента, EC-N2)', () => {
    expect(route(unknownChatText)).toMatchObject({
      kind: 'message',
      message: { chatId: CHAT_IDS.unknown },
    });
  });

  it('нетекстовое → заглушка без caption, миниатюры и ссылки (Р-11, EC-N6)', () => {
    const body = incomingMessage({
      idMessage: ID_MESSAGES.incoming3,
      messageData: {
        typeMessage: 'imageMessage',
        fileMessageData: {
          downloadUrl: 'https://media.example.test/files/secret.jpg',
          caption: 'Подпись к картинке',
          fileName: 'secret.jpg',
          jpegThumbnail: 'dGVzdA==',
          mimeType: 'image/jpeg',
        },
      } as never,
    });
    const r = route(body);
    expect(r).toMatchObject({
      kind: 'message',
      message: { text: '', unsupported: true, idMessage: ID_MESSAGES.incoming3 },
    });
    const json = JSON.stringify(r);
    for (const leak of ['Подпись', 'secret', 'dGVzdA', 'media.example'])
      expect(json).not.toContain(leak);
    expect(route(incomingImage)).toMatchObject({ message: { unsupported: true, text: '' } });
  });

  it('пустой chatName не передаётся (EC-N12)', () => {
    const r = route(incomingEmptyChatName);
    expect(r.kind).toBe('message');
    expect(r).not.toHaveProperty('chatName');
  });

  it.each([
    ['группа', groupText],
    ['группа с номером участника', groupQuotedWithPhone],
    ['канал', channelImage],
    ['бот (EC-N4)', botText],
    ['входящее без chatType', { ...incomingText, senderData: { chatId: CHAT_IDS.primary } }],
    ['исходящее в группу', { ...outgoingPhone, senderData: senderGroup }],
  ])('%s → игнор notPersonalChat (Р-5, EC-N1)', (_name, body) => {
    expect(route(body)).toMatchObject({ kind: 'ignore', reason: 'notPersonalChat' });
  });

  it('исходящее без chatType — по chatId', () => {
    const sender: Record<string, unknown> = { ...outgoingApi.senderData };
    delete sender.chatType;
    expect(route({ ...outgoingApi, senderData: sender })).toMatchObject({ kind: 'message' });
  });

  it('чужой idInstance → игнор, тип для лога (Р-5, EC-I7); свой строкой — показывается (EC-I2)', () => {
    expect(route(foreignInstanceIncoming)).toEqual({
      kind: 'ignore',
      reason: 'foreignInstance',
      type: 'incomingMessageReceived',
    });
    expect(route(foreignInstanceOutgoingApi)).toMatchObject({ reason: 'foreignInstance' });
    expect(route(ownInstanceAsString)).toMatchObject({ kind: 'message' });
  });

  it('нет instanceData / idInstance → проверка пропущена, обработка как обычно, пометка (Р-5 v1.3.7)', () => {
    const noData: Record<string, unknown> = { ...incomingText };
    delete noData.instanceData;
    expect(route(noData)).toMatchObject({
      kind: 'message',
      noInstanceData: true,
      message: { chatId: CHAT_IDS.primary },
    });
    expect(
      route({ ...incomingText, instanceData: { wid: incomingText.instanceData.wid } }),
    ).toMatchObject({ kind: 'message', noInstanceData: true });
    expect(route(incomingText)).not.toHaveProperty('noInstanceData');
    expect(route({ typeWebhook: 'quotaExceeded' })).toEqual({
      kind: 'quota',
      type: 'quotaExceeded',
      quota: { kind: 'chats', source: 'fallback' },
      noInstanceData: true,
    });
  });

  it('статус и смена состояния → игнор (Р-14, EC-N10)', () => {
    expect(route(statusDelivered)).toMatchObject({ kind: 'ignore', reason: 'status' });
    expect(route(stateChangedAuthorized)).toMatchObject({ kind: 'ignore', reason: 'stateChanged' });
  });

  it.each(Object.entries(unknownTypeWebhooks))('неизвестный тип %s → игнор (EC-N5)', (_k, body) => {
    expect(route(body)).toMatchObject({ kind: 'ignore', reason: 'unknownType' });
  });

  it('quotaExceeded → квота без description (§5.5)', () => {
    const r = route(quotaExceededNotification);
    expect(r).toMatchObject({ kind: 'quota', type: 'quotaExceeded', quota: { kind: 'chats' } });
    expect(JSON.stringify(r)).not.toContain('description');
    expect(route(quotaExceededNotificationNoUsedTotal)).toMatchObject({ kind: 'quota' });
    expect(
      route({ typeWebhook: 'quotaExceeded', instanceData: incomingText.instanceData }),
    ).toMatchObject({ kind: 'quota', quota: { kind: 'chats', source: 'fallback' } });
  });

  it.each(Object.entries(brokenBodies))('битое body %s → без исключения (EC-N7)', (_k, body) => {
    const r = route(body);
    expect(['ignore', 'message']).toContain(r.kind);
    if (r.kind === 'message') expect(r.message).toMatchObject({ text: '', unsupported: true });
  });

  it('idMessage числом, нет senderData / chatId / timestamp → malformed', () => {
    expect(route(brokenBodies.numericIdMessage)).toMatchObject({ reason: 'malformed' });
    expect(route(brokenBodies.noSenderData)).toMatchObject({ reason: 'malformed' });
    expect(route({ ...incomingText, idMessage: '' })).toMatchObject({ reason: 'malformed' });
    expect(
      route({ ...incomingText, senderData: { ...incomingText.senderData, chatId: '' } }),
    ).toMatchObject({ reason: 'malformed' });
    expect(route({ ...incomingText, timestamp: '1790000000' })).toMatchObject({
      reason: 'malformed',
    });
    expect(route({ ...incomingText, timestamp: Number.NaN })).toMatchObject({
      reason: 'malformed',
    });
    expect(route(null)).toEqual({ kind: 'ignore', reason: 'malformed', type: 'unknown' });
    expect(route({ typeWebhook: 5 })).toMatchObject({ reason: 'malformed' });
  });

  it('notificationTypeForLog: только латиница до 40 символов', () => {
    expect(notificationTypeForLog(incomingText)).toBe('incomingMessageReceived');
    expect(notificationTypeForLog({ typeWebhook: `x${String(PHONES.primary)}` })).toBe('unknown');
    expect(notificationTypeForLog({ typeWebhook: 'a'.repeat(41) })).toBe('unknown');
    expect(notificationTypeForLog('incomingMessageReceived')).toBe('unknown');
  });
});
