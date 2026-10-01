/**
 * HTTP-обёртки для моков: один формат и для Vitest (мок `fetch`), и для Playwright
 * (`route.fulfill({ status, headers, body })` принимает этот объект как есть).
 *
 * Чистые данные, без зависимостей от vitest/jsdom. Во всех ответах стоит
 * `Access-Control-Allow-Origin: *` — так отвечает GREEN-API и на успешные, и на ошибочные
 * запросы [проверено с фиктивными данными, анализ §3.9]. Без этого заголовка браузер
 * в e2e не дал бы прочитать ответ.
 */

/**
 * Ответ мока. `body` — уже сериализованная строка (`''` — пустое тело).
 * Ответ без `Access-Control-Allow-Origin` (см. `withoutCors`) браузер прочитать не даст:
 * в Playwright это `TypeError: Failed to fetch`, в Vitest — см. `toFetchResult`.
 */
export interface MockHttpResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

/**
 * Сбой на уровне сети: ответа нет совсем. Для Playwright — `route.abort(reason)`,
 * для Vitest — `fetch` отклоняется (`TypeError` / `AbortError`).
 */
export interface MockNetworkFailure {
  abort: 'failed' | 'timedout' | 'connectionrefused' | 'aborted';
}

export type MockReply = MockHttpResponse | MockNetworkFailure;

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
} as const satisfies Record<string, string>;

const JSON_HEADERS = {
  ...CORS_HEADERS,
  'Content-Type': 'application/json',
} as const satisfies Record<string, string>;

const TEXT_HEADERS = {
  ...CORS_HEADERS,
  'Content-Type': 'text/plain; charset=utf-8',
} as const satisfies Record<string, string>;

const HTML_HEADERS = {
  ...CORS_HEADERS,
  'Content-Type': 'text/html; charset=utf-8',
} as const satisfies Record<string, string>;

/** JSON-ответ. `data` сериализуется через `JSON.stringify` (в том числе `null` → `"null"`). */
export function jsonResponse(data: unknown, status = 200): MockHttpResponse {
  return { status, headers: { ...JSON_HEADERS }, body: JSON.stringify(data) };
}

/** Текстовый ответ (тело ошибки не JSON). */
export function textResponse(text: string, status: number): MockHttpResponse {
  return { status, headers: { ...TEXT_HEADERS }, body: text };
}

/** HTML-ответ (например, страница прокси при 502). */
export function htmlResponse(html: string, status: number): MockHttpResponse {
  return { status, headers: { ...HTML_HEADERS }, body: html };
}

/** Ответ с пустым телом. */
export function emptyResponse(status = 200): MockHttpResponse {
  return { status, headers: { ...CORS_HEADERS }, body: '' };
}

/** Ответ с произвольной строкой тела и JSON-заголовком (битый JSON). */
export function rawJsonResponse(body: string, status = 200): MockHttpResponse {
  return { status, headers: { ...JSON_HEADERS }, body };
}

/**
 * Тот же ответ без CORS-заголовков (`Access-Control-Allow-Origin`, `…-Expose-Headers`).
 * Так может ответить прокси или балансировщик, например на 429 (Р-27, [не подтверждено]).
 * Браузер такой ответ не отдаёт странице — для приложения это ветка «сеть».
 */
export function withoutCors(response: MockHttpResponse): MockHttpResponse {
  const headers = Object.fromEntries(
    Object.entries(response.headers).filter(
      ([name]) => !name.toLowerCase().startsWith('access-control-'),
    ),
  );
  return { ...response, headers };
}

/** Есть ли у ответа `Access-Control-Allow-Origin` (иначе браузер его не отдаст). */
export function hasCors(response: MockHttpResponse): boolean {
  return Object.keys(response.headers).some(
    (name) => name.toLowerCase() === 'access-control-allow-origin',
  );
}

export function isNetworkFailure(reply: MockReply): reply is MockNetworkFailure {
  return 'abort' in reply;
}

/**
 * Перевод в стандартный `Response` (для мока `fetch` в Vitest). Использует глобальный
 * `Response` (есть в Node ≥ 18, jsdom-окружении Vitest и браузере); в Playwright не нужен.
 */
export function toFetchResponse(mock: MockHttpResponse): Response {
  const nullBodyStatus = mock.status === 204 || mock.status === 205 || mock.status === 304;
  return new Response(nullBodyStatus || mock.body === '' ? null : mock.body, {
    status: mock.status,
    headers: mock.headers,
  });
}

export const networkError = { abort: 'failed' } as const satisfies MockNetworkFailure;
export const networkTimeout = { abort: 'timedout' } as const satisfies MockNetworkFailure;
export const connectionRefused = {
  abort: 'connectionrefused',
} as const satisfies MockNetworkFailure;

/**
 * Что увидит код приложения в браузере, для мока `fetch` в Vitest:
 * сетевой сбой и ответ без CORS-заголовков → `fetch` отклоняется с `TypeError`
 * (как `Failed to fetch` в Chromium), иначе — `Response`.
 */
export function toFetchResult(reply: MockReply): Promise<Response> {
  if (isNetworkFailure(reply) || !hasCors(reply)) {
    return Promise.reject(new TypeError('Failed to fetch'));
  }
  return Promise.resolve(toFetchResponse(reply));
}
