# MAX Chat — веб-чат для MAX через GREEN-API

<!-- Д-5: бейдж CI появится после публикации репозитория на GitHub:
[![CI](https://github.com/<owner>/<repo>/actions/workflows/ci.yml/badge.svg)](https://github.com/<owner>/<repo>/actions/workflows/ci.yml) -->

Простой веб-интерфейс в стиле [web.max.ru](https://web.max.ru/) для тестового задания
«Фронтенд-разработчик React». Через инстанс [GREEN-API](https://green-api.com/v3/docs/) (MAX)
пользователь входит по `idInstance` / `apiTokenInstance`, создаёт чат по номеру телефона,
отправляет текст (`SendMessage`) и видит ответы (HTTP API: `ReceiveNotification` + `DeleteNotification`).

Бэкенда нет: приложение — статический SPA, который ходит в API GREEN-API прямо из браузера.

> Статус: **каркас (A1)**. Экраны и логика — задачи F1–F7.

## Требования

- Node.js **20.19+** (см. `.nvmrc`), npm **10+**.
- Инстанс GREEN-API для MAX: авторизован по QR, пустой `webhookUrl`, включены уведомления о входящих,
  об отправленных через API и с телефона (подробно — в разделе «Настройка инстанса», F7).

## Запуск

```bash
npm ci          # или npm i
npm run dev     # http://localhost:5173
```

Учётные данные инстанса вводятся в форме входа и хранятся только в `sessionStorage` вкладки.
Env-переменные необязательны — см. `.env.example` (`VITE_DEFAULT_API_URL`, `VITE_FEATURE_HISTORY`).
Токен в env не кладётся: всё `VITE_*` попадает в собранный бандл.

## Скрипты

| Скрипт                  | Что делает                                       |
| ----------------------- | ------------------------------------------------ |
| `npm run dev`           | dev-сервер Vite                                  |
| `npm run build`         | `tsc -b` + production-сборка в `dist/`           |
| `npm run preview`       | локальный просмотр сборки                        |
| `npm run lint`          | ESLint (`--max-warnings=0`) + `prettier --check` |
| `npm run format`        | Prettier `--write`                               |
| `npm run typecheck`     | проверка типов (`tsc -b`, strict)                |
| `npm test`              | Vitest (jsdom + Testing Library), один прогон    |
| `npm run test:watch`    | Vitest в режиме наблюдения                       |
| `npm run test:coverage` | Vitest с покрытием (v8)                          |

## Структура

```
src/
├── api/             # клиент GREEN-API: URL, 6 методов, ошибки §5.4, квота 466 (F1)
│   ├── types.ts     # типы API-контракта: запросы/ответы, уведомления, 466
│   └── constants.ts # apiUrl по умолчанию, receiveTimeout, лимит 4000 символов
├── polling/         # цикл receive → delete, backoff, AbortController, Web Lock (F5)
├── notifications/   # разбор и маршрутизация уведомлений, извлечение текста (F5)
├── store/           # сессия (sessionStorage), чаты/сообщения/кеш (localStorage), дедуп (F2–F5)
├── ui/              # React-компоненты и стили (F2–F6)
├── test/setup.ts    # настройка Vitest (jest-dom)
├── config.ts        # необязательная конфигурация из env Vite
└── main.tsx         # точка входа
```

## Разработка

Коммиты — [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `test:`,
`docs:`, `refactor:`, `chore:`, `ci:`); проверяются хуком `commit-msg` (husky + commitlint) и в CI.
Подробнее — [CONTRIBUTING.md](CONTRIBUTING.md).

CI (GitHub Actions, `.github/workflows/ci.yml`): `npm ci` → lint → typecheck → test → build на push в
`main` и на каждый PR. Деплой демо (Д-1) будет добавлен в тот же workflow.

## Решения и компромиссы

_Заготовка — заполняется по ходу работы (Д-1)._

- **Без бэкенда** — _TODO: CORS у GREEN-API открыт, меньше точек отказа; минус — токен в браузере._
- **Опрос** — _TODO: HTTP API, long polling `receiveTimeout=20`, строго receive → delete, одна вкладка через Web Lock._
- **Дедупликация** — _TODO: ключ `chatId_idMessage`, слияние оптимистичного сообщения._
- **Хранение токена** — _TODO: sessionStorage, а не localStorage._
- **Чего нет и почему** — _TODO: `setSettings`, история, статусы доставки._

## Ограничения

_Заполняется в F7 / Д-1 (тариф MAX Developer: 3 чата и 100 проверок номеров в месяц; одна
опрашивающая вкладка; только текст; только личные чаты)._
