import { describe, expect, it } from 'vitest';
import {
  incomingChannelImage,
  incomingGroupTextQuoted,
  incomingPersonalText,
  outgoingApiExtendedText,
  outgoingPhoneText,
} from '../test/fixtures/apiNotifications';
import { extractMessageText } from './extractText';

describe('extractMessageText (§5.3)', () => {
  it('textMessage → textMessageData.textMessage', () => {
    expect(extractMessageText(outgoingPhoneText.body.messageData)).toEqual({
      kind: 'text',
      text: outgoingPhoneText.body.messageData.textMessageData.textMessage,
    });
    expect(extractMessageText(incomingPersonalText.body.messageData)).toEqual({
      kind: 'text',
      text: 'Ответ собеседника',
    });
  });

  it('textMessage с quotedMessage → только свой текст (Р-17)', () => {
    const r = extractMessageText(incomingGroupTextQuoted.body.messageData);
    expect(r).toEqual({
      kind: 'text',
      text: incomingGroupTextQuoted.body.messageData.textMessageData.textMessage,
    });
  });

  it('extendedTextMessage (исходящее через API) → extendedTextMessageData.text', () => {
    expect(extractMessageText(outgoingApiExtendedText.body.messageData)).toEqual({
      kind: 'text',
      text: outgoingApiExtendedText.body.messageData.extendedTextMessageData.text,
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
    expect(extractMessageText(incomingChannelImage.body.messageData)).toEqual({
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
