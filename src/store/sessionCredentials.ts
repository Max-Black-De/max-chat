/**
 * Учётные данные сессии — только в sessionStorage вкладки (Р-2, НФТ-3): до закрытия вкладки,
 * никогда в localStorage, env или URL. Каждое обращение — в `try` (приватный режим, запреты).
 */
import { STORAGE_PREFIX } from './constants';

/** Ключ sessionStorage. Версия — как у разделов localStorage (EC-D8). */
export const SESSION_CREDENTIALS_KEY = `${STORAGE_PREFIX}:session:v1`;

export interface SessionCredentials {
  idInstance: string;
  apiTokenInstance: string;
  apiUrl: string;
}

export type SessionBackend = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function defaultBackend(): SessionBackend | null {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

function isCredentials(v: unknown): v is SessionCredentials {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.idInstance === 'string' &&
    typeof r.apiTokenInstance === 'string' &&
    typeof r.apiUrl === 'string' &&
    r.idInstance !== '' &&
    r.apiTokenInstance !== ''
  );
}

export function loadCredentials(
  backend: SessionBackend | null = defaultBackend(),
): SessionCredentials | null {
  if (!backend) return null;
  try {
    const raw = backend.getItem(SESSION_CREDENTIALS_KEY);
    if (raw === null) return null;
    const v: unknown = JSON.parse(raw);
    return isCredentials(v)
      ? { idInstance: v.idInstance, apiTokenInstance: v.apiTokenInstance, apiUrl: v.apiUrl }
      : null;
  } catch {
    return null;
  }
}

/** `true` — сохранено. Неудача не мешает работе: сессия просто не переживёт перезагрузку. */
export function saveCredentials(
  creds: SessionCredentials,
  backend: SessionBackend | null = defaultBackend(),
): boolean {
  if (!backend) return false;
  try {
    backend.setItem(
      SESSION_CREDENTIALS_KEY,
      JSON.stringify({
        idInstance: creds.idInstance,
        apiTokenInstance: creds.apiTokenInstance,
        apiUrl: creds.apiUrl,
      }),
    );
    return true;
  } catch {
    return false;
  }
}

export function clearCredentials(backend: SessionBackend | null = defaultBackend()): void {
  if (!backend) return;
  try {
    backend.removeItem(SESSION_CREDENTIALS_KEY);
  } catch {
    // нечего делать
  }
}
