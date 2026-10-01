/**
 * Фикстуры F3: чаты, кеш «номер → chatId», ленты. Только условные значения из общих фикстур QA
 * (`./constants`, НФТ-11): номер `PHONES.primary` ↔ чат `CHAT_IDS.primary` и т. д.
 */
import { BASE_TIMESTAMP, CHAT_IDS, ID_INSTANCE, PHONES } from './constants';

/** Нормализованный номер (строка, Р-10) основного собеседника. */
export const TEST_PHONE = String(PHONES.primary);
export const TEST_PHONE_FORMATTED = '+7 999 000-00-01';
export const TEST_CHAT_ID = CHAT_IDS.primary;
export const TEST_PHONE_2 = String(PHONES.secondary);
export const TEST_CHAT_ID_2 = CHAT_IDS.secondary;
export const TEST_PHONE_BY = String(PHONES.belarus);
export const TEST_PHONE_BY_FORMATTED = '+375 29 000-00-01';

/** Ключ localStorage раздела данных инстанса (Р-2). */
export function lsKey(section: string, idInstance: string = ID_INSTANCE): string {
  return `maxchat:${idInstance}:v1:${section}`;
}

export interface ChatFixture {
  chatId: string;
  phone: string;
  createdAt: number;
  unread: number;
  chatName?: string;
  lastMessage?: { text: string; timestamp: number; direction: 'in' | 'out' };
}

export function chatFixture(over: Partial<ChatFixture> = {}): ChatFixture {
  return { chatId: TEST_CHAT_ID, phone: TEST_PHONE, createdAt: BASE_TIMESTAMP, unread: 0, ...over };
}

/** Содержимое localStorage: чаты и кеш (JSON-строки по ключам). */
export function storedChats(
  chats: ChatFixture[],
  phoneCache: Record<string, string> = {},
  idInstance: string = ID_INSTANCE,
): Record<string, string> {
  return {
    [lsKey('chats', idInstance)]: JSON.stringify(chats),
    [lsKey('phoneCache', idInstance)]: JSON.stringify(phoneCache),
  };
}
