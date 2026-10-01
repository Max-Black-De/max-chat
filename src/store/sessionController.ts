/**
 * Побочные эффекты сессии (F2): вход, восстановление после перезагрузки, getSettings, выход,
 * реакция на ошибки API в работе. Без React — React-обёртка в `ui/session/`.
 *
 * Номер сессии (`generation`) и `client.close()` отсекают поздние ответы старой сессии (EC-S7).
 */
import {
  GreenApiErrorCode,
  SETTINGS_TIMEOUT_MS,
  createGreenApiClient,
  describeError,
  isGreenApiError,
  isLoginAllowed,
  isQuotaError,
  isSessionInvalidError,
  shouldShowQuotaBanner,
  stateInstanceText,
  type GreenApiClient,
  type GreenApiClientConfig,
  type GreenApiMethod,
} from '../api';
import type { LoginPrefill, SessionAction, SettingsWarning } from './session';
import {
  clearCredentials,
  loadCredentials,
  saveCredentials,
  type SessionBackend,
  type SessionCredentials,
} from './sessionCredentials';
import { createAppStorage, type AppStorage, type StorageBackend } from './storage';

/** «Проверить снова» (П-1) неактивна ещё 1 с после ответа (ВА-6, НФТ-6: ≤ 1 rps). */
export const RECHECK_COOLDOWN_MS = 1_000;

export interface SessionTimers {
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (id: unknown) => void;
}

export interface SessionControllerDeps {
  dispatch: (action: SessionAction) => void;
  /** Фабрика клиента (для тестов). По умолчанию `createGreenApiClient`. */
  createClient?: (config: GreenApiClientConfig) => GreenApiClient;
  /** Доп. опции клиента: `fetch`, `sleep`, `timers` (для тестов). Учётные данные — только из формы. */
  clientOptions?: Omit<GreenApiClientConfig, 'apiUrl' | 'idInstance' | 'apiTokenInstance'>;
  /** sessionStorage (по умолчанию `window.sessionStorage`). */
  credentialsBackend?: SessionBackend | null;
  /** localStorage для `AppStorage` (по умолчанию `window.localStorage`). */
  storageBackend?: StorageBackend | null;
  timers?: SessionTimers;
  /** Логгер предупреждений (по умолчанию `console.warn`). Данные — только `GreenApiError.toJSON()`, без токена. */
  warn?: (message: string, data?: unknown) => void;
}

export type SessionEndReason = 'logout' | 'sessionInvalid';

export interface SessionController {
  /** Вход из формы (п. 1.3–1.7). */
  login(credentials: SessionCredentials): Promise<void>;
  /** Восстановление из sessionStorage после перезагрузки (п. 1.9). `false` — нечего восстанавливать. */
  restore(): Promise<boolean>;
  /** «Выйти» (п. 1.8). */
  logout(): void;
  /** «Проверить снова» у П-1: только getSettings (ВА-6). */
  recheckSettings(): Promise<void>;
  /**
   * Клиент текущей сессии для F3–F5 (`null` вне сессии). Каждый вызов через него сообщает
   * сессии исход: успех скрывает «Нет соединения» и «Инстанс не авторизован…», ошибки ведут к
   * баннерам и выходу (§5.4, п. 4.3).
   */
  getClient(): GreenApiClient | null;
  /** Хранилище данных текущего инстанса (`null` вне сессии). */
  getStorage(): AppStorage | null;
  /** Номер текущей сессии (EC-S7). */
  getGeneration(): number;
  /** Неопрашивающая вкладка (Р-12, EC-S4): ставит F5 по Web Lock. */
  setReadOnly(readOnly: boolean): void;
  /** Уведомление `quotaExceeded` из очереди (F5) — баннер по правилам ВА-13. */
  reportQueueQuota(): void;
  dismissQuotaBanner(): void;
  /** Закрыть П-2…П-4 (до выхода). */
  dismissWarning(warning: SettingsWarning): void;
  /** Подписка на конец сессии (F4: «отправляется» → «не отправлено», F5: стоп опроса). */
  onSessionEnd(listener: (reason: SessionEndReason) => void): () => void;
}

/** Методы очереди: их 466 — событие очереди, а не действие пользователя (§5.5, ВА-13). */
const QUEUE_METHODS: ReadonlySet<GreenApiMethod> = new Set<GreenApiMethod>([
  'receiveNotification',
  'deleteNotification',
]);

