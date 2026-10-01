import { useEffect, useMemo, useReducer, useState, type ReactNode } from 'react';
import {
  createInitialSessionState,
  createSessionController,
  sessionReducer,
  type SessionControllerDeps,
} from '../../store';
import { config } from '../../config';
import type { PollingDeps } from '../polling/pollingDeps';
import { SessionContext, type SessionContextValue } from './sessionContext';

export type SessionProviderDeps = Omit<SessionControllerDeps, 'dispatch'> & {
  /** Есть ли Web Locks API (по умолчанию — проверка `navigator.locks`). */
  locksSupported?: boolean;
  defaultApiUrl?: string;
  /** Опрос очереди F5 (для тестов): замки, пауза backoff, лог. */
  polling?: PollingDeps;
};

function hasWebLocks(): boolean {
  return typeof navigator !== 'undefined' && 'locks' in navigator && Boolean(navigator.locks);
}

/**
 * Сессия приложения (Р-9: Context + useReducer). Восстанавливает вход из sessionStorage при
 * монтировании (п. 1.9), слушает `offline` (п. 4.3) и проверяет Web Locks (EC-S5).
 */
export function SessionProvider({
  children,
  deps = {},
}: {
  children: ReactNode;
  deps?: SessionProviderDeps;
}) {
  // `polling` уходит в контроллер вместе с остальным и там не читается (его берёт App → Poller).
  const { locksSupported: locksOverride, defaultApiUrl, ...controllerDeps } = deps;
  const [state, dispatch] = useReducer(sessionReducer, undefined, () =>
    createInitialSessionState({ apiUrl: defaultApiUrl ?? config.defaultApiUrl }),
  );
  const [controller] = useState(() => createSessionController({ ...controllerDeps, dispatch }));
  const locksSupported = locksOverride ?? hasWebLocks();

  useEffect(() => {
    void controller.restore();
  }, [controller]);

  useEffect(() => {
    if (!locksSupported) dispatch({ type: 'locksUnsupported' });
  }, [locksSupported]);

  useEffect(() => {
    const onOffline = () => {
      dispatch({ type: 'browserOffline' });
    };
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const value = useMemo<SessionContextValue>(() => ({ state, controller }), [state, controller]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
