/**
 * F5 в сборе (Д-2, §6.1, §5.3, Р-5, Р-11, Р-12, Р-15): App + мок fetch + настоящий клиент F1.
 * Опрос идёт сам; паузы — мгновенные и записываются. Только условные данные (НФТ-11).
 */
import { fireEvent, render, waitFor, within } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { BANNER_TEXTS, QUOTA_TEXTS } from '../../api';
import { SESSION_CREDENTIALS_KEY, messagesSection } from '../../store';
import { App } from '../App';
import type { SessionProviderDeps } from '../session/SessionProvider';
import { createFakeLocks } from '../../test/fakeLocks';
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
  CHAT_IDS,
  FOREIGN_ID_INSTANCE,
  ID_MESSAGES,
  NAMES,
  PHONES,
  botText,
  channelImage,
  foreignInstanceIncoming,
  groupQuotedWithPhone,
  groupText,
  incomingMessage,
  incomingText,
  outgoingApi,
  outgoingPhone,
  quotaExceededNotification,
  sendMessageResponses,
  statusDelivered,
  stateChangedAuthorized,
  unknownChatText,
  unknownTypeWebhooks,
  errorResponses,
  quota466Cases,
} from '../../test/fixtures';
import { TEST_CHAT_ID, chatFixture, lsKey, storedChats } from '../../test/fixtures/chats';

const CREDS = { idInstance: TEST_ID_INSTANCE, apiTokenInstance: TEST_TOKEN, apiUrl: TEST_API_URL };
const HANG: Reply = { hang: true };
const note = (body: unknown, receiptId: number): Reply => ({ body: { receiptId, body } });

interface TabOptions {
  receive?: Reply[];
  routes?: Parameters<typeof routeFetch>[0];
  local?: ReturnType<typeof memoryStorage>;
  locks?: ReturnType<typeof createFakeLocks> | null;
  locksSupported?: boolean;
  strict?: boolean;
  container?: HTMLElement;
}

function openTab(opts: TabOptions = {}) {
  const api = routeFetch({
    getStateInstance: [{ body: { stateInstance: 'authorized' } }],
    getSettings: [{ body: OK_SETTINGS }],
    sendMessage: [sendMessageResponses.sent],
    receiveNotification: [...(opts.receive ?? []), HANG],
    ...opts.routes,
  });
  const session = memoryStorage({ [SESSION_CREDENTIALS_KEY]: JSON.stringify(CREDS) });
  const local = opts.local ?? memoryStorage(storedChats([chatFixture()]));
  const warn = vi.fn();
  const pollWarn = vi.fn();
  const sleeps: number[] = [];
  // Сколько receive одновременно в полёте (EC-P6).
  let inFlight = 0;
  let maxInFlight = 0;
  const trackedFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const isReceive = String(input instanceof Request ? input.url : input).includes(
      '/receiveNotification/',
    );
    if (isReceive) maxInFlight = Math.max(maxInFlight, ++inFlight);
    try {
      return await api.fetch(input, init);
    } finally {
      if (isReceive) inFlight--;
    }
  }) as typeof fetch;
  const deps: SessionProviderDeps = {
    clientOptions: { fetch: trackedFetch, sleep: () => Promise.resolve() },
    credentialsBackend: session,
    storageBackend: local,
    warn,
    locksSupported: opts.locksSupported ?? true,
    defaultApiUrl: TEST_API_URL,
    polling: {
      locks: opts.locks === undefined ? null : opts.locks,
      sleep: (ms) => {
        sleeps.push(ms);
        return Promise.resolve();
      },
      warn: pollWarn,
    },
  };
  const app = <App deps={deps} />;
  const view = render(opts.strict ? <StrictMode>{app}</StrictMode> : app, {
    ...(opts.container ? { container: opts.container } : {}),
  });
  const q = within(view.container);
  return { api, local, session, warn, pollWarn, sleeps, view, q, maxInFlight: () => maxInFlight };
}

async function ready(tab: ReturnType<typeof openTab>) {
  await tab.q.findByTestId('main-screen');
}

const deletes = (api: ReturnType<typeof routeFetch>) =>
  api.callsOf('deleteNotification').map((c) => Number(/\/(\d+)$/.exec(c.url)?.[1]));

/** Дождаться, пока опрос разберёт очередь и повиснет на следующем receive. */
async function drained(tab: ReturnType<typeof openTab>, receives: number) {
  await waitFor(() => {
    expect(tab.api.callsOf('receiveNotification')).toHaveLength(receives);
  });
}

