import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { BANNER_TEXTS, QUOTA_TEXTS, SEND_TEXTS } from '../../api';
import { SESSION_CREDENTIALS_KEY, SESSION_TEXTS, messageKey, messagesSection } from '../../store';
import type { StoredMessage } from '../../store';
import { App } from '../App';
import { useChats, type ChatsContextValue } from '../chats/chatsContext';
import { formatTime } from '../format';
import type { SessionProviderDeps } from '../session/SessionProvider';
import { useSession, type SessionContextValue } from '../session/sessionContext';
import { UI_TEXTS } from '../texts';
import { useMessages, type MessagesContextValue } from './messagesContext';
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
  chatFixture,
  lsKey,
  storedChats,
} from '../../test/fixtures/chats';
import { BASE_TIMESTAMP, ID_MESSAGES } from '../../test/fixtures/constants';
import { errorResponses, tooManyRequestsResponses } from '../../test/fixtures/errors';
import { messageTexts } from '../../test/fixtures/inputs';
import { quota466Cases } from '../../test/fixtures/quota';
import { sendMessageResponses } from '../../test/fixtures/sendMessage';

const T = BASE_TIMESTAMP;
const CREDS = { idInstance: TEST_ID_INSTANCE, apiTokenInstance: TEST_TOKEN, apiUrl: TEST_API_URL };

const probe: {
  session: SessionContextValue | null;
  chats: ChatsContextValue | null;
  messages: MessagesContextValue | null;
} = { session: null, chats: null, messages: null };

function Probe() {
  const session = useSession();
  const chats = useChats();
  const messages = useMessages();
  useEffect(() => {
    probe.session = session;
    probe.chats = chats;
    probe.messages = messages;
  });
  return null;
}

function messages(): MessagesContextValue {
  if (!probe.messages) throw new Error('MessagesProvider не смонтирован');
  return probe.messages;
}

function msg(over: Partial<StoredMessage> & Pick<StoredMessage, 'localId'>): StoredMessage {
  return { chatId: TEST_CHAT_ID, direction: 'in', text: 'текст', timestamp: T, ...over };
}

/** Лента чата в localStorage (`messages:<chatId>`). */
function storedMessages(list: StoredMessage[], chatId: string = TEST_CHAT_ID) {
  const index: Record<string, string> = {};
  for (const m of list) if (m.idMessage) index[messageKey(chatId, m.idMessage)] = m.localId;
  return { [lsKey(messagesSection(chatId))]: JSON.stringify({ messages: list, index }) };
}

function readStored(local: ReturnType<typeof memoryStorage>, chatId: string = TEST_CHAT_ID) {
  const raw = local.map.get(lsKey(messagesSection(chatId)));
  if (raw === undefined) throw new Error('лента не сохранена');
  return JSON.parse(raw) as { messages: StoredMessage[]; index: Record<string, string> };
}

interface SetupOptions {
  routes?: Record<string, Reply[]>;
  local?: ReturnType<typeof memoryStorage>;
  sleep?: (ms: number) => Promise<void>;
  /** Открыть первый чат списка. */
  open?: boolean;
}

const twoChats = () =>
  storedChats([
    chatFixture({ createdAt: T + 2 }),
    chatFixture({ chatId: TEST_CHAT_ID_2, phone: TEST_PHONE_2, createdAt: T + 1 }),
  ]);

async function openMain(opts: SetupOptions = {}) {
  const api = routeFetch({
    getStateInstance: [{ body: { stateInstance: 'authorized' } }],
    getSettings: [{ body: OK_SETTINGS }],
    sendMessage: [sendMessageResponses.sent],
    ...opts.routes,
  });
  const session = memoryStorage({ [SESSION_CREDENTIALS_KEY]: JSON.stringify(CREDS) });
  const local = opts.local ?? memoryStorage(twoChats());
  const warn = vi.fn();
  const deps: SessionProviderDeps = {
    clientOptions: { fetch: api.fetch, sleep: opts.sleep ?? (() => Promise.resolve()) },
    credentialsBackend: session,
    storageBackend: local,
    warn,
    locksSupported: true,
    defaultApiUrl: TEST_API_URL,
  };
  const view = render(<App deps={deps} sessionChildren={<Probe />} />);
  await screen.findByTestId('main-screen');
  await waitFor(() => {
    expect(api.callsOf('getSettings')).toHaveLength(1);
  });
  if (opts.open !== false) openChat(TEST_CHAT_ID);
  return { api, local, session, warn, view };
}

