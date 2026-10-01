/**
 * F7: обычный сценарий не пишет в консоль ни ошибок, ни предупреждений (разрешены только
 * единичные warn из ТЗ: getSettings, хранилище, чужой инстанс, битое body, квота) и нигде в
 * консоли нет токена и номеров (НФТ-3). Шум из групп удаляется молча. Только моки `greenApi`.
 */
import {
  API_TOKEN,
  CHAT_IDS,
  ID_INSTANCE,
  PHONES,
  bodyResponse,
  checkAccountResponses,
  deleteResponses,
  emptyReceiveResponses,
  groupText,
  incomingText,
  messageTexts,
  sendMessageResponses,
  settingsResponses,
  stateResponses,
} from '../src/test/fixtures';
import { delayed, expect, test } from './support/greenApi';

const EMPTY = delayed(emptyReceiveResponses.emptyBody, 300);

test('вход → новый чат → отправка → входящее и шум группы: консоль чистая', async ({
  page,
  greenApi,
}) => {
  const messages: { type: string; text: string }[] = [];
  page.on('console', (m) => {
    messages.push({ type: m.type(), text: m.text() });
  });
  page.on('pageerror', (e) => {
    messages.push({ type: 'pageerror', text: e.message });
  });

  let step = 0;
  greenApi
    .on('getStateInstance', stateResponses.authorized)
    .on('getSettings', settingsResponses.ok)
    .on('checkAccount', checkAccountResponses.exists)
    .on('sendMessage', sendMessageResponses.sent)
    .on('deleteNotification', deleteResponses.ok)
    .on('receiveNotification', () => {
      if (greenApi.callsTo('sendMessage').length === 0) return EMPTY;
      step += 1;
      if (step === 1) return bodyResponse(groupText, 301);
      if (step === 2) return bodyResponse(incomingText, 302);
      return EMPTY;
    });

  await page.goto('/');
  await page.getByTestId('login-idInstance').fill(ID_INSTANCE);
  await page.getByTestId('login-apiTokenInstance').fill(API_TOKEN);
  await page.getByTestId('login-submit').click();
  await page.getByTestId('new-chat-button').click();
  await page.getByTestId('new-chat-phone').fill(String(PHONES.primary));
  await page.getByTestId('new-chat-submit').click();
  await expect(page.getByTestId('chat-window')).toHaveAttribute('data-chat-id', CHAT_IDS.primary);
  await page.getByTestId('composer-input').fill(messageTexts.plain);
  await page.getByTestId('composer-input').press('Enter');
  await expect(page.locator('[data-testid="message"][data-direction="in"]')).toHaveCount(1);
  await expect.poll(() => greenApi.callsTo('deleteNotification').length).toBe(2);

  const noisy = messages.filter((m) =>
    ['error', 'warning', 'pageerror', 'assert'].includes(m.type),
  );
  expect(noisy).toEqual([]);
  const all = JSON.stringify(messages);
  for (const secret of [API_TOKEN, String(PHONES.primary), String(PHONES.own)])
    expect(all).not.toContain(secret);
});
