/**
 * Состояние сессии и баннеров приложения (F2): чистый редьюсер, без React и без побочных эффектов.
 * Побочные эффекты (запросы, sessionStorage) — в `sessionController.ts`.
 *
 * Выбор стора (Р-9): Context + `useReducer` — см. `README.md` раздела store.
 */
import type { InstanceSettings, StateInstanceResult } from '../api';

/** Предупреждения по getSettings (§4.1, Р-6). П-5 — только при Д-4, в MVP не вычисляется. */
export type SettingsWarning = 'P2' | 'P3' | 'P4';

/** Состояние getSettings после входа (п. 1.4, ВА-1). */
export type SettingsStatus = 'idle' | 'loading' | 'loaded' | 'failed';

export interface LoginPrefill {
  idInstance: string;
  apiUrl: string;
  /** Пусто после 401/403/expired/deleted и «Выйти» (ВА-4); при сетевой ошибке восстановления — из sessionStorage (п. 1.9). */
  apiTokenInstance: string;
}

export type SessionStatus =
  /** Экран входа. */
  | 'loggedOut'
  /** Идёт getStateInstance: кнопка «Войти» заблокирована (п. 1.3). */
  | 'checking'
  /** Восстановление из sessionStorage после перезагрузки (п. 1.9). */
  | 'restoring'
  /** Основной экран. */
  | 'loggedIn';

export interface SessionState {
  status: SessionStatus;
  /** Сессия (без токена: токен живёт только в клиенте и sessionStorage). */
  idInstance: string | null;
  apiUrl: string | null;
  stateInstance: StateInstanceResult['stateInstance'] | null;
  /** Номер сессии: растёт при каждом входе/выходе, ответы старых сессий отбрасываются (EC-S7). */
  generation: number;
  /** Текст ошибки на экране входа (п. 1.5, 1.6, §5.4). */
  loginError: string | null;
  prefill: LoginPrefill;
  /** Растёт при каждой смене `prefill` — ключ для пересоздания формы входа. */
  prefillVersion: number;

  settings: {
    status: SettingsStatus;
    /** П-1: webhookUrl не пустой — опрос не стартует, баннер не закрывается (ВА-6). */
    webhookUrlSet: boolean;
    warnings: SettingsWarning[];
    /** Закрытые пользователем П-2…П-4 (до выхода). */
    dismissed: SettingsWarning[];
    /** «Проверить снова» (П-1): неактивна во время запроса и 1 с после ответа. */
    recheckBusy: boolean;
  };

  /** Неопрашивающая вкладка (Р-12, EC-S4): только чтение. Ставит F5 по Web Lock. */
  readOnly: boolean;
  /** Нет Web Locks API (EC-S5): постоянный баннер. */
  locksUnsupported: boolean;
  /** Запись в localStorage не удалась (Р-2, EC-D8): баннер. */
  storageFailed: boolean;

  connection: {
    /** Подряд сетевых ошибок / таймаутов опроса (п. 4.3, ВА-24). */
    consecutiveFailures: number;
    /** Было событие `offline` и ещё не было успешного ответа. */
    offline: boolean;
    /** Порог достигнут — баннер держится до первого успешного ответа (HTTP-ошибки его не скрывают). */
    lost: boolean;
  };
  /** 400 «instance is starting or not authorized» в работе (§5.4) — до первого успешного ответа. */
  instanceNotReady: boolean;
  quota: {
    visible: boolean;
    /** Пользователь закрыл баннер: уведомления из очереди его больше не показывают до конца сессии (ВА-13). */
    dismissedByUser: boolean;
  };
}

export type SessionAction =
  | { type: 'restoreStarted'; prefill: LoginPrefill }
  | { type: 'loginStarted'; prefill: LoginPrefill }
  | {
      type: 'loginSucceeded';
      /** Номер сессии из контроллера: им помечаются все последующие ответы этой сессии. */
      generation: number;
      idInstance: string;
      apiUrl: string;
      stateInstance: StateInstanceResult['stateInstance'];
    }
  | { type: 'loginFailed'; error: string; prefill: LoginPrefill }
  | { type: 'settingsStarted'; generation: number }
  | { type: 'settingsLoaded'; generation: number; settings: InstanceSettings }
  | { type: 'settingsFailed'; generation: number }
  | { type: 'recheckCooldownEnded'; generation: number }
  | { type: 'warningDismissed'; warning: SettingsWarning }
  /** «Выйти» (п. 1.8). */
  | { type: 'loggedOut' }
  /** 401 / 403 / expired / deleted в работе (§5.4, ВА-3, ВА-4, ВА-19). */
  | { type: 'sessionInvalidated'; error: string }
  | { type: 'apiSucceeded'; generation: number }
  | { type: 'pollNetworkFailed'; generation: number }
  /** HTTP-ответ с ошибкой: связь есть, счётчик подряд сбрасывается (ВА-24: 4xx/5xx — не «нет соединения»). */
  | { type: 'apiHttpFailed'; generation: number }
  | { type: 'instanceNotReady'; generation: number }
  /** 400 «custom webhook url is set» на receive/delete в работе — П-1, опрос стоп (§5.4). */
  | { type: 'webhookUrlDetected'; generation: number }
  | { type: 'browserOffline' }
  | { type: 'quotaChats'; source: 'user' | 'queue' }
  | { type: 'quotaDismissed' }
  | { type: 'readOnlyChanged'; readOnly: boolean }
  | { type: 'locksUnsupported' }
  | { type: 'storageFailed' };

