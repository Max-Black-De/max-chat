/**
 * Д-2 (ТЗ §10.3) с опросом F5: вход → новый чат → отправка → receive возвращает
 * `outgoingAPIMessageReceived` с тем же chatId/idMessage (`extendedTextMessage`, как на реальном
 * инстансе) → в ленте ровно один пузырь «отправлено», уведомление удалено. Плюс ОР-5: входящий
 * ответ в известном чате. Всё на моках (`greenApi`); реальный GREEN-API не вызывается.
 */
import { type Page } from '@playwright/test';
import {
  API_TOKEN,
  CHAT_IDS,
  ID_INSTANCE,
  ID_MESSAGES,
  NAMES,
  PHONES,
  bodyResponse,
  checkAccountResponses,
  deleteResponses,
  emptyReceiveResponses,
  groupText,
  incomingText,
  messageTexts,
  outgoingApi,
  sendMessageResponses,
  settingsResponses,
  stateResponses,
} from '../src/test/fixtures';
import { delayed, expect, test, type GreenApiMock, type MockStep } from './support/greenApi';

/** Пустой long polling: ответ через 300 мс, чтобы цикл не крутился вхолостую. */
const EMPTY = delayed(emptyReceiveResponses.emptyBody, 300);

async function loginAndOpenChat(page: Page) {
  await page.goto('/');
  await page.getByTestId('login-idInstance').fill(ID_INSTANCE);
  await page.getByTestId('login-apiTokenInstance').fill(API_TOKEN);
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('main-screen')).toBeVisible();
  await page.getByTestId('new-chat-button').click();
  await page.getByTestId('new-chat-phone').fill(String(PHONES.primary));
  await page.getByTestId('new-chat-submit').click();
  await expect(page.getByTestId('chat-window')).toBeVisible();
}

/** receive: пусто, пока не выполнено условие; затем один раз `reply`; дальше снова пусто. */
function receiveOnce(greenApi: GreenApiMock, when: () => boolean, reply: () => MockStep) {
  let delivered = false;
  greenApi.on('receiveNotification', () => {
    if (delivered || !when()) return EMPTY;
    delivered = true;
    return reply();
  });
}

test.beforeEach(({ greenApi }) => {
  greenApi
    .on('getStateInstance', stateResponses.authorized)
    .on('getSettings', settingsResponses.ok)
    .on('checkAccount', checkAccountResponses.exists)
    .on('sendMessage', sendMessageResponses.sent)
    .on('receiveNotification', EMPTY)
    .on('deleteNotification', deleteResponses.ok);
});

test('Д-2: отправка + outgoingAPIMessageReceived с тем же idMessage → ровно один пузырь «отправлено»', async ({
  page,
  greenApi,
}) => {
  expect(outgoingApi.idMessage).toBe(ID_MESSAGES.api1);
  expect(outgoingApi.senderData.chatId).toBe(CHAT_IDS.primary);
  expect(outgoingApi.messageData.typeMessage).toBe('extendedTextMessage');
  receiveOnce(
    greenApi,
    () => greenApi.callsTo('sendMessage').length > 0,
    () => bodyResponse(outgoingApi, 90),
  );
  await loginAndOpenChat(page);
  const input = page.getByTestId('composer-input');
  await input.fill(messageTexts.plain);
  await input.press('Enter');

  await expect
    .poll(() => greenApi.callsTo('deleteNotification').map((c) => [c.httpMethod, c.extra]))
    .toEqual([['DELETE', '90']]);
  const bubble = page.getByTestId('message');
  await expect(bubble).toHaveCount(1);
  await expect(bubble).toHaveAttribute('data-status', 'sent');
  await expect(bubble.getByTestId('message-text')).toHaveText(messageTexts.plain);
  // Опрос продолжается после delete.
  const receivesAfterDelete = greenApi.callsTo('receiveNotification').length;
  await expect
    .poll(() => greenApi.callsTo('receiveNotification').length)
    .toBeGreaterThan(receivesAfterDelete);
  await expect(bubble).toHaveCount(1);
  // receiveTimeout=20 в каждом запросе опроса (Р-20).
  for (const call of greenApi.callsTo('receiveNotification'))
    expect(call.url.searchParams.get('receiveTimeout')).toBe('20');
});

test('ОР-5: входящий ответ в известном чате — пузырь слева, имя чата; группа не показывается', async ({
  page,
  greenApi,
}) => {
  let step = 0;
  greenApi.on('receiveNotification', () => {
    if (greenApi.callsTo('checkAccount').length === 0) return EMPTY;
    step += 1;
    if (step === 1) return delayed(bodyResponse(groupText, 91), 300);
    if (step === 2) return bodyResponse(incomingText, 92);
    return EMPTY;
  });
  await loginAndOpenChat(page);
  await expect
    .poll(() => greenApi.callsTo('deleteNotification').map((c) => c.extra))
    .toEqual(['91', '92']);
  const bubble = page.getByTestId('message');
  await expect(bubble).toHaveCount(1);
  await expect(bubble).toHaveAttribute('data-direction', 'in');
  await expect(bubble.getByTestId('message-text')).toHaveText('Тестовый ответ');
  await expect(page.getByTestId('chat-title')).toHaveText(NAMES.primary);
  await expect(page.getByTestId('chat-item')).toHaveCount(1);
  await expect(page.getByText(NAMES.group)).toHaveCount(0);
});
