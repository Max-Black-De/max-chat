import { describe, expect, it } from 'vitest';
import {
  chatSubtitle,
  chatTitle,
  chatsReducer,
  createInitialChatsState,
  findCachedChat,
  sanitizeChat,
  sanitizeChats,
  sanitizePhoneCache,
  selectSelectedChat,
  selectSortedChats,
  sortChats,
  type Chat,
  type ChatsState,
} from '../chats';
import {
  TEST_CHAT_ID,
  TEST_CHAT_ID_2,
  TEST_PHONE,
  TEST_PHONE_2,
  TEST_PHONE_FORMATTED,
  chatFixture,
} from '../../test/fixtures/chats';

const chat = (over: Partial<Chat> = {}): Chat => chatFixture(over);

function stateWith(chats: Chat[], over: Partial<ChatsState> = {}): ChatsState {
  return { ...createInitialChatsState(), chats, ...over };
}

describe('sanitizeChat / sanitizeChats (EC-D8, EC-I4)', () => {
  it('корректный чат проходит, лишние поля отбрасываются', () => {
    expect(sanitizeChat({ ...chat({ chatName: 'Имя' }), token: 'x' })).toEqual(
      chat({ chatName: 'Имя' }),
    );
  });

  it.each<[string, unknown]>([
    ['не объект', 'x'],
    ['chatId с @c.us', { ...chat(), chatId: `${TEST_CHAT_ID}@c.us` }],
    ['chatId числом', { ...chat(), chatId: 10000000 }],
    ['пустой chatId', { ...chat(), chatId: '' }],
    ['номер не нормализован', { ...chat(), phone: '89990000000' }],
    ['нет createdAt', { chatId: TEST_CHAT_ID, phone: TEST_PHONE, unread: 0 }],
  ])('%s → null', (_n, v) => {
    expect(sanitizeChat(v)).toBeNull();
  });

  it('битый unread → 0, битое lastMessage отбрасывается, пустой chatName — нет', () => {
    const c = sanitizeChat({ ...chat(), unread: -3, lastMessage: { text: 1 }, chatName: '  ' });
    expect(c).toEqual(chat());
  });

  it('не массив → пусто; битые и повторные элементы пропускаются', () => {
    expect(sanitizeChats({ chats: [] })).toEqual([]);
    expect(sanitizeChats(null)).toEqual([]);
    expect(
      sanitizeChats([chat(), 'мусор', chat({ unread: 5 }), chat({ chatId: TEST_CHAT_ID_2 })]),
    ).toEqual([chat(), chat({ chatId: TEST_CHAT_ID_2 })]);
  });

  it('кеш: только нормализованные номера и chatId ^-?\\d+$', () => {
    expect(
      sanitizePhoneCache({
        [TEST_PHONE]: TEST_CHAT_ID,
        [TEST_PHONE_2]: `${TEST_CHAT_ID_2}@c.us`,
        '8999': TEST_CHAT_ID,
        '79990000009': 42,
      }),
    ).toEqual({ [TEST_PHONE]: TEST_CHAT_ID });
    expect(sanitizePhoneCache([1, 2])).toEqual({});
  });
});

describe('сортировка списка (п. 5.2, ВА-15, EC-D9)', () => {
  it('по последнему сообщению любого направления, без сообщений — по созданию', () => {
    const a = chat({ chatId: '1', createdAt: 100 });
    const b = chat({
      chatId: '2',
      createdAt: 50,
      lastMessage: { text: 'x', timestamp: 200, direction: 'out' },
    });
    const c = chat({ chatId: '3', createdAt: 150 });
    expect(sortChats([a, b, c]).map((x) => x.chatId)).toEqual(['2', '3', '1']);
  });

  it('при равном времени сохраняется порядок массива (поднятый чат — первым)', () => {
    const a = chat({ chatId: '1', createdAt: 100 });
    const b = chat({ chatId: '2', createdAt: 100 });
    expect(sortChats([b, a]).map((x) => x.chatId)).toEqual(['2', '1']);
  });
});