function openChat(chatId: string) {
  const item = screen.getAllByTestId('chat-item').find((el) => el.dataset.chatId === chatId);
  if (!item) throw new Error('чат не найден в списке');
  fireEvent.click(item);
}

const input = () => screen.getByTestId<HTMLTextAreaElement>('composer-input');
const sendButton = () => screen.getByTestId<HTMLButtonElement>('send-button');
const bubbles = () => screen.queryAllByTestId('message');
const onlyBubble = (): HTMLElement => {
  const all = bubbles();
  if (all.length !== 1) throw new Error(`пузырей: ${String(all.length)}`);
  const [el] = all;
  if (!el) throw new Error('пузыря нет');
  return el;
};

function type(text: string) {
  fireEvent.change(input(), { target: { value: text } });
}

function pressEnter(init: Partial<KeyboardEventInit> = {}) {
  fireEvent.keyDown(input(), { key: 'Enter', code: 'Enter', ...init });
}

function sendBody(api: ReturnType<typeof routeFetch>, i = 0): unknown {
  const body = api.callsOf('sendMessage')[i]?.init.body;
  if (typeof body !== 'string') throw new Error('нет вызова sendMessage');
  return JSON.parse(body);
}

let consoleSpies: MockInstance[] = [];
beforeEach(() => {
  probe.session = null;
  probe.chats = null;
  probe.messages = null;
  consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
    vi.spyOn(console, m).mockImplementation(() => undefined),
  );
});
afterEach(() => {
  // Приватность: номер, chatId и токен не попадают в консоль ни в одном сценарии.
  const logged = JSON.stringify(consoleSpies.flatMap((s) => s.mock.calls));
  // Ни предупреждений React (act, ключи), ни логов приложения в этих сценариях.
  expect(logged).toBe('[]');
  for (const secret of [TEST_PHONE, TEST_PHONE_2, TEST_CHAT_ID, TEST_CHAT_ID_2, TEST_TOKEN])
    expect(logged).not.toContain(secret);
  vi.restoreAllMocks();
});

