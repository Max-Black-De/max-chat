import { describe, expect, it } from 'vitest';
import { SEND_TEXTS } from '../../api';
import {
  addOptimisticMessage,
  applySendFailure,
  applySendSuccess,
  createInitialMessagesState,
  createLocalId,
  emptyChatMessages,
  failSendingInChat,
  mergeNotificationMessage,
  messageKey,
  messagesReducer,
  selectChatMessages,
  sortMessages,
  startRetry,
  type ChatMessages,
  type MessagesState,
  type NotificationMessage,
} from '..';
import { BASE_TIMESTAMP, ID_MESSAGES } from '../../test/fixtures/constants';
import { TEST_CHAT_ID, TEST_CHAT_ID_2 } from '../../test/fixtures/chats';

const T = BASE_TIMESTAMP;
const CHAT = TEST_CHAT_ID;

function optimistic(data: ChatMessages = emptyChatMessages(), localId = 'l1', text = 'привет') {
  return addOptimisticMessage(data, { localId, chatId: CHAT, text, timestamp: T + 0.5 });
}

function note(over: Partial<NotificationMessage> = {}): NotificationMessage {
  return {
    chatId: CHAT,
    idMessage: ID_MESSAGES.api1,
    source: 'outgoingApi',
    text: 'привет',
    timestamp: T,
    ...over,
  };
}

describe('оптимистичная отправка (§6.3 п. 1–2, п. 3.1–3.3)', () => {
  it('создаёт «отправляется» без ключа', () => {
    const data = optimistic();
    expect(data.messages).toEqual([
      {
        localId: 'l1',
        chatId: CHAT,
        text: 'привет',
        timestamp: T + 0.5,
        direction: 'out',
        status: 'sending',
      },
    ]);
    expect(data.index).toEqual({});
  });

  it('ответ 200: idMessage, статус sent, ключ в индексе', () => {
    const { data, outcome } = applySendSuccess(optimistic(), 'l1', ID_MESSAGES.api1);
    expect(outcome).toBe('sent');
    expect(data.messages[0]).toMatchObject({ idMessage: ID_MESSAGES.api1, status: 'sent' });
    expect(data.index).toEqual({ [messageKey(CHAT, ID_MESSAGES.api1)]: 'l1' });
  });

  it('idMessage — строка без потери точности (18 цифр)', () => {
    const { data } = applySendSuccess(optimistic(), 'l1', ID_MESSAGES.incoming1);
    expect(data.messages[0]?.idMessage).toBe(ID_MESSAGES.incoming1);
  });

  it('EC-D2: уведомление пришло раньше ответа — оптимистичное удаляется, остаётся пришедшее', () => {
    let data = optimistic();
    data = mergeNotificationMessage(data, note({ idMessage: ID_MESSAGES.apiRace }), 'n1').data;
    expect(data.messages).toHaveLength(2);
    const result = applySendSuccess(data, 'l1', ID_MESSAGES.apiRace);
    expect(result.outcome).toBe('merged');
    expect(result.data.messages).toHaveLength(1);
    expect(result.data.messages[0]).toMatchObject({
      localId: 'n1',
      status: 'sent',
      timestamp: T,
      idMessage: ID_MESSAGES.apiRace,
    });
    expect(result.data.index).toEqual({ [messageKey(CHAT, ID_MESSAGES.apiRace)]: 'n1' });
  });

  it('ответ для сообщения не в статусе «отправляется» (после выхода) игнорируется', () => {
    const failed = failSendingInChat(optimistic());
    expect(applySendSuccess(failed, 'l1', ID_MESSAGES.api1)).toEqual({
      data: failed,
      outcome: 'ignored',
    });
    expect(applySendSuccess(failed, 'нет-такого', ID_MESSAGES.api1).outcome).toBe('ignored');
    expect(applySendFailure(failed, 'l1', 'x')).toBe(failed);
  });
});

