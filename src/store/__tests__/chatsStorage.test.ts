import { describe, expect, it, vi } from 'vitest';
import { SEND_TEXTS } from '../../api';
import { loadChats, saveChats, savePhoneCache } from '../chatsStorage';
import {
  loadChatMessages,
  messagesSection,
  recoverSendingMessages,
  saveChatMessages,
  sanitizeChatMessages,
} from '../messagesStorage';
import { createAppStorage } from '../storage';
import { memoryStorage } from '../../test/fixtures/greenApiMock';
import { FOREIGN_ID_INSTANCE, ID_INSTANCE } from '../../test/fixtures/constants';
import {
  STORAGE_KEY_PREFIX,
  corruptedStorageValues,
  legacyStorageKey,
} from '../../test/fixtures/storage';
import {
  TEST_CHAT_ID,
  TEST_CHAT_ID_2,
  TEST_PHONE,
  chatFixture,
  lsKey,
  storedChats,
} from '../../test/fixtures/chats';

const ID = ID_INSTANCE;
const OTHER_ID = FOREIGN_ID_INSTANCE;

function storageOf(
  initial: Record<string, string> = {},
  opts: { failWrites?: boolean; readOnly?: boolean } = {},
) {
  const backend = memoryStorage(initial, opts.failWrites);
  const warn = vi.fn();
  const onWriteFailure = vi.fn();
  const storage = createAppStorage({
    idInstance: ID,
    backend,
    warn,
    onWriteFailure,
    ...(opts.readOnly ? { readOnly: true } : {}),
  });
  return { backend, storage, warn, onWriteFailure };
}

const out = (localId: string, status: 'sending' | 'sent' | 'error', extra: object = {}) => ({
  localId,
  chatId: TEST_CHAT_ID,
  direction: 'out',
  text: `текст ${localId}`,
  timestamp: 1_790_000_000,
  status,
  ...extra,
});

