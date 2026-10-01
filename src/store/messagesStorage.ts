/**
 * Хранение ленты чата в localStorage (§6.3, Р-2) — схема, общая для F3–F5.
 *
 * Раздел на чат: `messages:<chatId>` (ключ `maxchat:<idInstance>:v1:messages:<chatId>`), чтобы
 * повреждение одного чата не стирало остальные (EC-D8). Значение — `{ messages, index }`, где
 * `index` — «`chatId_idMessage` → `localId`» для дедупа (§6.3).
 *
 * При чтении сообщения «отправляется» становятся «не отправлено» с текстом «Статус неизвестен…»
 * (`failSendingMessages`, ВА-20, EC-D5), и исправленная лента сразу записывается обратно
 * (во вкладке только на чтение — только в память, EC-S4).
 */
import { isCheckAccountChatId, type ChatId, type MessageKey, type UnixSeconds } from '../api';
import { failSendingMessages } from './sendingRecovery';
import type { AppStorage } from './storage';

export type MessageStatus = 'sending' | 'sent' | 'error';

export interface StoredMessage {
  /** Локальный id (uuid) — ключ пузыря. */
  localId: string;
  chatId: ChatId;
  /** Есть после ответа sendMessage или из уведомления. */
  idMessage?: string;
  direction: 'in' | 'out';
  text: string;
  timestamp: UnixSeconds;
  /** Только у своих (`out`). */
  status?: MessageStatus;
  /** Текст под пузырём «не отправлено» (п. 3.4–3.6). */
  errorText?: string;
  /** Заглушка «Сообщение этого типа не поддерживается» (Р-11). */
  unsupported?: boolean;
}

export interface ChatMessages {
  messages: StoredMessage[];
  index: Record<MessageKey, string>;
}

export function messagesSection(chatId: ChatId): string {
  return `messages:${chatId}`;
}

export function emptyChatMessages(): ChatMessages {
  return { messages: [], index: {} };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function sanitizeMessage(v: unknown, chatId: ChatId): StoredMessage | null {
  if (!isRecord(v)) return null;
  const { localId, idMessage, direction, text, timestamp, status, errorText, unsupported } = v;
  if (typeof localId !== 'string' || localId === '') return null;
  if (v.chatId !== chatId) return null;
  if (direction !== 'in' && direction !== 'out') return null;
  if (typeof text !== 'string') return null;
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) return null;
  const m: StoredMessage = { localId, chatId, direction, text, timestamp };
  if (typeof idMessage === 'string' && idMessage !== '') m.idMessage = idMessage;
  if (status === 'sending' || status === 'sent' || status === 'error') m.status = status;
  if (typeof errorText === 'string') m.errorText = errorText;
  if (unsupported === true) m.unsupported = true;
  return m;
}

/** Лента из localStorage; не объект — пустая (EC-D8), битые сообщения отбрасываются. */
export function sanitizeChatMessages(v: unknown, chatId: ChatId): ChatMessages {
  if (!isRecord(v) || !Array.isArray(v.messages)) return emptyChatMessages();
  const messages: StoredMessage[] = [];
  const localIds = new Set<string>();
  for (const item of v.messages) {
    const m = sanitizeMessage(item, chatId);
    if (!m || localIds.has(m.localId)) continue;
    localIds.add(m.localId);
    messages.push(m);
  }
  const index: Record<MessageKey, string> = {};
  if (isRecord(v.index)) {
    for (const [key, localId] of Object.entries(v.index)) {
      if (key.startsWith(`${chatId}_`) && typeof localId === 'string' && localIds.has(localId))
        index[key as MessageKey] = localId;
    }
  }
  // Индекс восстанавливается из самих сообщений, если ключ потерялся (дедуп §6.3 не должен ломаться).
  for (const m of messages) {
    if (m.idMessage !== undefined) index[`${chatId}_${m.idMessage}`] ??= m.localId;
  }
  return { messages, index };
}

const isAnything = (v: unknown): v is unknown => v !== undefined;

/**
 * Прочитать ленту чата. «Отправляется» → «не отправлено» (ВА-20); если что-то исправлено,
 * лента записывается обратно, чтобы после следующей перезагрузки было то же самое.
 */
export function loadChatMessages(storage: AppStorage, chatId: ChatId): ChatMessages {
  if (!isCheckAccountChatId(chatId)) return emptyChatMessages();
  const raw = storage.read(messagesSection(chatId), isAnything);
  if (raw === undefined) return emptyChatMessages();
  const data = sanitizeChatMessages(raw, chatId);
  const recovered = failSendingMessages(data.messages);
  if (recovered === data.messages) return data;
  const fixed: ChatMessages = { messages: [...recovered], index: data.index };
  storage.write(messagesSection(chatId), fixed);
  return fixed;
}

export function saveChatMessages(storage: AppStorage, chatId: ChatId, data: ChatMessages): boolean {
  if (!isCheckAccountChatId(chatId)) return false;
  return storage.write(messagesSection(chatId), data);
}

/** Восстановление «отправляется» во всех чатах при загрузке страницы / входе (ВА-20, EC-D5). */
export function recoverSendingMessages(storage: AppStorage, chatIds: readonly ChatId[]): void {
  for (const chatId of chatIds) loadChatMessages(storage, chatId);
}
