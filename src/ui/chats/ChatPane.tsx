import { chatSubtitle, chatTitle, selectSelectedChat } from '../../store';
import { Composer } from '../messages/Composer';
import { MessageList } from '../messages/MessageList';
import { UI_TEXTS } from '../texts';
import { useChats } from './chatsContext';

/**
 * Правая колонка (§4.0 п. 2): шапка выбранного чата (Р-15), лента и поле ввода (F4) или
 * заглушка. Лента и поле монтируются на чат: прокрутка и черновик не переходят в другой чат.
 */
export function ChatPane() {
  const { state } = useChats();
  const chat = selectSelectedChat(state);
  if (!chat)
    return (
      <div className="content__empty" data-testid="chat-empty">
        {UI_TEXTS.emptyChat}
      </div>
    );
  const subtitle = chatSubtitle(chat);
  return (
    <div className="chat-window" data-testid="chat-window" data-chat-id={chat.chatId}>
      <header className="chat-header" data-testid="chat-header">
        <h2 className="chat-header__title" dir="auto" data-testid="chat-title">
          {chatTitle(chat)}
        </h2>
        {subtitle ? (
          <span className="chat-header__subtitle" data-testid="chat-subtitle">
            {subtitle}
          </span>
        ) : null}
      </header>
      <MessageList key={`list-${chat.chatId}`} chatId={chat.chatId} />
      <Composer key={`composer-${chat.chatId}`} chatId={chat.chatId} />
    </div>
  );
}
