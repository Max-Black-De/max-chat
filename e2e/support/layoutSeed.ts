/**
 * F6: данные для e2e макета — чаты и ленты прямо в localStorage до загрузки страницы
 * (формат `AppStorage`, ключи `maxchat:<idInstance>:v1:<раздел>`). Только условные значения
 * из `src/test/fixtures`; реальный GREEN-API не вызывается.
 */
import type { Page } from '@playwright/test';
import { SEND_TEXTS } from '../../src/api';
import {
  API_TOKEN,
  BASE_TIMESTAMP,
  CHAT_IDS,
  ID_INSTANCE,
  NAMES,
  PHONES,
  messageTexts,
} from '../../src/test/fixtures';
import { lsKey, storedChats, type ChatFixture } from '../../src/test/fixtures/chats';
import { messagesSection, type StoredMessage } from '../../src/store/messagesStorage';
import { expect } from './greenApi';

/** Длинное имя для шапки и списка (EC-N12): должно уйти в многоточие. */
export const LONG_NAME = `${NAMES.secondary} ${'с очень длинным именем '.repeat(6).trim()}`;

/** Лента основного чата: свои / входящие, RTL и bidi (EC-U5), длинные слова (EC-U4), ошибка, заглушка. */
export function primaryMessages(): StoredMessage[] {
  const chatId = CHAT_IDS.primary;
  let n = 0;
  const msg = (m: Omit<StoredMessage, 'localId' | 'chatId' | 'timestamp'>): StoredMessage => {
    n += 1;
    return { localId: `seed-${String(n)}`, chatId, timestamp: BASE_TIMESTAMP + n * 60, ...m };
  };
  return [
    msg({ direction: 'in', idMessage: 'SEEDIN0001', text: messageTexts.plain }),
    msg({
      direction: 'out',
      idMessage: 'SEEDOUT001',
      text: messageTexts.multiline,
      status: 'sent',
    }),
    msg({ direction: 'out', idMessage: 'SEEDOUT002', text: messageTexts.rtlText, status: 'sent' }),
    msg({ direction: 'in', idMessage: 'SEEDIN0002', text: messageTexts.rtlText }),
    msg({ direction: 'in', idMessage: 'SEEDIN0003', text: messageTexts.bidiOverride }),
    msg({
      direction: 'out',
      idMessage: 'SEEDOUT003',
      text: messageTexts.bidiOverride,
      status: 'sent',
    }),
    msg({ direction: 'in', idMessage: 'SEEDIN0004', text: messageTexts.longWord }),
    msg({ direction: 'out', idMessage: 'SEEDOUT004', text: messageTexts.longUrl, status: 'sent' }),
    msg({ direction: 'in', idMessage: 'SEEDIN0005', text: '', unsupported: true }),
    msg({
      direction: 'out',
      text: messageTexts.plain,
      status: 'error',
      errorText: SEND_TEXTS.rateLimited,
    }),
  ];
}

export function seededChats(): ChatFixture[] {
  const messages = primaryMessages();
  const last = messages[messages.length - 1];
  return [
    {
      chatId: CHAT_IDS.primary,
      phone: String(PHONES.primary),
      createdAt: BASE_TIMESTAMP,
      unread: 0,
      chatName: NAMES.primary,
      ...(last
        ? { lastMessage: { text: last.text, timestamp: last.timestamp, direction: last.direction } }
        : {}),
    },
    {
      chatId: CHAT_IDS.secondary,
      phone: String(PHONES.secondary),
      createdAt: BASE_TIMESTAMP,
      unread: 120,
      chatName: LONG_NAME,
      lastMessage: {
        text: messageTexts.previewEmojiBoundary.repeat(3),
        timestamp: BASE_TIMESTAMP + 30,
        direction: 'in',
      },
    },
    {
      chatId: CHAT_IDS.newRecipient,
      phone: String(PHONES.newRecipient),
      createdAt: BASE_TIMESTAMP,
      unread: 3,
      lastMessage: {
        text: messageTexts.previewOnlyEmoji,
        timestamp: BASE_TIMESTAMP + 20,
        direction: 'in',
      },
    },
  ];
}

/** Записать чаты и ленту в localStorage до старта приложения. */
export async function seedStorage(page: Page): Promise<void> {
  const entries: Record<string, string> = {
    ...storedChats(seededChats()),
    [lsKey(messagesSection(CHAT_IDS.primary))]: JSON.stringify({
      messages: primaryMessages(),
      index: {},
    }),
  };
  await page.addInitScript((data: Record<string, string>) => {
    for (const [k, v] of Object.entries(data)) window.localStorage.setItem(k, v);
  }, entries);
}

export async function login(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByTestId('login-idInstance').fill(ID_INSTANCE);
  await page.getByTestId('login-apiTokenInstance').fill(API_TOKEN);
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('main-screen')).toBeVisible();
}

/** Нет горизонтального скролла страницы (Д-6e: 375 px). */
export async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
}