describe('ошибка и «Повторить» (§6.3 п. 4, EC-D6)', () => {
  it('ошибка → error с текстом; повтор — тот же localId снова «отправляется»', () => {
    const failed = applySendFailure(optimistic(), 'l1', SEND_TEXTS.rateLimited);
    expect(failed.messages[0]).toMatchObject({
      status: 'error',
      errorText: SEND_TEXTS.rateLimited,
    });
    const retried = startRetry(failed, 'l1');
    expect(retried.messages).toHaveLength(1);
    expect(retried.messages[0]).toMatchObject({ localId: 'l1', status: 'sending' });
    expect(retried.messages[0]).not.toHaveProperty('errorText');
    // Повтор того же сообщения — не новый пузырь, время прежнее.
    expect(retried.messages[0]?.timestamp).toBe(T + 0.5);
    const sent = applySendSuccess(retried, 'l1', ID_MESSAGES.api2);
    expect(sent.data.messages[0]).toMatchObject({ status: 'sent', idMessage: ID_MESSAGES.api2 });
  });

  it('повтор доступен только у «не отправлено»', () => {
    const sending = optimistic();
    expect(startRetry(sending, 'l1')).toBe(sending);
    expect(startRetry(sending, 'нет-такого')).toBe(sending);
  });
});

describe('выход (§6.3 п. 5, EC-D5)', () => {
  it('«отправляется» → «не отправлено» со «Статус неизвестен…»; без изменений — тот же объект', () => {
    const data = failSendingInChat(optimistic());
    expect(data.messages[0]).toMatchObject({
      status: 'error',
      errorText: SEND_TEXTS.statusUnknown,
    });
    expect(failSendingInChat(data)).toBe(data);
  });
});

