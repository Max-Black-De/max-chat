import type { ReactNode } from 'react';
import { config } from '../config';
import { LoginScreen } from './auth/LoginScreen';
import { ChatsProvider } from './chats/ChatsProvider';
import { MainScreen } from './main/MainScreen';
import { SessionProvider, type SessionProviderDeps } from './session/SessionProvider';
import { useSession } from './session/sessionContext';

function Screens({ defaultApiUrl }: { defaultApiUrl: string }) {
  const { state } = useSession();
  if (state.status === 'loggedIn')
    return (
      // Чаты — на сессию: новая сессия (другой инстанс) начинает с чистого состояния (EC-D7, EC-S7).
      <ChatsProvider key={state.generation}>
        <MainScreen />
      </ChatsProvider>
    );
  // Форма пересоздаётся при смене предзаполнения (восстановление, ошибка входа, выход).
  return <LoginScreen key={state.prefillVersion} defaultApiUrl={defaultApiUrl} />;
}

/**
 * Корневой компонент. `deps` — для тестов (мок `fetch`, хранилища, таймеры), `children` —
 * компоненты без разметки внутри контекста сессии;
 * учётные данные приходят только из формы входа (ОР-1, НФТ-3).
 */
export function App({ deps, children }: { deps?: SessionProviderDeps; children?: ReactNode }) {
  const defaultApiUrl = deps?.defaultApiUrl ?? config.defaultApiUrl;
  return (
    <SessionProvider deps={deps ?? {}}>
      <Screens defaultApiUrl={defaultApiUrl} />
      {/* Фоновые компоненты внутри сессии (например, опрос F5) и пробы в тестах. */}
      {children}
    </SessionProvider>
  );
}