describe('лента (§4.0 п. 2, Р-11, Р-16, EC-U4, EC-U5, EC-O1)', () => {
  it('пузыри: свои справа со статусом, входящие слева, время, заглушка, порядок по времени', async () => {
    const local = memoryStorage({
      ...twoChats(),
      ...storedMessages([
        msg({ localId: 'b', direction: 'out', text: 'моё', timestamp: T + 60, status: 'sent' }),
        msg({ localId: 'a', idMessage: ID_MESSAGES.incoming1, text: 'привет', timestamp: T }),
        msg({ localId: 'c', idMessage: ID_MESSAGES.incoming2, text: '', unsupported: true }),
        msg({
          localId: 'd',
          direction: 'out',
          text: 'упало',
          timestamp: T + 120,
          status: 'error',
          errorText: SEND_TEXTS.statusUnknown,
        }),
      ]),
    });
    await openMain({ local });
    // EC-O2: равные timestamp — по порядку поступления; иначе по времени.
    expect(bubbles().map((el) => el.dataset.localId)).toEqual(['a', 'c', 'b', 'd']);
    const [incoming, placeholder, own, failed] = bubbles();
    if (!incoming || !placeholder || !own || !failed) throw new Error('не все пузыри');

    expect(incoming).toHaveClass('message--in');
    expect(incoming).not.toHaveAttribute('dir');
    expect(within(incoming).getByTestId('message-text')).toHaveAttribute('dir', 'auto');
    expect(within(incoming).getByTestId('message-time')).toHaveTextContent(formatTime(T));
    expect(within(incoming).getByTestId('message-time')).toHaveAttribute(
      'dateTime',
      new Date(T * 1000).toISOString(),
    );
    expect(within(incoming).queryByTestId('message-status')).toBeNull();

    expect(within(placeholder).getByTestId('message-text')).toHaveTextContent(
      BANNER_TEXTS.unsupportedMessage,
    );

    expect(own).toHaveClass('message--out');
    // «Отправлено» — без значка (п. 3.3).
    expect(within(own).queryByTestId('message-status')).toBeNull();

    expect(within(failed).getByTestId('message-status')).toHaveTextContent(UI_TEXTS.statusError);
    expect(within(failed).getByTestId('message-error')).toHaveTextContent(SEND_TEXTS.statusUnknown);
    expect(within(failed).getByTestId('message-retry')).toBeEnabled();
  });

  it('«отправляется» из прошлой загрузки показывается как «не отправлено» (ВА-20, EC-D5)', async () => {
    const local = memoryStorage({
      ...twoChats(),
      ...storedMessages([msg({ localId: 's', direction: 'out', status: 'sending' })]),
    });
    await openMain({ local });
    expect(onlyBubble()).toHaveAttribute('data-status', 'error');
    expect(within(onlyBubble()).getByTestId('message-error')).toHaveTextContent(
      SEND_TEXTS.statusUnknown,
    );
  });

  it('Р-16 / EC-U4: HTML и ссылки — просто текст; переносы сохраняются', async () => {
    const local = memoryStorage({
      ...twoChats(),
      ...storedMessages([
        msg({ localId: 'h', text: messageTexts.html }),
        msg({ localId: 'l', text: messageTexts.link, timestamp: T + 1 }),
        msg({ localId: 'm', text: messageTexts.multiline, timestamp: T + 2 }),
      ]),
    });
    await openMain({ local });
    const list = screen.getByTestId('message-list');
    expect(list.querySelector('b, img, a')).toBeNull();
    const texts = screen.getAllByTestId('message-text').map((el) => el.textContent);
    expect(texts).toEqual([messageTexts.html, messageTexts.link, messageTexts.multiline]);
  });

  it('EC-U5: RTL и U+202E в своём пузыре — пузырь справа, dir="auto" только у текста', async () => {
    const local = memoryStorage({
      ...twoChats(),
      ...storedMessages([
        msg({ localId: 'r', direction: 'out', status: 'sent', text: messageTexts.rtlText }),
        msg({ localId: 'x', text: messageTexts.bidiOverride, timestamp: T + 1 }),
      ]),
    });
    await openMain({ local });
    const [rtl, bidi] = bubbles();
    expect(rtl).toHaveClass('message--out');
    expect(rtl?.querySelectorAll('[dir]')).toHaveLength(1);
    expect(bidi?.querySelectorAll('[dir]')).toHaveLength(1);
    expect(within(bidi ?? document.body).getByTestId('message-text')).toHaveTextContent(
      messageTexts.bidiOverride,
    );
  });

  it('битая лента в localStorage — пустая, без исключения (EC-D8)', async () => {
    const local = memoryStorage({
      ...twoChats(),
      [lsKey(messagesSection(TEST_CHAT_ID))]: '{"messages": [{"bad": true}], "index": 5',
    });
    await openMain({ local });
    expect(screen.getByTestId('messages-empty')).toHaveTextContent(UI_TEXTS.noMessages);
  });
});

