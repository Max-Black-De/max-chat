import { createContext, useContext } from 'react';
import type { ChatLastMessage, ChatsState, NewChatResult } from '../../store';

export interface ChatsContextValue {
  state: ChatsState;
  /** «Новый чат»: кеш → checkAccount → чат создан или открыт существующий (ОР-2). */
  createChat: (input: string, signal?: AbortSignal) => Promise<NewChatResult>;
  /** Открыть чат из списка (сбрасывает счётчик, п. 5.2). `null` — закрыть. */
  selectChat: (chatId: string | null) => void;
  /** Для F4/F5: сообщение в чате — превью, сортировка, счётчик непрочитанных. */
  reportActivity: (chatId: string, message: ChatLastMessage, countUnread: boolean) => void;
  /** Для F5: `senderData.chatName` личного чата (Р-15). */
  reportChatName: (chatId: string, chatName: string) => void;
  /** Перечитать localStorage (вкладка захватила замок — EC-S10; вызывается и сам при смене readOnly). */
  reload: () => void;
}

export const ChatsContext = createContext<ChatsContextValue | null>(null);

export function useChats(): ChatsContextValue {
  const value = useContext(ChatsContext);
  if (!value) throw new Error('useChats must be used inside <ChatsProvider>');
  return value;
}
