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
  **целым числом**. Нормализация ввода — в F3.
- `sendMessage`: `chatId` только из цифр (личный чат). Строка с `@` (`…@c.us`) и отрицательные id групп/каналов
  отклоняются **до запроса** (`INVALID_ARGUMENT`, §5.5, Р-26). Пустой/пробельный текст и > 4000 символов
  (считаются code points) — тоже.
- `receiveNotification`: пустое тело, `null`/ложное значение, объект без `receiptId` → `null`. HTTP-таймаут
  по умолчанию `RECEIVE_HTTP_TIMEOUT_MS` (30 с) и никогда не меньше `receiveTimeout + 10 с`.
  `body` возвращается как есть (`unknown`) — разбор в `notifications/` (F5) в `NotificationBody` из `types.ts`.
- `deleteNotification`: `result:false` и 500 `findUnAckedMessage` → `alreadyDeleted: true` без исключения (§5.4).
- Клиент **сам ничего не повторяет**: на каждый вызов — ровно один `fetch`. Повторы делает вызывающий код по `error.retry`.

## Ошибки

Все ошибки — `GreenApiError` (`code`, `method`, `httpStatus?`, `reason?`, `retry`, `maskedUrl?`, `apiUrl?`,
`receiptId?`); для 466 — подкласс `GreenApiQuotaError` с `quota: QuotaSummary`.
`retry`: `backoff` (1→2→4…30 с), `pause` (30 с), `none`.

| code                                       | Когда                                                             | retry           |
| ------------------------------------------ | ----------------------------------------------------------------- | --------------- |
| `NETWORK`                                  | fetch упал (сеть, DNS, CORS)                                      | backoff*        |
| `TIMEOUT`                                  | нет ответа за `timeoutMs`                                         | backoff*        |
| `ABORTED`                                  | отменён внешним `AbortSignal`                                     | none            |
| `INVALID_JSON` / `UNEXPECTED_RESPONSE`     | 2xx, но не JSON / не та структура                                 | backoff*        |
| `UNAUTHORIZED`                             | 401                                                               | none            |
| `FORBIDDEN` / `ACCOUNT_SUSPENDED`          | 403 / 403 `Your account is suspended`                             | none            |
| `INSTANCE_NOT_READY`                       | 400 или `{status:false}` «instance is starting or not authorized» | pause*          |
| `INSTANCE_EXPIRED`                         | 400 «account is expired» / «Instance is deleted»                  | none            |
| `WEBHOOK_URL_SET`                          | 400 «custom webhook url is set» (П-1)                             | none            |
| `BAD_REQUEST`                              | прочие 400 (`Validation failed…`) — `reason` можно показать       | none            |
| `NOT_FOUND`                                | 404                                                               | none            |
| `RATE_LIMITED`                             | 429                                                               | backoff*        |
| `QUOTA_EXCEEDED`                           | 466 → `GreenApiQuotaError`                                        | **none всегда** |
| `CHECK_LIMIT`                              | 469, «User get contact info limit reached»                        | none            |
| `SERVER`                                   | 499, 5xx                                                          | backoff*        |
| `HTTP`                                     | прочие коды                                                       | none            |
| `INVALID_ARGUMENT` / `CHAT_ID_NOT_ALLOWED` | проверка на клиенте, запрос не отправлялся                        | none            |

\* для `sendMessage` всегда `none` (дубли, §5.4/§4.3 п. 3.4); для `checkAccount` сеть/таймаут/5xx/JSON — `none`
(запрос мог списать проверку из квоты 100/мес, Р-26 п. 3).

**466 / `quotaExceeded` (§5.5).** `parseQuota466Body(body, method)` разбирает все три формата
(`invokeStatus`, `correspondentsStatus`, тело-уведомление `quotaData`), `used/total` — number или string;
результат — `QuotaSummary` (`kind: QuotaKind`, `method/used/total/status`). Вид: `checks` / `chats`; нераспознанное тело → по методу. `parseQuotaExceededNotification(body)` — для
уведомления из очереди (без `timestamp`). `description` (там чужие chatId) **не сохраняется** нигде — ни в
`QuotaSummary`, ни в `message`, ни в логах; в лог идут только `method/used/total/status`.

**Тексты для UI** (`messages.ts`): `describeError(err, 'login' | 'session' | 'checkAccount' | 'send')`,
`QUOTA_TEXTS`, `quotaText()`, `stateInstanceText()`, `isLoginAllowed()`, `WEBHOOK_URL_SET_TEXT` — строки из §4.1–4.3, §5.5.

## Токен

- хранится только в замыкании `createGreenApiClient`; у объекта клиента нет поля с токеном;
  `String(client)`, `JSON.stringify(client)`, `util.inspect(client)` → `token=***`;
- тексты ошибок строятся без URL; `maskedUrl` — с `***`; ответы сервера чистятся от токена (в т. ч.
  URL-кодированного) и обрезаются до 300 символов; исходная ошибка `fetch` не прикладывается (`cause`),
  т. к. её текст может содержать URL;
- по умолчанию клиент ничего не пишет в `console`.

## Чистые функции (для тестов и других модулей)

`buildMethodUrl`, `buildMaskedUrl`, `normalizeApiUrl`, `validateCredentials` (url.ts); `maskToken`, `maskUrl`,
`redactSecret` (mask.ts); `parseQuota466Body`, `parseQuotaExceededNotification` (quota.ts); `normalizePhone`,
`isNormalizedPhone`, `toCheckAccountPhone`, `PHONE_FORMAT_ERROR` (phone.ts, Р-10); `validateSendChatId`,
`messageLength` (client.ts); тексты — messages.ts. Извлечение текста уведомления (§5.3) —
`extractMessageText` в `src/notifications/extractText.ts`.

## Тесты и фикстуры

`src/api/__tests__/`: `url`, `client`, `config`, `errors`, `quota`, `masking`, `messages`, `phone`
(+ `src/notifications/extractText.test.ts`). `fetch` — всегда мок, глобальный `fetch` в этих тестах бросает
исключение (`blockRealNetwork()`). Фикстуры `__tests__/fixtures/notifications.ts` — обезличенные структуры
реальных уведомлений (все значения условные) + синтетические по документации (личное входящее, `quotaExceeded`,
466 в трёх форматах); `satisfies ReceivedNotification` сверяет контракт `types.ts` с реальными данными.
