import { afterEach, describe, expect, it, vi } from 'vitest';
import { GreenApiErrorCode, type GreenApiError } from '../../api';
import {
  createInitialSessionState,
  createSessionController,
  selectShowOfflineBanner,
  sessionReducer,
  type SessionAction,
  type SessionControllerDeps,
  type SessionState,
} from '..';
import { SESSION_CREDENTIALS_KEY } from '../sessionCredentials';
import {
  OK_SETTINGS,
  TEST_API_URL,
  TEST_ID_INSTANCE,
  TEST_TOKEN,
  deferred,
  memoryStorage,
  routeFetch,
  type Reply,
} from '../../test/fixtures/greenApiMock';

const CREDS = { idInstance: TEST_ID_INSTANCE, apiTokenInstance: TEST_TOKEN, apiUrl: TEST_API_URL };
const instantSleep = () => Promise.resolve();

function harness(
  routes?: Parameters<typeof routeFetch>[0],
  extra: Partial<Omit<SessionControllerDeps, 'dispatch'>> = {},
  session = memoryStorage(),
) {
  let state: SessionState = createInitialSessionState({ apiUrl: TEST_API_URL });
  const actions: SessionAction[] = [];
  const api = routeFetch(routes);
  const local = memoryStorage();
  const warn = vi.fn();
  const timers = { setTimeout: vi.fn(() => 0), clearTimeout: vi.fn() };
  const controller = createSessionController({
    dispatch: (a) => {
      actions.push(a);
      state = sessionReducer(state, a);
    },
    clientOptions: { fetch: api.fetch, sleep: instantSleep },
    credentialsBackend: session,
    storageBackend: local,
    warn,
    timers,
    ...extra,
  });
  return {
    controller,
    api,
    session,
    local,
    warn,
    timers,
    actions,
    get state() {
      return state;
    },
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  vi.useRealTimers();
});

