import { chatTitle, selectSortedChats } from '../../store';
import { formatTime, isoDateTime, previewText } from '../format';
import { UI_TEXTS } from '../texts';
import { Avatar } from './Avatar';
import { useChats } from './chatsContext';

/**
 * Список чатов (§4.0 п. 2, п. 5.2): заголовок (Р-15), превью последнего сообщения, время
 * (Р-21), счётчик непрочитанных. Порядок — по последнему сообщению, иначе по созданию (ВА-15).
 */
export function ChatList() {
  const { state, selectChat } = useChats();
  const chats = selectSortedChats(state);
  if (chats.length === 0)
    return (
      <p className="chat-list__empty" data-testid="chat-list-empty">
        {UI_TEXTS.noChats}
      </p>
    );
  return (
    <ul className="chat-list" data-testid="chat-list" aria-label={UI_TEXTS.chatListLabel}>
      {chats.map((chat) => {
        const selected = chat.chatId === state.selectedChatId;
        const last = chat.lastMessage;
        const title = chatTitle(chat);
        return (
          <li key={chat.chatId}>
            <button
              type="button"
              className={`chat-item${selected ? ' chat-item--selected' : ''}`}
              aria-current={selected ? 'true' : undefined}
              onClick={() => {
                selectChat(chat.chatId);
              }}
              data-testid="chat-item"
              data-chat-id={chat.chatId}
            >
              <Avatar chatId={chat.chatId} title={title} />
              <span className="chat-item__body">
                <span className="chat-item__row">
                  <span className="chat-item__title" dir="auto" data-testid="chat-item-title">
                    {title}
                  </span>
                  {last ? (
                    <time
                      className="chat-item__time"
                      dateTime={isoDateTime(last.timestamp)}
                      data-testid="chat-item-time"
                    >
                      {formatTime(last.timestamp)}
                    </time>
                  ) : null}
                </span>
                <span className="chat-item__row">
                  {/* EC-U5: dir="auto" — у элемента текста, не у контейнера. */}
                  <span className="chat-item__preview" dir="auto" data-testid="chat-item-preview">
                    {last ? previewText(last.text) : ''}
                  </span>
                  {chat.unread > 0 ? (
                    <span
                      className="chat-item__unread"
                      data-testid="chat-item-unread"
                      aria-label={`${UI_TEXTS.unreadLabel}: ${String(chat.unread)}`}
                    >
                      {chat.unread > 99 ? '99+' : chat.unread}
                    </span>
                  ) : null}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