function openChat(tab: ReturnType<typeof openTab>, chatId = TEST_CHAT_ID) {
  const item = tab.q.getAllByTestId('chat-item').find((el) => el.dataset.chatId === chatId);
  if (!item) throw new Error('чат не найден');
  fireEvent.click(item);
}

let consoleSpies: MockInstance[] = [];
beforeEach(() => {
  consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
    vi.spyOn(console, m).mockImplementation(() => undefined),
  );
});
afterEach(() => {
  // Ни одного вывода в консоль мимо инъецированных логгеров.
  for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});

/** Персональные данные и секреты, которых не должно быть в логах (НФТ-3, Р-11). */
function expectCleanLogs(...logs: MockInstance[]) {
  const text = JSON.stringify(logs.map((l) => l.mock.calls));
  for (const secret of [
    TEST_TOKEN,
    String(PHONES.primary),
    String(PHONES.own),
    String(PHONES.groupMember),
    CHAT_IDS.primary,
    CHAT_IDS.group,
    'senderPhoneNumber',
    'Тестовый ответ',
  ])
    expect(text).not.toContain(secret);
}

describe('Poller: входящие и свои сообщения (§5.3, §6.3)', () => {
  it('входящее в известном чате → пузырь слева, превью, счётчик, имя чата; delete с тем же receiptId', async () => {
    const tab = openTab({ receive: [note(incomingText, 41)] });
    await ready(tab);
    await drained(tab, 2);
    expect(deletes(tab.api)).toEqual([41]);
    const item = tab.q.getByTestId('chat-item');
    expect(within(item).getByTestId('chat-item-preview')).toHaveTextContent('Тестовый ответ');
    expect(within(item).getByTestId('chat-item-unread')).toHaveTextContent('1');
    // Р-15: заголовок — chatName, номер — подзаголовком.
    expect(within(item).getByTestId('chat-item-title')).toHaveTextContent(NAMES.primary);
    openChat(tab);
    const bubble = tab.q.getByTestId('message');
    expect(bubble).toHaveAttribute('data-direction', 'in');
    expect(within(bubble).getByTestId('message-text')).toHaveTextContent('Тестовый ответ');
    expect(tab.q.getByTestId('chat-title')).toHaveTextContent(NAMES.primary);
    expect(tab.q.getByTestId('chat-subtitle')).toHaveTextContent('+7');
    expect(tab.sleeps).toEqual([]);
    expectCleanLogs(tab.warn, tab.pollWarn);
  });

  it('повтор уведомления и сообщение с телефона: дубль не создаётся (EC-D1, EC-N13)', async () => {
    const tab = openTab({
      receive: [note(incomingText, 41), note(incomingText, 42), note(outgoingPhone, 43)],
    });
    await ready(tab);
    await drained(tab, 4);
    expect(deletes(tab.api)).toEqual([41, 42, 43]);
    openChat(tab);
    const all = tab.q.getAllByTestId('message');
    expect(all.map((el) => el.dataset.direction)).toEqual(['in', 'out']);
  });

  it('Р-11: нетекстовое с caption → заглушка в пузыре и превью; caption, миниатюры и ссылки нет', async () => {
    const image = incomingMessage({
      idMessage: ID_MESSAGES.incoming3,
      messageData: {
        typeMessage: 'imageMessage',
        fileMessageData: {
          downloadUrl: 'https://media.example.test/files/test.jpg',
          caption: 'Подпись к картинке',
          fileName: 'test.jpg',
          jpegThumbnail: 'dGVzdA==',
          mimeType: 'image/jpeg',
        },
      } as never,
    });
    const tab = openTab({ receive: [note(image, 44)] });
    await ready(tab);
    await drained(tab, 2);
    expect(tab.q.getByTestId('chat-item-preview')).toHaveTextContent(
      new RegExp(`^${BANNER_TEXTS.unsupportedMessage}$`),
    );
    openChat(tab);
    expect(tab.q.getByTestId('message-text')).toHaveTextContent(
      new RegExp(`^${BANNER_TEXTS.unsupportedMessage}$`),
    );
    const stored = JSON.stringify([...tab.local.map.values()]);
    for (const leak of ['Подпись', 'test.jpg', 'dGVzdA', 'media.example', 'senderPhoneNumber']) {
      expect(document.body.innerHTML).not.toContain(leak);
      expect(stored).not.toContain(leak);
    }
    expect(tab.local.map.has(lsKey(messagesSection(TEST_CHAT_ID)))).toBe(true);
  });

  it('ОР-3 + §6.3: отправка → outgoingAPIMessageReceived с тем же idMessage → ровно один пузырь «отправлено»', async () => {
    const gate = deferred();
    const tab = openTab({ receive: [{ deferred: gate }] });
    await ready(tab);
    openChat(tab);
    fireEvent.change(tab.q.getByTestId('composer-input'), {
      target: { value: 'Тестовое сообщение' },
    });
    fireEvent.click(tab.q.getByTestId('send-button'));
    await waitFor(() => {
      expect(tab.q.getByTestId('message')).toHaveAttribute('data-status', 'sent');
    });
    gate.release({ body: { receiptId: 45, body: outgoingApi } });
    await drained(tab, 2);
    expect(deletes(tab.api)).toEqual([45]);
    const all = tab.q.getAllByTestId('message');
    expect(all).toHaveLength(1);
    expect(all[0]).toHaveAttribute('data-status', 'sent');
  });

  it('уведомление раньше ответа sendMessage (гонка §6.3 шаг 2) → один пузырь', async () => {
    const sendGate = deferred();
    const tab = openTab({
      receive: [note(outgoingApi, 46)],
      routes: { sendMessage: [{ deferred: sendGate }] },
    });
    await ready(tab);
    openChat(tab);
    await drained(tab, 2);
    fireEvent.change(tab.q.getByTestId('composer-input'), {
      target: { value: 'Тестовое сообщение' },
    });
    fireEvent.click(tab.q.getByTestId('send-button'));
    sendGate.release({ body: { idMessage: ID_MESSAGES.api1 } });
    await waitFor(() => {
      expect(tab.q.getAllByTestId('message')).toHaveLength(1);
    });
    expect(tab.q.getByTestId('message')).toHaveAttribute('data-status', 'sent');
  });
});

