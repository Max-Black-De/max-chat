import { describe, expect, it } from 'vitest';
import {
  channelImage,
  groupQuotedWithPhone,
  incomingText,
  outgoingApi,
  outgoingPhone,
} from '../test/fixtures';
import { extractMessageText } from './extractText';

describe('extractMessageText (§5.3)', () => {
  it('textMessage → textMessageData.textMessage', () => {
    expect(extractMessageText(outgoingPhone.messageData)).toEqual({
      kind: 'text',
      text: 'Тестовое сообщение с телефона',
    });
    expect(extractMessageText(incomingText.messageData)).toEqual({
      kind: 'text',
      text: 'Тестовый ответ',
    });
  });

  it('textMessage с quotedMessage → только свой текст (Р-17)', () => {
    const r = extractMessageText(groupQuotedWithPhone.messageData);
    expect(r).toEqual({
      kind: 'text',
      text: 'Тестовый ответ в группе',
    });
  });

  it('extendedTextMessage (исходящее через API) → extendedTextMessageData.text', () => {
    expect(extractMessageText(outgoingApi.messageData)).toEqual({
      kind: 'text',
      text: 'Тестовое сообщение',
    });
  });

  it('quotedMessage (вариант документации) → extendedTextMessageData.text', () => {
    expect(
      extractMessageText({
        typeMessage: 'quotedMessage',
        extendedTextMessageData: { text: 'Ответ', stanzaId: '1', participant: '2' },
      }),
    ).toEqual({ kind: 'text', text: 'Ответ' });
  });

  it('нетекстовые типы → заглушка (Р-11)', () => {
    expect(extractMessageText(channelImage.messageData)).toEqual({
      kind: 'unsupported',
      typeMessage: 'imageMessage',
    });
    expect(extractMessageText({ typeMessage: 'editedMessage', editedMessageData: {} })).toEqual({
      kind: 'unsupported',
      typeMessage: 'editedMessage',
    });
  });

  it.each([
    null,
    undefined,
    'text',
    [],
    {},
    { typeMessage: 'textMessage' },
    { typeMessage: 'textMessage', textMessageData: { textMessage: 42 } },
    { typeMessage: 'extendedTextMessage', extendedTextMessageData: null },
    { typeMessage: 5 },
  ])('битые данные %j → заглушка без исключения', (md) => {
    expect(extractMessageText(md).kind).toBe('unsupported');
  });
});