describe('mergeNotificationMessage — хук F5 (§6.3)', () => {
  it('входящее: новый пузырь слева, ключ записан; повтор — игнор (EC-D1)', () => {
    const input = note({ source: 'incoming', idMessage: ID_MESSAGES.incoming1, text: 'ответ' });
    const first = mergeNotificationMessage(emptyChatMessages(), input, 'n1');
    expect(first.outcome).toBe('added');
    expect(first.message).toEqual({
      localId: 'n1',
      chatId: CHAT,
      idMessage: ID_MESSAGES.incoming1,
      direction: 'in',
      text: 'ответ',
      timestamp: T,
    });
    expect(first.data.index).toEqual({ [messageKey(CHAT, ID_MESSAGES.incoming1)]: 'n1' });
    const again = mergeNotificationMessage(first.data, input, 'n2');
    expect(again.outcome).toBe('duplicate');
    expect(again.data).toBe(first.data);
  });

  it('idMessage различаются в последней цифре — два пузыря (строки, не Number)', () => {
    let data = emptyChatMessages();
    data = mergeNotificationMessage(
      data,
      note({ source: 'incoming', idMessage: ID_MESSAGES.incoming1 }),
      'a',
    ).data;
    data = mergeNotificationMessage(
      data,
      note({ source: 'incoming', idMessage: ID_MESSAGES.incoming2 }),
      'b',
    ).data;
    expect(data.messages).toHaveLength(2);
  });

  it('с телефона: пузырь справа со статусом sent (п. 3.7); повтор — игнор', () => {
    const input = note({ source: 'outgoingPhone', idMessage: ID_MESSAGES.phone1 });
    const first = mergeNotificationMessage(emptyChatMessages(), input, 'p1');
    expect(first.message).toMatchObject({ direction: 'out', status: 'sent' });
    expect(mergeNotificationMessage(first.data, { ...input, timestamp: T + 9 }, 'p2').outcome).toBe(
      'duplicate',
    );
  });

  it('EC-D3 / EC-O3: outgoingApi после ответа — тот же пузырь, серверный timestamp, sent', () => {
    const sent = applySendSuccess(optimistic(), 'l1', ID_MESSAGES.api1).data;
    const result = mergeNotificationMessage(sent, note({ timestamp: T - 2 }), 'n1');
    expect(result.outcome).toBe('confirmed');
    expect(result.data.messages).toHaveLength(1);
    expect(result.data.messages[0]).toMatchObject({
      localId: 'l1',
      timestamp: T - 2,
      status: 'sent',
    });
    // Повтор того же уведомления ничего не меняет.
    expect(mergeNotificationMessage(result.data, note({ timestamp: T - 2 }), 'n2').outcome).toBe(
      'duplicate',
    );
  });

  it('outgoingApi без оптимистичного (другой API-клиент) — новый свой пузырь', () => {
    const result = mergeNotificationMessage(emptyChatMessages(), note(), 'n1');
    expect(result.outcome).toBe('added');
    expect(result.message).toMatchObject({ direction: 'out', status: 'sent', localId: 'n1' });
  });

  it('ВА-20: после «Статус неизвестен» уведомление — отдельный пузырь, по тексту не сопоставляем', () => {
    const failed = failSendingInChat(optimistic());
    const result = mergeNotificationMessage(failed, note({ text: 'привет' }), 'n1');
    expect(result.outcome).toBe('added');
    expect(result.data.messages.map((m) => m.status)).toEqual(['error', 'sent']);
  });

  it('EC-D4: одинаковые тексты с разными idMessage — два пузыря', () => {
    let data = emptyChatMessages();
    data = mergeNotificationMessage(data, note({ idMessage: ID_MESSAGES.api1 }), 'a').data;
    data = mergeNotificationMessage(data, note({ idMessage: ID_MESSAGES.api2 }), 'b').data;
    expect(data.messages.map((m) => m.text)).toEqual(['привет', 'привет']);
  });

  it('Р-11: заглушка — без текста, unsupported', () => {
    const result = mergeNotificationMessage(
      emptyChatMessages(),
      note({ source: 'incoming', text: 'подпись картинки', unsupported: true }),
      'u1',
    );
    expect(result.message).toMatchObject({ text: '', unsupported: true, direction: 'in' });
  });

  it('входящее с ключом существующего — не меняет ни статус, ни время', () => {
    const sent = applySendSuccess(optimistic(), 'l1', ID_MESSAGES.api1).data;
    const result = mergeNotificationMessage(sent, note({ source: 'incoming', timestamp: 1 }), 'x');
    expect(result.outcome).toBe('duplicate');
    expect(result.data).toBe(sent);
  });

  it('чистая функция: вход не мутируется', () => {
    const data = optimistic();
    const snapshot = structuredClone(data);
    mergeNotificationMessage(data, note(), 'n1');
    applySendSuccess(data, 'l1', ID_MESSAGES.api1);
    applySendFailure(data, 'l1', 'x');
    expect(data).toEqual(snapshot);
  });
});

describe('порядок (§6.2, EC-O2, EC-O3)', () => {
  it('по timestamp, при равенстве — по порядку поступления', () => {
    let data = emptyChatMessages();
    const add = (id: string, ts: number) => {
      data = mergeNotificationMessage(
        data,
        note({ source: 'incoming', idMessage: id, timestamp: ts }),
        id,
      ).data;
    };
    add('a', T + 2);
    add('b', T); // инверсия на 2 с [проверено]
    add('c', T + 2);
    add('d', T);
    expect(sortMessages(data.messages).map((m) => m.localId)).toEqual(['b', 'd', 'a', 'c']);
  });

  it('оптимистичное переезжает на место по серверному времени после слияния', () => {
    let data = emptyChatMessages();
    data = mergeNotificationMessage(
      data,
      note({ source: 'incoming', idMessage: ID_MESSAGES.incoming1, timestamp: T + 1 }),
      'in1',
    ).data;
    data = addOptimisticMessage(data, { localId: 'l1', chatId: CHAT, text: 'x', timestamp: T + 5 });
    expect(sortMessages(data.messages).map((m) => m.localId)).toEqual(['in1', 'l1']);
    data = applySendSuccess(data, 'l1', ID_MESSAGES.api1).data;
    data = mergeNotificationMessage(data, note({ timestamp: T }), 'n').data;
    expect(sortMessages(data.messages).map((m) => m.localId)).toEqual(['l1', 'in1']);
  });
});

