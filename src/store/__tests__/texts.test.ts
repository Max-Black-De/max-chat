import { describe, expect, it } from 'vitest';
import { SESSION_TEXTS, hostWarningText } from '../texts';

/** Эталон — строки из ТЗ v1.3.2 (Р-1, Р-2, Р-12, п. 1.2), посимвольно. */
describe('тексты F2 совпадают с ТЗ', () => {
  it('Р-1, п. 1.2, Р-12, Р-2', () => {
    expect(SESSION_TEXTS.apiUrlHint).toBe(
      'Скопируйте apiUrl из личного кабинета GREEN-API (console.green-api.com → инстанс)',
    );
    expect(hostWarningText('proxy.example')).toBe(
      'Адрес не похож на сервер GREEN-API: токен будет отправлен на proxy.example. Продолжайте, только если уверены',
    );
    expect(SESSION_TEXTS.otherTabReadOnly).toBe('Чат открыт в другой вкладке — пишите там');
    expect(SESSION_TEXTS.locksUnsupported).toBe(
      'Браузер не поддерживает блокировку вкладок — не открывайте чат в нескольких вкладках одновременно',
    );
    expect(SESSION_TEXTS.storageFailed).toBe(
      'Не удаётся сохранить данные в браузере — после перезагрузки чаты и сообщения пропадут',
    );
  });
});