const EMPTY_PREFILL: LoginPrefill = { idInstance: '', apiUrl: '', apiTokenInstance: '' };

export function createInitialSessionState(prefill: Partial<LoginPrefill> = {}): SessionState {
  return {
    status: 'loggedOut',
    idInstance: null,
    apiUrl: null,
    stateInstance: null,
    generation: 0,
    loginError: null,
    prefill: { ...EMPTY_PREFILL, ...prefill },
    prefillVersion: 0,
    settings: initialSettings(),
    readOnly: false,
    locksUnsupported: false,
    storageFailed: false,
    connection: { consecutiveFailures: 0, offline: false, lost: false },
    instanceNotReady: false,
    quota: { visible: false, dismissedByUser: false },
  };
}

function initialSettings(): SessionState['settings'] {
  return { status: 'idle', webhookUrlSet: false, warnings: [], dismissed: [], recheckBusy: false };
}

/** П-1…П-4 по ответу getSettings (§4.1). Нет поля или `null` — «≠ "yes"» (EC-E5). */
export function evaluateSettings(settings: InstanceSettings): {
  webhookUrlSet: boolean;
  warnings: SettingsWarning[];
} {
  const webhookUrl = settings.webhookUrl;
  const warnings: SettingsWarning[] = [];
  if (settings.incomingWebhook !== 'yes') warnings.push('P2');
  if (settings.outgoingAPIMessageWebhook !== 'yes') warnings.push('P3');
  if (settings.outgoingMessageWebhook !== 'yes') warnings.push('P4');
  return {
    webhookUrlSet: typeof webhookUrl === 'string' && webhookUrl.trim() !== '',
    warnings,
  };
}

/** Ушла ли сессия, к которой относится ответ (EC-S7): поздние ответы игнорируются. */
function stale(state: SessionState, generation: number): boolean {
  return state.status !== 'loggedIn' || generation !== state.generation;
}

/** Выход на экран входа: всё сессионное сбрасывается, остаются признаки браузера. */
function toLoggedOut(
  state: SessionState,
  error: string | null,
  prefill: LoginPrefill,
): SessionState {
  const fresh = createInitialSessionState(prefill);
  return {
    ...fresh,
    generation: state.generation,
    prefillVersion: state.prefillVersion + 1,
    loginError: error,
    locksUnsupported: state.locksUnsupported,
    storageFailed: state.storageFailed,
  };
}