describe('loadChats (Р-2, EC-D7, EC-D8)', () => {
  it('читает чаты и кеш своего инстанса', () => {
    const { storage } = storageOf(storedChats([chatFixture()], { [TEST_PHONE]: TEST_CHAT_ID }, ID));
    expect(loadChats(storage)).toEqual({
      chats: [chatFixture()],
      phoneCache: { [TEST_PHONE]: TEST_CHAT_ID },
    });
  });

  it('EC-D7: данные другого инстанса не видны', () => {
    const { storage } = storageOf(
      storedChats([chatFixture()], { [TEST_PHONE]: TEST_CHAT_ID }, OTHER_ID),
    );
    expect(loadChats(storage)).toEqual({ chats: [], phoneCache: {} });
  });

  it.each(Object.entries(corruptedStorageValues))(
    'EC-D8: повреждённый раздел (%s) — пусто, без исключений',
    (_name, value) => {
      const { storage } = storageOf({
        [lsKey('chats', ID)]: value,
        [lsKey('phoneCache', ID)]: value,
      });
      expect(loadChats(storage)).toEqual({ chats: [], phoneCache: {} });
    },
  );

  it('EC-D8: ключ без версии (старая схема) или другой версии не читается', () => {
    for (const initial of [
      { [legacyStorageKey]: JSON.stringify([chatFixture()]) },
      { [`maxchat:${ID}:v2:chats`]: JSON.stringify([chatFixture()]) },
    ]) {
      const { storage } = storageOf(initial);
      expect(loadChats(storage)).toEqual({ chats: [], phoneCache: {} });
    }
  });

  it('EC-D8: битый кеш не мешает чатам и наоборот', () => {
    const { storage } = storageOf({
      [lsKey('chats', ID)]: JSON.stringify([chatFixture()]),
      [lsKey('phoneCache', ID)]: '{broken',
    });
    expect(loadChats(storage)).toEqual({ chats: [chatFixture()], phoneCache: {} });
  });

  it('getItem бросает — пустой список', () => {
    const storage = createAppStorage({
      idInstance: ID,
      backend: {
        getItem: () => {
          throw new Error('SecurityError');
        },
        setItem: () => undefined,
        removeItem: () => undefined,
      },
    });
    expect(loadChats(storage)).toEqual({ chats: [], phoneCache: {} });
  });

  it('сохранение: ключи maxchat:<id>:v1:chats / phoneCache, токена нет', () => {
    const { storage, backend } = storageOf();
    expect(saveChats(storage, [chatFixture()])).toBe(true);
    expect(savePhoneCache(storage, { [TEST_PHONE]: TEST_CHAT_ID })).toBe(true);
    expect([...backend.map.keys()].sort()).toEqual([
      `${STORAGE_KEY_PREFIX}chats`,
      `${STORAGE_KEY_PREFIX}phoneCache`,
    ]);
    expect(JSON.parse(backend.map.get(lsKey('chats', ID)) ?? '')).toEqual([chatFixture()]);
  });

  it('EC-D11: запись не удалась — работа в памяти, один warn без данных, один сигнал баннеру', () => {
    const { storage, backend, warn, onWriteFailure } = storageOf({}, { failWrites: true });
    expect(saveChats(storage, [chatFixture()])).toBe(false);
    expect(savePhoneCache(storage, { [TEST_PHONE]: TEST_CHAT_ID })).toBe(false);
    saveChats(storage, [chatFixture(), chatFixture({ chatId: TEST_CHAT_ID_2 })]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warn.mock.calls)).not.toContain(TEST_PHONE);
    expect(JSON.stringify(warn.mock.calls)).not.toContain(TEST_CHAT_ID);
    expect(onWriteFailure).toHaveBeenCalledTimes(1);
    expect(backend.map.size).toBe(0);
    expect(loadChats(storage).chats).toHaveLength(2); // в памяти до перезагрузки
  });

  it('EC-S4: вкладка только на чтение в localStorage не пишет', () => {
    const { storage, backend } = storageOf({}, { readOnly: true });
    saveChats(storage, [chatFixture()]);
    savePhoneCache(storage, { [TEST_PHONE]: TEST_CHAT_ID });
    expect(backend.map.size).toBe(0);
    expect(loadChats(storage).chats).toEqual([chatFixture()]);
  });
});

