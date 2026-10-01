import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BANNER_TEXTS } from '../../api';
import {
  checkComposerText,
  createLocalId,
  findMessage,
  loadChatMessages,
  mergeNotificationMessage,
  messagesReducer,
  saveChatMessages,
  selectCanWrite,
  selectChatMessages,
  sendChatMessage,
  type AppStorage,
  type ChatMessages,
  type MessagesAction,
  type MessagesState,
  type StoredMessage,
} from '../../store';
import { useChats } from '../chats/chatsContext';
import { useSession } from '../session/sessionContext';
import { MessagesContext, type MessagesContextValue } from './messagesContext';

function loadAll(storage: AppStorage | null, chatIds: Iterable<string>): MessagesState {
  const byChat: Record<string, ChatMessages> = {};
  if (storage) for (const chatId of chatIds) byChat[chatId] = loadChatMessages(storage, chatId);
  return { byChat };
}

/** Превью в списке чатов: у заглушки — её текст (Р-11). */
function previewOf(m: StoredMessage): string {
  return m.unsupported ? BANNER_TEXTS.unsupportedMessage : m.text;
}

/**
 * Ленты сообщений текущей сессии (F4): отправка (ОР-3, §6.3) и слияние уведомлений для F5.
 * Монтируется внутри `ChatsProvider` (на сессию), поэтому ответы и данные прошлой сессии сюда
 * не попадают (§6.1 п. 3, EC-S7).
 *
 * Состояние — `messagesReducer`; текущее значение держится и в ref, чтобы `applyNotification`
 * и отправка видели результат предыдущего вызова сразу, без ожидания рендера. Каждая
 * изменённая лента пишется в localStorage (`messages:<chatId>`, во вкладке «только чтение» —
 * в память, EC-S4).
 */
