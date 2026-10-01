import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { App } from '../App';
import { useSession, type SessionContextValue } from '../index';
import type { SessionProviderDeps } from '../session/SessionProvider';
import { useChats, type ChatsContextValue } from './chatsContext';
import { ChatsProvider } from './ChatsProvider';
import { ChatList } from './ChatList';
import { ChatPane } from './ChatPane';
import { SessionProvider } from '../session/SessionProvider';
import { SEND_TEXTS } from '../../api';
import { SESSION_CREDENTIALS_KEY } from '../../store';
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
import {
  TEST_CHAT_ID,
  TEST_CHAT_ID_2,
  TEST_PHONE,
  TEST_PHONE_2,
  TEST_PHONE_FORMATTED,
  chatFixture,
  lsKey,
  storedChats,
} from '../../test/fixtures/chats';

const CREDS = { idInstance: TEST_ID_INSTANCE, apiTokenInstance: TEST_TOKEN, apiUrl: TEST_API_URL };
const OTHER_ID = '1101000001';

const probe: { session: SessionContextValue | null; chats: ChatsContextValue | null } = {
  session: null,
  chats: null,
};
function SessionProbe() {
  const v = useSession();
  useEffect(() => {
    probe.session = v;
  });
  return null;
}
/** Проба чатов — внутри `ChatsProvider`. */
function ChatsProbe() {
  const v = useChats();
  useEffect(() => {
    probe.chats = v;
  });
  return null;
}

interface SetupOptions {
  routes?: Record<string, Reply[]>;
  local?: ReturnType<typeof memoryStorage>;
  idInstance?: string;
  deps?: Partial<SessionProviderDeps>;
}

/** Основной экран через восстановление сессии из sessionStorage (п. 1.9). */
async function openMain(opts: SetupOptions = {}) {
  const api = routeFetch({
    getStateInstance: [{ body: { stateInstance: 'authorized' } }],
    getSettings: [{ body: OK_SETTINGS }],
    ...opts.routes,
  });
  const session = memoryStorage({
    [SESSION_CREDENTIALS_KEY]: JSON.stringify({
      ...CREDS,
      idInstance: opts.idInstance ?? TEST_ID_INSTANCE,
    }),
  });
  const local = opts.local ?? memoryStorage();
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
  const view = render(
    <App deps={deps}>
      <SessionProbe />
    </App>,
  );
  await screen.findByTestId('main-screen');
  await waitFor(() => {
    expect(api.callsOf('getSettings')).toHaveLength(1);
  });
  return { api, local, session, warn, view, deps };
}

const chatItems = () => screen.queryAllByTestId('chat-item');
const firstItem = (): HTMLElement => {
  const [el] = chatItems();
  if (!el) throw new Error('список пуст');
  return el;
};
const chatIds = () => chatItems().map((el) => el.getAttribute('data-chat-id'));

function openDialog() {
  fireEvent.click(screen.getByTestId('new-chat-button'));
  return screen.getByTestId('new-chat-dialog');
}

function submitPhone(value: string) {
  fireEvent.change(screen.getByTestId('new-chat-phone'), { target: { value } });
  fireEvent.click(screen.getByTestId('new-chat-submit'));
}

let consoleSpies: MockInstance[] = [];
let consoleWarn: MockInstance | null = null;
beforeEach(() => {
  probe.session = null;
  probe.chats = null;
  vi.stubGlobal('fetch', () => {
    throw new Error('real network is forbidden in tests');
  });
  consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m): MockInstance =>
    vi.spyOn(console, m).mockImplementation(() => undefined),
  );
  consoleWarn = consoleSpies[2] ?? null;
});
afterEach(() => {
  for (const s of consoleSpies) s.mockRestore();
  vi.unstubAllGlobals();
});

/** Ни в console.*, ни в deps.warn нет номера, chatId и токена (персональные данные, НФТ-3). */
function expectNoPersonalDataInLogs(warn: ReturnType<typeof vi.fn>) {
  const logged = JSON.stringify([...consoleSpies.map((s) => s.mock.calls), warn.mock.calls]);
  for (const secret of [TEST_PHONE, TEST_PHONE_2, TEST_CHAT_ID, TEST_CHAT_ID_2, TEST_TOKEN])
    expect(logged).not.toContain(secret);
}

