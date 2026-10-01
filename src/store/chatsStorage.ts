/**
 * Чтение и запись списка чатов и кеша «номер → chatId» через `AppStorage` (Р-2, EC-D7, EC-D8,
 * EC-D11, EC-S4). Ошибки чтения и записи обрабатывает `AppStorage`: битый раздел — пустой,
 * сбой записи — режим «только память» с одним `console.warn` и баннером.
 */
import {
  CHATS_SECTION,
  PHONE_CACHE_SECTION,
  sanitizeChats,
  sanitizePhoneCache,
  type Chat,
  type PhoneCache,
} from './chats';
import { recoverSendingMessages } from './messagesStorage';
import type { AppStorage } from './storage';

const isAnything = (v: unknown): v is unknown => v !== undefined;

export interface LoadedChats {
  chats: Chat[];
  phoneCache: PhoneCache;
}

/** Загрузка при входе / перезагрузке / захвате замка; заодно ВА-20 для всех лент. */
export function loadChats(storage: AppStorage): LoadedChats {
  const chats = sanitizeChats(storage.read(CHATS_SECTION, isAnything));
  const phoneCache = sanitizePhoneCache(storage.read(PHONE_CACHE_SECTION, isAnything));
  recoverSendingMessages(
    storage,
    chats.map((c) => c.chatId),
  );
  return { chats, phoneCache };
}

export function saveChats(storage: AppStorage, chats: readonly Chat[]): boolean {
  return storage.write(CHATS_SECTION, chats);
}

export function savePhoneCache(storage: AppStorage, phoneCache: PhoneCache): boolean {
  return storage.write(PHONE_CACHE_SECTION, phoneCache);
}