describe('вход (п. 1.3–1.7)', () => {
  it('authorized → loggedIn, креды в sessionStorage, затем getSettings с таймаутом 10 с', async () => {
    const h = harness();
    await h.controller.login(CREDS);
    expect(h.state.status).toBe('loggedIn');
    expect(h.session.map.has(SESSION_CREDENTIALS_KEY)).toBe(true);
    await flush();
    expect(h.api.calls.map((c) => c.method)).toEqual(['getStateInstance', 'getSettings']);
    expect(h.state.settings.status).toBe('loaded');
    expect(h.controller.getClient()).not.toBeNull();
    expect(h.controller.getStorage()?.idInstance).toBe(TEST_ID_INSTANCE);
    // кулдаун «Проверить снова» 1 с
    expect(h.timers.setTimeout).toHaveBeenCalledWith(expect.any(Function), 1000);
  });

  it('getSettings висит → таймаут 10 с, опрос разрешён, предупреждений нет (ВА-1, EC-E3)', async () => {
    vi.useFakeTimers();
    const h = harness({
      getStateInstance: [{ body: { stateInstance: 'authorized' } }],
      getSettings: [{ hang: true }],
    });
    await h.controller.login(CREDS);
    await vi.advanceTimersByTimeAsync(9_999);
    expect(h.state.settings.status).toBe('loading');
    await vi.advanceTimersByTimeAsync(1);
    expect(h.state.settings.status).toBe('failed');
    expect(h.state.settings.warnings).toEqual([]);
    expect(h.warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(h.warn.mock.calls)).not.toContain(TEST_TOKEN);
    expect(JSON.stringify(h.warn.mock.calls)).toContain('TIMEOUT');
  });

  it.each<[string, Reply, string]>([
    ['401', { status: 401 }, 'Неверный apiTokenInstance'],
    ['403', { status: 403 }, 'Неверный idInstance или адрес API'],
    [
      'сеть',
      { throws: new TypeError('Failed to fetch') },
      'Не удалось связаться с https://api.green-api.com. Проверьте адрес API',
    ],
    [
      'expired',
      { status: 400, body: 'Instance account is expired' },
      'Срок действия инстанса истёк. Продлите его в личном кабинете GREEN-API',
    ],
    [
      'deleted',
      { status: 400, body: 'Instance is deleted' },
      'Инстанс удалён. Создайте новый инстанс в личном кабинете GREEN-API',
    ],
    [
      'notAuthorized',
      { body: { stateInstance: 'notAuthorized' } },
      'Инстанс не авторизован. Отсканируйте QR-код в личном кабинете',
    ],
    [
      'starting',
      { body: { stateInstance: 'starting' } },
      'Инстанс запускается, повторите через 1–5 минут',
    ],
    ['blocked', { body: { stateInstance: 'blocked' } }, 'Аккаунт MAX заблокирован'],
    [
      'pendingPassword',
      { body: { stateInstance: 'pendingPassword' } },
      'Требуется пароль 2FA — завершите авторизацию в личном кабинете',
    ],
    [
      'неизвестный',
      { body: { stateInstance: 'yellowCard' } },
      'Инстанс недоступен (статус: yellowCard). Проверьте инстанс в личном кабинете GREEN-API',
    ],
    [
      'нет поля',
      { body: {} },
      'Инстанс недоступен (статус: неизвестен). Проверьте инстанс в личном кабинете GREEN-API',
    ],
  ])('%s → вход не выполнен, текст ТЗ, sessionStorage не пишется', async (_n, reply, text) => {
    const h = harness({ getStateInstance: [reply] });
    await h.controller.login(CREDS);
    expect(h.state.status).toBe('loggedOut');
    expect(h.state.loginError).toBe(text);
    expect(h.state.loginError).not.toContain(TEST_TOKEN);
    expect(h.session.map.size).toBe(0);
    expect(h.api.callsOf('getSettings')).toHaveLength(0);
    expect(h.controller.getClient()).toBeNull();
  });

  it('suspended → вход разрешён (баннер)', async () => {
    const h = harness({
      getStateInstance: [{ body: { stateInstance: 'suspended' } }],
      getSettings: [{ body: OK_SETTINGS }],
    });
    await h.controller.login(CREDS);
    expect(h.state.status).toBe('loggedIn');
    expect(h.state.stateInstance).toBe('suspended');
  });

  it('новая попытка входа отбрасывает ответ прежней (EC-S7)', async () => {
    const first = deferred();
    const h = harness({
      getStateInstance: [{ deferred: first }, { body: { stateInstance: 'notAuthorized' } }],
    });
    const p1 = h.controller.login(CREDS);
    await flush();
    await h.controller.login({ ...CREDS, idInstance: '1101000001' });
    first.release({ body: { stateInstance: 'authorized' } });
    await p1;
    expect(h.state.status).toBe('loggedOut');
    expect(h.state.loginError).toMatch(/QR-код/);
  });
});

describe('восстановление после перезагрузки (п. 1.9, ВА-5)', () => {
  const stored = () => ({ [SESSION_CREDENTIALS_KEY]: JSON.stringify(CREDS) });

  function restoreHarness(reply: Reply) {
    return harness(
      { getStateInstance: [reply], getSettings: [{ body: OK_SETTINGS }] },
      {},
      memoryStorage(stored()),
    );
  }

  it('нет данных → false, без запросов', async () => {
    const h = harness();
    expect(await h.controller.restore()).toBe(false);
    expect(h.api.calls).toHaveLength(0);
  });

  it('authorized → вход без формы; второй вызов (StrictMode) ничего не делает', async () => {
    const h = restoreHarness({ body: { stateInstance: 'authorized' } });
    expect(await h.controller.restore()).toBe(true);
    expect(h.state.status).toBe('loggedIn');
    expect(h.actions[0]?.type).toBe('restoreStarted');
    expect(await h.controller.restore()).toBe(false);
    expect(h.api.callsOf('getStateInstance')).toHaveLength(1);
  });

  it('сеть → экран входа с текстом 1.5, поля из sessionStorage (с токеном), хранилище не очищено, без автоповтора', async () => {
    const h = restoreHarness({ throws: new TypeError('Failed to fetch') });
    await h.controller.restore();
    expect(h.state.status).toBe('loggedOut');
    expect(h.state.loginError).toMatch(/^Не удалось связаться с/);
    expect(h.state.prefill).toEqual(CREDS);
    expect(h.session.map.has(SESSION_CREDENTIALS_KEY)).toBe(true);
    await flush();
    expect(h.api.calls).toHaveLength(1);
  });

  it('≠ authorized → текст 1.6, sessionStorage сохраняется', async () => {
    const h = restoreHarness({ body: { stateInstance: 'starting' } });
    await h.controller.restore();
    expect(h.state.loginError).toBe('Инстанс запускается, повторите через 1–5 минут');
    expect(h.session.map.has(SESSION_CREDENTIALS_KEY)).toBe(true);
  });

  it.each<[string, Reply]>([
    ['401', { status: 401 }],
    ['403', { status: 403 }],
    ['expired', { status: 400, body: 'Instance account is expired' }],
    ['deleted', { status: 400, body: 'Instance is deleted' }],
  ])('%s → sessionStorage очищается, токен в форме пуст', async (_n, reply) => {
    const h = restoreHarness(reply);
    await h.controller.restore();
    expect(h.state.status).toBe('loggedOut');
    expect(h.session.map.has(SESSION_CREDENTIALS_KEY)).toBe(false);
    expect(h.state.prefill).toEqual({ ...CREDS, apiTokenInstance: '' });
  });
});

