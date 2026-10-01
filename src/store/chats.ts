/**
 * Список чатов и кеш «номер → chatId» (F3, ОР-2, ОР-5 п. 5.2, Р-2, Р-15, ВА-15).
 *
 * Чистые функции: типы, проверка данных из localStorage, редьюсер, сортировка. Эффекты
 * (запись в `AppStorage`, checkAccount) — в `chatsController.ts` и `newChat.ts`.
 *
 * Разделы `AppStorage` (ключи `maxchat:<idInstance>:v1:<раздел>`, EC-D7, EC-D8):
 * - `chats` — массив `Chat`;
 * - `phoneCache` — объект `{ "<номер>": "<chatId>" }`.
 * Битый раздел целиком пропускается, битые элементы внутри — отбрасываются.
 */
import { isCheckAccountChatId, isNormalizedPhone, type ChatId, type UnixSeconds } from '../api';
import { formatPhone } from './phoneFormat';

export const CHATS_SECTION = 'chats';
export const PHONE_CACHE_SECTION = 'phoneCache';

/** Последнее сообщение чата — для превью и сортировки списка (F4/F5 сообщают через `chatActivity`). */
export interface ChatLastMessage {
  text: string;
  timestamp: UnixSeconds;
  direction: 'in' | 'out';
}

export interface Chat {
  /** Строка из checkAccount или кеша (`^-?\d+$`), без `@` и суффиксов (EC-I4). */
  chatId: ChatId;
  /** Нормализованный номер (Р-10), из которого создан чат. */
  phone: string;
  /** `senderData.chatName` из уведомлений (Р-15) — заменяет номер в заголовке. */
  chatName?: string;
  /** Время создания (секунды) — для сортировки чата без сообщений (ВА-15). */
  createdAt: UnixSeconds;
  lastMessage?: ChatLastMessage;
  /** Непрочитанные входящие (п. 5.2, EC-D9). */
  unread: number;
}

/** «Номер → chatId» (п. 2.4, EC-D10). */
export type PhoneCache = Readonly<Record<string, ChatId>>;

export interface ChatsState {
  chats: readonly Chat[];
  phoneCache: PhoneCache;
  selectedChatId: ChatId | null;
}

export type ChatsAction =
  /** Загрузка из хранилища (вход, перезагрузка, захват замка вкладкой — EC-S10). */
  | { type: 'loaded'; chats: readonly Chat[]; phoneCache: PhoneCache }
  | { type: 'phoneCached'; phone: string; chatId: ChatId }
  /** Новый чат (п. 2.6) или открытие существующего с тем же chatId. Чат выбирается. */
  | { type: 'chatOpened'; chatId: ChatId; phone: string; now: UnixSeconds }
  | { type: 'chatSelected'; chatId: ChatId | null }
  /**
   * Сообщение в чате (F4 — отправка, F5 — уведомления). `countUnread` — входящее, включая
   * заглушки Р-11; счётчик растёт, только если чат не открыт (п. 5.2).
   */
  | { type: 'chatActivity'; chatId: ChatId; message: ChatLastMessage; countUnread: boolean }
  | { type: 'chatNameReceived'; chatId: ChatId; chatName: string };

