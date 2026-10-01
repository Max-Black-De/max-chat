import type { ReactNode } from 'react';
import { config } from '../config';
import { LoginScreen } from './auth/LoginScreen';
import { ChatsProvider } from './chats/ChatsProvider';
import { MainScreen } from './main/MainScreen';
import { MessagesProvider } from './messages/MessagesProvider';
import { SessionProvider, type SessionProviderDeps } from './session/SessionProvider';
import { useSession } from './session/sessionContext';

function Screens({
  defaultApiUrl,
  sessionChildren,
}: {
  defaultApiUrl: string;
  sessionChildren?: ReactNode;
}) {
  const { state } = useSession();
  if (state.status === 'loggedIn')
    return (
      // Чаты и ленты — на сессию: новая сессия (другой инстанс) начинает с чистого состояния
      // (EC-D7, EC-S7), ответы прошлой сессии не применяются (§6.1 п. 3).
      <ChatsProvider key={state.generation}>
        <MessagesProvider>
          <MainScreen />
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
 * вошедшей сессии (опрос F5: `useChats`, `useMessages`; пробы в тестах);
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
  return (
    <SessionProvider deps={deps ?? {}}>
      <Screens defaultApiUrl={defaultApiUrl} sessionChildren={sessionChildren} />
      {/* Фоновые компоненты внутри сессии (например, опрос F5) и пробы в тестах. */}
      {children}
    </SessionProvider>
  );
}
