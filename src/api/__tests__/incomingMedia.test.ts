import { describe, expect, it } from 'vitest';
import { extractMessageText } from '../../notifications/extractText';
import type { FileMessageContent, IncomingMessageReceived } from '../types';
import { MEDIA_URL_BASE, deleteOk, incomingMessage, senderPrimary } from '../../test/fixtures';
import {
  blockRealNetwork,
  callAt,
  makeClient,
  mockFetch,
  recordingLogger,
} from '../../test/apiHelpers';

blockRealNetwork();

/**
 * Аналог маскированного образца QA (входящее `imageMessage`, Р-26): `fileMessageData` с подписью,
 * миниатюрой и пересылкой, chatId — только в `senderData` (на верхнем уровне его нет).
 * Собран из условных значений `src/test/fixtures`, а не скопирован: миниатюра укорочена, ссылка —
 * на `media.example.test`.
 */
const forwardedImage = {
  typeMessage: 'imageMessage',
  fileMessageData: {
    downloadUrl: `${MEDIA_URL_BASE}/test-photo.jpg`,
    caption: 'Тестовая подпись к изображению',
    fileName: 'test-photo.jpg',
    jpegThumbnail: 'dGVzdA==',
    isAnimated: false,
    mimeType: 'image/jpeg',
    forwardingScore: 1,
    isForwarded: true,
  },
} satisfies FileMessageContent;

const incomingImage: IncomingMessageReceived = incomingMessage({
  idMessage: '100000000000000301',
  senderData: { ...senderPrimary, senderContactName: senderPrimary.senderName },
  messageData: forwardedImage,
});

const RECEIPT_ID = 7;

describe('receiveNotification: входящее imageMessage (маскированный образец QA)', () => {
  it('разбирается без исключения, receiptId сохраняется, текст — заглушка (Р-11)', async () => {
    const m = mockFetch({ body: { receiptId: RECEIPT_ID, body: incomingImage } });
    const n = await makeClient(m.fetch).receiveNotification();
    expect(n?.receiptId).toBe(RECEIPT_ID);
    expect(n?.body).toEqual(incomingImage);
    const body = n?.body as IncomingMessageReceived;
    expect('chatId' in body).toBe(false);
    expect(body.senderData.chatId).toBe(senderPrimary.chatId);
    // Подпись к фото текстом не показывается: нетекстовое сообщение — заглушка (§5.3, Р-11).
    expect(extractMessageText(body.messageData)).toEqual({
      kind: 'unsupported',
      typeMessage: 'imageMessage',
    });
  });

  it('большая миниатюра и неизвестные поля в fileMessageData не мешают разбору', async () => {
    const big = {
      ...incomingImage,
      messageData: {
        typeMessage: 'imageMessage',
        fileMessageData: {
          ...forwardedImage.fileMessageData,
          jpegThumbnail: 'A'.repeat(1212),
          someNewField: { nested: true },
        },
      },
    };
    const m = mockFetch({ body: JSON.stringify({ receiptId: RECEIPT_ID, body: big }) });
    const n = await makeClient(m.fetch).receiveNotification();
    expect(n?.receiptId).toBe(RECEIPT_ID);
    expect(extractMessageText((n?.body as IncomingMessageReceived).messageData).kind).toBe(
      'unsupported',
    );
  });

  it('receiptId годится для deleteNotification: уведомление удаляется', async () => {
    const m = mockFetch(
      { body: { receiptId: RECEIPT_ID, body: incomingImage } },
      { body: deleteOk },
    );
    const c = makeClient(m.fetch);
    const n = await c.receiveNotification();
    if (!n) throw new Error('expected notification');
    await expect(c.deleteNotification(n.receiptId)).resolves.toEqual({
      result: true,
      reason: '',
      alreadyDeleted: false,
    });
    expect(callAt(m.calls, 1).init.method).toBe('DELETE');
    expect(callAt(m.calls, 1).url).toMatch(new RegExp(`/deleteNotification/[^/]+/${RECEIPT_ID}$`));
  });

  it('в логах нет подписи, ссылки, chatId и номера отправителя', async () => {
    const { logger, lines } = recordingLogger();
    const m = mockFetch({ body: { receiptId: RECEIPT_ID, body: incomingImage } });
    await makeClient(m.fetch, { logger }).receiveNotification();
    const log = lines.join('\n');
    for (const s of [
      forwardedImage.fileMessageData.caption,
      forwardedImage.fileMessageData.downloadUrl,
      senderPrimary.chatId,
      String(senderPrimary.senderPhoneNumber),
    ]) {
      expect(log).not.toContain(s);
    }
  });
});