describe('Poller: что не показывается (Р-5, Р-14, EC-N1…N10)', () => {
  it('группа, канал, бот, неизвестный чат, чужой инстанс, статус, состояние, неизвестный тип → удалены, лента и список не меняются', async () => {
    const bodies: unknown[] = [
      groupText,
      groupQuotedWithPhone,
      channelImage,
      botText,
      unknownChatText,
      { ...outgoingPhone, senderData: { ...outgoingPhone.senderData, chatId: CHAT_IDS.unknown } },
      foreignInstanceIncoming,
      statusDelivered,
      stateChangedAuthorized,
      unknownTypeWebhooks.incomingCall,
      null,
      'строка',
    ];
    const tab = openTab({ receive: bodies.map((b, i) => note(b, 100 + i)) });
    await ready(tab);
    await drained(tab, bodies.length + 1);
    expect(deletes(tab.api)).toEqual(bodies.map((_b, i) => 100 + i));
    expect(tab.q.getAllByTestId('chat-item')).toHaveLength(1);
    expect(tab.q.queryByTestId('chat-item-unread')).toBeNull();
    expect(tab.q.queryByTestId('chat-item-title')).not.toHaveTextContent(NAMES.group);
    openChat(tab);
    expect(tab.q.queryAllByTestId('message')).toHaveLength(0);
    expect(tab.sleeps).toEqual([]);
    // В лог — только тип (Р-5): чужой инстанс и битые body.
    expect(tab.pollWarn.mock.calls).toEqual([
      ['Notification ignored', { reason: 'foreignInstance', type: 'incomingMessageReceived' }],
      ['Notification ignored', { reason: 'malformed', type: 'unknown' }],
      ['Notification ignored', { reason: 'malformed', type: 'unknown' }],
    ]);
    expect(JSON.stringify(tab.pollWarn.mock.calls)).not.toContain(FOREIGN_ID_INSTANCE);
    expectCleanLogs(tab.warn, tab.pollWarn);
    // Ни одна запись localStorage не содержит данных групп, каналов и номеров.
    const stored = JSON.stringify([...tab.local.map.values()]);
    for (const leak of [NAMES.group, NAMES.channel, NAMES.unknown, String(PHONES.groupMember)])
      expect(stored).not.toContain(leak);
  });

  it('quotaExceeded → баннер квоты, delete, ленты не меняются; в лог — без description (§5.5)', async () => {
    const tab = openTab({ receive: [note(quotaExceededNotification, 47)] });
    await ready(tab);
    await drained(tab, 2);
    expect(tab.q.getByTestId('banner-quota')).toHaveTextContent(QUOTA_TEXTS.banner);
    expect(deletes(tab.api)).toEqual([47]);
    expect(tab.q.queryByTestId('chat-item-unread')).toBeNull();
    expect(tab.pollWarn).toHaveBeenCalledWith('GREEN-API quotaExceeded notification', {
      method: 'correspondents',
      used: 3,
      total: 3,
      status: 'CORRESPONDENTS_QUOTA_EXCEEDED',
    });
    expect(JSON.stringify(tab.pollWarn.mock.calls)).not.toContain('description');
  });
});