describe('поле ввода (п. 3.1, п. 3.5, EC-U1, EC-U2, EC-U6)', () => {
  it('Enter отправляет, Shift+Enter — нет; поле очищается', async () => {
    const { api } = await openMain();
    type('строка');
    pressEnter({ shiftKey: true });
    expect(api.callsOf('sendMessage')).toHaveLength(0);
    pressEnter();
    expect(input().value).toBe('');
    await waitFor(() => {
      expect(api.callsOf('sendMessage')).toHaveLength(1);
    });
  });

  it('EC-U6: Enter во время набора через IME не отправляет', async () => {
    const { api } = await openMain();
    type('にほん');
    pressEnter({ isComposing: true });
    fireEvent.compositionStart(input());
    pressEnter();
    expect(api.callsOf('sendMessage')).toHaveLength(0);
    expect(input().value).toBe('にほん');
    fireEvent.compositionEnd(input());
    pressEnter();
    await waitFor(() => {
      expect(api.callsOf('sendMessage')).toHaveLength(1);
    });
  });

  it.each([messageTexts.onlySpaces, messageTexts.onlyNewlines, ''])(
    'EC-U1: пустой текст или пробелы (%j) — кнопка неактивна, Enter не отправляет',
    async (text) => {
      const { api } = await openMain();
      type(text);
      expect(sendButton()).toBeDisabled();
      pressEnter();
      fireEvent.submit(screen.getByTestId('composer'));
      expect(api.callsOf('sendMessage')).toHaveLength(0);
      expect(bubbles()).toHaveLength(0);
    },
  );

  it('EC-U2: 4001 — кнопка неактивна, счётчик «4001/4000»; 4000 и 2000 emoji — можно', async () => {
    const { api } = await openMain();
    type(messageTexts.over4000);
    expect(sendButton()).toBeDisabled();
    expect(screen.getByTestId('composer-counter')).toHaveTextContent('4001/4000');
    expect(screen.getByTestId('composer-counter')).toHaveClass('composer__counter--over');
    pressEnter();
    expect(api.callsOf('sendMessage')).toHaveLength(0);

    type(messageTexts.emoji4001);
    expect(sendButton()).toBeDisabled();
    type(messageTexts.emoji4000);
    expect(sendButton()).toBeEnabled();
    expect(screen.getByTestId('composer-counter')).toHaveTextContent('4000/4000');
    type('коротко');
    expect(screen.queryByTestId('composer-counter')).toBeNull();
    type(messageTexts.max4000);
    fireEvent.click(sendButton());
    await waitFor(() => {
      expect(sendBody(api)).toEqual({ chatId: TEST_CHAT_ID, message: messageTexts.max4000 });
    });
  });

  it('текст отправляется как есть, без trim (ВА-14), кнопкой «Отправить»', async () => {
    const { api } = await openMain();
    type(messageTexts.surroundingSpaces);
    fireEvent.click(sendButton());
    await waitFor(() => {
      expect(sendBody(api)).toEqual({
        chatId: TEST_CHAT_ID,
        message: messageTexts.surroundingSpaces,
      });
    });
  });
});

