import { useState } from 'react';
import { SESSION_TEXTS, selectCanWrite } from '../../store';
import { Banners } from '../banners/Banners';
import { ChatList } from '../chats/ChatList';
import { ChatPane } from '../chats/ChatPane';
import { NewChatDialog } from '../chats/NewChatDialog';
import { UI_TEXTS } from '../texts';
import { useSession } from '../session/sessionContext';

/**
 * Основной экран (§4.0 п. 2): шапка с idInstance и «Выйти», «Новый чат», список чатов (F3),
 * баннеры и окно чата (F4). Должен быть внутри `ChatsProvider`.
 */
export function MainScreen() {
  const { state, controller } = useSession();
  const canWrite = selectCanWrite(state);
  const [dialogOpen, setDialogOpen] = useState(false);
  // Вкладка стала «только чтение» — диалог закрывается (Р-12, EC-S4).
  const showDialog = dialogOpen && canWrite;
  return (
    <div className="main" data-testid="main-screen">
      <aside className="sidebar">
        <header className="sidebar__header">
          <span className="sidebar__instance" data-testid="session-idInstance">
            {state.idInstance}
          </span>
          <button
            type="button"
            className="button button--ghost"
            onClick={() => {
              controller.logout();
            }}
            data-testid="logout-button"
          >
            {UI_TEXTS.logout}
          </button>
        </header>
        <button
          type="button"
          className="button button--primary sidebar__new-chat"
          disabled={!canWrite}
          title={canWrite ? undefined : SESSION_TEXTS.otherTabReadOnly}
          onClick={() => {
            setDialogOpen(true);
          }}
          data-testid="new-chat-button"
        >
          {UI_TEXTS.newChat}
        </button>
        {canWrite ? null : (
          <p className="sidebar__hint" data-testid="new-chat-readonly-hint">
            {SESSION_TEXTS.otherTabReadOnly}
          </p>
        )}
        <ChatList />
      </aside>
      <section className="content">
        <Banners />
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
