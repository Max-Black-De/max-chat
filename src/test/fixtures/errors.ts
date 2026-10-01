/**
 * Ошибки API (§5.4, ВА-3, ВА-7…ВА-11, ВА-17…ВА-19).
 *
 * ВАЖНО про формат тел. Точные тела ошибок в документации не приведены (там только код
 * и текст), реальных ошибочных ответов в спайке нет. [проверено с фиктивными данными]
 * только одно: 401 приходит с **пустым телом** и с `Access-Control-Allow-Origin: *`.
 * Поэтому каждая ошибка с текстом есть в двух вариантах:
 * - `json` — `{"statusCode": <код>, "message": "<текст>"}` [не подтверждено, предположение];
 * - `text` — текст как есть, `text/plain` [не подтверждено].
 * Разбор в приложении должен искать подстроку текста ошибки в теле любого формата.
 * Тексты — [док common-errors и страниц методов]; где в документации многоточие,
 * хвост дописан условно и помечен.
 */
import {
  emptyResponse,
  htmlResponse,
  jsonResponse,
  rawJsonResponse,
  textResponse,
  type MockHttpResponse,
} from './http';

export type ErrorBodyFormat = 'json' | 'text';

/** Ошибка с текстом в выбранном формате тела. */
export function apiError(
  status: number,
  message: string,
  format: ErrorBodyFormat = 'json',
): MockHttpResponse {
  return format === 'json'
    ? jsonResponse({ statusCode: status, message }, status)
    : textResponse(message, status);
}

/** Пара вариантов `{ json, text }` для одной ошибки. */
function both(status: number, message: string): Record<ErrorBodyFormat, MockHttpResponse> {
  return { json: apiError(status, message, 'json'), text: apiError(status, message, 'text') };
}

// --- тексты ошибок ----------------------------------------------------------

export const ERROR_TEXTS = {
  /** [док] 400, любой метод. */
  instanceStarting: 'instance is starting or not authorized',
  /** [док] 400, любой метод. */
  instanceStartingProcess: 'instance in starting process try later',
  /** [док common-errors] «Instance account is expired…» — хвост после многоточия условный. */
  instanceExpired: 'Instance account is expired. Please renew it in the console',
  /** [док common-errors] */
  instanceDeleted: 'Instance is deleted',
  /** [док ReceiveNotification] Текст сокращён в анализе §3.5 — середина условная. */
  customWebhook:
    'Message cannot be received because custom webhook url is set. Please clear webhook url and wait for about 1 minute',
  /** [док SendMessage] */
  suspended: 'Your account is suspended',
  /** [док] Префикс `Validation failed` — из документации, детали условные. */
  validationMessageLength:
    "Validation failed. Details: 'message' length must be less than or equal to 4000 characters long",
  /** [док common-errors] */
  validationChatIdFormat:
    "'chatId' must be one of the next formats: 'phone_number@c.us' or 'chatId'",
  /** [док CheckAccount] */
  badPhoneNumber: 'bad phone number, valid 11 or 12 digits',
  /** [док CheckAccount] */
  phoneOnlyDigits: "'phoneNumber' must contain only digits",
  /** [док CheckAccount] Таймаут ответа MAX, а не лимит частоты (ВА-10). */
  checkPhoneTimeout: 'check phone number timeout limit exceeded',
  /** [док] Прочие 400 → «Ошибка в запросе: <текст сервера, до 200 символов>». */
  badRequestData: 'bad request data',
  /** [док DeleteNotification] Уведомление не найдено → считать удалённым. */
  findUnAcked: "Cannot read properties of undefined (reading 'findUnAckedMessage')",
  /** [док DeleteNotification] */
  receiptIdNotNumber: 'Parameter receiptId must be a Number!',
  /** [док SendMessage] JSON > 100 КБ. */
  entityTooLarge: 'request entity too large',
} as const;

/** Условный длинный текст 400 (> 200 символов) — проверка обрезки до 200 (ВА-10). */
export const LONG_VALIDATION_TEXT = `Validation failed. Details: ${'x'.repeat(300)}`;

// --- 401 / 403 / 400 общего вида ---------------------------------------------

