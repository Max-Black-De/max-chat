/**
 * Базовый сценарий-заготовка Д-2: приложение открывается.
 * Полный базовый сценарий (вход → чат → отправка → один пузырь) — после F2–F4.
 */
import { expect, test } from './support/greenApi';

test('app opens without errors and without API calls', async ({ page, greenApi }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') pageErrors.push(message.text());
  });

  await page.goto('/');

  await expect(page).toHaveTitle('MAX Chat — GREEN-API');
  await expect(page.getByRole('heading', { level: 1, name: 'MAX Chat' })).toBeVisible();
  expect(pageErrors).toEqual([]);
  // Каркас ещё не ходит в API; когда появится экран входа (F2), здесь будет L-01.
  expect(greenApi.calls).toEqual([]);
});
