import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  chatsReducer,
  createInitialChatsState,
  loadChats,
  SESSION_TEXTS,
  resolveNewChat,
  saveChats,
  savePhoneCache,
  selectCanWrite,
  type AppStorage,
  type ChatsState,
} from '../../store';
import { useSession } from '../session/sessionContext';
import { ChatsContext, type ChatsContextValue } from './chatsContext';

function initState(storage: AppStorage | null): ChatsState {
  const state = createInitialChatsState();
  return storage ? { ...state, ...loadChats(storage) } : state;
}

/**
 * Чаты текущей сессии (F3). Монтируется на сессию (`key` = номер сессии), поэтому данные
 * разных инстансов и сессий не смешиваются (EC-D7, EC-S7).
 *
 * Запись в localStorage — через `AppStorage` после каждого изменения: во вкладке только на
 * чтение она остаётся в памяти (EC-S4, EC-S10), при сбое — режим памяти и баннер (EC-D11).
 */
export function ChatsProvider({
  children,
  now = Date.now,
}: {
  children: ReactNode;
  /** Часы (мс) — для тестов. */
  now?: () => number;
}) {
  const { state: session, controller } = useSession();
  const [storage] = useState(() => controller.getStorage());
  const [state, dispatch] = useReducer(chatsReducer, storage, initState);

  const saved = useRef({ chats: state.chats, phoneCache: state.phoneCache });
  const latest = useRef({ state, session });
  useEffect(() => {
    latest.current = { state, session };
  });

  useEffect(() => {
    if (!storage) return;
    if (state.chats !== saved.current.chats) {
      saveChats(storage, state.chats);
      saved.current.chats = state.chats;
    }
    if (state.phoneCache !== saved.current.phoneCache) {
      savePhoneCache(storage, state.phoneCache);
      saved.current.phoneCache = state.phoneCache;
    }
  }, [storage, state.chats, state.phoneCache]);

  const reload = useCallback(() => {
    if (!storage) return;
    const loaded = loadChats(storage);
    saved.current = loaded;
    dispatch({ type: 'loaded', ...loaded });
  }, [storage]);

  // Вкладка захватила замок (readOnly → false): перечитать localStorage (EC-S10, ВА-16).
  const wasReadOnly = useRef(session.readOnly);
  useEffect(() => {
    if (wasReadOnly.current && !session.readOnly) reload();
    wasReadOnly.current = session.readOnly;
  }, [session.readOnly, reload]);

  // Выход: «отправляется» → «не отправлено» в сохранённых лентах (ВА-20, §6.3 п. 5).
  useEffect(
    () =>
      controller.onSessionEnd(() => {
        if (storage) loadChats(storage);
      }),
    [controller, storage],
  );

  const createChat = useCallback<ChatsContextValue['createChat']>(
    async (input, signal) => {
      const { state: chats, session: s } = latest.current;
      const result = await resolveNewChat(input, {
        state: chats,
        client: controller.getClient(),
        canWrite: selectCanWrite(s),
        ...(signal ? { signal } : {}),
      });
      if (!result.ok) return result;
      // Пока шёл запрос, вкладка могла стать «только чтение» — тогда чат не создаём (EC-S4).
      if (!selectCanWrite(latest.current.session))
        return { ok: false, reason: 'readOnly', error: SESSION_TEXTS.otherTabReadOnly };
      {
        dispatch({ type: 'phoneCached', phone: result.phone, chatId: result.chatId });
        dispatch({
          type: 'chatOpened',
          chatId: result.chatId,
          phone: result.phone,
          now: Math.floor(now() / 1000),
        });
      }
      return result;
    },
    [controller, now],
  );

  const value = useMemo<ChatsContextValue>(
    () => ({
      state,
      createChat,
      selectChat: (chatId) => {
        dispatch({ type: 'chatSelected', chatId });
      },
      reportActivity: (chatId, message, countUnread) => {
        dispatch({ type: 'chatActivity', chatId, message, countUnread });
      },
      reportChatName: (chatId, chatName) => {
        dispatch({ type: 'chatNameReceived', chatId, chatName });
      },
      reload,
    }),
    [state, createChat, reload],
  );
  return <ChatsContext.Provider value={value}>{children}</ChatsContext.Provider>;
}
