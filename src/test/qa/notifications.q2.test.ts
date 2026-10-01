/**
 * Q2 (Д3), только моки: маршрутизация уведомлений по ТЗ v1.3.6–v1.3.7.
 * - Р-11 (v1.3.6): входящее `imageMessage` по структуре образца Р-26 → заглушка, без содержимого;
 * - Р-5 (v1.3.7): нет `instanceData` / `idInstance` — не «чужое», уведомление обрабатывается.
 * Красные из-за кода тесты помечены `it.fails` с ID бага (отчёт Q2): код не правим.
 */
import { describe, expect, it } from 'vitest';
import { routeNotification } from '../../notifications';
import {
  CHAT_IDS,
  FOREIGN_ID_INSTANCE_NUMBER,
  ID_INSTANCE,
  incomingImageSampleLeaks,
  incomingImageSampleR26,
  incomingWithoutIdInstance,
  incomingWithoutInstanceData,
  quotaExceededNotification,
} from '../fixtures';

const ctx = { idInstance: ID_INSTANCE };

describe('Р-11: нетекстовое входящее по образцу Р-26', () => {
  it('imageMessage с caption, миниатюрой и ссылкой → заглушка в известном чате', () => {
    const routed = routeNotification(incomingImageSampleR26, ctx);
    expect(routed).toMatchObject({
      kind: 'message',
      message: {
        chatId: CHAT_IDS.primary,
        idMessage: incomingImageSampleR26.idMessage,
        source: 'incoming',
        text: '',
        unsupported: true,
      },
    });
  });

  it('в результате маршрутизации нет caption, имени файла, миниатюры, ссылки, номера и senderContactName', () => {
    const json = JSON.stringify(routeNotification(incomingImageSampleR26, ctx));
    for (const leak of incomingImageSampleLeaks) expect(json).not.toContain(leak);
    expect(json).not.toContain('senderPhoneNumber');
    expect(json).not.toContain('downloadUrl');
  });
});

describe('Р-5 (v1.3.7): без instanceData — не «чужое»', () => {
  it.fails(
    'BUG-Q2-01: входящее без instanceData в известный чат → сообщение, а не foreignInstance',
    () => {
      expect(routeNotification(incomingWithoutInstanceData, ctx)).toMatchObject({
        kind: 'message',
        message: { chatId: CHAT_IDS.primary, text: 'Тестовый ответ без instanceData' },
      });
    },
  );

  it.fails('BUG-Q2-01: instanceData без idInstance → сообщение, а не foreignInstance', () => {
    expect(routeNotification(incomingWithoutIdInstance, ctx)).toMatchObject({
      kind: 'message',
      message: { text: 'Тестовый ответ без idInstance' },
    });
  });

  it.fails('BUG-Q2-01: quotaExceeded без instanceData → событие квоты (баннер §5.5)', () => {
    const body = Object.fromEntries(
      Object.entries(quotaExceededNotification).filter(([key]) => key !== 'instanceData'),
    );
    expect(routeNotification(body, ctx)).toMatchObject({ kind: 'quota' });
  });

  it('контроль: с чужим idInstance по-прежнему foreignInstance (EC-I7 не сломан)', () => {
    const body = {
      ...(incomingWithoutIdInstance as Record<string, unknown>),
      instanceData: { idInstance: FOREIGN_ID_INSTANCE_NUMBER, wid: '', typeInstance: 'v3' },
    };
    expect(routeNotification(body, ctx)).toMatchObject({
      kind: 'ignore',
      reason: 'foreignInstance',
    });
  });
});
