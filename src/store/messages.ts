/**
 * Лента чата в памяти (F4, §6.2, §6.3, Р-3) — чистые функции и редьюсер.
 *
 * Хранение — `messagesStorage.ts` (`{ messages, index }` на чат). Здесь только переходы:
 * оптимистичная отправка, ответ sendMessage, ошибка и «Повторить», выход, а также слияние
 * уведомлений (`mergeNotificationMessage`) — его вызывает F5 для входящих и своих сообщений
 * с телефона или через API.
 *
 * `messages` хранятся в порядке поступления; порядок показа — `sortMessages` (по `timestamp`,
 * при равенстве — по порядку поступления, §6.2, EC-O2). Тексты не сопоставляются никогда (EC-D4).
 */
import type { ChatId, MessageKey, UnixSeconds } from '../api';
import { emptyChatMessages, type ChatMessages, type StoredMessage } from './messagesStorage';
import { failSendingMessages } from './sendingRecovery';

/** Откуда пришло сообщение уведомлением (§5.3). */
export type NotificationSource =
  /** `incomingMessageReceived` — пузырь слева, растёт счётчик непрочитанных. */
  | 'incoming'
  /** `outgoingMessageReceived` — отправлено с телефона (п. 3.7). */
  | 'outgoingPhone'
  /** `outgoingAPIMessageReceived` — отправлено через API (это приложение или другой клиент). */
  | 'outgoingApi';

/** Сообщение из уведомления, уже разобранное F5 (§5.3). */
export interface NotificationMessage {
  chatId: ChatId;
  idMessage: string;
  source: NotificationSource;
  /** Свой текст сообщения (без цитаты, Р-17); у заглушки — пустая строка. */
  text: string;
  /** Серверное время, секунды. */
  timestamp: UnixSeconds;
  /** Нетекстовое сообщение — пузырь-заглушка (Р-11, EC-N6). */
  unsupported?: boolean;
}

/**
 * Итог слияния уведомления:
 * - `added` — новый пузырь (ключа не было);
 * - `confirmed` — `outgoingAPIMessageReceived` для уже известного своего сообщения: серверный
 *   `timestamp` и статус «отправлено» (§6.3 п. 3, EC-D3, EC-O3);
 * - `duplicate` — повтор, ничего не изменилось (§6.3, EC-D1).
 */
export type MergeOutcome = 'added' | 'confirmed' | 'duplicate';

export interface MergeResult {
  data: ChatMessages;
  outcome: MergeOutcome;
  /** Добавленное или подтверждённое сообщение; у `duplicate` — существующее (если найдено). */
  message: StoredMessage | null;
}

/** Ключ дедупа `chatId_idMessage` (§6.3): `idMessage` уникален только в пределах чата. */
export function messageKey(chatId: ChatId, idMessage: string): MessageKey {
  return `${chatId}_${idMessage}`;
}

function findByLocalId(data: ChatMessages, localId: string): number {
  return data.messages.findIndex((m) => m.localId === localId);
}

function replaceAt(data: ChatMessages, i: number, message: StoredMessage): ChatMessages {
  const messages = data.messages.slice();
  messages[i] = message;
  return { messages, index: data.index };
}

function withoutErrorText(m: StoredMessage): StoredMessage {
  if (m.errorText === undefined) return m;
  const copy = { ...m };
  delete copy.errorText;
  return copy;
}

/**
 * Слияние сообщения из уведомления (§6.3) — чистая функция для F5.
 * `localId` — id для нового пузыря (используется только при `added`).
 *
 * - Ключ есть: входящее и «с телефона» — игнор; `outgoingApi` — у существующего своего
 *   сообщения серверный `timestamp` и статус `sent`, новый пузырь не создаётся.
 * - Ключа нет: новое сообщение (`in` для входящих, `out` со статусом `sent` для своих), ключ
 *   записывается в индекс. Если ответ sendMessage придёт позже, оптимистичное сообщение
 *   удалится (`applySendSuccess`, EC-D2).
 */
