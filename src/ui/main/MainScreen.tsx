import { useState } from 'react';
import { SESSION_TEXTS, selectCanWrite } from '../../store';
import { Banners } from '../banners/Banners';
import { ChatList } from '../chats/ChatList';
import { ChatPane } from '../chats/ChatPane';
import { NewChatDialog } from '../chats/NewChatDialog';
import { useChats } from '../chats/chatsContext';
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
      {showDialog ? (
        <NewChatDialog
          onClose={() => {
            setDialogOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
