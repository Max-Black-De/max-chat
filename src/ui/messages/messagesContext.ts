import { createContext, useContext } from 'react';
import type { ChatMessages, MergeOutcome, MessagesState, NotificationMessage } from '../../store';

/** Итог `applyNotification`: `unknownChat` — чата нет в списке, лента не меняется (Р-5, EC-N2/N3). */
export type ApplyNotificationOutcome = MergeOutcome | 'unknownChat';

export interface MessagesContextValue {
  state: MessagesState;
  /** Лента чата; не загружена — пустая (загрузка — `ensureLoaded`). */
  getChatMessages: (chatId: string) => ChatMessages;
  /** Прочитать ленту из localStorage, если её ещё нет в памяти. */
  ensureLoaded: (chatId: string) => void;
  /**
   * Отправить текст (п. 3.1–3.6). `false` — не отправлено сразу: вкладка «только чтение»
   * (EC-S4), пустой текст или длиннее 4000 (п. 3.5). Текст отправляется как есть.
   */
  send: (chatId: string, text: string) => boolean;
  /** «Повторить» у сообщения «не отправлено» (EC-D6). */
  retry: (chatId: string, localId: string) => void;
  /**
   * Для F5: уведомление о сообщении (§6.3) — слияние, сохранение, превью и счётчик
   * непрочитанных в списке чатов (входящие и заглушки — растёт, свои — нет, п. 5.2).
   * Синхронно возвращает итог, в том числе для нескольких вызовов подряд.
   */
  applyNotification: (message: NotificationMessage) => ApplyNotificationOutcome;
}

export const MessagesContext = createContext<MessagesContextValue | null>(null);

export function useMessages(): MessagesContextValue {
  const value = useContext(MessagesContext);
  if (!value) throw new Error('useMessages must be used inside <MessagesProvider>');
  return value;
}