export function mergeNotificationMessage(
  data: ChatMessages,
  input: NotificationMessage,
  localId: string,
): MergeResult {
  const key = messageKey(input.chatId, input.idMessage);
  const existingId = data.index[key];
  const i = existingId === undefined ? -1 : findByLocalId(data, existingId);
  if (i >= 0) {
    const existing = data.messages[i];
    if (!existing) return { data, outcome: 'duplicate', message: null };
    if (input.source !== 'outgoingApi' || existing.direction !== 'out')
      return { data, outcome: 'duplicate', message: existing };
    if (existing.status === 'sent' && existing.timestamp === input.timestamp)
      return { data, outcome: 'duplicate', message: existing };
    const confirmed: StoredMessage = {
      ...withoutErrorText(existing),
      timestamp: input.timestamp,
      status: 'sent',
    };
    return { data: replaceAt(data, i, confirmed), outcome: 'confirmed', message: confirmed };
  }
  const direction = input.source === 'incoming' ? 'in' : 'out';
  const message: StoredMessage = {
    localId,
    chatId: input.chatId,
    idMessage: input.idMessage,
    direction,
    text: input.unsupported ? '' : input.text,
    timestamp: input.timestamp,
    ...(direction === 'out' ? { status: 'sent' as const } : {}),
    ...(input.unsupported ? { unsupported: true } : {}),
  };
  return {
    data: { messages: [...data.messages, message], index: { ...data.index, [key]: localId } },
    outcome: 'added',
    message,
  };
}

export interface OptimisticInput {
  localId: string;
  chatId: ChatId;
  text: string;
  /** `Date.now() / 1000` (§6.2). */
  timestamp: UnixSeconds;
}

/** §6.3 п. 1: оптимистичное сообщение «отправляется», без ключа. */
export function addOptimisticMessage(data: ChatMessages, input: OptimisticInput): ChatMessages {
  const message: StoredMessage = { ...input, direction: 'out', status: 'sending' };
  return { messages: [...data.messages, message], index: data.index };
}

/** `sent` — idMessage присвоен; `merged` — уведомление пришло раньше, оптимистичное удалено. */
export type SendSuccessOutcome = 'sent' | 'merged' | 'ignored';

/**
 * §6.3 п. 2: ответ `200 {idMessage}`. Применяется только к сообщению «отправляется» (ответ
 * после выхода или для удалённого сообщения игнорируется).
 */
export function applySendSuccess(
  data: ChatMessages,
  localId: string,
  idMessage: string,
): { data: ChatMessages; outcome: SendSuccessOutcome } {
  const i = findByLocalId(data, localId);
  const message = data.messages[i];
  if (message?.status !== 'sending') return { data, outcome: 'ignored' };
  const key = messageKey(message.chatId, idMessage);
  const owner = data.index[key];
  if (owner !== undefined && owner !== localId && findByLocalId(data, owner) >= 0) {
    // EC-D2: `outgoingAPIMessageReceived` пришёл раньше ответа — остаётся пузырь из уведомления.
    return {
      data: { messages: data.messages.filter((m) => m.localId !== localId), index: data.index },
      outcome: 'merged',
    };
  }
  const sent: StoredMessage = { ...withoutErrorText(message), idMessage, status: 'sent' };
  const next = replaceAt(data, i, sent);
  return { data: { ...next, index: { ...data.index, [key]: localId } }, outcome: 'sent' };
}

/** §6.3 п. 4: ошибка sendMessage — «не отправлено» с текстом под пузырём (п. 3.4–3.6). */
export function applySendFailure(
  data: ChatMessages,
  localId: string,
  errorText: string,
): ChatMessages {
  const i = findByLocalId(data, localId);
  const message = data.messages[i];
  if (message?.status !== 'sending') return data;
  return replaceAt(data, i, { ...message, status: 'error', errorText });
}

/** «Повторить» (п. 3.4, EC-D6): то же сообщение (`localId`) снова «отправляется». */
export function startRetry(data: ChatMessages, localId: string): ChatMessages {
  const i = findByLocalId(data, localId);
  const message = data.messages[i];
  if (message?.status !== 'error') return data;
  return replaceAt(data, i, { ...withoutErrorText(message), status: 'sending' });
}