describe('список чатов (§4.0 п. 2, п. 5.2, ВА-15)', () => {
  it('пусто — подпись «Чатов пока нет», правая колонка — заглушка', async () => {
    await openMain();
    expect(screen.getByTestId('chat-list-empty')).toBeInTheDocument();
    expect(screen.getByTestId('chat-empty')).toHaveTextContent('Выберите чат или создайте новый');
  });

  it('из localStorage: порядок по последнему сообщению / созданию, превью, время, счётчик', async () => {
    const ts = 1_790_000_100;
    const local = memoryStorage(
      storedChats([
        chatFixture({ createdAt: 1_790_000_000 }),
        chatFixture({
          chatId: TEST_CHAT_ID_2,
          phone: TEST_PHONE_2,
          createdAt: 1_789_000_000,
          unread: 3,
          chatName: 'Собеседник',
          lastMessage: { text: 'привет\nкак дела', timestamp: ts, direction: 'in' },
        }),
      ]),
    );
    await openMain({ local });
    expect(chatIds()).toEqual([TEST_CHAT_ID_2, TEST_CHAT_ID]);
    const [first, second] = chatItems() as [HTMLElement, HTMLElement];
    expect(within(first).getByTestId('chat-item-title')).toHaveTextContent('Собеседник');
    expect(within(first).getByTestId('chat-item-preview')).toHaveTextContent('привет как дела');
    expect(within(first).getByTestId('chat-item-preview')).toHaveAttribute('dir', 'auto');
    const d = new Date(ts * 1000);
    const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    expect(within(first).getByTestId('chat-item-time')).toHaveTextContent(hhmm);
    expect(within(first).getByTestId('chat-item-unread')).toHaveTextContent('3');
    expect(within(second).getByTestId('chat-item-title')).toHaveTextContent(TEST_PHONE_FORMATTED);
    expect(within(second).queryByTestId('chat-item-unread')).toBeNull();
  });

  it('открытие чата: шапка (Р-15), счётчик сброшен и сохранён (EC-D9)', async () => {
    const local = memoryStorage(storedChats([chatFixture({ unread: 2, chatName: 'Собеседник' })]));
    await openMain({ local });
    fireEvent.click(screen.getByTestId('chat-item'));
    expect(screen.getByTestId('chat-item')).toHaveAttribute('aria-current', 'true');
    expect(screen.getByTestId('chat-title')).toHaveTextContent('Собеседник');
    expect(screen.getByTestId('chat-subtitle')).toHaveTextContent(TEST_PHONE_FORMATTED);
    expect(screen.queryByTestId('chat-item-unread')).toBeNull();
    expect(JSON.parse(local.map.get(lsKey('chats')) ?? '[]')).toEqual([
      chatFixture({ unread: 0, chatName: 'Собеседник' }),
    ]);
  });

  it('EC-D8: битый раздел — пустой список, без падения', async () => {
    const local = memoryStorage({ [lsKey('chats')]: '{"chats":[{"chatId":"10000000"' });
    await openMain({ local });
    expect(screen.getByTestId('chat-list-empty')).toBeInTheDocument();
  });

  it('EC-D7: чаты другого инстанса не видны', async () => {
    const local = memoryStorage(storedChats([chatFixture()], {}, OTHER_ID));
    await openMain({ local });
    expect(chatItems()).toHaveLength(0);
  });

  it('ВА-20: «отправляется» в сохранённой ленте → «не отправлено» при загрузке и при выходе', async () => {
    const section = lsKey(`messages:${TEST_CHAT_ID}`);
    const sending = JSON.stringify({
      messages: [
        {
          localId: 'a',
          chatId: TEST_CHAT_ID,
          direction: 'out',
          text: 't',
          timestamp: 1,
          status: 'sending',
        },
      ],
      index: {},
    });
    const local = memoryStorage({ ...storedChats([chatFixture()]), [section]: sending });
    await openMain({ local });
    expect(local.map.get(section)).toContain(SEND_TEXTS.statusUnknown);
    // F4 записал новое «отправляется», пользователь вышел
    local.map.set(section, sending);
    fireEvent.click(screen.getByTestId('logout-button'));
    expect(local.map.get(section)).toContain('"status":"error"');
  });

  it('F4/F5: reportActivity поднимает чат и растит счётчик, reportChatName меняет заголовок', async () => {
    const local = memoryStorage(
      storedChats([
        chatFixture({ createdAt: 2 }),
        chatFixture({ chatId: TEST_CHAT_ID_2, phone: TEST_PHONE_2, createdAt: 1 }),
      ]),
    );
    const session = memoryStorage({ [SESSION_CREDENTIALS_KEY]: JSON.stringify(CREDS) });
    const api = routeFetch();
    function Gate() {
      const { state } = useSession();
      if (state.status !== 'loggedIn') return null;
      return (
        <ChatsProvider key={state.generation}>
          <ChatsProbe />
          <ChatList />
          <ChatPane />
        </ChatsProvider>
      );
    }
    render(
      <SessionProvider
        deps={{
          clientOptions: { fetch: api.fetch },
          credentialsBackend: session,
          storageBackend: local,
          locksSupported: true,
        }}
      >
        <Gate />
      </SessionProvider>,
    );
    await screen.findByTestId('chat-list');
    expect(chatIds()).toEqual([TEST_CHAT_ID, TEST_CHAT_ID_2]);
    act(() => {
      probe.chats?.reportActivity(
        TEST_CHAT_ID_2,
        { text: 'входящее', timestamp: 10, direction: 'in' },
        true,
      );
    });
    expect(chatIds()).toEqual([TEST_CHAT_ID_2, TEST_CHAT_ID]);
    expect(within(firstItem()).getByTestId('chat-item-unread')).toHaveTextContent('1');
    expect(within(firstItem()).getByTestId('chat-item-preview')).toHaveTextContent('входящее');
    act(() => {
      probe.chats?.reportChatName(TEST_CHAT_ID_2, 'Собеседник');
      probe.chats?.selectChat(TEST_CHAT_ID_2);
    });
    expect(screen.getByTestId('chat-title')).toHaveTextContent('Собеседник');
    expect(screen.queryByTestId('chat-item-unread')).toBeNull();
    const saved = JSON.parse(local.map.get(lsKey('chats')) ?? '[]') as {
      chatId: string;
      chatName?: string;
    }[];
    expect(saved[0]).toMatchObject({ chatId: TEST_CHAT_ID_2, chatName: 'Собеседник', unread: 0 });
  });
});