export const errorResponses = {
  /** [проверено с фиктивными данными] пустое тело. */
  unauthorized401: emptyResponse(401),
  /** [док] Неверный idInstance или адрес; тело не известно — пустое. */
  forbidden403: emptyResponse(403),
  /** sendMessage, п. 3.6. */
  suspended403: both(403, ERROR_TEXTS.suspended),
  starting400: both(400, ERROR_TEXTS.instanceStarting),
  startingProcess400: both(400, ERROR_TEXTS.instanceStartingProcess),
  /** ВА-3: при входе — свой текст; после входа — как 401. */
  expired400: both(400, ERROR_TEXTS.instanceExpired),
  /** ВА-3 */
  deleted400: both(400, ERROR_TEXTS.instanceDeleted),
  /** receive / delete → П-1. */
  customWebhook400: both(400, ERROR_TEXTS.customWebhook),
  validationLength400: both(400, ERROR_TEXTS.validationMessageLength),
  validationChatId400: both(400, ERROR_TEXTS.validationChatIdFormat),
  validationLong400: both(400, LONG_VALIDATION_TEXT),
  badRequestData400: both(400, ERROR_TEXTS.badRequestData),
  entityTooLarge500: both(500, ERROR_TEXTS.entityTooLarge),

  // --- checkAccount: 400 (ВА-10) и 469 -------------------------------------
  badPhoneNumber400: both(400, ERROR_TEXTS.badPhoneNumber),
  phoneOnlyDigits400: both(400, ERROR_TEXTS.phoneOnlyDigits),
  checkPhoneTimeout400: both(400, ERROR_TEXTS.checkPhoneTimeout),
  /** [док ratelimiter / CheckAccount] Тело не описано — пустое. */
  contactInfoLimit469: emptyResponse(469),

  // --- 499 / 5xx --------------------------------------------------------------
  /** [док] Клиент закрыл соединение; тело не описано — пустое. */
  clientClosed499: emptyResponse(499),
  /** Условная внутренняя ошибка сервера. */
  internal500: both(500, 'Internal Server Error'),
  /** Условная страница прокси. */
  badGateway502: htmlResponse('<html><body><h1>502 Bad Gateway</h1></body></html>', 502),
  serviceUnavailable503: emptyResponse(503),
  gatewayTimeout504: emptyResponse(504),

  // --- deleteNotification -----------------------------------------------------
  /** §5.4: считать удалённым. */
  findUnAcked500: both(500, ERROR_TEXTS.findUnAcked),
  receiptIdNotNumber400: both(400, ERROR_TEXTS.receiptIdNotNumber),

  // --- битый JSON ---------------------------------------------------------------
  /** JSON-заголовок, но тело обрывается. */
  truncatedJson200: rawJsonResponse('{"receiptId": 1, "body": {"typeWebhook": "incomingMes'),
  /** ВА-18: весь ответ receive — непустой не-JSON → ошибка с backoff. */
  htmlInsteadOfJson200: htmlResponse('<html><body>Service page</body></html>', 200),
} as const;

// --- 429 (ВА-7, ВА-8) ---------------------------------------------------------

/**
 * 429 [док ratelimiter]: запрос отклонён сервером. Заголовок `Retry-After` в документации
 * не описан [не подтверждено] — варианты нужны для ВА-8.
 *
 * Важно для браузера: `Retry-After` не входит в CORS-safelisted заголовки ответа. Его видно
 * из JS, только если сервер отдаёт `Access-Control-Expose-Headers: Retry-After` или `*`.
 * По анализу §3.9: `api.green-api.com` отдаёт `Expose-Headers: *`, а `3100.api…` —
 * только `Content-Length, Content-Range`, то есть там `Retry-After` браузеру недоступен
 * и действует запасная пауза 1 → 2 → 4 с. Вариант `retryAfterHidden` моделирует это
 * в Playwright; мок `fetch` в Vitest видит все заголовки, там различие не воспроизводится.
 */
export function tooManyRequests(
  options: { retryAfter?: string; exposeRetryAfter?: boolean } = {},
): MockHttpResponse {
  const response = emptyResponse(429);
  if (options.retryAfter !== undefined) {
    response.headers['Retry-After'] = options.retryAfter;
    if (options.exposeRetryAfter !== false) {
      response.headers['Access-Control-Expose-Headers'] = 'Retry-After';
    }
  }
  return response;
}

export const tooManyRequestsResponses = {
  /** Без `Retry-After` → 1 → 2 → 4 с. */
  noRetryAfter: tooManyRequests(),
  /** `Retry-After: 2` → пауза 2 с. */
  retryAfter2s: tooManyRequests({ retryAfter: '2' }),
  /** `Retry-After: 0`. */
  retryAfter0s: tooManyRequests({ retryAfter: '0' }),
  /** `Retry-After: 120` → не больше 30 с (ВА-8). */
  retryAfter120s: tooManyRequests({ retryAfter: '120' }),
  /** HTTP-дата вместо секунд — допустимо по RFC 9110; поддержка не обязательна → запасная пауза. */
  retryAfterHttpDate: tooManyRequests({ retryAfter: 'Thu, 01 Oct 2026 14:00:00 GMT' }),
  /** Мусор → запасная пауза. */
  retryAfterGarbage: tooManyRequests({ retryAfter: 'soon' }),
  /** Заголовок есть, но не открыт через Expose-Headers — браузер его не видит. */
  retryAfterHidden: tooManyRequests({ retryAfter: '2', exposeRetryAfter: false }),
} as const satisfies Record<string, MockHttpResponse>;
