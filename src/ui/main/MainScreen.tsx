import { useRef, useState } from 'react';
import { SESSION_TEXTS, selectCanWrite } from '../../store';
import { Banners } from '../banners/Banners';
import { ChatList } from '../chats/ChatList';
import { ChatPane } from '../chats/ChatPane';
import { NewChatDialog, type NewChatCloseReason } from '../chats/NewChatDialog';
import { useChats } from '../chats/chatsContext';
import { isNarrowViewport } from '../format';
import { UI_TEXTS } from '../texts';
import { useSession } from '../session/sessionContext';

/**
 * Основной экран (§4.0 п. 2): слева «Сообщения» (Р-28), idInstance и «Выйти», «Новый чат» и
 * список чатов (F3); справа баннеры над лентой (§4.0 п. 4) и окно чата (F4).
 * Узкий экран (< 768 px, Д-6e): одна колонка — список или чат (`main--chat-open`), баннеры
 * над обеими. Должен быть внутри `ChatsProvider`.
 */
export function MainScreen() {
  const { state, controller } = useSession();
  const { state: chats } = useChats();
  const canWrite = selectCanWrite(state);
  const [dialogOpen, setDialogOpen] = useState(false);
  // Вкладка стала «только чтение» — диалог закрывается (Р-12, EC-S4).
  const showDialog = dialogOpen && canWrite;
  const chatOpen = chats.selectedChatId !== null;
  const newChatRef = useRef<HTMLButtonElement>(null);

  // Фокус после диалога: «Отмена» / Esc — обратно на «Новый чат»; чат создан — в поле ввода
  // (на узком экране его забирает «Назад», ChatPane).
  const closeDialog = (reason: NewChatCloseReason) => {
    setDialogOpen(false);
    requestAnimationFrame(() => {
      if (reason === 'cancel') {
        newChatRef.current?.focus();
        return;
      }
      if (isNarrowViewport()) return;
      document.querySelector<HTMLTextAreaElement>('[data-testid="composer-input"]')?.focus();
    });
  };
  return (
    <div
      className={`main${chatOpen ? ' main--chat-open' : ''}`}
      data-testid="main-screen"
      data-pane={chatOpen ? 'chat' : 'list'}
    >
      <aside className="sidebar">
        <header className="sidebar__header">
          <div className="sidebar__top">
            <h1 className="sidebar__title" data-testid="sidebar-title">
              {UI_TEXTS.messagesLabel}
            </h1>
            <button
              ref={newChatRef}
              type="button"
              className="button button--primary button--compact sidebar__new-chat"
              disabled={!canWrite}
              title={canWrite ? undefined : SESSION_TEXTS.otherTabReadOnly}
              onClick={() => {
                setDialogOpen(true);
              }}
              data-testid="new-chat-button"
            >
              <span aria-hidden="true">+</span> {UI_TEXTS.newChat}
            </button>
          </div>
          {canWrite ? null : (
            <p className="hint hint--readonly" data-testid="new-chat-readonly-hint">
              {SESSION_TEXTS.otherTabReadOnly}
            </p>
          )}
          <div className="sidebar__account">
            <span className="sidebar__account-label">{UI_TEXTS.instanceLabel}</span>
            <span className="sidebar__instance" data-testid="session-idInstance">
              {state.idInstance}
            </span>
            <button
              type="button"
              className="button button--ghost button--compact sidebar__logout"
              onClick={() => {
                controller.logout();
              }}
              data-testid="logout-button"
            >
              {UI_TEXTS.logout}
            </button>
          </div>
        </header>
        <ChatList />
      </aside>
      <Banners />
      <section className="content">
        <ChatPane />
      </section>
      {showDialog ? <NewChatDialog onClose={closeDialog} /> : null}
    </div>
  );
}