export function MessagesProvider({
  children,
  now = Date.now,
  newId = createLocalId,
}: {
  children: ReactNode;
  /** Часы (мс) — для тестов. */
  now?: () => number;
  /** Генератор `localId` — для тестов. */
  newId?: () => string;
}) {
  const { state: session, controller } = useSession();
  const chats = useChats();
  const [storage] = useState(() => controller.getStorage());
  const [generation] = useState(() => controller.getGeneration());
  const [state, setState] = useState<MessagesState>(() =>
    loadAll(
      storage,
      chats.state.chats.map((c) => c.chatId),
    ),
  );

  const current = useRef(state);
  const saved = useRef<Readonly<Record<string, ChatMessages>>>(state.byChat);
  const latest = useRef({ session, chats });
  useEffect(() => {
    latest.current = { session, chats };
  });

  const apply = useCallback((action: MessagesAction) => {
    const next = messagesReducer(current.current, action);
    if (next === current.current) return;
    current.current = next;
    setState(next);
  }, []);

  // Запись изменённых лент (§6.3: индекс — вместе с сообщениями).
  useEffect(() => {
    if (!storage) return;
    const written: Record<string, ChatMessages> = { ...saved.current };
    for (const [chatId, data] of Object.entries(state.byChat)) {
      if (written[chatId] === data) continue;
      saveChatMessages(storage, chatId, data);
      written[chatId] = data;
    }
    saved.current = written;
  }, [storage, state.byChat]);

  // Ответ после выхода или размонтирования не обрабатывается (§6.1 п. 3); запросы отменяются.
  const alive = useRef(false);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => {
    alive.current = true;
    const controllerForSends = new AbortController();
    abort.current = controllerForSends;
    return () => {
      alive.current = false;
      controllerForSends.abort();
    };
  }, []);

  const ensureLoaded = useCallback(
    (chatId: string) => {
      if (!storage || chatId in current.current.byChat) return;
      const data = loadChatMessages(storage, chatId);
      saved.current = { ...saved.current, [chatId]: data };
      apply({ type: 'chatsLoaded', byChat: { [chatId]: data } });
    },
    [storage, apply],
  );

  // Вкладка захватила замок (readOnly → false): перечитать ленты (EC-S10, ВА-16).
  const wasReadOnly = useRef(session.readOnly);
  useEffect(() => {
    if (wasReadOnly.current && !session.readOnly && storage) {
      const ids = new Set([
        ...Object.keys(current.current.byChat),
        ...latest.current.chats.state.chats.map((c) => c.chatId),
      ]);
      const loaded = loadAll(storage, ids);
      saved.current = { ...saved.current, ...loaded.byChat };
      apply({ type: 'chatsLoaded', byChat: loaded.byChat });
    }
    wasReadOnly.current = session.readOnly;
  }, [session.readOnly, storage, apply]);

  // Выход: «отправляется» → «не отправлено» в памяти и в localStorage (§6.3 п. 5, EC-D5).
  // Слушатель вызывается после отключения хранилища в сессии — пишем в сохранённую ссылку.
  useEffect(
    () =>
      controller.onSessionEnd(() => {
        const before = current.current;
        apply({ type: 'sendingFailed' });
        if (!storage) return;
        for (const [chatId, data] of Object.entries(current.current.byChat)) {
          if (before.byChat[chatId] !== data) saveChatMessages(storage, chatId, data);
        }
        saved.current = current.current.byChat;
      }),
    [controller, storage, apply],
  );

  const attempt = useCallback(
    async (chatId: string, localId: string, text: string) => {
      const outcome = await sendChatMessage(
        controller.getClient(),
        chatId,
        text,
        abort.current?.signal,
      );
      if (!alive.current || controller.getGeneration() !== generation) return;
      if (outcome.ok)
        apply({ type: 'sendSucceeded', chatId, localId, idMessage: outcome.idMessage });
      else apply({ type: 'sendFailed', chatId, localId, errorText: outcome.errorText });
    },
    [controller, generation, apply],
  );

  const send = useCallback<MessagesContextValue['send']>(
    (chatId, text) => {
      if (!selectCanWrite(latest.current.session)) return false;
      if (!checkComposerText(text).canSend) return false;
      ensureLoaded(chatId);
      const localId = newId();
      const timestamp = now() / 1000;
      apply({ type: 'optimisticAdded', message: { localId, chatId, text, timestamp } });
      latest.current.chats.reportActivity(chatId, { text, timestamp, direction: 'out' }, false);
      void attempt(chatId, localId, text);
      return true;
    },
    [ensureLoaded, newId, now, apply, attempt],
  );

  const retry = useCallback<MessagesContextValue['retry']>(
    (chatId, localId) => {
      if (!selectCanWrite(latest.current.session)) return;
      const message = findMessage(selectChatMessages(current.current, chatId), localId);
      if (message?.status !== 'error') return;
      apply({ type: 'retryStarted', chatId, localId });
      void attempt(chatId, localId, message.text);
    },
    [apply, attempt],
  );

  const applyNotification = useCallback<MessagesContextValue['applyNotification']>(
    (message) => {
      const { chats: c } = latest.current;
      if (!c.state.chats.some((chat) => chat.chatId === message.chatId)) return 'unknownChat';
      ensureLoaded(message.chatId);
      const localId = newId();
      const result = mergeNotificationMessage(
        selectChatMessages(current.current, message.chatId),
        message,
        localId,
      );
      if (result.outcome === 'duplicate' || !result.message) return 'duplicate';
      apply({ type: 'notificationMerged', message, localId });
      const m = result.message;
      c.reportActivity(
        m.chatId,
        { text: previewOf(m), timestamp: m.timestamp, direction: m.direction },
        result.outcome === 'added' && m.direction === 'in',
      );
      return result.outcome;
    },
    [ensureLoaded, newId, apply],
  );

  const value = useMemo<MessagesContextValue>(
    () => ({
      state,
      getChatMessages: (chatId) => selectChatMessages(state, chatId),
      ensureLoaded,
      send,
      retry,
      applyNotification,
    }),
    [state, ensureLoaded, send, retry, applyNotification],
  );
  return <MessagesContext.Provider value={value}>{children}</MessagesContext.Provider>;
}