describe('отправка (п. 3.1–3.6, §6.3)', () => {
  it('оптимистично «отправляется» → «отправлено», idMessage и индекс в localStorage, превью', async () => {
    const reply = deferred();
    const { api, local } = await openMain({ routes: { sendMessage: [{ deferred: reply }] } });
    openChat(TEST_CHAT_ID_2);
    type('привет');
    pressEnter();
    const bubble = onlyBubble();
    expect(bubble).toHaveAttribute('data-status', 'sending');
    expect(within(bubble).getByTestId('message-status')).toHaveTextContent(UI_TEXTS.statusSending);
    expect(within(bubble).getByTestId('message-text')).toHaveTextContent('привет');
    // Чат поднялся наверх, превью — своё сообщение, счётчик не растёт (п. 5.2).
    const [first] = screen.getAllByTestId('chat-item');
    expect(first).toHaveAttribute('data-chat-id', TEST_CHAT_ID_2);
    expect(within(first ?? document.body).getByTestId('chat-item-preview')).toHaveTextContent(
      'привет',
    );
    expect(within(first ?? document.body).queryByTestId('chat-item-unread')).toBeNull();
    // «Отправляется» уже в localStorage.
    expect(readStored(local, TEST_CHAT_ID_2).messages[0]?.status).toBe('sending');

    await waitFor(() => {
      expect(api.callsOf('sendMessage')).toHaveLength(1);
    });
    expect(sendBody(api)).toEqual({ chatId: TEST_CHAT_ID_2, message: 'привет' });
    await act(async () => {
      reply.release(sendMessageResponses.sent);
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(onlyBubble()).toHaveAttribute('data-status', 'sent');
    });
    expect(within(onlyBubble()).queryByTestId('message-status')).toBeNull();
    const stored = readStored(local, TEST_CHAT_ID_2);
    const localId = onlyBubble().dataset.localId;
    expect(stored.messages).toEqual([
      expect.objectContaining({ localId, idMessage: ID_MESSAGES.api1, status: 'sent' }),
    ]);
    expect(stored.index).toEqual({ [messageKey(TEST_CHAT_ID_2, ID_MESSAGES.api1)]: localId });
  });

  it('EC-T7 / EC-Q8: 429 — «отправляется» во время автоповторов, затем текст п. 3.4 и «Повторить»', async () => {
    const pauses: (() => void)[] = [];
    const sleep = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          pauses.push(resolve);
        }),
    );
    const { api } = await openMain({
      sleep,
      routes: { sendMessage: [tooManyRequestsResponses.noRetryAfter] },
    });
    type('a');
    pressEnter();
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await waitFor(() => {
        expect(pauses).toHaveLength(attempt);
      });
      expect(onlyBubble()).toHaveAttribute('data-status', 'sending');
      await act(async () => {
        pauses[attempt - 1]?.();
        await Promise.resolve();
      });
    }
    await waitFor(() => {
      expect(onlyBubble()).toHaveAttribute('data-status', 'error');
    });
    expect(api.callsOf('sendMessage')).toHaveLength(4);
    expect(sleep.mock.calls.map((args: unknown[]) => args[0])).toEqual([1000, 2000, 4000]);
    expect(within(onlyBubble()).getByTestId('message-error')).toHaveTextContent(
      SEND_TEXTS.rateLimited,
    );

    // Ручной повтор — то же сообщение (EC-D6).
    const localId = onlyBubble().dataset.localId;
    api.set('sendMessage', [sendMessageResponses.sent2]);
    fireEvent.click(within(onlyBubble()).getByTestId('message-retry'));
    expect(onlyBubble()).toHaveAttribute('data-status', 'sending');
    await waitFor(() => {
      expect(onlyBubble()).toHaveAttribute('data-status', 'sent');
    });
    expect(onlyBubble().dataset.localId).toBe(localId);
    expect(api.callsOf('sendMessage')).toHaveLength(5);
  });

  it('EC-Q8 (M-19): 429 → 429 → 200 — один пузырь «отправлено», 3 вызова', async () => {
    const { api } = await openMain({
      routes: {
        sendMessage: [
          tooManyRequestsResponses.noRetryAfter,
          tooManyRequestsResponses.retryAfter0s,
          sendMessageResponses.sent,
        ],
      },
    });
    type('a');
    pressEnter();
    await waitFor(() => {
      expect(onlyBubble()).toHaveAttribute('data-status', 'sent');
    });
    expect(api.callsOf('sendMessage')).toHaveLength(3);
  });

  it('EC-Q1: 466 — текст квоты под пузырём и баннер, без автоповтора', async () => {
    const { api } = await openMain({
      routes: { sendMessage: [quota466Cases.correspondentsStatus.response] },
    });
    type('a');
    pressEnter();
    await waitFor(() => {
      expect(onlyBubble()).toHaveAttribute('data-status', 'error');
    });
    expect(within(onlyBubble()).getByTestId('message-error')).toHaveTextContent(
      QUOTA_TEXTS.sendChats,
    );
    expect(screen.getByTestId('banner-quota')).toBeInTheDocument();
    expect(api.callsOf('sendMessage')).toHaveLength(1);
    expect(within(onlyBubble()).getByTestId('message-retry')).toBeEnabled();
  });

  it('EC-S9: 403 suspended — свой текст, сессия не завершается', async () => {
    await openMain({ routes: { sendMessage: [errorResponses.suspended403.json] } });
    type('a');
    pressEnter();
    await waitFor(() => {
      expect(within(onlyBubble()).getByTestId('message-error')).toHaveTextContent(
        SEND_TEXTS.suspended,
      );
    });
    expect(screen.getByTestId('main-screen')).toBeInTheDocument();
  });

  it('400 «instance is starting…» — текст под пузырём и баннер (п. 3.6)', async () => {
    await openMain({ routes: { sendMessage: [errorResponses.starting400.json] } });
    type('a');
    pressEnter();
    await waitFor(() => {
      expect(within(onlyBubble()).getByTestId('message-error')).toHaveTextContent(
        SEND_TEXTS.instanceNotReady,
      );
    });
    expect(screen.getByTestId('banner-not-ready')).toBeInTheDocument();
  });

  it.each<[string, Reply]>([
    ['500', errorResponses.internal500.json],
    ['сеть', { throws: new TypeError('Failed to fetch') }],
  ])('%s — «Статус неизвестен…», автоповтора нет (ВА-20)', async (_name, reply) => {
    const { api } = await openMain({ routes: { sendMessage: [reply, sendMessageResponses.sent] } });
    type('a');
    pressEnter();
    await waitFor(() => {
      expect(within(onlyBubble()).getByTestId('message-error')).toHaveTextContent(
        SEND_TEXTS.statusUnknown,
      );
    });
    expect(api.callsOf('sendMessage')).toHaveLength(1);
  });

  it('401 при отправке — выход на экран входа, сообщение «не отправлено» в localStorage', async () => {
    const { local } = await openMain({
      routes: { sendMessage: [errorResponses.unauthorized401] },
    });
    type('a');
    pressEnter();
    await screen.findByTestId('login-form');
    expect(readStored(local).messages[0]).toMatchObject({
      status: 'error',
      errorText: SEND_TEXTS.statusUnknown,
    });
  });

  it('EC-D5: выход во время отправки — «не отправлено» в localStorage, поздний ответ игнорируется', async () => {
    const reply = deferred();
    const { local, api } = await openMain({ routes: { sendMessage: [{ deferred: reply }] } });
    type('a');
    pressEnter();
    await waitFor(() => {
      expect(api.callsOf('sendMessage')).toHaveLength(1);
    });
    fireEvent.click(screen.getByTestId('logout-button'));
    await screen.findByTestId('login-form');
    const failed = readStored(local).messages;
    expect(failed[0]).toMatchObject({ status: 'error', errorText: SEND_TEXTS.statusUnknown });
    await act(async () => {
      reply.release(sendMessageResponses.sent);
      await Promise.resolve();
    });
    expect(readStored(local).messages).toEqual(failed);
  });
});

