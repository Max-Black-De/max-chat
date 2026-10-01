import { createContext, useContext } from 'react';
import type { SessionController, SessionState } from '../../store';

export interface SessionContextValue {
  state: SessionState;
  controller: SessionController;
}

export const SessionContext = createContext<SessionContextValue | null>(null);

/** Состояние сессии и контроллер (вход, выход, клиент API для F3–F5). */
export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside <SessionProvider>');
  return value;
}
