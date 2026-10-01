import { chatSubtitle, chatTitle, selectSelectedChat } from '../../store';
import { UI_TEXTS } from '../texts';
import { useChats } from './chatsContext';

/**
 * Правая колонка (§4.0 п. 2): шапка выбранного чата (Р-15) или заглушка. Лента и ввод — F4
 * (встраиваются в `chat-window` вместо `chat-body`).
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
      <div className="chat-body" data-testid="chat-body" />
    </div>
  );
}