describe('слияние для F5 (§6.3)', () => {
  it('EC-D2: уведомление раньше ответа — один пузырь из уведомления', async () => {
    const reply = deferred();
    const { local, api } = await openMain({ routes: { sendMessage: [{ deferred: reply }] } });
    type('гонка');
    pressEnter();
    await waitFor(() => {
      expect(api.callsOf('sendMessage')).toHaveLength(1);
    });
    let outcome = '';
    act(() => {
      outcome = messages().applyNotification({
        chatId: TEST_CHAT_ID,
        idMessage: ID_MESSAGES.apiRace,
        source: 'outgoingApi',
        text: 'гонка',
        timestamp: T,
      });
    });
    expect(outcome).toBe('added');
    expect(bubbles()).toHaveLength(2);
    await act(async () => {
      reply.release(sendMessageResponses.sentRace);
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(bubbles()).toHaveLength(1);
    });
    expect(onlyBubble()).toHaveAttribute('data-status', 'sent');
    const stored = readStored(local);
    expect(stored.messages).toHaveLength(1);
    expect(stored.messages[0]?.timestamp).toBe(T);
  });

  it('EC-D3 / EC-O3: уведомление после ответа — тот же пузырь, серверное время', async () => {
    const { local } = await openMain();
    type('после');
    pressEnter();
    await waitFor(() => {
      expect(onlyBubble()).toHaveAttribute('data-status', 'sent');
    });
    const localId = onlyBubble().dataset.localId;
    let outcome = '';
    act(() => {
      outcome = messages().applyNotification({
        chatId: TEST_CHAT_ID,
        idMessage: ID_MESSAGES.api1,
        source: 'outgoingApi',
        text: 'после',
        timestamp: T,
      });
    });
    expect(outcome).toBe('confirmed');
    expect(onlyBubble().dataset.localId).toBe(localId);
    expect(within(onlyBubble()).getByTestId('message-time')).toHaveTextContent(formatTime(T));
    expect(readStored(local).messages[0]?.timestamp).toBe(T);
    // Повтор того же уведомления (EC-D1).
    act(() => {
      outcome = messages().applyNotification({
        chatId: TEST_CHAT_ID,
        idMessage: ID_MESSAGES.api1,
        source: 'outgoingApi',
        text: 'после',
        timestamp: T,
      });
    });
    expect(outcome).toBe('duplicate');
    expect(bubbles()).toHaveLength(1);
  });

  it('входящее в неоткрытый чат: счётчик, превью, наверх; заглушка; неизвестный чат — без изменений', async () => {
    const { local } = await openMain();
    const results: string[] = [];
    act(() => {
      results.push(
        messages().applyNotification({
          chatId: TEST_CHAT_ID_2,
          idMessage: ID_MESSAGES.incoming1,
          source: 'incoming',
          text: 'ответ',
          timestamp: T + 100,
        }),
        // Два вызова подряд без рендера: второй видит первый (дубль).
        messages().applyNotification({
          chatId: TEST_CHAT_ID_2,
          idMessage: ID_MESSAGES.incoming1,
          source: 'incoming',
          text: 'ответ',
          timestamp: T + 100,
        }),
        messages().applyNotification({
          chatId: TEST_CHAT_ID_2,
          idMessage: ID_MESSAGES.incoming2,
          source: 'incoming',
          text: '',
          unsupported: true,
          timestamp: T + 101,
        }),
        messages().applyNotification({
          chatId: '10000099',
          idMessage: ID_MESSAGES.incoming3,
          source: 'incoming',
          text: 'чужой',
          timestamp: T,
        }),
      );
    });
    expect(results).toEqual(['added', 'duplicate', 'added', 'unknownChat']);
    const [first] = screen.getAllByTestId('chat-item');
    expect(first).toHaveAttribute('data-chat-id', TEST_CHAT_ID_2);
    expect(within(first ?? document.body).getByTestId('chat-item-unread')).toHaveTextContent('2');
    expect(within(first ?? document.body).getByTestId('chat-item-preview')).toHaveTextContent(
      BANNER_TEXTS.unsupportedMessage,
    );
    expect(readStored(local, TEST_CHAT_ID_2).messages).toHaveLength(2);
    expect(local.map.has(lsKey(messagesSection('10000099')))).toBe(false);
    openChat(TEST_CHAT_ID_2);
    expect(bubbles().map((el) => el.dataset.direction)).toEqual(['in', 'in']);
  });

  it('с телефона (outgoingPhone) — свой пузырь справа, счётчик не растёт (EC-N13)', async () => {
    await openMain({ open: false });
    act(() => {
      messages().applyNotification({
        chatId: TEST_CHAT_ID_2,
        idMessage: ID_MESSAGES.phone1,
        source: 'outgoingPhone',
        text: 'с телефона',
        timestamp: T + 100,
      });
    });
    const [first] = screen.getAllByTestId('chat-item');
    expect(first).toHaveAttribute('data-chat-id', TEST_CHAT_ID_2);
    expect(within(first ?? document.body).queryByTestId('chat-item-unread')).toBeNull();
    openChat(TEST_CHAT_ID_2);
    expect(onlyBubble()).toHaveClass('message--out');
  });
});

