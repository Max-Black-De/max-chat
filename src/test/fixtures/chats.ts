/**
 * Фикстуры F3: чаты, кеш «номер → chatId», ленты. Только условные значения (НФТ-11), те же,
 * что в общих фикстурах QA (`constants.ts` в main: PHONES.primary/secondary, CHAT_IDS) —
 * после rebase на main заменить на импорт оттуда.
 */
import { TEST_ID_INSTANCE } from './greenApiMock';

export const TEST_PHONE = '79990000001';
export const TEST_PHONE_FORMATTED = '+7 999 000-00-01';
export const TEST_CHAT_ID = '10000000';
export const TEST_PHONE_2 = '79990000002';
export const TEST_CHAT_ID_2 = '10000001';
export const TEST_PHONE_BY = '375290000001';
export const TEST_PHONE_BY_FORMATTED = '+375 29 000-00-01';

/** Ключ localStorage раздела данных инстанса (Р-2). */
export function lsKey(section: string, idInstance: string = TEST_ID_INSTANCE): string {
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
  return { chatId: TEST_CHAT_ID, phone: TEST_PHONE, createdAt: 1_790_000_000, unread: 0, ...over };
}

/** Содержимое localStorage: чаты и кеш (JSON-строки по ключам). */
export function storedChats(
  chats: ChatFixture[],
  phoneCache: Record<string, string> = {},
  idInstance: string = TEST_ID_INSTANCE,
): Record<string, string> {
  return {
    [lsKey('chats', idInstance)]: JSON.stringify(chats),
    [lsKey('phoneCache', idInstance)]: JSON.stringify(phoneCache),
  };
}
