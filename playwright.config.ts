/**
 * Playwright: e2e на моках (ТЗ Д-2, Р-25). Только Chromium headless; приложение поднимает
 * Vite dev-сервер на отдельном порту. Все запросы к API перехватываются фикстурой
 * `e2e/support/greenApi.ts` — реальный GREEN-API не вызывается.
 */
import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 5179);
const BASE_URL = `http://localhost:${String(PORT)}`;
const CI = Boolean(process.env.CI);

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: CI,
  // Без ретраев: падение страховки или флак должны быть видны сразу.
  retries: 0,
  ...(CI ? { workers: 2 } : {}),
  timeout: 15_000,
  expect: { timeout: 5_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: BASE_URL,
    headless: true,
    // Service Worker мог бы обойти page.route — блокируем.
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'ru-RU',
    timezoneId: 'Asia/Aqtobe',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run dev -- --port ${String(PORT)} --strictPort`,
    url: BASE_URL,
    // Не переиспользовать чужой dev-сервер: он может быть из другого worktree.
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