/** Выход (§6.3 п. 5, EC-D5): «отправляется» → «не отправлено», «Статус неизвестен…». */
export function failSendingInChat(data: ChatMessages): ChatMessages {
  const messages = failSendingMessages(data.messages);
  return messages === data.messages ? data : { messages: [...messages], index: data.index };
}

/** Порядок показа (§6.2, EC-O2): по `timestamp`, при равенстве — по порядку поступления. */
export function sortMessages(messages: readonly StoredMessage[]): StoredMessage[] {
  // Array.prototype.sort устойчива (ES2019), поэтому равные остаются в порядке поступления.
  return [...messages].sort((a, b) => a.timestamp - b.timestamp);
}

export function findMessage(data: ChatMessages, localId: string): StoredMessage | undefined {
  return data.messages.find((m) => m.localId === localId);
}

// ---------- Редьюсер лент всех чатов сессии ----------

export interface MessagesState {
  /** Загруженные ленты; чата нет — лента ещё не прочитана из localStorage (или пуста). */
  byChat: Readonly<Record<ChatId, ChatMessages>>;
}

export type MessagesAction =
  /** Ленты прочитаны из localStorage (вход, захват замка — EC-S10). Заменяют загруженные. */
  | { type: 'chatsLoaded'; byChat: Readonly<Record<ChatId, ChatMessages>> }
  | { type: 'optimisticAdded'; message: OptimisticInput }
  | { type: 'sendSucceeded'; chatId: ChatId; localId: string; idMessage: string }
  | { type: 'sendFailed'; chatId: ChatId; localId: string; errorText: string }
  | { type: 'retryStarted'; chatId: ChatId; localId: string }
  | { type: 'notificationMerged'; message: NotificationMessage; localId: string }
  /** Конец сессии: все «отправляется» → «не отправлено» (EC-D5). */
  | { type: 'sendingFailed' };

const EMPTY: ChatMessages = Object.freeze(emptyChatMessages());

export function createInitialMessagesState(): MessagesState {
  return { byChat: {} };
}

/** Лента чата (пустая, если сообщений нет). Возвращает один и тот же пустой объект. */
export function selectChatMessages(state: MessagesState, chatId: ChatId): ChatMessages {
  return state.byChat[chatId] ?? EMPTY;
}

function updateChat(
  state: MessagesState,
  chatId: ChatId,
  update: (data: ChatMessages) => ChatMessages,
): MessagesState {
  const before = selectChatMessages(state, chatId);
  const after = update(before);
  if (after === before) return state;
  return { byChat: { ...state.byChat, [chatId]: after } };
}

export function messagesReducer(state: MessagesState, action: MessagesAction): MessagesState {
  switch (action.type) {
    case 'chatsLoaded':
      return { byChat: { ...state.byChat, ...action.byChat } };
    case 'optimisticAdded':
      return updateChat(state, action.message.chatId, (d) =>
        addOptimisticMessage(d, action.message),
      );
    case 'sendSucceeded':
      return updateChat(
        state,
        action.chatId,
        (d) => applySendSuccess(d, action.localId, action.idMessage).data,
      );
    case 'sendFailed':
      return updateChat(state, action.chatId, (d) =>
        applySendFailure(d, action.localId, action.errorText),
      );
    case 'retryStarted':
      return updateChat(state, action.chatId, (d) => startRetry(d, action.localId));
    case 'notificationMerged':
      return updateChat(
        state,
        action.message.chatId,
        (d) => mergeNotificationMessage(d, action.message, action.localId).data,
      );
    case 'sendingFailed': {
      let changed = false;
      const byChat: Record<ChatId, ChatMessages> = {};
      for (const [chatId, data] of Object.entries(state.byChat)) {
        const next = failSendingInChat(data);
        if (next !== data) changed = true;
        byChat[chatId] = next;
      }
      return changed ? { byChat } : state;
    }
  }
}

/**
 * Локальный id сообщения. `crypto.randomUUID` есть только в безопасном контексте (https,
 * localhost); на `http://<ip>` — запасной вариант на `crypto.getRandomValues`.
 */
export function createLocalId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (typeof c?.randomUUID === 'function') return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c) c.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
