/**
 * Тексты F2, которых нет в `api/messages.ts` (ТЗ v1.3.2: Р-1, Р-2, Р-12, п. 1.2). Дословно из ТЗ;
 * тест `texts.test.ts` сверяет их с эталоном. Держатся вне `src/api`, чтобы не конфликтовать с
 * правками клиента (F1); при желании их можно перенести в messages.ts.
 */
export const SESSION_TEXTS = {
  /** Подсказка под полем apiUrl (Р-1). */
  apiUrlHint: 'Скопируйте apiUrl из личного кабинета GREEN-API (console.green-api.com → инстанс)',
  /** Части шаблона предупреждения о чужом хосте (п. 1.2, Д-3/EC-T9). */
  hostWarningPrefix: 'Адрес не похож на сервер GREEN-API: токен будет отправлен на ',
  hostWarningSuffix: '. Продолжайте, только если уверены',
  /** Р-12, EC-S4: подсказка у неактивных «Отправить» / «Новый чат» во вкладке только на чтение. */
  otherTabReadOnly: 'Чат открыт в другой вкладке — пишите там',
  /** Р-12, EC-S5: нет Web Locks API, постоянный баннер. */
  locksUnsupported:
    'Браузер не поддерживает блокировку вкладок — не открывайте чат в нескольких вкладках одновременно',
  /** Р-2, EC-D11: запись в localStorage не удалась. */
  storageFailed:
    'Не удаётся сохранить данные в браузере — после перезагрузки чаты и сообщения пропадут',
} as const;

export function hostWarningText(host: string): string {
  return `${SESSION_TEXTS.hostWarningPrefix}${host}${SESSION_TEXTS.hostWarningSuffix}`;
}
