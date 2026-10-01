import { useEffect, useRef } from 'react';
import { chatSubtitle, chatTitle, selectSelectedChat } from '../../store';
import { isNarrowViewport } from '../format';
import { Composer } from '../messages/Composer';
import { MessageList } from '../messages/MessageList';
import { UI_TEXTS } from '../texts';
import { Avatar } from './Avatar';
import { useChats } from './chatsContext';

/** Вернуть фокус на пункт списка после «Назад» (Д-6e): иначе он теряется на скрытой колонке. */
function focusChatItem(chatId: string) {
  requestAnimationFrame(() => {
    const items = document.querySelectorAll<HTMLButtonElement>('[data-testid="chat-item"]');
    for (const item of items) {
      if (item.dataset.chatId === chatId) {
        item.focus();
        return;
      }
    }
  });
}

/**
 * Правая колонка (§4.0 п. 2): шапка выбранного чата (Р-15), лента и поле ввода (F4) или
 * заглушка. Лента и поле монтируются на чат: прокрутка и черновик не переходят в другой чат.
 * На узком экране (Д-6e) колонка одна: в шапке кнопка «Назад» к списку, на широком она скрыта.
 */
export function ChatPane() {
  const { state, selectChat } = useChats();
  const chat = selectSelectedChat(state);
  const chatId = chat?.chatId;
  const backRef = useRef<HTMLButtonElement>(null);

  // Узкий экран: список скрылся вместе с фокусом — переносим его на «Назад».
  useEffect(() => {
    if (chatId !== undefined && isNarrowViewport()) backRef.current?.focus();
  }, [chatId]);

  if (!chat)
    return (
      <div className="content__empty" data-testid="chat-empty">
        <p className="empty-state">{UI_TEXTS.emptyChat}</p>
      </div>
    );
  const title = chatTitle(chat);
  const subtitle = chatSubtitle(chat);
  return (
    <div className="chat-window" data-testid="chat-window" data-chat-id={chat.chatId}>
      <header className="chat-header" data-testid="chat-header">
        <button
          ref={backRef}
          type="button"
          className="button button--ghost chat-header__back"
          aria-label={UI_TEXTS.backLabel}
          onClick={() => {
            selectChat(null);
            focusChatItem(chat.chatId);
          }}
          data-testid="chat-back"
        >
          <span aria-hidden="true">←</span> {UI_TEXTS.back}
        </button>
        <Avatar chatId={chat.chatId} title={title} />
        <div className="chat-header__text">
          <h2 className="chat-header__title" dir="auto" title={title} data-testid="chat-title">
            {title}
          </h2>
          {subtitle ? (
            <span className="chat-header__subtitle" data-testid="chat-subtitle">
              {subtitle}
            </span>
          ) : null}
        </div>
      </header>
      <MessageList key={`list-${chat.chatId}`} chatId={chat.chatId} />
      <Composer key={`composer-${chat.chatId}`} chatId={chat.chatId} />
    </div>
  );
}
