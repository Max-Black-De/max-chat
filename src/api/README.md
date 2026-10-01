# api/ — клиент GREEN-API (F1)

Типизированный клиент для 6 методов GREEN-API (ТЗ v1.2 §5.2). Чистый TypeScript без React и без
runtime-зависимостей (только `fetch`, `AbortController`). Типы контракта — `types.ts` (A1), константы —
`constants.ts`, опции и результаты клиента — `clientTypes.ts`.

Учётные данные приходят **только параметрами** `createGreenApiClient` (из формы входа); в `.env` / `VITE_*`
их не кладём.

## Публичный API (`src/api/index.ts`)

```ts
const api = createGreenApiClient({
  idInstance, apiTokenInstance,           // idInstance — строка из цифр
  apiUrl?: string,                        // по умолчанию DEFAULT_API_URL (https://api.green-api.com), «/» в конце обрезается
  timeoutMs?: number,                     // по умолчанию REQUEST_TIMEOUT_MS = 30 000 (Р-20), per-call — opts.timeoutMs
  fetch?: typeof fetch,                   // инъекция для тестов
  timers?: { setTimeout, clearTimeout },  // инъекция для тестов
  logger?: { debug?, warn? },             // по умолчанию ничего не логируется; в лог идут только замаскированные URL
  allowedChatIds?: readonly string[],     // необязательный белый список для sendMessage (Р-26)
});

api.getStateInstance(opts?): Promise<StateInstanceResult>   // { stateInstance }
api.getSettings(opts?): Promise<InstanceSettings>          // Partial<GetSettingsResponse>
api.checkAccount(phone: string | number, opts?): Promise<{ exist: boolean; chatId: string; fromCache: boolean }>
api.sendMessage({ chatId, message }, opts?): Promise<{ idMessage: string }>
api.receiveNotification(opts?: ReceiveOptions)            // receiveTimeout 5..60, по умолч. 20
  : Promise<RawReceivedNotification | null>                // { receiptId, body: unknown }; null = «пустой ответ»
api.deleteNotification(receiptId: number, opts?): Promise<DeleteNotificationResult>  // + alreadyDeleted

type RequestOptions = { signal?: AbortSignal; timeoutMs?: number };   // есть у каждого метода
```

- URL: `{apiUrl}/waInstance{idInstance}/{method}/{token}` (без `/v3`), `credentials: 'omit'`,
  `Content-Type: application/json` только у POST; у GET и DELETE нет ни заголовков, ни тела (§5.1,
  без лишнего CORS-preflight на GET).
- `checkAccount` принимает уже нормализованный номер (Р-10: `7XXXXXXXXXX` или `375XXXXXXXXX`) и шлёт его
  **целым числом**. Нормализация ввода — в F3. Ответ `exist:true` принимается, только если `chatId` — непустая
  строка `^-?\d+$` (`isCheckAccountChatId`); число, `…@c.us`, буквы, пустая строка или нет `exist` →
  `UNEXPECTED_RESPONSE` (битый JSON — `INVALID_JSON`), текст п. 2.6 «Не удалось проверить номер: неожиданный
  ответ сервера…», без повтора (ВА-7, EC-I9). `exist:false` — штатный ответ.
- `sendMessage`: `chatId` только из цифр (личный чат). Строка с `@` (`…@c.us`) и отрицательные id групп/каналов
  отклоняются **до запроса** (`INVALID_ARGUMENT`, §5.5, Р-26). Пустой/пробельный текст и > 4000 символов
  (длина = `text.length`, UTF-16: emoji = 2, ВА-14) — тоже. Текст уходит как есть, без trim.
- `receiveNotification`: пустое тело, `null`/ложное значение, объект без `receiptId` → `null`. HTTP-таймаут
  по умолчанию `RECEIVE_HTTP_TIMEOUT_MS` (30 с) и никогда не меньше `receiveTimeout + 10 с`.
  `body` возвращается как есть (`unknown`) — разбор в `notifications/` (F5) в `NotificationBody` из `types.ts`.
