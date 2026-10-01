/**
 * Общие шаги e2e QA (Q2): вход на моках и новый чат по номеру `PHONES.primary`.
 * Моки задаёт тест через `greenApi`; реальный GREEN-API не вызывается.
 */
import { type Page } from '@playwright/test';
import { API_TOKEN, ID_INSTANCE, PHONES } from '../../src/test/fixtures';
import { expect } from './greenApi';

export async function login(page: Page): Promise<void> {
  await page.getByTestId('login-idInstance').fill(ID_INSTANCE);
  await page.getByTestId('login-apiTokenInstance').fill(API_TOKEN);
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('main-screen')).toBeVisible();
}

export async function loginAndOpenChat(page: Page): Promise<void> {
  await page.goto('/');
  await login(page);
  await page.getByTestId('new-chat-button').click();
  await page.getByTestId('new-chat-phone').fill(String(PHONES.primary));
  await page.getByTestId('new-chat-submit').click();
  await expect(page.getByTestId('chat-window')).toBeVisible();
}

/** Всё содержимое localStorage и sessionStorage страницы одной строкой (для поиска утечек). */
export function dumpStorage(page: Page): Promise<string> {
  return page.evaluate(() =>
    JSON.stringify({
      local: Object.fromEntries(Object.entries(localStorage)),
      session: Object.fromEntries(Object.entries(sessionStorage)),
    }),
  );
}
