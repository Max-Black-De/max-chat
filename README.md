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

- Node.js **22 LTS** (≥ 22.22.2, см. `.nvmrc`), npm **10+** (идёт в комплекте с Node 22).
- Инстанс GREEN-API для MAX: авторизован по QR, пустой `webhookUrl`, включены уведомления о входящих,
  об отправленных через API и с телефона (подробно — в разделе «Настройка инстанса», F7).

## Установка Node 22

Версия зафиксирована в `.nvmrc` (`22`). С [nvm](https://github.com/nvm-sh/nvm):

```bash
nvm install   # один раз: ставит версию из .nvmrc
nvm use       # в каждой новой оболочке, из корня репозитория
node -v       # v22.x
```

Подойдёт и любой другой менеджер версий, который читает `.nvmrc` (fnm, Volta, asdf), или
установщик с [nodejs.org](https://nodejs.org/). Git-хук `commit-msg` запускается тем `node`,
который активен в оболочке, где выполняется `git commit`, поэтому коммитить нужно тоже под Node 22.

### Общий компьютер команды (бокс агентов)

Системный Node здесь — 20 (`/usr/bin/node`), его не меняем: им пользуются другие процессы.
Node 22 стоит рядом через nvm в `~/.nvm`, без alias `default` и без правок профилей, поэтому
в новой оболочке по умолчанию по-прежнему Node 20. Активация в текущей оболочке:

```bash
cd /workspace/max-chat   # или ваш worktree
unset NPM_CONFIG_PREFIX && source ~/.nvm/nvm.sh && nvm use
```

`unset NPM_CONFIG_PREFIX` нужен потому, что nvm несовместим с этой переменной, а в окружении
бокса она задана. Действует только на текущую оболочку.

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

## Краевые случаи

Полная спецификация (101 случай: ожидаемое поведение, модуль-владелец, задача, как тестировать) —
[docs/edge-cases.md](docs/edge-cases.md). Обязательный минимум Д-3:

| #   | Случай                                                               | Как обработано                                                                     | Тесты (чек-лист QA)    |
| --- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------- |
| 1   | `chatId`, `idMessage`, `idInstance` — строки; 18-значные `idMessage` | не приводятся к числу; ключ дедупа `chatId_idMessage`                              | V-09, V-10, V-08, M-05 |
| 2   | Шум из групп и каналов, неизвестные чаты                             | не показываются, сразу удаляются из очереди                                        | V-13…V-17, R-13        |
| 3   | Неизвестный или битый `typeWebhook` / `typeMessage`                  | заглушка или игнор, уведомление **всегда** удаляется                               | V-19, V-11, V-12, E-11 |
| 4   | Несколько вкладок                                                    | опрос только во вкладке с Web Lock `maxchat-poll-<idInstance>`, в остальных баннер | R-10, R-11, R-14       |
| 5   | Повтор уведомления; уведомление раньше ответа `sendMessage`          | дедуп и слияние по `chatId_idMessage`                                              | V-07, M-06, M-07, E-10 |
| 6   | Через API приходит `extendedTextMessage`, с телефона — `textMessage` | разбираются оба типа                                                               | M-06, M-20             |
| 7   | 401 / 403                                                            | остановка опроса, выход на экран входа с текстом ошибки                            | L-08, L-09, E-01, E-02 |
| 8   | Инстанс не авторизован или запускается                               | текст при входе; в работе — баннер и пауза 30 с                                    | L-11…L-16, E-03        |
| 9   | Квота Developer: 466 / `quotaExceeded`                               | «не отправлено» + баннер, без автоповтора; только chatId; кеш номер → chatId       | Q-01…Q-17, C-07        |
| 10  | Задан `webhookUrl`                                                   | предупреждение П-1, опрос не запускается                                           | S-01, S-02, E-04, E-05 |
| 11  | Старые уведомления (до 24 ч) при входе                               | обрабатываются как обычные                                                         | R-12                   |
| 12  | Порядок очереди не совпадает с `timestamp`                           | сортировка по `timestamp`, при равенстве — по порядку поступления                  | V-21                   |

ID тестов — из чек-листа QA (Q1). Unit- и e2e-тесты появятся в задачах F1–F5 и Q2 / Д-2.

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
