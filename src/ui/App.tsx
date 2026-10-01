import { useState, type ReactNode } from 'react';
import { config } from '../config';
import { LoginScreen } from './auth/LoginScreen';
import { ChatsProvider } from './chats/ChatsProvider';
import { MainScreen } from './main/MainScreen';
import { MessagesProvider } from './messages/MessagesProvider';
import type { LockManagerLike } from '../polling';
import { Poller } from './polling/Poller';
import { resolvePollLocks, type PollingDeps } from './polling/pollingDeps';
import { SessionProvider, type SessionProviderDeps } from './session/SessionProvider';
import { useSession } from './session/sessionContext';

function Screens({
  defaultApiUrl,
  sessionChildren,
  polling,
}: {
  defaultApiUrl: string;
  sessionChildren?: ReactNode;
  polling: Omit<PollingDeps, 'locks'> & { locks: LockManagerLike | null };
}) {
  const { state } = useSession();
  if (state.status === 'loggedIn')
    return (
      // Чаты и ленты — на сессию: новая сессия (другой инстанс) начинает с чистого состояния
      // (EC-D7, EC-S7), ответы прошлой сессии не применяются (§6.1 п. 3).
      <ChatsProvider key={state.generation}>
        <MessagesProvider>
          <MainScreen />
          {/* Опрос очереди F5: замок вкладки и цикл receive → handle → delete (§6.1). */}
          {polling.enabled === false ? null : (
            <Poller
              locks={polling.locks}
              {...(polling.sleep ? { sleep: polling.sleep } : {})}
              {...(polling.warn ? { warn: polling.warn } : {})}
            />
          )}
          {sessionChildren}
        </MessagesProvider>
      </ChatsProvider>
    );
  // Форма пересоздаётся при смене предзаполнения (восстановление, ошибка входа, выход).
  return <LoginScreen key={state.prefillVersion} defaultApiUrl={defaultApiUrl} />;
}

/**
 * Корневой компонент. `deps` — для тестов (мок `fetch`, хранилища, таймеры), `children` —
 * компоненты без разметки внутри контекста сессии, `sessionChildren` — внутри чатов и лент
 * вошедшей сессии (пробы в тестах); опрос F5 (`Poller`) монтируется там же всегда;
 * учётные данные приходят только из формы входа (ОР-1, НФТ-3).
 */
export function App({
  deps,
  children,
  sessionChildren,
}: {
  deps?: SessionProviderDeps;
  children?: ReactNode;
  sessionChildren?: ReactNode;
}) {
  const defaultApiUrl = deps?.defaultApiUrl ?? config.defaultApiUrl;
  const [polling] = useState(() => ({ ...deps?.polling, locks: resolvePollLocks(deps ?? {}) }));
  return (
    <SessionProvider deps={deps ?? {}}>
      <Screens defaultApiUrl={defaultApiUrl} sessionChildren={sessionChildren} polling={polling} />
      {/* Фоновые компоненты внутри контекста сессии и пробы в тестах. */}
      {children}
    </SessionProvider>
  );
}