describe('«Новый чат» (ОР-2, §4.0 п. 3)', () => {
  it('2.1: диалог с фокусом в поле; Отмена и Esc закрывают', async () => {
    await openMain();
    openDialog();
    expect(screen.getByTestId('new-chat-phone')).toHaveFocus();
    expect(screen.getByLabelText('Номер телефона')).toBe(screen.getByTestId('new-chat-phone'));
    fireEvent.click(screen.getByTestId('new-chat-cancel'));
    expect(screen.queryByTestId('new-chat-dialog')).toBeNull();
    fireEvent.keyDown(openDialog(), { key: 'Escape' });
    expect(screen.queryByTestId('new-chat-dialog')).toBeNull();
  });

  it('2.3: невалидный номер — ошибка у поля, запроса нет', async () => {
    const { api } = await openMain();
    openDialog();
    submitPhone('12345');
    expect(await screen.findByTestId('new-chat-error')).toHaveTextContent(
      'Введите номер в формате +7XXXXXXXXXX или +375XXXXXXXXX',
    );
    expect(screen.getByTestId('new-chat-phone')).toHaveAttribute('aria-invalid', 'true');
    expect(api.callsOf('checkAccount')).toHaveLength(0);
  });

  it('2.5–2.6, 2.10: checkAccount → чат вверху и открыт, кеш и чат в localStorage', async () => {
    const local = memoryStorage(
      storedChats([chatFixture({ chatId: TEST_CHAT_ID_2, phone: TEST_PHONE_2 })]),
    );
    const { api, warn } = await openMain({
      local,
      routes: { checkAccount: [{ body: { exist: true, chatId: TEST_CHAT_ID, fromCache: false } }] },
    });
    openDialog();
    submitPhone('+7 (999) 000-00-01');
    await waitFor(() => {
      expect(screen.queryByTestId('new-chat-dialog')).toBeNull();
    });
    expect(chatIds()).toEqual([TEST_CHAT_ID, TEST_CHAT_ID_2]);
    expect(screen.getByTestId('chat-title')).toHaveTextContent(TEST_PHONE_FORMATTED);
    expect(screen.getByTestId('chat-window')).toHaveAttribute('data-chat-id', TEST_CHAT_ID);
    expect(api.callsOf('checkAccount')).toHaveLength(1);
    expect(api.callsOf('checkAccount')[0]?.init.body).toBe(`{"phoneNumber":${TEST_PHONE}}`);
    expect(api.callsOf('sendMessage')).toHaveLength(0); // 2.9
    expect(JSON.parse(local.map.get(lsKey('phoneCache')) ?? '{}')).toEqual({
      [TEST_PHONE]: TEST_CHAT_ID,
    });
    const saved = JSON.parse(local.map.get(lsKey('chats')) ?? '[]') as { chatId: string }[];
    expect(saved.map((c) => c.chatId)).toEqual([TEST_CHAT_ID, TEST_CHAT_ID_2]);
    expect(JSON.stringify([...local.map.values()])).not.toContain(TEST_TOKEN);
    expectNoPersonalDataInLogs(warn);
  });

  it('2.4, EC-D10: номер в кеше (другим написанием) — без checkAccount; чат уже есть — открывается, без дубля', async () => {
    const local = memoryStorage(storedChats([chatFixture()], { [TEST_PHONE]: TEST_CHAT_ID }));
    const { api } = await openMain({ local });
    openDialog();
    submitPhone('8 999 000 00 01');
    await waitFor(() => {
      expect(screen.queryByTestId('new-chat-dialog')).toBeNull();
    });
    expect(chatIds()).toEqual([TEST_CHAT_ID]);
    expect(screen.getByTestId('chat-window')).toHaveAttribute('data-chat-id', TEST_CHAT_ID);
    expect(api.callsOf('checkAccount')).toHaveLength(0);
  });

  it('2.4: номер в кеше, а чата нет — чат создаётся из кеша без checkAccount', async () => {
    const local = memoryStorage(storedChats([], { [TEST_PHONE]: TEST_CHAT_ID }));
    const { api } = await openMain({ local });
    openDialog();
    submitPhone(TEST_PHONE);
    await waitFor(() => {
      expect(chatIds()).toEqual([TEST_CHAT_ID]);
    });
    expect(api.callsOf('checkAccount')).toHaveLength(0);
  });

  it('2.6: другой номер с тем же chatId — чат не дублируется, номер попадает в кеш', async () => {
    const local = memoryStorage(storedChats([chatFixture()], { [TEST_PHONE]: TEST_CHAT_ID }));
    await openMain({
      local,
      routes: { checkAccount: [{ body: { exist: true, chatId: TEST_CHAT_ID } }] },
    });
    openDialog();
    submitPhone(TEST_PHONE_2);
    await waitFor(() => {
      expect(screen.queryByTestId('new-chat-dialog')).toBeNull();
    });
    expect(chatIds()).toEqual([TEST_CHAT_ID]);
    expect(JSON.parse(local.map.get(lsKey('phoneCache')) ?? '{}')).toEqual({
      [TEST_PHONE]: TEST_CHAT_ID,
      [TEST_PHONE_2]: TEST_CHAT_ID,
    });
  });

  it('EC-U7: двойное «Создать» — один запрос, кнопка и «Отмена» неактивны во время запроса', async () => {
    const gate = deferred();
    const { api } = await openMain({ routes: { checkAccount: [{ deferred: gate }] } });
    openDialog();
    submitPhone(TEST_PHONE);
    expect(screen.getByTestId('new-chat-submit')).toBeDisabled();
    expect(screen.getByTestId('new-chat-cancel')).toBeDisabled();
    expect(screen.getByTestId('new-chat-spinner')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('new-chat-submit'));
    fireEvent.submit(screen.getByTestId('new-chat-form'));
    fireEvent.keyDown(screen.getByTestId('new-chat-dialog'), { key: 'Escape' });
    expect(screen.getByTestId('new-chat-dialog')).toBeInTheDocument();
    await act(async () => {
      gate.release({ body: { exist: true, chatId: TEST_CHAT_ID } });
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(screen.queryByTestId('new-chat-dialog')).toBeNull();
    });
    expect(api.callsOf('checkAccount')).toHaveLength(1);
  });

  it.each<[string, Reply, string]>([
    [
      'exist:false (2.7)',
      { body: { exist: false, chatId: '' } },
      'На этом номере нет аккаунта MAX',
    ],
    [
      'EC-I9 chatId с @c.us',
      { body: { exist: true, chatId: `${TEST_CHAT_ID}@c.us` } },
      'Не удалось проверить номер: неожиданный ответ сервера. Попробуйте позже',
    ],
    [
      'EC-I9 нет exist',
      { body: {} },
      'Не удалось проверить номер: неожиданный ответ сервера. Попробуйте позже',
    ],
    [
      'сеть (EC-Q7)',
      { throws: new TypeError('Failed to fetch') },
      'Не удалось проверить номер: нет связи с сервером GREEN-API. Проверьте соединение и нажмите «Создать» ещё раз',
    ],
    [
      '429 (EC-Q7)',
      { status: 429 },
      'Слишком много запросов. Подождите несколько секунд и нажмите «Создать» ещё раз',
    ],
    [
      '500 (EC-Q7)',
      { status: 500 },
      'Сервер GREEN-API временно не отвечает. Нажмите «Создать» ещё раз через минуту',
    ],
    ['469 (EC-Q6)', { status: 469 }, 'Слишком много проверок номеров, повторите позже'],
    [
      'timeout limit (EC-Q6)',
      { status: 400, body: { status: false, reason: 'check phone number timeout limit exceeded' } },
      'MAX не ответил вовремя при проверке номера. Нажмите «Создать» ещё раз через минуту',
    ],
  ])(
    '%s: текст под полем, номер остаётся, «Создать» активна, чат и кеш не пишутся',
    async (_n, reply, text) => {
      const { api, local, warn } = await openMain({ routes: { checkAccount: [reply] } });
      openDialog();
      submitPhone(TEST_PHONE);
      expect(await screen.findByTestId('new-chat-error')).toHaveTextContent(text);
      expect(screen.getByTestId<HTMLInputElement>('new-chat-phone').value).toBe(TEST_PHONE);
      expect(screen.getByTestId('new-chat-submit')).toBeEnabled();
      expect(chatItems()).toHaveLength(0);
      expect(local.map.has(lsKey('phoneCache'))).toBe(false);
      expect(local.map.has(lsKey('chats'))).toBe(false);
      expect(api.callsOf('checkAccount')).toHaveLength(1);
      expectNoPersonalDataInLogs(warn);
    },
  );

  it('EC-Q2: 466 checks — текст в диалоге, баннера нет; 466 chats — текст и баннер квоты', async () => {
    await openMain({
      routes: {
        checkAccount: [
          {
            status: 466,
            body: {
              invokeStatus: {
                method: 'checkAccount',
                used: 100,
                total: 100,
                status: 'QUOTE_EXCEEDED',
              },
            },
          },
          {
            status: 466,
            body: {
              correspondentsStatus: { method: 'correspondents', used: 3, total: 3, status: 'X' },
            },
          },
        ],
      },
    });
    openDialog();
    submitPhone(TEST_PHONE);
    expect(await screen.findByTestId('new-chat-error')).toHaveTextContent(
      /^Исчерпан месячный лимит проверок номеров \(100 на тарифе Developer\)/,
    );
    expect(screen.queryByTestId('banner-quota')).toBeNull();
    fireEvent.click(screen.getByTestId('new-chat-submit'));
    await waitFor(() => {
      expect(screen.getByTestId('new-chat-error')).toHaveTextContent(/^Нельзя начать новый чат/);
    });
    expect(screen.getByTestId('banner-quota')).toBeInTheDocument();
    expect(chatItems()).toHaveLength(0);
  });

  it('401 на checkAccount — экран входа (§5.4)', async () => {
    await openMain({ routes: { checkAccount: [{ status: 401 }] } });
    openDialog();
    submitPhone(TEST_PHONE);
    expect(await screen.findByTestId('login-error')).toHaveTextContent('Неверный apiTokenInstance');
  });
});

