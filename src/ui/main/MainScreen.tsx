import { SESSION_TEXTS, selectCanWrite } from '../../store';
import { Banners } from '../banners/Banners';
import { UI_TEXTS } from '../texts';
import { useSession } from '../session/sessionContext';

/**
 * Основной экран (§4.0 п. 2) — каркас F2: шапка с idInstance и «Выйти», баннеры, заглушка
 * чата. Список чатов, «Новый чат» (F3) и окно чата (F4) встраиваются сюда.
 */
export function MainScreen() {
  const { state, controller } = useSession();
  const canWrite = selectCanWrite(state);
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
          disabled
          title={canWrite ? undefined : SESSION_TEXTS.otherTabReadOnly}
          data-testid="new-chat-button"
        >
          {UI_TEXTS.newChat}
        </button>
      </aside>
      <section className="content">
        <Banners />
        <div className="content__empty" data-testid="chat-empty">
          {UI_TEXTS.emptyChat}
        </div>
      </section>
    </div>
  );
}