- `deleteNotification`: `result:false` и 500 `findUnAckedMessage` → `alreadyDeleted: true` без исключения (§5.4).
- **Встроенные повторы** (пауза — инъектируемый `sleep(ms, signal)`, по умолчанию на `timers`; отмена во время
  паузы → `ABORTED`, `close()` → `SESSION_CLOSED`):
  - `sendMessage` 429 — до 3 автоповторов: `Retry-After` (сек или HTTP-дата), если ≤ 30 с, иначе 1 → 2 → 4 с
    (ВА-8). Заголовок на `3100.api…` браузеру, скорее всего, не виден (Expose-Headers) — тогда работает запасная
    схема. Сеть, таймаут, 499, 5xx, 466, 4xx — сразу ошибка, без автоповтора (дубли).
  - `deleteNotification` — до 3 повторов 1 → 2 → 4 с при сети, таймауте, 429, 499, 5xx (ВА-17).
  - `checkAccount` — никогда (ВА-7). receive / getStateInstance / getSettings — ровно один `fetch`, повтор — у
    вызывающего кода по `error.retry`.
  - `error.attempts` — сколько HTTP-попыток сделано.
- `close()` / `isClosed()` — конец сессии (выход, смена учётных данных, EC-S7): запросы и паузы прерываются,
  поздние ответы отбрасываются (`SESSION_CLOSED`), новые вызовы падают без запроса. Новые учётные данные —
  новый клиент.
- `validateApiUrl(raw)` — поле «Адрес API»: пусто → `https://api.green-api.com`, только `https:` (ВА-2).

## Ошибки

Все ошибки — `GreenApiError` (`code`, `method`, `httpStatus?`, `reason?`, `retry`, `maskedUrl?`, `apiUrl?`,
`receiptId?`, `retryAfterMs?`, `attempts`); для 466 — подкласс `GreenApiQuotaError` с `quota: QuotaSummary`;
для «сессия невалидна» (401, 403 кроме suspended на send, 400 expired/deleted — EC-E2, EC-P13) — подкласс
`GreenApiSessionError` (`isSessionInvalidError(e)`): F2/F5 по нему останавливают опрос и выходят на вход.
401 и 403 — всегда «сессия невалидна», тело `{status:false, reason}` код не перекрывает (ВА-4, ВА-19;
исключение — 403 suspended на sendMessage, п. 3.6). На 200/400 и прочих кодах `{status:false, reason}` с
известной причиной разбирается по `reason` (ВА-11); expired/deleted проверяются раньше «not authorized».
`retry`: `backoff` (1→2→4…30 с), `pause` (30 с), `none`.

| code                                       | Когда                                                             | retry           |
| ------------------------------------------ | ----------------------------------------------------------------- | --------------- |
| `NETWORK`                                  | fetch упал (сеть, DNS, CORS)                                      | backoff*        |
| `TIMEOUT`                                  | нет ответа за `timeoutMs`                                         | backoff*        |
| `ABORTED`                                  | отменён внешним `AbortSignal`                                     | none            |
| `SESSION_CLOSED`                           | клиент закрыт `close()`, ответ старой сессии отброшен             | none            |
| `INVALID_JSON` / `UNEXPECTED_RESPONSE`     | 2xx, но не JSON / не та структура                                 | backoff*        |
| `UNAUTHORIZED`                             | 401                                                               | none            |
| `FORBIDDEN` / `ACCOUNT_SUSPENDED`          | 403 / 403 `Your account is suspended`                             | none            |
| `INSTANCE_NOT_READY`                       | 400 или `{status:false}` «instance is starting or not authorized» | pause*          |
| `INSTANCE_EXPIRED` / `INSTANCE_DELETED`    | 400 «account is expired» / «Instance is deleted» (сессия)         | none            |
| `WEBHOOK_URL_SET`                          | 400 «custom webhook url is set» (П-1)                             | none            |
| `BAD_REQUEST`                              | прочие 400 (`Validation failed…`) — `reason` можно показать       | none            |
| `NOT_FOUND`                                | 404                                                               | none            |
| `RATE_LIMITED`                             | 429                                                               | backoff*        |
| `QUOTA_EXCEEDED`                           | 466 → `GreenApiQuotaError`                                        | **none всегда** |
| `CHECK_LIMIT`                              | 469, «User get contact info limit reached»                        | none            |
| `CHECK_TIMEOUT`                            | 400 «check phone number timeout limit exceeded» (ВА-10)           | none            |
| `SERVER`                                   | 499, 5xx                                                          | backoff*        |
| `HTTP`                                     | прочие коды                                                       | none            |
| `INVALID_ARGUMENT` / `CHAT_ID_NOT_ALLOWED` | проверка на клиенте, запрос не отправлялся                        | none            |