export function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case 'restoreStarted':
      return {
        ...state,
        status: 'restoring',
        loginError: null,
        prefill: action.prefill,
        prefillVersion: state.prefillVersion + 1,
      };
    case 'loginStarted':
      // Форму не пересоздаём: введённые значения и так в ней.
      return { ...state, status: 'checking', loginError: null, prefill: action.prefill };
    case 'loginSucceeded':
      return {
        ...state,
        status: 'loggedIn',
        idInstance: action.idInstance,
        apiUrl: action.apiUrl,
        stateInstance: action.stateInstance,
        generation: action.generation,
        loginError: null,
        settings: initialSettings(),
        connection: { consecutiveFailures: 0, offline: false, lost: false },
        instanceNotReady: false,
        quota: { visible: false, dismissedByUser: false },
      };
    case 'loginFailed':
      return toLoggedOut(state, action.error, action.prefill);
    case 'loggedOut':
      return toLoggedOut(state, null, {
        idInstance: state.idInstance ?? state.prefill.idInstance,
        apiUrl: state.apiUrl ?? state.prefill.apiUrl,
        apiTokenInstance: '',
      });
    case 'sessionInvalidated':
      if (state.status !== 'loggedIn') return state;
      return toLoggedOut(state, action.error, {
        idInstance: state.idInstance ?? '',
        apiUrl: state.apiUrl ?? '',
        apiTokenInstance: '',
      });

    case 'settingsStarted':
      if (stale(state, action.generation)) return state;
      return {
        ...state,
        settings: { ...state.settings, status: 'loading', recheckBusy: true },
      };
    case 'settingsLoaded': {
      if (stale(state, action.generation)) return state;
      const { webhookUrlSet, warnings } = evaluateSettings(action.settings);
      return {
        ...state,
        settings: { ...state.settings, status: 'loaded', webhookUrlSet, warnings },
      };
    }
    case 'settingsFailed':
      // Ошибка или таймаут getSettings: предупреждений нет, опрос стартует (п. 1.4, П-таблица).
      // При повторной проверке П-1 после ошибки прежний результат сохраняется.
      if (stale(state, action.generation)) return state;
      return { ...state, settings: { ...state.settings, status: 'failed' } };
    case 'recheckCooldownEnded':
      if (stale(state, action.generation)) return state;
      return { ...state, settings: { ...state.settings, recheckBusy: false } };
    case 'warningDismissed':
      if (state.settings.dismissed.includes(action.warning)) return state;
      return {
        ...state,
        settings: { ...state.settings, dismissed: [...state.settings.dismissed, action.warning] },
      };

    case 'apiSucceeded':
      if (stale(state, action.generation)) return state;
      if (
        state.connection.consecutiveFailures === 0 &&
        !state.connection.offline &&
        !state.connection.lost &&
        !state.instanceNotReady
      )
        return state;
      return {
        ...state,
        connection: { consecutiveFailures: 0, offline: false, lost: false },
        instanceNotReady: false,
      };
    case 'pollNetworkFailed': {
      if (stale(state, action.generation)) return state;
      const consecutiveFailures = state.connection.consecutiveFailures + 1;
      return {
        ...state,
        connection: {
          ...state.connection,
          consecutiveFailures,
          lost: state.connection.lost || consecutiveFailures >= OFFLINE_FAILURE_THRESHOLD,
        },
      };
    }
    case 'apiHttpFailed':
      if (stale(state, action.generation) || state.connection.consecutiveFailures === 0)
        return state;
      return { ...state, connection: { ...state.connection, consecutiveFailures: 0 } };
    case 'instanceNotReady':
      if (stale(state, action.generation)) return state;
      return { ...state, instanceNotReady: true };
    case 'webhookUrlDetected':
      if (stale(state, action.generation)) return state;
      return { ...state, settings: { ...state.settings, webhookUrlSet: true } };
    case 'browserOffline':
      return { ...state, connection: { ...state.connection, offline: true } };

    case 'quotaChats':
      if (state.status !== 'loggedIn') return state;
      // ВА-13: из очереди — только если пользователь его ещё не закрывал; 466 на действие — всегда.
      if (action.source === 'queue' && state.quota.dismissedByUser) return state;
      return { ...state, quota: { ...state.quota, visible: true } };
    case 'quotaDismissed':
      return { ...state, quota: { visible: false, dismissedByUser: true } };

    case 'readOnlyChanged':
      return { ...state, readOnly: action.readOnly };
    case 'locksUnsupported':
      return { ...state, locksUnsupported: true };
    case 'storageFailed':
      return { ...state, storageFailed: true };
  }
}

// ---------- Селекторы ----------

/** Порог «Нет соединения»: 2 подряд сетевые ошибки или таймаута опроса (п. 4.3, ВА-24). */
export const OFFLINE_FAILURE_THRESHOLD = 2;

export function selectShowOfflineBanner(state: SessionState): boolean {
  return state.status === 'loggedIn' && (state.connection.offline || state.connection.lost);
}

/** Видимые П-2…П-4 (с учётом закрытых). */
export function selectVisibleWarnings(state: SessionState): SettingsWarning[] {
  return state.settings.warnings.filter((w) => !state.settings.dismissed.includes(w));
}

/**
 * Можно ли запускать опрос (для F5): вошли, getSettings завершился (ответ, ошибка или
 * таймаут 10 с), П-1 нет (п. 1.4, ВА-1, ВА-6).
 */
export function selectCanStartPolling(state: SessionState): boolean {
  return (
    state.status === 'loggedIn' &&
    (state.settings.status === 'loaded' || state.settings.status === 'failed') &&
    !state.settings.webhookUrlSet
  );
}

/** `suspended`: вход разрешён, баннер (п. 1.6, EC-S9). */
export function selectShowSuspendedBanner(state: SessionState): boolean {
  return state.status === 'loggedIn' && state.stateInstance === 'suspended';
}

/** Можно ли писать (отправка, «Новый чат») — не в неопрашивающей вкладке (Р-12, EC-S4). */
export function selectCanWrite(state: SessionState): boolean {
  return state.status === 'loggedIn' && !state.readOnly;
}