describe('работа после входа', () => {
  async function loggedIn(routes: Parameters<typeof routeFetch>[0] = {}) {
    const h = harness({
      getStateInstance: [{ body: { stateInstance: 'authorized' } }],
      getSettings: [{ body: OK_SETTINGS }],
      ...routes,
    });
    await h.controller.login(CREDS);
    await flush();
    return h;
  }

  it('«Выйти»: клиент закрыт (запрос в полёте → SESSION_CLOSED), sessionStorage очищен, подписчики уведомлены', async () => {
    const h = await loggedIn({ receiveNotification: [{ hang: true }] });
    const ended = vi.fn();
    h.controller.onSessionEnd(ended);
    const client = h.controller.getClient();
    const p = client?.receiveNotification().catch((e: unknown) => e);
    await flush();
    h.controller.logout();
    expect(((await p) as GreenApiError).code).toBe(GreenApiErrorCode.SESSION_CLOSED);
    expect(h.state.status).toBe('loggedOut');
    expect(h.session.map.size).toBe(0);
    expect(h.controller.getClient()).toBeNull();
    expect(ended).toHaveBeenCalledWith('logout');
    expect(h.state.prefill).toEqual({ ...CREDS, apiTokenInstance: '' });
  });

  it.each<[string, Reply, string]>([
    ['401', { status: 401 }, 'Неверный apiTokenInstance'],
    ['403', { status: 403 }, 'Неверный idInstance или адрес API'],
    [
      'expired',
      { status: 400, body: 'Instance account is expired' },
      'Срок действия инстанса истёк. Продлите его в личном кабинете GREEN-API',
    ],
  ])(
    '%s на receive в работе → экран входа с текстом, sessionStorage очищен (EC-P13)',
    async (_n, reply, text) => {
      const h = await loggedIn({ receiveNotification: [reply] });
      const ended = vi.fn();
      h.controller.onSessionEnd(ended);
      await h.controller
        .getClient()
        ?.receiveNotification()
        .catch(() => undefined);
      expect(h.state.status).toBe('loggedOut');
      expect(h.state.loginError).toBe(text);
      expect(h.session.map.size).toBe(0);
      expect(ended).toHaveBeenCalledWith('sessionInvalid');
      expect(h.controller.getClient()).toBeNull();
    },
  );

  it('403 suspended на sendMessage — сессия жива', async () => {
    const h = await loggedIn({ sendMessage: [{ status: 403, body: 'Your account is suspended' }] });
    await h.controller
      .getClient()
      ?.sendMessage({ chatId: '10000000', message: 'x' })
      .catch(() => undefined);
    expect(h.state.status).toBe('loggedIn');
  });

  it('«Нет соединения»: 2 сетевые ошибки receive → баннер, успех любого запроса → скрыт; ошибки send не считаются', async () => {
    const h = await loggedIn({
      receiveNotification: [
        { throws: new TypeError('x') },
        { throws: new TypeError('x') },
        { body: '' },
      ],
      sendMessage: [{ throws: new TypeError('x') }],
    });
    const c = h.controller.getClient();
    await c?.sendMessage({ chatId: '10000000', message: 'x' }).catch(() => undefined);
    await c?.sendMessage({ chatId: '10000000', message: 'x' }).catch(() => undefined);
    expect(selectShowOfflineBanner(h.state)).toBe(false);
    await c?.receiveNotification().catch(() => undefined);
    await c?.receiveNotification().catch(() => undefined);
    expect(selectShowOfflineBanner(h.state)).toBe(true);
    await c?.receiveNotification();
    expect(selectShowOfflineBanner(h.state)).toBe(false);
  });

  it('400 not-ready → баннер, webhook → П-1 и опрос стоп; 466 chats → баннер квоты, checks — нет', async () => {
    const h = await loggedIn({
      receiveNotification: [
        { status: 400, body: 'instance is starting or not authorized' },
        { status: 400, body: 'Message cannot be received because custom webhook url is set' },
      ],
      sendMessage: [{ status: 466, body: { correspondentsStatus: { used: 3, total: 3 } } }],
      checkAccount: [
        { status: 466, body: { invokeStatus: { method: 'checkAccount', used: 100, total: 100 } } },
      ],
    });
    const c = h.controller.getClient();
    await c?.receiveNotification().catch(() => undefined);
    expect(h.state.instanceNotReady).toBe(true);
    await c?.receiveNotification().catch(() => undefined);
    expect(h.state.settings.webhookUrlSet).toBe(true);
    await c?.checkAccount('79990000000').catch(() => undefined);
    expect(h.state.quota.visible).toBe(false);
    await c?.sendMessage({ chatId: '10000000', message: 'x' }).catch(() => undefined);
    expect(h.state.quota.visible).toBe(true);
    h.controller.dismissQuotaBanner();
    h.controller.reportQueueQuota();
    expect(h.state.quota.visible).toBe(false);
  });

  it('«Проверить снова» вызывает только getSettings; ответ после выхода игнорируется', async () => {
    const h = await loggedIn({
      getSettings: [{ body: { ...OK_SETTINGS, webhookUrl: 'https://hook.example' } }],
    });
    expect(h.state.settings.webhookUrlSet).toBe(true);
    h.api.set('getSettings', [{ body: OK_SETTINGS }]);
    await h.controller.recheckSettings();
    expect(h.state.settings.webhookUrlSet).toBe(false);
    expect(h.api.calls.map((c) => c.method)).toEqual([
      'getStateInstance',
      'getSettings',
      'getSettings',
    ]);
  });

  it('getSettings 401 → выход с текстом', async () => {
    const h = harness({
      getStateInstance: [{ body: { stateInstance: 'authorized' } }],
      getSettings: [{ status: 401 }],
    });
    await h.controller.login(CREDS);
    await flush();
    expect(h.state.status).toBe('loggedOut');
    expect(h.state.loginError).toBe('Неверный apiTokenInstance');
  });

  it('readOnly: хранилище перестаёт писать в localStorage (EC-S4)', async () => {
    const h = await loggedIn();
    h.controller.setReadOnly(true);
    expect(h.state.readOnly).toBe(true);
    expect(h.controller.getStorage()?.write('chats', [])).toBe(false);
    expect(h.local.map.size).toBe(0);
    h.controller.setReadOnly(false);
    expect(h.controller.getStorage()?.write('chats', [])).toBe(true);
    expect([...h.local.map.keys()]).toEqual([`maxchat:${TEST_ID_INSTANCE}:v1:chats`]);
  });

  it('сбой записи localStorage → баннер (Р-2, EC-D8)', async () => {
    const h = harness(undefined, { storageBackend: memoryStorage({}, true) });
    await h.controller.login(CREDS);
    h.controller.getStorage()?.write('chats', []);
    expect(h.state.storageFailed).toBe(true);
  });

  it('токен не попадает в состояние (кроме формы), actions и логи', async () => {
    const h = await loggedIn({
      receiveNotification: [{ throws: new TypeError(`fail ${TEST_TOKEN}`) }],
    });
    await h.controller
      .getClient()
      ?.receiveNotification()
      .catch(() => undefined);
    h.controller.logout();
    // prefill после выхода содержит только idInstance и apiUrl (токен пуст)
    expect(h.state.prefill.apiTokenInstance).toBe('');
    expect(JSON.stringify(h.state)).not.toContain(TEST_TOKEN);
    expect(JSON.stringify(h.actions.filter((a) => !('prefill' in a)))).not.toContain(TEST_TOKEN);
    expect(JSON.stringify(h.warn.mock.calls)).not.toContain(TEST_TOKEN);
    expect(String(h.controller.getClient())).not.toContain(TEST_TOKEN);
  });
});