\* для `sendMessage` и `checkAccount` — всегда `none` (ВА-7, ВА-8: 429 у send клиент уже повторил сам); для
`deleteNotification` — `none` после встроенных повторов (дальше — следующий receive), кроме `pause`.

**466 / `quotaExceeded` (§5.5).** `parseQuota466Body(body, method)` разбирает все три формата
(`invokeStatus`, `correspondentsStatus`, тело-уведомление `quotaData`), `used/total` — number или string;
результат — `QuotaSummary` (`kind: QuotaKind`, `method/used/total/status`). Вид: `checks` / `chats`; нераспознанное тело → по методу. `parseQuotaExceededNotification(body)` — для
уведомления из очереди (без `timestamp`). `description` (там чужие chatId) **не сохраняется** нигде — ни в
`QuotaSummary`, ни в `message`, ни в логах; в лог идут только `method/used/total/status`.

**Тексты для UI** (`messages.ts`) — дословно из ТЗ v1.3.1, константы `LOGIN_FORM_TEXTS`, `AUTH_TEXTS`,
`INSTANCE_TEXTS`, `BANNER_TEXTS`, `SETTINGS_TEXTS` (П-1…П-5), `CHECK_ACCOUNT_TEXTS`, `SEND_TEXTS`, `QUOTA_TEXTS`;
функции `describeError(err, 'login' | 'session' | 'checkAccount' | 'send')`, `quotaText()`,
`shouldShowQuotaBanner()` (только `chats`, ВА-13), `stateInstanceText()`, `isLoginAllowed()`, `unreachableText()`.
`FALLBACK_TEXTS` — строки, которых в ТЗ нет (например, 429 у send после повторов). Тест `messages.test.ts`
сверяет каждую строку с ТЗ посимвольно.

## Токен

- хранится только в замыкании `createGreenApiClient`; у объекта клиента нет поля с токеном;
  `String(client)`, `JSON.stringify(client)`, `util.inspect(client)` → `token=***`;
- тексты ошибок строятся без URL; `maskedUrl` — с `***`; ответы сервера чистятся от токена (в т. ч.
  URL-кодированного) и обрезаются до 300 символов; исходная ошибка `fetch` не прикладывается (`cause`),
  т. к. её текст может содержать URL;
- по умолчанию клиент ничего не пишет в `console`.

## Чистые функции (для тестов и других модулей)

`buildMethodUrl`, `buildMaskedUrl`, `normalizeApiUrl`, `validateApiUrl`, `validateCredentials` (url.ts);
`parseRetryAfter`, `retryHintFor` (http.ts); `maskToken`, `maskUrl`,
`redactSecret` (mask.ts); `parseQuota466Body`, `parseQuotaExceededNotification` (quota.ts); `normalizePhone`,
`isNormalizedPhone`, `toCheckAccountPhone`, `PHONE_FORMAT_ERROR` (phone.ts, Р-10); `validateSendChatId`,
`messageLength` (client.ts); тексты — messages.ts. Извлечение текста уведомления (§5.3) —
`extractMessageText` в `src/notifications/extractText.ts`.

## Тесты и фикстуры

`src/api/__tests__/`: `url`, `client`, `config`, `errors`, `quota`, `masking`, `messages`, `phone`, `retries`,
`session`
(+ `src/notifications/extractText.test.ts`). `fetch` — всегда мок, глобальный `fetch` в этих тестах бросает
исключение (`blockRealNetwork()`). Фикстуры `src/test/fixtures/notifications.ts` (общие для api, notifications, polling) — обезличенные структуры
реальных уведомлений (все значения условные) + синтетические по документации (личное входящее, `quotaExceeded`,
466 в трёх форматах); `satisfies ReceivedNotification` сверяет контракт `types.ts` с реальными данными.