describe('Poller: квота из очереди (§5.5, ВА-13, Р-5 v1.3.7)', () => {
  it('quotaExceeded без instanceData → баннер квоты и delete; в лог — тип с пометкой', async () => {
    const noData: Record<string, unknown> = { ...quotaExceededNotification };
    delete noData.instanceData;
    const tab = openTab({ receive: [note(noData, 57)] });
    await ready(tab);
    await drained(tab, 2);
    expect(tab.q.getByTestId('banner-quota')).toHaveTextContent(QUOTA_TEXTS.banner);
    expect(deletes(tab.api)).toEqual([57]);
    expect(tab.pollWarn).toHaveBeenCalledWith('Notification without instanceData', {
      type: 'quotaExceeded',
      note: 'no instanceData',
    });
    expectCleanLogs(tab.warn, tab.pollWarn);
  });

  it('закрытый баннер квоты: quotaExceeded и 466 на receive его не возвращают, опрос — с backoff', async () => {
    const gate = deferred();
    const tab = openTab({
      receive: [note(quotaExceededNotification, 58), { deferred: gate }],
    });
    await ready(tab);
    await tab.q.findByTestId('banner-quota');
    fireEvent.click(tab.q.getByTestId('banner-quota-close'));
    expect(tab.q.queryByTestId('banner-quota')).toBeNull();
    tab.api.set('receiveNotification', [note(quotaExceededNotification, 59), HANG]);
    gate.release(quota466Cases.correspondentsStatus.response);
    await drained(tab, 4);
    expect(tab.sleeps).toEqual([1000]);
    expect(deletes(tab.api)).toEqual([58, 59]);
    expect(tab.q.queryByTestId('banner-quota')).toBeNull();
  });
});

describe('Poller: ошибки и остановка (§5.4, §6.1 п. 3)', () => {
  it('сеть ×2 → баннер «Нет соединения», backoff 1 → 2 с, опрос продолжается (EC-P8, EC-P9)', async () => {
    const tab = openTab({
      receive: [{ throws: new TypeError('Failed to fetch') }, { throws: new TypeError('x') }],
    });
    await ready(tab);
    await drained(tab, 3);
    expect(tab.sleeps).toEqual([1000, 2000]);
    // Третий receive висит: баннер держится до первого успешного ответа.
    expect(tab.q.getByTestId('banner-offline')).toBeInTheDocument();
  });

  it('400 custom webhook url → П-1, опрос остановлен; «Проверить снова» без П-1 → опрос снова', async () => {
    const tab = openTab({ receive: [errorResponses.customWebhook400.json] });
    await ready(tab);
    await tab.q.findByTestId('banner-p1');
    expect(tab.api.callsOf('receiveNotification')).toHaveLength(1);
    tab.api.set('receiveNotification', [HANG]);
    await waitFor(
      () => {
        expect(tab.q.getByTestId('banner-p1-recheck')).toBeEnabled();
      },
      { timeout: 2000 },
    );
    fireEvent.click(tab.q.getByTestId('banner-p1-recheck'));
    await waitFor(() => {
      expect(tab.q.queryByTestId('banner-p1')).toBeNull();
    });
    await drained(tab, 2);
  });

  it('401 на receive → выход на экран входа, токен пуст, новых receive нет (EC-P13)', async () => {
    const tab = openTab({ receive: [{ status: 401 }] });
    await ready(tab);
    await tab.q.findByTestId('login-error');
    expect(tab.q.getByTestId<HTMLInputElement>('login-apiTokenInstance').value).toBe('');
    await new Promise((r) => setTimeout(r, 20));
    expect(tab.api.callsOf('receiveNotification')).toHaveLength(1);
    expect(tab.session.map.size).toBe(0);
  });

  it('ответ receive после «Выйти» не обрабатывается и не удаляется (EC-S7, L-26)', async () => {
    const gate = deferred();
    const tab = openTab({ receive: [{ deferred: gate }] });
    await ready(tab);
    await drained(tab, 1);
    fireEvent.click(tab.q.getByTestId('logout-button'));
    await tab.q.findByTestId('login-submit');
    gate.release({ body: { receiptId: 77, body: incomingText } });
    await new Promise((r) => setTimeout(r, 20));
    expect(deletes(tab.api)).toEqual([]);
    expect(tab.api.callsOf('receiveNotification')).toHaveLength(1);
    expect(tab.local.map.get(lsKey(messagesSection(TEST_CHAT_ID)))).toBeUndefined();
  });

  it('StrictMode: в полёте не больше одного receive (EC-P6)', async () => {
    const tab = openTab({
      strict: true,
      receive: [note(incomingText, 48), { throws: new TypeError('x') }, note(incomingText, 51)],
    });
    await ready(tab);
    await drained(tab, 4);
    expect(tab.maxInFlight()).toBe(1);
    expect(deletes(tab.api)).toEqual([48, 51]);
  });
});