describe('вкладка только на чтение (Р-12, EC-S4, EC-S10)', () => {
  it('«Новый чат» неактивна с подсказкой; открытие чата не пишет в localStorage; после захвата замка — перечитывание', async () => {
    const local = memoryStorage(storedChats([chatFixture({ unread: 2 })]));
    const setItem = vi.spyOn(local, 'setItem');
    await openMain({ local });
    act(() => {
      probe.session?.controller.setReadOnly(true);
    });
    expect(screen.getByTestId('new-chat-button')).toBeDisabled();
    expect(screen.getByTestId('new-chat-button')).toHaveAttribute(
      'title',
      'Чат открыт в другой вкладке — пишите там',
    );
    expect(screen.getByTestId('new-chat-readonly-hint')).toHaveTextContent(
      'Чат открыт в другой вкладке — пишите там',
    );
    fireEvent.click(screen.getByTestId('chat-item'));
    expect(screen.queryByTestId('chat-item-unread')).toBeNull(); // в памяти вкладки
    expect(setItem).not.toHaveBeenCalled();
    act(() => {
      probe.session?.controller.setReadOnly(false);
    });
    // EC-S10: перечитан localStorage — счётчик вернулся
    expect(screen.getByTestId('chat-item-unread')).toHaveTextContent('2');
    expect(screen.getByTestId('new-chat-button')).toBeEnabled();
  });

  it('диалог закрывается, если вкладка стала только на чтение', async () => {
    await openMain();
    openDialog();
    act(() => {
      probe.session?.controller.setReadOnly(true);
    });
    expect(screen.queryByTestId('new-chat-dialog')).toBeNull();
  });
});