describe('chatsReducer', () => {
  it('chatOpened: новый чат — в начале списка и выбран (п. 2.6)', () => {
    const s = chatsReducer(stateWith([chat({ chatId: TEST_CHAT_ID_2, phone: TEST_PHONE_2 })]), {
      type: 'chatOpened',
      chatId: TEST_CHAT_ID,
      phone: TEST_PHONE,
      now: 1_790_000_500,
    });
    expect(s.chats[0]).toEqual({
      chatId: TEST_CHAT_ID,
      phone: TEST_PHONE,
      createdAt: 1_790_000_500,
      unread: 0,
    });
    expect(s.selectedChatId).toBe(TEST_CHAT_ID);
    expect(selectSortedChats(s)[0]?.chatId).toBe(TEST_CHAT_ID);
  });

  it('chatOpened: chatId уже есть — открывается существующий, без дубля (п. 2.6, EC-D10)', () => {
    const existing = chat({ unread: 2, chatName: 'Имя' });
    const s = chatsReducer(stateWith([existing]), {
      type: 'chatOpened',
      chatId: TEST_CHAT_ID,
      phone: TEST_PHONE,
      now: 1,
    });
    expect(s.chats).toHaveLength(1);
    expect(s.chats[0]).toEqual({ ...existing, unread: 0 });
    expect(s.selectedChatId).toBe(TEST_CHAT_ID);
  });

  it('chatSelected сбрасывает счётчик (без readChat), неизвестный chatId — без изменений', () => {
    const s0 = stateWith([chat({ unread: 3 })]);
    const s1 = chatsReducer(s0, { type: 'chatSelected', chatId: TEST_CHAT_ID });
    expect(s1.chats[0]?.unread).toBe(0);
    expect(selectSelectedChat(s1)?.chatId).toBe(TEST_CHAT_ID);
    expect(chatsReducer(s1, { type: 'chatSelected', chatId: '999' })).toBe(s1);
    expect(chatsReducer(s1, { type: 'chatSelected', chatId: null }).selectedChatId).toBeNull();
  });

  it('chatActivity: входящее в неоткрытом чате +1, в открытом — нет; исходящее не считает, но поднимает', () => {
    const msg = (timestamp: number, direction: 'in' | 'out' = 'in') => ({
      text: 't',
      timestamp,
      direction,
    });
    let s = stateWith([chat({ chatId: TEST_CHAT_ID_2, createdAt: 10 }), chat({ createdAt: 5 })]);
    s = chatsReducer(s, {
      type: 'chatActivity',
      chatId: TEST_CHAT_ID,
      message: msg(20),
      countUnread: true,
    });
    expect(s.chats[0]?.chatId).toBe(TEST_CHAT_ID);
    expect(s.chats[0]?.unread).toBe(1);
    s = chatsReducer(s, {
      type: 'chatActivity',
      chatId: TEST_CHAT_ID_2,
      message: msg(30, 'out'),
      countUnread: false,
    });
    expect(s.chats.find((c) => c.chatId === TEST_CHAT_ID_2)?.unread).toBe(0);
    expect(selectSortedChats(s)[0]?.chatId).toBe(TEST_CHAT_ID_2);
    s = chatsReducer(s, { type: 'chatSelected', chatId: TEST_CHAT_ID });
    s = chatsReducer(s, {
      type: 'chatActivity',
      chatId: TEST_CHAT_ID,
      message: msg(40),
      countUnread: true,
    });
    expect(s.chats.find((c) => c.chatId === TEST_CHAT_ID)?.unread).toBe(0);
  });

  it('chatActivity: более старое сообщение не заменяет превью; неизвестный чат — без изменений', () => {
    const last = { text: 'новое', timestamp: 50, direction: 'in' as const };
    const s0 = stateWith([chat({ lastMessage: last })]);
    const s1 = chatsReducer(s0, {
      type: 'chatActivity',
      chatId: TEST_CHAT_ID,
      message: { text: 'старое', timestamp: 40, direction: 'in' },
      countUnread: true,
    });
    expect(s1.chats[0]?.lastMessage).toEqual(last);
    expect(s1.chats[0]?.unread).toBe(1);
    expect(
      chatsReducer(s0, { type: 'chatActivity', chatId: '999', message: last, countUnread: true }),
    ).toBe(s0);
  });

  it('chatNameReceived (Р-15): заголовок — имя, номер — подзаголовок; пустое имя игнорируется', () => {
    const s0 = stateWith([chat()]);
    expect(chatTitle(chat())).toBe(TEST_PHONE_FORMATTED);
    expect(chatSubtitle(chat())).toBeNull();
    const s1 = chatsReducer(s0, {
      type: 'chatNameReceived',
      chatId: TEST_CHAT_ID,
      chatName: ' Имя ',
    });
    const [named] = s1.chats;
    if (!named) throw new Error('нет чата');
    expect(chatTitle(named)).toBe('Имя');
    expect(chatSubtitle(named)).toBe(TEST_PHONE_FORMATTED);
    expect(
      chatsReducer(s1, { type: 'chatNameReceived', chatId: TEST_CHAT_ID, chatName: ' ' }),
    ).toBe(s1);
  });

  it('phoneCached и loaded', () => {
    const s1 = chatsReducer(createInitialChatsState(), {
      type: 'phoneCached',
      phone: TEST_PHONE,
      chatId: TEST_CHAT_ID,
    });
    expect(s1.phoneCache).toEqual({ [TEST_PHONE]: TEST_CHAT_ID });
    expect(chatsReducer(s1, { type: 'phoneCached', phone: TEST_PHONE, chatId: TEST_CHAT_ID })).toBe(
      s1,
    );
    const selected = { ...s1, chats: [chat()], selectedChatId: TEST_CHAT_ID };
    expect(
      chatsReducer(selected, { type: 'loaded', chats: [chat()], phoneCache: {} }).selectedChatId,
    ).toBe(TEST_CHAT_ID);
    expect(
      chatsReducer(selected, { type: 'loaded', chats: [], phoneCache: {} }).selectedChatId,
    ).toBeNull();
  });
});

describe('findCachedChat (п. 2.4, EC-D10)', () => {
  it('кеш → chatId и чат; кеша нет, но чат с этим номером есть → тоже без checkAccount', () => {
    const s = stateWith([chat()], { phoneCache: { [TEST_PHONE_2]: TEST_CHAT_ID_2 } });
    expect(findCachedChat(s, TEST_PHONE_2)).toEqual({ chatId: TEST_CHAT_ID_2, chat: null });
    expect(findCachedChat(s, TEST_PHONE)).toEqual({ chatId: TEST_CHAT_ID, chat: chat() });
    expect(findCachedChat(s, '79990000009')).toBeNull();
  });
});