describe('ленты чатов: ВА-20 «отправляется» → «не отправлено» при загрузке (EC-D5)', () => {
  it('loadChatMessages исправляет sending и записывает обратно; остальное без изменений', () => {
    const data = {
      messages: [
        out('a', 'sending'),
        out('b', 'sent', { idMessage: '111' }),
        out('c', 'error', { errorText: 'x' }),
      ],
      index: { [`${TEST_CHAT_ID}_111`]: 'b' },
    };
    const { storage, backend } = storageOf({
      [lsKey(messagesSection(TEST_CHAT_ID), ID)]: JSON.stringify(data),
    });
    const loaded = loadChatMessages(storage, TEST_CHAT_ID);
    expect(loaded.messages[0]).toMatchObject({
      localId: 'a',
      status: 'error',
      errorText: SEND_TEXTS.statusUnknown,
    });
    expect(loaded.messages.slice(1)).toEqual(data.messages.slice(1));
    const persisted = JSON.parse(
      backend.map.get(lsKey(messagesSection(TEST_CHAT_ID), ID)) ?? '',
    ) as typeof data;
    expect(persisted.messages[0]?.status).toBe('error');
    expect(persisted.index).toEqual(data.index);
  });

  it('нечего исправлять — не пишет', () => {
    const data = { messages: [out('b', 'sent')], index: {} };
    const initial = { [lsKey(messagesSection(TEST_CHAT_ID), ID)]: JSON.stringify(data) };
    const { storage, backend } = storageOf(initial);
    const setItem = vi.spyOn(backend, 'setItem');
    loadChatMessages(storage, TEST_CHAT_ID);
    expect(setItem).not.toHaveBeenCalled();
  });

  it('loadChats чинит ленты всех чатов; лента без чата не трогается', () => {
    const sending = (chatId: string) =>
      JSON.stringify({ messages: [{ ...out('a', 'sending'), chatId }], index: {} });
    const { storage, backend } = storageOf({
      ...storedChats([chatFixture()], {}, ID),
      [lsKey(messagesSection(TEST_CHAT_ID), ID)]: sending(TEST_CHAT_ID),
      [lsKey(messagesSection(TEST_CHAT_ID_2), ID)]: sending(TEST_CHAT_ID_2),
    });
    loadChats(storage);
    expect(backend.map.get(lsKey(messagesSection(TEST_CHAT_ID), ID))).toContain('"status":"error"');
    expect(backend.map.get(lsKey(messagesSection(TEST_CHAT_ID_2), ID))).toContain(
      '"status":"sending"',
    );
  });

  it('во вкладке только на чтение исправление живёт в памяти (EC-S4)', () => {
    const raw = JSON.stringify({ messages: [out('a', 'sending')], index: {} });
    const { storage, backend } = storageOf(
      { [lsKey(messagesSection(TEST_CHAT_ID), ID)]: raw },
      { readOnly: true },
    );
    recoverSendingMessages(storage, [TEST_CHAT_ID]);
    expect(backend.map.get(lsKey(messagesSection(TEST_CHAT_ID), ID))).toBe(raw);
    expect(loadChatMessages(storage, TEST_CHAT_ID).messages[0]?.status).toBe('error');
  });

  it('EC-D8: битая лента одного чата — пустая, соседняя цела; плохой chatId не читается', () => {
    const { storage } = storageOf({
      [lsKey(messagesSection(TEST_CHAT_ID), ID)]: '{oops',
      [lsKey(messagesSection(TEST_CHAT_ID_2), ID)]: JSON.stringify({
        messages: [{ ...out('z', 'sent'), chatId: TEST_CHAT_ID_2 }],
        index: {},
      }),
    });
    expect(loadChatMessages(storage, TEST_CHAT_ID)).toEqual({ messages: [], index: {} });
    expect(loadChatMessages(storage, TEST_CHAT_ID_2).messages).toHaveLength(1);
    expect(loadChatMessages(storage, `${TEST_CHAT_ID}@c.us`)).toEqual({ messages: [], index: {} });
    expect(saveChatMessages(storage, `${TEST_CHAT_ID}@c.us`, { messages: [], index: {} })).toBe(
      false,
    );
  });

  it('sanitizeChatMessages: чужой chatId, повторный localId, битые поля отбрасываются; индекс восстанавливается', () => {
    const v = {
      messages: [
        out('a', 'sent', { idMessage: '1' }),
        out('a', 'sent'),
        { ...out('b', 'sent'), chatId: TEST_CHAT_ID_2 },
        { ...out('c', 'sent'), timestamp: 'x' },
        {
          localId: 'd',
          chatId: TEST_CHAT_ID,
          direction: 'in',
          text: 'привет',
          timestamp: 1,
          unsupported: true,
        },
      ],
      index: { [`${TEST_CHAT_ID}_9`]: 'нет-такого', [`${TEST_CHAT_ID_2}_1`]: 'a' },
    };
    const r = sanitizeChatMessages(v, TEST_CHAT_ID);
    expect(r.messages.map((m) => m.localId)).toEqual(['a', 'd']);
    expect(r.messages[1]).toEqual({
      localId: 'd',
      chatId: TEST_CHAT_ID,
      direction: 'in',
      text: 'привет',
      timestamp: 1,
      unsupported: true,
    });
    expect(r.index).toEqual({ [`${TEST_CHAT_ID}_1`]: 'a' });
    expect(sanitizeChatMessages([], TEST_CHAT_ID)).toEqual({ messages: [], index: {} });
  });
});
