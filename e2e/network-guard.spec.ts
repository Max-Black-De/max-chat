/**
 * N-05: доказательство, что сетевая страховка e2e работает.
 * Запросы делаются из страницы приложения (`fetch` в контексте браузера, Origin — localhost),
 * как это будет делать API-клиент. Реальной сети тесты не касаются: внешние запросы обрываются.
 */
import {
  API_TOKEN,
  API_URL,
  CHAT_IDS,
  ID_INSTANCE,
  ID_MESSAGES,
  sendMessageResponses,
  stateResponses,
  tooManyRequestsResponses,
} from '../src/test/fixtures';
import { type Page } from '@playwright/test';
import { expect, test } from './support/greenApi';

const methodUrl = (method: string) => `${API_URL}/waInstance${ID_INSTANCE}/${method}/${API_TOKEN}`;

/**
 * Результат `fetch` из страницы: статус и тело или имя ошибки. Заголовок ACAO странице
 * не виден (не входит в CORS-safelisted), его проверяем через `page.waitForResponse`.
 */
interface FetchOutcome {
  ok: boolean;
  status?: number;
  body?: string;
  error?: string;
}

async function acaoOf(page: Page, url: string, run: () => Promise<FetchOutcome>) {
  const [response, outcome] = await Promise.all([
    page.waitForResponse((r) => r.url() === url && r.request().method() !== 'OPTIONS'),
    run(),
  ]);
  return { acao: response.headers()['access-control-allow-origin'], outcome };
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

function pageFetch(
  page: Page,
  url: string,
  init?: { method: string; json: unknown },
): Promise<FetchOutcome> {
  return page.evaluate(
    async ({ url, init }) => {
      try {
        const response = await fetch(url, {
          credentials: 'omit',
          ...(init
            ? {
                method: init.method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(init.json),
              }
            : {}),
        });
        return {
          ok: true,
          status: response.status,
          body: await response.text(),
        };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.name : String(error) };
      }
    },
    { url, init },
  );
}

test.describe('network guard', () => {
  test('aborts a request to an external host and records a violation', async ({
    page,
    greenApi,
  }) => {
    const outcome = await pageFetch(page, 'https://tracker.example.test/collect');

    expect(outcome).toEqual({ ok: false, error: 'TypeError' });
    expect(greenApi.takeViolations()).toEqual([
      { kind: 'external-host', method: 'GET', url: 'https://tracker.example.test/collect' },
    ]);
  });

  test('aborts an unmocked GREEN-API method and masks the token', async ({ page, greenApi }) => {
    greenApi.on('getStateInstance', stateResponses.authorized);

    const outcome = await pageFetch(page, methodUrl('getSettings'));

    expect(outcome).toEqual({ ok: false, error: 'TypeError' });
    const violations = greenApi.takeViolations();
    expect(violations).toEqual([
      {
        kind: 'unmocked-method',
        method: 'GET',
        url: `${API_URL}/waInstance${ID_INSTANCE}/getSettings/***`,
      },
    ]);
    expect(JSON.stringify(violations)).not.toContain(API_TOKEN);
    expect(greenApi.calls).toEqual([]);
  });

  test('serves a mocked GET with the CORS header', async ({ page, greenApi }) => {
    greenApi.on('getStateInstance', stateResponses.authorized);

    const url = methodUrl('getStateInstance');
    const { acao, outcome } = await acaoOf(page, url, () => pageFetch(page, url));

    expect(acao).toBe('*');
    expect(outcome).toMatchObject({ ok: true, status: 200 });
    expect(JSON.parse(outcome.body ?? '')).toEqual({ stateInstance: 'authorized' });
    expect(greenApi.callsTo('getStateInstance')).toHaveLength(1);
  });

  test('serves a cross-origin POST with JSON (preflight) and records the body', async ({
    page,
    greenApi,
  }) => {
    greenApi.on('sendMessage', sendMessageResponses.sent);
    const request = { chatId: CHAT_IDS.primary, message: 'Тестовое сообщение' };

    const url = methodUrl('sendMessage');
    const { acao, outcome } = await acaoOf(page, url, () =>
      pageFetch(page, url, { method: 'POST', json: request }),
    );

    expect(acao).toBe('*');
    expect(outcome).toMatchObject({ ok: true, status: 200 });
    expect(JSON.parse(outcome.body ?? '')).toEqual({ idMessage: ID_MESSAGES.api1 });
    const [call] = greenApi.callsTo('sendMessage');
    expect(call?.httpMethod).toBe('POST');
    expect(call?.body).toEqual(request);
  });

  test('replays a sequence and repeats the last reply', async ({ page, greenApi }) => {
    greenApi.on('sendMessage', [tooManyRequestsResponses.noRetryAfter, sendMessageResponses.sent]);
    const statuses: (number | undefined)[] = [];
    for (let i = 0; i < 3; i += 1) {
      const outcome = await pageFetch(page, methodUrl('sendMessage'), {
        method: 'POST',
        json: { chatId: CHAT_IDS.primary, message: 'x' },
      });
      statuses.push(outcome.status);
    }
    expect(statuses).toEqual([429, 200, 200]);
  });

  test('a response without CORS headers is a TypeError in the browser (Р-27)', async ({
    page,
    greenApi,
  }) => {
    greenApi.on('sendMessage', tooManyRequestsResponses.noCors);

    const outcome = await pageFetch(page, methodUrl('sendMessage'), {
      method: 'POST',
      json: { chatId: CHAT_IDS.primary, message: 'x' },
    });

    expect(outcome).toEqual({ ok: false, error: 'TypeError' });
    expect(greenApi.callsTo('sendMessage')).toHaveLength(1);
  });

  test('an untaken violation fails the test in teardown', async ({ page }) => {
    // Ожидаемое падение: тело теста проходит, а страховка валит тест после него.
    test.fail(true, 'страховка должна завалить тест с незабранным нарушением');
    const outcome = await pageFetch(page, 'https://cdn.example.test/script.js');
    expect(outcome.ok).toBe(false);
  });
});
