/**
 * Q2 (Д3), e2e на моках — уточнения ТЗ v1.3.6, которых нет в e2e Фронтенда:
 * - п. 3.5: счётчик «N/4000» появляется с 3600 символов, при N > 4000 — красный и отправка
 *   недоступна (в unit у Фронтенда — 4000/4001, порог 3600 не проверен);
 * - R-10 / R-11 (EC-S4, Р-12): вторая вкладка в настоящем Chromium с настоящим Web Lock —
 *   только чтение; закрыли первую — вторая берёт замок и становится обычной (в unit у Фронтенда
 *   это на фейковых замках);
 * - Р-11: входящее `imageMessage` по структуре образца Р-26 → заглушка в пузыре и превью;
 *   caption, имя файла, миниатюра, ссылка, `senderContactName` и номер не попадают в DOM,
 *   localStorage/sessionStorage и консоль браузера.
 */
import { BANNER_TEXTS } from '../src/api';
import { SESSION_TEXTS } from '../src/store';
import {
  bodyResponse,
  checkAccountResponses,
  deleteResponses,
  emptyReceiveResponses,
  incomingImageSampleLeaks,
  incomingImageSampleR26,
  sendMessageResponses,
  settingsResponses,
  stateResponses,
} from '../src/test/fixtures';
import { delayed, expect, test } from './support/greenApi';
import { dumpStorage, login, loginAndOpenChat } from './support/session';

const EMPTY = delayed(emptyReceiveResponses.emptyBody, 300);

test.beforeEach(({ greenApi }) => {
  greenApi
    .on('getStateInstance', stateResponses.authorized)
    .on('getSettings', settingsResponses.ok)
    .on('checkAccount', checkAccountResponses.exists)
    .on('receiveNotification', EMPTY)
    .on('deleteNotification', deleteResponses.ok)
    .on('sendMessage', sendMessageResponses.sent);
});

test('п. 3.5 (v1.3.6): счётчик с 3600, красный и без отправки при 4001', async ({
  page,
  greenApi,
}) => {
  await loginAndOpenChat(page);
  const input = page.getByTestId('composer-input');
  const counter = page.getByTestId('composer-counter');
  const send = page.getByTestId('send-button');

  await input.fill('а'.repeat(3599));
  await expect(counter).toHaveCount(0);
  await expect(send).toBeEnabled();

  await input.fill('а'.repeat(3600));
  await expect(counter).toHaveText('3600/4000');
  await expect(counter).not.toHaveClass(/composer__counter--over/);
  await expect(send).toBeEnabled();

  await input.fill('а'.repeat(4000));
  await expect(counter).toHaveText('4000/4000');
  await expect(send).toBeEnabled();

  await input.fill('а'.repeat(4001));
  await expect(counter).toHaveText('4001/4000');
  await expect(counter).toHaveClass(/composer__counter--over/);
  await expect(send).toBeDisabled();
  await input.press('Enter');
  expect(greenApi.callsTo('sendMessage')).toHaveLength(0);
});

test('Р-11 (v1.3.6): imageMessage по образцу Р-26 — заглушка; содержимого нет в DOM, хранилище и консоли', async ({
  page,
  greenApi,
}) => {
  const consoleLines: string[] = [];
  page.on('console', (m) => consoleLines.push(m.text()));
  let delivered = false;
  greenApi.on('receiveNotification', () => {
    if (delivered || greenApi.callsTo('checkAccount').length === 0) return EMPTY;
    delivered = true;
    return bodyResponse(incomingImageSampleR26, 93);
  });
  await loginAndOpenChat(page);
  await expect
    .poll(() => greenApi.callsTo('deleteNotification').map((c) => c.extra))
    .toEqual(['93']);

  const bubble = page.getByTestId('message');
  await expect(bubble).toHaveCount(1);
  await expect(bubble).toHaveAttribute('data-direction', 'in');
  await expect(bubble.getByTestId('message-text')).toHaveText(BANNER_TEXTS.unsupportedMessage);
  await expect(page.getByTestId('chat-item-preview')).toHaveText(BANNER_TEXTS.unsupportedMessage);
  await expect(page.locator('img')).toHaveCount(0);

  const html = await page.content();
  const stored = await dumpStorage(page);
  const logs = consoleLines.join('\n');
  for (const leak of incomingImageSampleLeaks) {
    expect(html).not.toContain(leak);
    expect(stored).not.toContain(leak);
    expect(logs).not.toContain(leak);
  }
  for (const field of ['senderPhoneNumber', 'downloadUrl', 'jpegThumbnail', 'caption']) {
    expect(stored).not.toContain(field);
    expect(logs).not.toContain(field);
  }
});

test('R-10 / R-11 (EC-S4): вторая вкладка — только чтение; после закрытия первой — обычная', async ({
  page,
  context,
  greenApi,
}) => {
  await loginAndOpenChat(page);
  const second = await context.newPage();
  await second.goto('/');
  await login(second);

  await expect(second.getByTestId('banner-other-tab')).toHaveText(BANNER_TEXTS.otherTab);
  await expect(second.getByTestId('new-chat-button')).toBeDisabled();
  await second.getByTestId('chat-item').click();
  await expect(second.getByTestId('composer-input')).toBeDisabled();
  await expect(second.getByTestId('send-button')).toBeDisabled();
  await expect(second.getByTestId('composer-readonly-hint')).toHaveText(
    SESSION_TEXTS.otherTabReadOnly,
  );

  const receivesBefore = greenApi.callsTo('receiveNotification').length;
  await page.close();
  // Замок перешёл ко второй вкладке: баннер скрыт, ввод и «Новый чат» доступны, опрос идёт.
  await expect(second.getByTestId('banner-other-tab')).toHaveCount(0);
  await expect(second.getByTestId('new-chat-button')).toBeEnabled();
  await expect(second.getByTestId('composer-input')).toBeEnabled();
  await expect
    .poll(() => greenApi.callsTo('receiveNotification').length)
    .toBeGreaterThan(receivesBefore);
  await second.getByTestId('composer-input').fill('Тестовое сообщение');
  await second.getByTestId('composer-input').press('Enter');
  await expect(second.getByTestId('message')).toHaveCount(1);
  await expect(second.getByTestId('message')).toHaveAttribute('data-status', 'sent');
});