export function createInitialChatsState(): ChatsState {
  return { chats: [], phoneCache: {}, selectedChatId: null };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function sanitizeLastMessage(v: unknown): ChatLastMessage | undefined {
  if (!isRecord(v)) return undefined;
  const { text, timestamp, direction } = v;
  if (typeof text !== 'string' || !isFiniteNumber(timestamp)) return undefined;
  if (direction !== 'in' && direction !== 'out') return undefined;
  return { text, timestamp, direction };
}

/** Один чат из localStorage; не прошёл проверку — `null` (EC-D8). */
export function sanitizeChat(v: unknown): Chat | null {
  if (!isRecord(v)) return null;
  const { chatId, phone, chatName, createdAt, unread } = v;
  if (!isCheckAccountChatId(chatId)) return null;
  if (typeof phone !== 'string' || !isNormalizedPhone(phone)) return null;
  if (!isFiniteNumber(createdAt)) return null;
  const chat: Chat = {
    chatId,
    phone,
    createdAt,
    unread: isFiniteNumber(unread) && unread > 0 ? Math.floor(unread) : 0,
  };
  if (typeof chatName === 'string' && chatName.trim() !== '') chat.chatName = chatName;
  const last = sanitizeLastMessage(v.lastMessage);
  if (last) chat.lastMessage = last;
  return chat;
}

/** Раздел `chats`: не массив — пустой список; битые и повторные chatId отбрасываются. */
export function sanitizeChats(v: unknown): Chat[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const out: Chat[] = [];
  for (const item of v) {
    const chat = sanitizeChat(item);
    if (!chat || seen.has(chat.chatId)) continue;
    seen.add(chat.chatId);
    out.push(chat);
  }
  return out;
}

/** Раздел `phoneCache`: только нормализованные номера и chatId вида `^-?\d+$`. */
export function sanitizePhoneCache(v: unknown): Record<string, ChatId> {
  if (!isRecord(v)) return {};
  const out: Record<string, ChatId> = {};
  for (const [phone, chatId] of Object.entries(v)) {
    if (isNormalizedPhone(phone) && isCheckAccountChatId(chatId)) out[phone] = chatId;
  }
  return out;
}

/** Время для сортировки: последнее сообщение любого направления, иначе создание (ВА-15). */
export function chatActivityTime(chat: Chat): UnixSeconds {
  return chat.lastMessage?.timestamp ?? chat.createdAt;
}

/**
 * Порядок списка (п. 5.2, ВА-15): по убыванию времени активности. Сортировка устойчивая,
 * поэтому при равном времени сохраняется порядок в массиве — новые и поднятые чаты в начале.
 */
export function sortChats(chats: readonly Chat[]): Chat[] {
  return [...chats].sort((a, b) => chatActivityTime(b) - chatActivityTime(a));
}

/** Поднять чат в начало массива (для равных времён при устойчивой сортировке). */
function moveToFront(chats: readonly Chat[], chat: Chat): Chat[] {
  return [chat, ...chats.filter((c) => c.chatId !== chat.chatId)];
}

function updateChat(
  state: ChatsState,
  chatId: ChatId,
  update: (chat: Chat) => Chat,
  toFront = false,
): ChatsState {
  const current = state.chats.find((c) => c.chatId === chatId);
  if (!current) return state;
  const next = update(current);
  if (next === current) return state;
  const chats = toFront
    ? moveToFront(state.chats, next)
    : state.chats.map((c) => (c.chatId === chatId ? next : c));
  return { ...state, chats };
}

export function chatsReducer(state: ChatsState, action: ChatsAction): ChatsState {
  switch (action.type) {
    case 'loaded': {
      const selected =
        state.selectedChatId !== null && action.chats.some((c) => c.chatId === state.selectedChatId)
          ? state.selectedChatId
          : null;
      return { chats: action.chats, phoneCache: action.phoneCache, selectedChatId: selected };
    }
    case 'phoneCached':
      if (state.phoneCache[action.phone] === action.chatId) return state;
      return { ...state, phoneCache: { ...state.phoneCache, [action.phone]: action.chatId } };
    case 'chatOpened': {
      const existing = state.chats.find((c) => c.chatId === action.chatId);
      if (existing) {
        // Чат с этим chatId уже есть — открыть его, не дублировать (п. 2.6, EC-D10).
        const opened = existing.unread === 0 ? existing : { ...existing, unread: 0 };
        return {
          ...state,
          chats:
            opened === existing
              ? state.chats
              : state.chats.map((c) => (c === existing ? opened : c)),
          selectedChatId: action.chatId,
        };
      }
      const chat: Chat = {
        chatId: action.chatId,
        phone: action.phone,
        createdAt: action.now,
        unread: 0,
      };
      return { ...state, chats: [chat, ...state.chats], selectedChatId: action.chatId };
    }
    case 'chatSelected': {
      if (action.chatId === null) return { ...state, selectedChatId: null };
      const chatId = action.chatId;
      if (!state.chats.some((c) => c.chatId === chatId)) return state;
      // Открытие чата сбрасывает счётчик локально, без readChat (п. 5.2, EC-D9).
      const next = updateChat(state, chatId, (c) => (c.unread === 0 ? c : { ...c, unread: 0 }));
      return next.selectedChatId === chatId ? next : { ...next, selectedChatId: chatId };
    }
    case 'chatActivity': {
      const isOpen = state.selectedChatId === action.chatId;
      return updateChat(
        state,
        action.chatId,
        (c) => {
          const newer = !c.lastMessage || action.message.timestamp >= c.lastMessage.timestamp;
          return {
            ...c,
            ...(newer ? { lastMessage: action.message } : {}),
            unread: action.countUnread && !isOpen ? c.unread + 1 : c.unread,
          };
        },
        true,
      );
    }
    case 'chatNameReceived': {
      const name = action.chatName.trim();
      if (!name) return state;
      return updateChat(state, action.chatId, (c) =>
        c.chatName === name ? c : { ...c, chatName: name },
      );
    }
  }
}

/** Заголовок (Р-15): `chatName`, если пришёл, иначе номер `+7 999 123-45-67`. */
export function chatTitle(chat: Chat): string {
  return chat.chatName ?? formatPhone(chat.phone);
}

/** Подзаголовок (Р-15): номер — только когда заголовок заменён на `chatName`. */
export function chatSubtitle(chat: Chat): string | null {
  return chat.chatName ? formatPhone(chat.phone) : null;
}

export function selectSortedChats(state: ChatsState): Chat[] {
  return sortChats(state.chats);
}

export function selectSelectedChat(state: ChatsState): Chat | null {
  return state.chats.find((c) => c.chatId === state.selectedChatId) ?? null;
}

/** Что нужно найти в кеше / списке перед checkAccount (п. 2.4). */
export function findCachedChat(
  state: Pick<ChatsState, 'chats' | 'phoneCache'>,
  phone: string,
): { chatId: ChatId; chat: Chat | null } | null {
  const chatId = state.phoneCache[phone];
  if (chatId !== undefined)
    return { chatId, chat: state.chats.find((c) => c.chatId === chatId) ?? null };
  // Кеша нет, но чат по этому номеру уже есть (например, кеш был повреждён) — тоже без checkAccount.
  const chat = state.chats.find((c) => c.phone === phone);
  return chat ? { chatId: chat.chatId, chat } : null;
}
