/**
 * Базовый сценарий Д-2 до опроса (F2–F4): вход → новый чат → отправка → один пузырь
 * «отправлено». Плюс EC-U5 в настоящей вёрстке: RTL-текст в своём пузыре остаётся справа.
 * Всё на моках (`greenApi`); реальный GREEN-API не вызывается.
 */
import {
  API_TOKEN,
  CHAT_IDS,
  ID_INSTANCE,
  PHONES,
  checkAccountResponses,
  deleteResponses,
  emptyReceiveResponses,
  messageTexts,
  sendMessageResponses,
  settingsResponses,
  stateResponses,
} from '../src/test/fixtures';
import { type Page } from '@playwright/test';
import { SEND_TEXTS } from '../src/api';
import { delayed, expect, test } from './support/greenApi';

async function login(page: Page) {
  await page.getByTestId('login-idInstance').fill(ID_INSTANCE);
  await page.getByTestId('login-apiTokenInstance').fill(API_TOKEN);
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('main-screen')).toBeVisible();
}

async function loginAndOpenChat(page: Page) {
  await page.goto('/');
  await login(page);
  await page.getByTestId('new-chat-button').click();
  await page.getByTestId('new-chat-phone').fill(String(PHONES.primary));
  await page.getByTestId('new-chat-submit').click();
  await expect(page.getByTestId('chat-window')).toBeVisible();
}

test.beforeEach(({ greenApi }) => {
  greenApi
    .on('getStateInstance', stateResponses.authorized)
    .on('getSettings', settingsResponses.ok)
    .on('checkAccount', checkAccountResponses.exists)
    // Опрос F5: пустой long polling (с задержкой, чтобы не крутить цикл) и delete.
    .on('receiveNotification', delayed(emptyReceiveResponses.emptyBody, 500))
    .on('deleteNotification', deleteResponses.ok)
    // Каждому сообщению — свой idMessage: одинаковый означал бы «уже пришло уведомлением» (§6.3).
    .on('sendMessage', [
      sendMessageResponses.sent,
      sendMessageResponses.sent2,
      sendMessageResponses.sentRace,
    ]);
});

test('ОР-3: Enter отправляет, пузырь справа «отправлено», sendMessage с chatId', async ({
  page,
  greenApi,
}) => {
  await loginAndOpenChat(page);
  const input = page.getByTestId('composer-input');
  await input.fill(messageTexts.plain);
  await input.press('Enter');

  const bubble = page.getByTestId('message');
  await expect(bubble).toHaveCount(1);
  await expect(bubble).toHaveAttribute('data-status', 'sent');
  await expect(bubble.getByTestId('message-text')).toHaveText(messageTexts.plain);
  await expect(input).toHaveValue('');
  expect(greenApi.callsTo('sendMessage').map((c) => c.body)).toEqual([
    { chatId: CHAT_IDS.primary, message: messageTexts.plain },
  ]);
  // Превью и время в списке чатов.
  await expect(page.getByTestId('chat-item-preview')).toHaveText(messageTexts.plain);

  // Shift+Enter — перенос строки, не отправка.
  await input.press('Shift+Enter');
  expect(greenApi.callsTo('sendMessage')).toHaveLength(1);
});

test('EC-U5: RTL и U+202E в своём пузыре — пузырь справа, dir="auto" только у текста', async ({
  page,
}) => {
  await loginAndOpenChat(page);
  const input = page.getByTestId('composer-input');
  for (const text of [messageTexts.rtlText, messageTexts.bidiOverride, messageTexts.longUrl]) {
    await input.fill(text);
    await input.press('Enter');
  }
  const bubbles = page.getByTestId('message');
  await expect(bubbles).toHaveCount(3);
  const list = await page.getByTestId('message-list').boundingBox();
  if (!list) throw new Error('лента не видна');
  for (const bubble of await bubbles.all()) {
    await expect(bubble).not.toHaveAttribute('dir');
    await expect(bubble.getByTestId('message-text')).toHaveAttribute('dir', 'auto');
    const box = await bubble.boundingBox();
    if (!box) throw new Error('пузырь не виден');
    // Свои — у правого края ленты (с учётом отступа), ширина не больше ленты.
    expect(list.x + list.width - (box.x + box.width)).toBeLessThan(40);
    expect(box.width).toBeLessThanOrEqual(list.width);
  }
  // Длинная ссылка переносится — горизонтальной прокрутки нет.
  const overflow = await page
    .getByTestId('message-list')
    .evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('EC-U1 (M-13): пробелы — «Отправить» неактивна, Enter не отправляет', async ({
  page,
  greenApi,
}) => {
  await loginAndOpenChat(page);
  const input = page.getByTestId('composer-input');
  await input.fill(messageTexts.onlySpaces);
  await expect(page.getByTestId('send-button')).toBeDisabled();
  await input.press('Enter');
  await expect(page.getByTestId('message')).toHaveCount(0);
  expect(greenApi.callsTo('sendMessage')).toHaveLength(0);
});

test('EC-D5 (M-24): выход во время отправки — после входа «не отправлено», «Повторить»', async ({
  page,
  greenApi,
}) => {
  greenApi.on('sendMessage', delayed(sendMessageResponses.sent, 3_000));
  await loginAndOpenChat(page);
  const input = page.getByTestId('composer-input');
  await input.fill(messageTexts.plain);
  await input.press('Enter');
  await expect(page.getByTestId('message')).toHaveAttribute('data-status', 'sending');
  await page.getByTestId('logout-button').click();
  await expect(page.getByTestId('login-form')).toBeVisible();

  await login(page);
  await page.getByTestId('chat-item').click();
  const bubble = page.getByTestId('message');
  await expect(bubble).toHaveAttribute('data-status', 'error');
  await expect(bubble.getByTestId('message-error')).toHaveText(SEND_TEXTS.statusUnknown);
  await expect(bubble.getByTestId('message-retry')).toBeEnabled();
  // Автоповтора нет: один вызов sendMessage.
  expect(greenApi.callsTo('sendMessage')).toHaveLength(1);
});