describe('сбой записи localStorage (Р-2, EC-D11)', () => {
  it('чат создаётся в памяти, баннер, один console.warn без номера и chatId', async () => {
    const local = memoryStorage({}, true);
    const { warn } = await openMain({
      local,
      routes: { checkAccount: [{ body: { exist: true, chatId: TEST_CHAT_ID } }] },
    });
    openDialog();
    submitPhone(TEST_PHONE);
    await waitFor(() => {
      expect(chatIds()).toEqual([TEST_CHAT_ID]);
    });
    expect(screen.getByTestId('banner-storage')).toHaveTextContent(
      'Не удаётся сохранить данные в браузере — после перезагрузки чаты и сообщения пропадут',
    );
    expect(consoleWarn?.mock.calls).toHaveLength(1);
    expectNoPersonalDataInLogs(warn);
  });
});

describe('перезагрузка (п. 2.10)', () => {
  it('чат и кеш на месте после перемонтирования', async () => {
    const r = await openMain({
      routes: { checkAccount: [{ body: { exist: true, chatId: TEST_CHAT_ID } }] },
    });
    openDialog();
    submitPhone(TEST_PHONE);
    await waitFor(() => {
      expect(chatIds()).toEqual([TEST_CHAT_ID]);
    });
    r.view.unmount();
    const again = await openMain({ local: r.local });
    expect(chatIds()).toEqual([TEST_CHAT_ID]);
    openDialog();
    submitPhone(TEST_PHONE);
    await waitFor(() => {
      expect(screen.queryByTestId('new-chat-dialog')).toBeNull();
    });
    expect(again.api.callsOf('checkAccount')).toHaveLength(0);
  });
});