describe('вкладка «только чтение» (EC-S4)', () => {
  it('поле, «Отправить» и «Повторить» неактивны, подсказка; send() отказывает', async () => {
    const local = memoryStorage({
      ...twoChats(),
      ...storedMessages([
        msg({ localId: 'e', direction: 'out', status: 'error', errorText: SEND_TEXTS.rateLimited }),
      ]),
    });
    const { api } = await openMain({ local });
    type('черновик');
    act(() => {
      probe.session?.controller.setReadOnly(true);
    });
    expect(input()).toBeDisabled();
    expect(sendButton()).toBeDisabled();
    expect(screen.getByTestId('composer-readonly-hint')).toHaveTextContent(
      SESSION_TEXTS.otherTabReadOnly,
    );
    expect(screen.getByTestId('message-retry')).toBeDisabled();
    pressEnter();
    let accepted = true;
    act(() => {
      accepted = messages().send(TEST_CHAT_ID, 'x');
      messages().retry(TEST_CHAT_ID, 'e');
    });
    expect(accepted).toBe(false);
    expect(api.callsOf('sendMessage')).toHaveLength(0);
    expect(onlyBubble()).toHaveAttribute('data-status', 'error');

    act(() => {
      probe.session?.controller.setReadOnly(false);
    });
    expect(input()).toBeEnabled();
    expect(screen.queryByTestId('composer-readonly-hint')).toBeNull();
  });

  it('EC-S10: захват замка перечитывает ленты из localStorage', async () => {
    const { local } = await openMain();
    act(() => {
      probe.session?.controller.setReadOnly(true);
    });
    // Другая вкладка дописала ленту.
    local.map.set(
      lsKey(messagesSection(TEST_CHAT_ID)),
      JSON.stringify({ messages: [msg({ localId: 'z', text: 'из другой вкладки' })], index: {} }),
    );
    act(() => {
      probe.session?.controller.setReadOnly(false);
    });
    expect(within(onlyBubble()).getByTestId('message-text')).toHaveTextContent('из другой вкладки');
  });
});

