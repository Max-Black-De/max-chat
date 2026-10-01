import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect } from 'react';
import { App } from './App';
import { useSession, type SessionContextValue } from './index';
import type { SessionProviderDeps } from './session/SessionProvider';
import { SESSION_CREDENTIALS_KEY } from '../store';
import {
  OK_SETTINGS,
  TEST_API_URL,
  TEST_ID_INSTANCE,
  TEST_TOKEN,
  deferred,
  memoryStorage,
  routeFetch,
  type Reply,
} from '../test/greenApiMock';

const CREDS = { idInstance: TEST_ID_INSTANCE, apiTokenInstance: TEST_TOKEN, apiUrl: TEST_API_URL };

/** Последнее значение контекста сессии (обновляется после каждого коммита рендера). */
const probeRef: { current: SessionContextValue | null } = { current: null };
function Probe() {
  const value = useSession();
  useEffect(() => {
    probeRef.current = value;
  });
  return null;
}

function setup(
  routes?: Parameters<typeof routeFetch>[0],
  opts: { session?: ReturnType<typeof memoryStorage>; deps?: Partial<SessionProviderDeps> } = {},
) {
  const api = routeFetch(routes);
  const session = opts.session ?? memoryStorage();
  const local = memoryStorage();
  const warn = vi.fn();
  const deps: SessionProviderDeps = {
    clientOptions: { fetch: api.fetch, sleep: () => Promise.resolve() },
    credentialsBackend: session,
    storageBackend: local,
    warn,
    locksSupported: true,
    defaultApiUrl: TEST_API_URL,
    ...opts.deps,
  };
  const view = render(<App deps={deps} />);
  return { api, session, local, warn, view };
}

const input = (id: string) => screen.getByTestId<HTMLInputElement>(id);

function fillAndSubmit(values: Partial<typeof CREDS> = CREDS) {
  if (values.idInstance !== undefined)
    fireEvent.change(input('login-idInstance'), { target: { value: values.idInstance } });
  if (values.apiTokenInstance !== undefined)
    fireEvent.change(input('login-apiTokenInstance'), {
      target: { value: values.apiTokenInstance },
    });
  if (values.apiUrl !== undefined)
    fireEvent.change(input('login-apiUrl'), { target: { value: values.apiUrl } });
  fireEvent.click(screen.getByTestId('login-submit'));
}

async function login(values: Partial<typeof CREDS> = CREDS) {
  fillAndSubmit(values);
  await screen.findByTestId('main-screen');
}

/** Токен не виден ни в тексте, ни в атрибутах DOM (кроме value поля токена на экране входа). */
function expectNoTokenInDom() {
  const html = document.body.innerHTML;
  expect(html).not.toContain(TEST_TOKEN);
  expect(document.body.textContent).not.toContain(TEST_TOKEN);
}