describe('messagesReducer', () => {
  const s0: MessagesState = createInitialMessagesState();

  it('ленты по чатам независимы; пустая лента — один и тот же объект', () => {
    expect(selectChatMessages(s0, CHAT)).toBe(selectChatMessages(s0, TEST_CHAT_ID_2));
    const s1 = messagesReducer(s0, {
      type: 'optimisticAdded',
      message: { localId: 'l1', chatId: CHAT, text: 'a', timestamp: T },
    });
    expect(selectChatMessages(s1, CHAT).messages).toHaveLength(1);
    expect(selectChatMessages(s1, TEST_CHAT_ID_2).messages).toHaveLength(0);
  });

  it('полный цикл: отправка → ошибка → повтор → успех → подтверждение', () => {
    let s = messagesReducer(s0, {
      type: 'optimisticAdded',
      message: { localId: 'l1', chatId: CHAT, text: 'a', timestamp: T + 1 },
    });
    s = messagesReducer(s, { type: 'sendFailed', chatId: CHAT, localId: 'l1', errorText: 'e' });
    s = messagesReducer(s, { type: 'retryStarted', chatId: CHAT, localId: 'l1' });
    s = messagesReducer(s, {
      type: 'sendSucceeded',
      chatId: CHAT,
      localId: 'l1',
      idMessage: ID_MESSAGES.api1,
    });
    s = messagesReducer(s, {
      type: 'notificationMerged',
      message: note({ text: 'a' }),
      localId: 'z',
    });
    expect(selectChatMessages(s, CHAT)).toEqual({
      messages: [
        {
          localId: 'l1',
          chatId: CHAT,
          text: 'a',
          timestamp: T,
          direction: 'out',
          status: 'sent',
          idMessage: ID_MESSAGES.api1,
        },
      ],
      index: { [messageKey(CHAT, ID_MESSAGES.api1)]: 'l1' },
    });
  });

  it('sendingFailed — во всех загруженных чатах; без «отправляется» состояние то же', () => {
    let s = messagesReducer(s0, {
      type: 'optimisticAdded',
      message: { localId: 'l1', chatId: CHAT, text: 'a', timestamp: T },
    });
    s = messagesReducer(s, {
      type: 'optimisticAdded',
      message: { localId: 'l2', chatId: TEST_CHAT_ID_2, text: 'b', timestamp: T },
    });
    const failed = messagesReducer(s, { type: 'sendingFailed' });
    expect(selectChatMessages(failed, CHAT).messages[0]?.status).toBe('error');
    expect(selectChatMessages(failed, TEST_CHAT_ID_2).messages[0]?.status).toBe('error');
    expect(messagesReducer(failed, { type: 'sendingFailed' })).toBe(failed);
  });

  it('действие без изменений возвращает то же состояние', () => {
    expect(messagesReducer(s0, { type: 'retryStarted', chatId: CHAT, localId: 'x' })).toBe(s0);
  });

  it('chatsLoaded заменяет ленты указанных чатов', () => {
    const loaded = optimistic();
    const s = messagesReducer(s0, { type: 'chatsLoaded', byChat: { [CHAT]: loaded } });
    expect(selectChatMessages(s, CHAT)).toBe(loaded);
  });
});

describe('createLocalId', () => {
  it('уникальные непустые строки', () => {
    const ids = new Set(Array.from({ length: 50 }, () => createLocalId()));
    expect(ids.size).toBe(50);
  });

  it('без crypto.randomUUID (http://<ip>) — запасной вариант', () => {
    const original = globalThis.crypto.randomUUID.bind(globalThis.crypto);
    Object.defineProperty(globalThis.crypto, 'randomUUID', {
      value: undefined,
      configurable: true,
    });
    try {
      const id = createLocalId();
      expect(id).toMatch(/^[0-9a-f]{32}$/);
    } finally {
      Object.defineProperty(globalThis.crypto, 'randomUUID', {
        value: original,
        configurable: true,
      });
    }
  });
});