describe('автопрокрутка (п. 5.6)', () => {
  function metrics(el: HTMLElement, m: { scrollHeight: number; clientHeight: number }) {
    Object.defineProperty(el, 'scrollHeight', { value: m.scrollHeight, configurable: true });
    Object.defineProperty(el, 'clientHeight', { value: m.clientHeight, configurable: true });
  }
  const incoming = (idMessage: string, ts: number) => {
    act(() => {
      messages().applyNotification({
        chatId: TEST_CHAT_ID,
        idMessage,
        source: 'incoming',
        text: 'новое',
        timestamp: ts,
      });
    });
  };

  it('внизу — прокрутка к новому; прокручено вверх — кнопка «↓ новые сообщения»', async () => {
    await openMain();
    const list = screen.getByTestId('message-list');
    metrics(list, { scrollHeight: 1000, clientHeight: 300 });

    // Пользователь внизу.
    list.scrollTop = 700;
    fireEvent.scroll(list);
    metrics(list, { scrollHeight: 1100, clientHeight: 300 });
    incoming(ID_MESSAGES.incoming1, T + 1);
    expect(list.scrollTop).toBe(1100);
    expect(screen.queryByTestId('new-messages-button')).toBeNull();

    // Пользователь прокрутил вверх.
    list.scrollTop = 100;
    fireEvent.scroll(list);
    metrics(list, { scrollHeight: 1200, clientHeight: 300 });
    incoming(ID_MESSAGES.incoming2, T + 2);
    expect(list.scrollTop).toBe(100);
    const button = screen.getByTestId('new-messages-button');
    expect(button).toHaveTextContent(UI_TEXTS.newMessages);

    fireEvent.click(button);
    expect(list.scrollTop).toBe(1200);
    expect(screen.queryByTestId('new-messages-button')).toBeNull();
  });

  it('своё отправленное — прокрутка даже если пользователь выше', async () => {
    await openMain();
    const list = screen.getByTestId('message-list');
    metrics(list, { scrollHeight: 1000, clientHeight: 300 });
    list.scrollTop = 0;
    fireEvent.scroll(list);
    metrics(list, { scrollHeight: 1100, clientHeight: 300 });
    type('моё');
    pressEnter();
    expect(list.scrollTop).toBe(1100);
    expect(screen.queryByTestId('new-messages-button')).toBeNull();
    await waitFor(() => {
      expect(onlyBubble()).toHaveAttribute('data-status', 'sent');
    });
  });

  it('кнопка скрывается, когда пользователь сам долистал вниз', async () => {
    await openMain();
    const list = screen.getByTestId('message-list');
    metrics(list, { scrollHeight: 1000, clientHeight: 300 });
    list.scrollTop = 0;
    fireEvent.scroll(list);
    incoming(ID_MESSAGES.incoming1, T + 1);
    expect(screen.getByTestId('new-messages-button')).toBeInTheDocument();
    list.scrollTop = 690;
    fireEvent.scroll(list);
    expect(screen.queryByTestId('new-messages-button')).toBeNull();
  });
});