beforeEach(() => {
  probeRef.current = null;
  vi.stubGlobal('fetch', () => {
    throw new Error('real network is forbidden in tests');
  });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('экран входа (п. 1.1–1.2, §4.0 п. 1)', () => {
  it('1.1: поля, «Войти», ссылка на кабинет; apiUrl предзаполнен и свёрнут в «Дополнительно»', () => {
    setup();
    expect(screen.getByLabelText('ID инстанса (idInstance)')).toBe(input('login-idInstance'));
    const token = screen.getByLabelText<HTMLInputElement>('Токен (apiTokenInstance)');
    expect(token.type).toBe('password');
    expect(input('login-apiUrl').value).toBe('https://api.green-api.com');
    expect(screen.getByTestId<HTMLDetailsElement>('login-advanced').open).toBe(false);
    expect(screen.getByTestId('login-submit')).toHaveTextContent('Войти');
    expect(screen.getByTestId('login-cabinet-link')).toHaveAttribute('rel', 'noopener noreferrer');
    expect(
      screen.getByText(
        'Скопируйте apiUrl из личного кабинета GREEN-API (console.green-api.com → инстанс)',
      ),
    ).toBeInTheDocument();
  });

  it('кнопка «показать» переключает тип поля токена', () => {
    setup();
    fireEvent.click(screen.getByTestId('login-token-toggle'));
    expect(input('login-apiTokenInstance').type).toBe('text');
    fireEvent.click(screen.getByTestId('login-token-toggle'));
    expect(input('login-apiTokenInstance').type).toBe('password');
  });

  it('1.2: пустые поля и idInstance не из цифр — ошибки у полей, запроса нет', () => {
    const { api } = setup();
    fillAndSubmit({ idInstance: '  ', apiTokenInstance: '' });
    expect(screen.getByTestId('login-idInstance-error')).toHaveTextContent('Заполните поле');
    expect(screen.getByTestId('login-apiTokenInstance-error')).toHaveTextContent('Заполните поле');
    expect(input('login-idInstance')).toHaveAttribute('aria-invalid', 'true');
    fillAndSubmit({ idInstance: '11a', apiTokenInstance: 'x' });
    expect(screen.getByTestId('login-idInstance-error')).toHaveTextContent(
      'ID инстанса — только цифры',
    );
    expect(screen.queryByTestId('login-apiTokenInstance-error')).toBeNull();
    expect(api.calls).toHaveLength(0);
  });

  it('1.2: http:// — ошибка у поля, «Дополнительно» раскрывается, запроса нет (ВА-2)', () => {
    const { api } = setup();
    fillAndSubmit({ ...CREDS, apiUrl: 'http://api.green-api.com' });
    expect(screen.getByTestId('login-apiUrl-error')).toHaveTextContent(
      'Введите адрес вида https://3100.api.green-api.com',
    );
    expect(screen.getByTestId<HTMLDetailsElement>('login-advanced').open).toBe(true);
    expect(api.calls).toHaveLength(0);
  });

  it('EC-T9: чужой хост — предупреждение, вход не блокируется; green-api / greenapi — без предупреждения', async () => {
    const { api } = setup();
    fireEvent.change(input('login-apiUrl'), { target: { value: 'https://evilgreen-api.com' } });
    expect(screen.getByTestId('login-apiUrl-warning')).toHaveTextContent(
      'Адрес не похож на сервер GREEN-API: токен будет отправлен на evilgreen-api.com. Продолжайте, только если уверены',
    );
    for (const ok of ['https://3100.api.green-api.com', 'https://api.greenapi.com/', '']) {
      fireEvent.change(input('login-apiUrl'), { target: { value: ok } });
      expect(screen.queryByTestId('login-apiUrl-warning')).toBeNull();
    }
    fireEvent.change(input('login-apiUrl'), { target: { value: 'https://proxy.example' } });
    fillAndSubmit({ idInstance: TEST_ID_INSTANCE, apiTokenInstance: TEST_TOKEN });
    await screen.findByTestId('main-screen');
    expect(api.calls[0]?.url.startsWith('https://proxy.example/waInstance')).toBe(true);
  });
});

describe('вход (п. 1.3–1.7)', () => {
  it('1.3–1.4: кнопка заблокирована с индикатором; затем основной экран, sessionStorage, getSettings', async () => {
    const gate = deferred();
    const { api, session } = setup({
      getStateInstance: [{ deferred: gate }],
      getSettings: [{ body: OK_SETTINGS }],
    });
    fillAndSubmit({ ...CREDS, apiUrl: 'https://3100.api.green-api.com/' });
    const submit = screen.getByTestId('login-submit');
    expect(submit).toBeDisabled();
    expect(screen.getByTestId('login-spinner')).toBeInTheDocument();
    // EC-U7: повторное нажатие не шлёт второй запрос
    fireEvent.click(submit);
    fireEvent.submit(screen.getByTestId('login-form'));
    expect(api.callsOf('getStateInstance')).toHaveLength(1);
    gate.release({ body: { stateInstance: 'authorized' } });
    await screen.findByTestId('main-screen');
    expect(screen.getByTestId('session-idInstance')).toHaveTextContent(TEST_ID_INSTANCE);
    expect(JSON.parse(session.map.get(SESSION_CREDENTIALS_KEY) ?? '{}')).toEqual({
      ...CREDS,
      apiUrl: 'https://3100.api.green-api.com',
    });
    await waitFor(() => {
      expect(api.callsOf('getSettings')).toHaveLength(1);
    });
    expect(api.calls[0]?.url).toBe(
      `https://3100.api.green-api.com/waInstance${TEST_ID_INSTANCE}/getStateInstance/${TEST_TOKEN}`,
    );
    expect(screen.queryByTestId('banner-p2')).toBeNull();
    expect(screen.getByTestId('chat-empty')).toHaveTextContent('Выберите чат или создайте новый');
    expectNoTokenInDom();
  });

  it.each<[string, Reply, string]>([
    ['401', { status: 401 }, 'Неверный apiTokenInstance'],
    ['403', { status: 403 }, 'Неверный idInstance или адрес API'],
    [
      'CORS / сеть',
      { throws: new TypeError('Failed to fetch') },
      'Не удалось связаться с https://api.green-api.com. Проверьте адрес API',
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
      'неизвестный статус (EC-E1)',
      { body: { stateInstance: 'yellowCard' } },
      'Инстанс недоступен (статус: yellowCard). Проверьте инстанс в личном кабинете GREEN-API',
    ],
    [
      'нет поля',
      { body: {} },
      'Инстанс недоступен (статус: неизвестен). Проверьте инстанс в личном кабинете GREEN-API',
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
  ])('%s → вход не выполнен, текст ТЗ, кнопка снова активна', async (_n, reply, text) => {
    const { session, api } = setup({ getStateInstance: [reply] });
    fillAndSubmit();
    expect(await screen.findByTestId('login-error')).toHaveTextContent(text);
    expect(screen.queryByTestId('main-screen')).toBeNull();
    expect(screen.getByTestId('login-submit')).toBeEnabled();
    expect(session.map.size).toBe(0);
    expect(api.callsOf('getSettings')).toHaveLength(0);
    // введённые значения остаются в форме
    expect(input('login-idInstance').value).toBe(TEST_ID_INSTANCE);
  });

  it('suspended — вход разрешён, баннер (п. 1.6, EC-S9)', async () => {
    setup({
      getStateInstance: [{ body: { stateInstance: 'suspended' } }],
      getSettings: [{ body: OK_SETTINGS }],
    });
    await login();
    expect(screen.getByTestId('banner-suspended')).toHaveTextContent(
      'На аккаунте временные ограничения: отправка только контактам',
    );
  });
});

describe('getSettings: П-1…П-4 (п. 1.7, ВА-1, ВА-6, EC-E3…EC-E5)', () => {
  it('П-2…П-4 — тексты ТЗ, закрываются; поле отсутствует или null — предупреждение', async () => {
    setup({
      getStateInstance: [{ body: { stateInstance: 'authorized' } }],
      getSettings: [
        { body: { webhookUrl: '', incomingWebhook: 'no', outgoingMessageWebhook: null } },
      ],
    });
    await login();
    expect(await screen.findByTestId('banner-p2')).toHaveTextContent(
      /^Выключено получение входящих сообщений/,
    );
    expect(screen.getByTestId('banner-p3')).toHaveTextContent(
      /^Выключены уведомления о сообщениях, отправленных через API/,
    );
    expect(screen.getByTestId('banner-p4')).toHaveTextContent(
      /^Выключены уведомления о сообщениях, отправленных с телефона/,
    );
    expect(screen.queryByTestId('banner-p1')).toBeNull();
    fireEvent.click(screen.getByTestId('banner-p3-close'));
    expect(screen.queryByTestId('banner-p3')).toBeNull();
    expect(screen.getByTestId('banner-p2')).toBeInTheDocument();
  });

  it('П-1: не закрывается; «Проверить снова» — только getSettings, неактивна во время запроса и 1 с после', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { api } = setup({
      getStateInstance: [{ body: { stateInstance: 'authorized' } }],
      getSettings: [{ body: { ...OK_SETTINGS, webhookUrl: 'https://hook.example' } }],
    });
    await login();
    const banner = await screen.findByTestId('banner-p1');
    expect(banner).toHaveTextContent(/^В настройках инстанса указан Webhook URL/);
    expect(screen.queryByTestId('banner-p1-close')).toBeNull();
    const recheck = screen.getByTestId('banner-p1-recheck');
    expect(recheck).toBeDisabled(); // 1 с после первого ответа
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(recheck).toBeEnabled();

    const gate = deferred();
    api.set('getSettings', [{ deferred: gate }]);
    fireEvent.click(recheck);
    expect(recheck).toBeDisabled();
    gate.release({ body: OK_SETTINGS });
    await waitFor(() => {
      expect(screen.queryByTestId('banner-p1')).toBeNull();
    });
    expect(api.calls.map((c) => c.method)).toEqual([
      'getStateInstance',
      'getSettings',
      'getSettings',
    ]);
  });

  it('ошибка getSettings: предупреждений нет, console.warn без токена', async () => {
    const { warn } = setup({
      getStateInstance: [{ body: { stateInstance: 'authorized' } }],
      getSettings: [{ status: 500, body: `oops ${TEST_TOKEN}` }],
    });
    await login();
    await waitFor(() => {
      expect(warn).toHaveBeenCalledTimes(1);
    });
    expect(JSON.stringify(warn.mock.calls)).not.toContain(TEST_TOKEN);
    expect(screen.queryByTestId('banner-p2')).toBeNull();
    expect(screen.getByTestId('main-screen')).toBeInTheDocument();
  });
});

describe('выход и восстановление (п. 1.8–1.9, ВА-4, ВА-5)', () => {
  it('1.8 «Выйти»: экран входа, sessionStorage очищен, idInstance и apiUrl предзаполнены, токен пуст', async () => {
    const { session } = setup();
    await login();
    fireEvent.click(screen.getByTestId('logout-button'));
    expect(screen.getByTestId('login-form')).toBeInTheDocument();
    expect(session.map.size).toBe(0);
    expect(input('login-idInstance').value).toBe(TEST_ID_INSTANCE);
    expect(input('login-apiUrl').value).toBe(TEST_API_URL);
    expect(input('login-apiTokenInstance').value).toBe('');
    expect(screen.queryByTestId('login-error')).toBeNull();
  });

  it('1.9: перезагрузка — вход из sessionStorage без формы', async () => {
    const session = memoryStorage({ [SESSION_CREDENTIALS_KEY]: JSON.stringify(CREDS) });
    const { api } = setup(undefined, { session });
    expect(await screen.findByTestId('main-screen')).toBeInTheDocument();
    expect(api.callsOf('getStateInstance')).toHaveLength(1);
  });

  it('1.9: во время восстановления — форма заблокирована, «Восстанавливаем сессию…»', () => {
    const session = memoryStorage({ [SESSION_CREDENTIALS_KEY]: JSON.stringify(CREDS) });
    setup({ getStateInstance: [{ hang: true }] }, { session });
    expect(screen.getByTestId('login-submit')).toBeDisabled();
    expect(screen.getByTestId('login-submit')).toHaveTextContent('Восстанавливаем сессию…');
    expect(input('login-idInstance').value).toBe(TEST_ID_INSTANCE);
  });

  it('1.9: сеть при восстановлении — текст 1.5, поля из sessionStorage, она сохраняется, автоповтора нет', async () => {
    const session = memoryStorage({ [SESSION_CREDENTIALS_KEY]: JSON.stringify(CREDS) });
    const { api } = setup(
      { getStateInstance: [{ throws: new TypeError('Failed to fetch') }] },
      { session },
    );
    expect(await screen.findByTestId('login-error')).toHaveTextContent(/^Не удалось связаться с/);
    expect(input('login-idInstance').value).toBe(TEST_ID_INSTANCE);
    expect(input('login-apiTokenInstance').value).toBe(TEST_TOKEN);
    expect(session.map.has(SESSION_CREDENTIALS_KEY)).toBe(true);
    await new Promise((r) => setTimeout(r, 20));
    expect(api.calls).toHaveLength(1);
  });

  it('1.9: 401 при восстановлении — sessionStorage очищена, токен пуст', async () => {
    const session = memoryStorage({ [SESSION_CREDENTIALS_KEY]: JSON.stringify(CREDS) });
    setup({ getStateInstance: [{ status: 401 }] }, { session });
    expect(await screen.findByTestId('login-error')).toHaveTextContent('Неверный apiTokenInstance');
    expect(session.map.size).toBe(0);
    expect(input('login-apiTokenInstance').value).toBe('');
    expect(input('login-idInstance').value).toBe(TEST_ID_INSTANCE);
  });
});

describe('в работе: сессия, баннеры, вкладки (§5.4, п. 4.3, Р-12, Р-2)', () => {
  it('401 на receive в работе → экран входа с текстом, токен пуст (EC-P13)', async () => {
    const r = await mainWithProbe({ receiveNotification: [{ status: 401 }] });
    expect(probeRef.current).not.toBeNull();
    await act(async () => {
      await probeRef.current?.controller
        .getClient()
        ?.receiveNotification()
        .catch(() => undefined);
    });
    expect(screen.getByTestId('login-error')).toHaveTextContent('Неверный apiTokenInstance');
    expect(input('login-apiTokenInstance').value).toBe('');
    expect(r.session.map.size).toBe(0);
  });

  it('«Нет соединения»: после 2 сетевых ошибок опроса; скрывается после успеха; событие offline — сразу', async () => {
    await mainWithProbe({
      receiveNotification: [
        { throws: new TypeError('x') },
        { throws: new TypeError('x') },
        { body: '' },
      ],
    });
    const recv = () =>
      act(async () => {
        await probeRef.current?.controller
          .getClient()
          ?.receiveNotification()
          .catch(() => undefined);
      });
    await recv();
    expect(screen.queryByTestId('banner-offline')).toBeNull();
    await recv();
    expect(screen.getByTestId('banner-offline')).toHaveTextContent(
      'Нет соединения с GREEN-API. Переподключаемся…',
    );
    await recv();
    expect(screen.queryByTestId('banner-offline')).toBeNull();
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(screen.getByTestId('banner-offline')).toBeInTheDocument();
  });

  it('квота чатов: баннер один, закрывается; из очереди после закрытия — нет, новый 466 — да (ВА-13)', async () => {
    await mainWithProbe({ sendMessage: [{ status: 466 }] });
    const send = () =>
      act(async () => {
        await probeRef.current?.controller
          .getClient()
          ?.sendMessage({ chatId: '10000000', message: 'x' })
          .catch(() => undefined);
      });
    await send();
    expect(screen.getAllByTestId('banner-quota')).toHaveLength(1);
    expect(screen.getByTestId('banner-quota')).toHaveTextContent(
      /^Лимит тарифа Developer исчерпан/,
    );
    fireEvent.click(screen.getByTestId('banner-quota-close'));
    act(() => {
      probeRef.current?.controller.reportQueueQuota();
    });
    expect(screen.queryByTestId('banner-quota')).toBeNull();
    await send();
    expect(screen.getByTestId('banner-quota')).toBeInTheDocument();
  });

  it('400 not-ready → баннер «Инстанс не авторизован или запускается»', async () => {
    await mainWithProbe({
      receiveNotification: [{ status: 400, body: 'instance is starting or not authorized' }],
    });
    await act(async () => {
      await probeRef.current?.controller
        .getClient()
        ?.receiveNotification()
        .catch(() => undefined);
    });
    expect(screen.getByTestId('banner-not-ready')).toHaveTextContent(
      'Инстанс не авторизован или запускается',
    );
  });

  it('вкладка только на чтение: баннер, «Новый чат» неактивна с подсказкой (EC-S4)', async () => {
    await mainWithProbe();
    act(() => {
      probeRef.current?.controller.setReadOnly(true);
    });
    expect(screen.getByTestId('banner-other-tab')).toHaveTextContent(
      'Чат открыт в другой вкладке — получение сообщений идёт там',
    );
    expect(screen.getByTestId('new-chat-button')).toBeDisabled();
    expect(screen.getByTestId('new-chat-button')).toHaveAttribute(
      'title',
      'Чат открыт в другой вкладке — пишите там',
    );
  });

  it('нет Web Locks → постоянный баннер (EC-S5); сбой localStorage → баннер (EC-D11)', async () => {
    await mainWithProbe({}, { locksSupported: false, storageBackend: memoryStorage({}, true) });
    expect(screen.getByTestId('banner-locks-unsupported')).toHaveTextContent(
      'Браузер не поддерживает блокировку вкладок — не открывайте чат в нескольких вкладках одновременно',
    );
    expect(screen.queryByTestId('banner-locks-unsupported-close')).toBeNull();
    act(() => {
      probeRef.current?.controller.getStorage()?.write('chats', []);
    });
    expect(screen.getByTestId('banner-storage')).toHaveTextContent(
      'Не удаётся сохранить данные в браузере — после перезагрузки чаты и сообщения пропадут',
    );
  });

  it('основной экран не содержит токен (DOM, атрибуты)', async () => {
    await mainWithProbe();
    expectNoTokenInDom();
    expect(within(screen.getByTestId('main-screen')).queryByDisplayValue(TEST_TOKEN)).toBeNull();
  });
});

/** Основной экран с пробой контекста `probe`. */
async function mainWithProbe(
  routes: Parameters<typeof routeFetch>[0] = {},
  deps: Partial<SessionProviderDeps> = {},
) {
  const api = routeFetch({
    getStateInstance: [{ body: { stateInstance: 'authorized' } }],
    getSettings: [{ body: OK_SETTINGS }],
    ...routes,
  });
  const session = memoryStorage();
  const d: SessionProviderDeps = {
    clientOptions: { fetch: api.fetch, sleep: () => Promise.resolve() },
    credentialsBackend: session,
    storageBackend: memoryStorage(),
    warn: vi.fn(),
    locksSupported: true,
    defaultApiUrl: TEST_API_URL,
    ...deps,
  };
  render(
    <App deps={d}>
      <Probe />
    </App>,
  );
  await login();
  await waitFor(() => {
    expect(api.callsOf('getSettings')).toHaveLength(1);
  });
  return { api, session };
}