const SILENT_CODES: ReadonlySet<string> = new Set([
  GreenApiErrorCode.ABORTED,
  GreenApiErrorCode.SESSION_CLOSED,
  GreenApiErrorCode.INVALID_ARGUMENT,
  GreenApiErrorCode.CHAT_ID_NOT_ALLOWED,
]);

export function createSessionController(deps: SessionControllerDeps): SessionController {
  const { dispatch } = deps;
  const createClient = deps.createClient ?? createGreenApiClient;
  const credentialsBackend = deps.credentialsBackend;
  const timers: SessionTimers = deps.timers ?? {
    setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
    clearTimeout: (id) => {
      globalThis.clearTimeout(id as ReturnType<typeof globalThis.setTimeout>);
    },
  };
  const warn =
    deps.warn ??
    ((message: string, data?: unknown) => {
      console.warn(message, data);
    });
  const listeners = new Set<(reason: SessionEndReason) => void>();

  /** Номер попытки входа / сессии. Любой ответ с другим номером игнорируется. */
  let generation = 0;
  let raw: GreenApiClient | null = null;
  let client: GreenApiClient | null = null;
  let storage: AppStorage | null = null;
  let restoreStarted = false;
  let readOnly = false;

  const loadCreds = () =>
    credentialsBackend === undefined ? loadCredentials() : loadCredentials(credentialsBackend);
  const saveCreds = (c: SessionCredentials) =>
    credentialsBackend === undefined ? saveCredentials(c) : saveCredentials(c, credentialsBackend);
  const clearCreds = () => {
    if (credentialsBackend === undefined) clearCredentials();
    else clearCredentials(credentialsBackend);
  };

  function endSession(reason: SessionEndReason) {
    generation++;
    raw?.close();
    raw = null;
    client = null;
    storage = null;
    clearCreds();
    for (const l of [...listeners]) {
      try {
        l(reason);
      } catch {
        // подписчик не должен ломать выход
      }
    }
  }

  function report(gen: number, method: GreenApiMethod, error: unknown) {
    if (gen !== generation || !isGreenApiError(error) || SILENT_CODES.has(error.code)) return;
    if (isSessionInvalidError(error)) {
      const text = describeError(error, 'session');
      endSession('sessionInvalid');
      dispatch({ type: 'sessionInvalidated', error: text });
      return;
    }
    switch (error.code) {
      case GreenApiErrorCode.NETWORK:
      case GreenApiErrorCode.TIMEOUT:
        // «Нет соединения» считают только ошибки опроса (п. 4.3, ВА-24).
        if (method === 'receiveNotification')
          dispatch({ type: 'pollNetworkFailed', generation: gen });
        return;
      case GreenApiErrorCode.INSTANCE_NOT_READY:
        dispatch({ type: 'instanceNotReady', generation: gen });
        return;
      case GreenApiErrorCode.WEBHOOK_URL_SET:
        dispatch({ type: 'webhookUrlDetected', generation: gen });
        return;
      default:
        // ВА-13, v1.3.7: 466 на receive / delete — событие очереди (закрытый баннер не
        // возвращается), на send / checkAccount — действие пользователя (показывает снова).
        if (isQuotaError(error) && shouldShowQuotaBanner(error.quota))
          dispatch({ type: 'quotaChats', source: QUEUE_METHODS.has(method) ? 'queue' : 'user' });
        if (error.httpStatus !== undefined) dispatch({ type: 'apiHttpFailed', generation: gen });
    }
  }

  /** Обёртка клиента: исход каждого вызова — в сессию. Сам клиент (и токен) наружу не отдаётся. */
  function instrument(c: GreenApiClient, gen: number): GreenApiClient {
    async function track<T>(method: GreenApiMethod, run: () => Promise<T>): Promise<T> {
      try {
        const result = await run();
        if (gen === generation) dispatch({ type: 'apiSucceeded', generation: gen });
        return result;
      } catch (e) {
        report(gen, method, e);
        throw e;
      }
    }
    const wrapped: GreenApiClient = {
      apiUrl: c.apiUrl,
      idInstance: c.idInstance,
      getStateInstance: (o) => track('getStateInstance', () => c.getStateInstance(o)),
      getSettings: (o) => track('getSettings', () => c.getSettings(o)),
      checkAccount: (phone, o) => track('checkAccount', () => c.checkAccount(phone, o)),
      sendMessage: (p, o) => track('sendMessage', () => c.sendMessage(p, o)),
      receiveNotification: (o) => track('receiveNotification', () => c.receiveNotification(o)),
      deleteNotification: (id, o) => track('deleteNotification', () => c.deleteNotification(id, o)),
      close: () => {
        c.close();
      },
      isClosed: () => c.isClosed(),
      toString: () => c.toString(),
      toJSON: () => c.toJSON(),
    };
    return Object.freeze(wrapped);
  }

  async function loadSettings(gen: number): Promise<void> {
    const c = client;
    if (!c || gen !== generation) return;
    dispatch({ type: 'settingsStarted', generation: gen });
    try {
      const settings = await c.getSettings({ timeoutMs: SETTINGS_TIMEOUT_MS });
      if (gen === generation) dispatch({ type: 'settingsLoaded', generation: gen, settings });
    } catch (e) {
      if (gen !== generation) return;
      // Ошибка или таймаут 10 с: предупреждений нет, только console.warn без токена (§4.1).
      warn('GREEN-API getSettings failed', isGreenApiError(e) ? e.toJSON() : undefined);
      dispatch({ type: 'settingsFailed', generation: gen });
    } finally {
      timers.setTimeout(() => {
        dispatch({ type: 'recheckCooldownEnded', generation: gen });
      }, RECHECK_COOLDOWN_MS);
    }
  }

  async function authenticate(creds: SessionCredentials, mode: 'login' | 'restore') {
    const prefill: LoginPrefill = { ...creds };
    // Новая попытка отменяет прежнюю сессию и прежние попытки.
    raw?.close();
    raw = null;
    client = null;
    const gen = ++generation;
    dispatch({ type: mode === 'restore' ? 'restoreStarted' : 'loginStarted', prefill });

    let c: GreenApiClient;
    try {
      c = createClient({ ...deps.clientOptions, ...creds });
    } catch (e) {
      dispatch({ type: 'loginFailed', error: describeError(e, 'login'), prefill });
      return;
    }
    raw = c;
    let stateInstance: string;
    try {
      ({ stateInstance } = await c.getStateInstance());
    } catch (e) {
      if (gen !== generation) return;
      c.close();
      raw = null;
      const invalid = isSessionInvalidError(e);
      // п. 1.9 (ВА-5): 401/403/expired/deleted — sessionStorage очищается, токен пуст (ВА-4);
      // сеть / таймаут / CORS — поля предзаполнены, sessionStorage сохраняется, автоповтора нет.
      if (invalid) clearCreds();
      dispatch({
        type: 'loginFailed',
        error: describeError(e, 'login'),
        prefill: invalid ? { ...prefill, apiTokenInstance: '' } : prefill,
      });
      return;
    }
    if (gen !== generation) return;
    if (!isLoginAllowed(stateInstance)) {
      // п. 1.6: вход не выполняется; при восстановлении sessionStorage сохраняется (п. 1.9).
      c.close();
      raw = null;
      dispatch({
        type: 'loginFailed',
        error: stateInstanceText(stateInstance) ?? describeError(undefined, 'login'),
        prefill,
      });
      return;
    }
    saveCreds(creds);
    client = instrument(c, gen);
    storage = createAppStorage({
      idInstance: creds.idInstance,
      readOnly,
      onWriteFailure: () => {
        if (gen === generation) dispatch({ type: 'storageFailed' });
      },
      ...(deps.storageBackend !== undefined ? { backend: deps.storageBackend } : {}),
    });
    dispatch({
      type: 'loginSucceeded',
      generation: gen,
      idInstance: creds.idInstance,
      apiUrl: c.apiUrl,
      stateInstance,
    });
    // getSettings не блокирует вход (п. 1.4).
    void loadSettings(gen);
  }

  return {
    login: (credentials) => authenticate(credentials, 'login'),

    async restore() {
      if (restoreStarted) return false; // StrictMode: эффект монтирования вызывается дважды
      restoreStarted = true;
      const creds = loadCreds();
      if (!creds) return false;
      await authenticate(creds, 'restore');
      return true;
    },

    logout() {
      endSession('logout');
      dispatch({ type: 'loggedOut' });
    },

    recheckSettings: () => loadSettings(generation),

    getClient: () => client,
    getStorage: () => storage,
    getGeneration: () => generation,

    setReadOnly(value) {
      readOnly = value;
      storage?.setReadOnly(value);
      dispatch({ type: 'readOnlyChanged', readOnly: value });
    },

    reportQueueQuota() {
      dispatch({ type: 'quotaChats', source: 'queue' });
    },
    dismissQuotaBanner() {
      dispatch({ type: 'quotaDismissed' });
    },
    dismissWarning(warning) {
      dispatch({ type: 'warningDismissed', warning });
    },

    onSessionEnd(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