describe('Poller: вкладки и Web Lock (Р-12, ВА-16, EC-S1, EC-S4, EC-S5)', () => {
  it('вторая вкладка — только чтение и без опроса; закрыли первую — вторая перехватывает замок и опрашивает', async () => {
    const locks = createFakeLocks();
    const a = openTab({
      locks,
      container: document.body.appendChild(document.createElement('div')),
    });
    await ready(a);
    await drained(a, 1);
    const b = openTab({
      locks,
      receive: [note(incomingText, 49)],
      container: document.body.appendChild(document.createElement('div')),
    });
    await ready(b);
    await b.q.findByTestId('banner-other-tab');
    expect(b.q.getByTestId('banner-other-tab')).toHaveTextContent(BANNER_TEXTS.otherTab);
    expect(b.q.getByTestId('new-chat-button')).toBeDisabled();
    expect(b.api.callsOf('receiveNotification')).toHaveLength(0);
    expect(a.q.queryByTestId('banner-other-tab')).toBeNull();

    a.view.unmount(); // закрыли первую вкладку
    await waitFor(() => {
      expect(b.q.queryByTestId('banner-other-tab')).toBeNull();
    });
    await drained(b, 2);
    expect(deletes(b.api)).toEqual([49]);
    expect(b.q.getByTestId('chat-item-unread')).toHaveTextContent('1');
    expect(b.q.getByTestId('new-chat-button')).toBeEnabled();
  });

  it('размонтирование → abort, замок освобождён, новых запросов нет', async () => {
    const locks = createFakeLocks();
    const tab = openTab({ locks });
    await ready(tab);
    await drained(tab, 1);
    expect(locks.held(`maxchat-poll-${TEST_ID_INSTANCE}`)).toBe(true);
    const [call] = tab.api.callsOf('receiveNotification');
    tab.view.unmount();
    await waitFor(() => {
      expect(locks.held(`maxchat-poll-${TEST_ID_INSTANCE}`)).toBe(false);
    });
    expect(call?.init.signal?.aborted).toBe(true);
    await new Promise((r) => setTimeout(r, 20));
    expect(tab.api.callsOf('receiveNotification')).toHaveLength(1);
  });

  it('выход освобождает замок, вход снова его берёт', async () => {
    const locks = createFakeLocks();
    const tab = openTab({ locks });
    const name = `maxchat-poll-${TEST_ID_INSTANCE}`;
    await ready(tab);
    await drained(tab, 1);
    fireEvent.click(tab.q.getByTestId('logout-button'));
    await waitFor(() => {
      expect(locks.held(name)).toBe(false);
    });
    fireEvent.change(tab.q.getByTestId('login-apiTokenInstance'), {
      target: { value: TEST_TOKEN },
    });
    fireEvent.click(tab.q.getByTestId('login-submit'));
    await ready(tab);
    await drained(tab, 2);
    expect(locks.held(name)).toBe(true);
    expect(tab.q.queryByTestId('banner-other-tab')).toBeNull();
  });

  it('нет Web Locks API → опрос без замка и постоянный баннер (EC-S5)', async () => {
    const tab = openTab({ locksSupported: false, receive: [note(incomingText, 50)] });
    await ready(tab);
    await drained(tab, 2);
    expect(tab.q.getByTestId('banner-locks-unsupported')).toBeInTheDocument();
    expect(deletes(tab.api)).toEqual([50]);
  });
});
