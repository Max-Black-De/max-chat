# Как вносить изменения

## Ветки

- Общая рабочая копия `/workspace/max-chat` всегда стоит на `main`. Переключать в ней ветки
  (`git checkout` / `git switch`) нельзя: ею одновременно пользуются несколько человек и агентов.
- Каждая задача делается в своей ветке с именем `<тип>/<краткое-имя>`, где тип — `feat/`, `fix/`,
  `test/`, `docs/`, `refactor/`, `chore/`, `ci/` (как в коммитах), например `feat/f2-login-screen`.
- И в своём git worktree. Общий каталог для worktree — `/workspace/max-chat-wt/`:

  ```bash
  git -C /workspace/max-chat worktree add /workspace/max-chat-wt/<имя> -b <ветка> main
  cd /workspace/max-chat-wt/<имя>
  npm ci   # в каждом worktree свой node_modules
  ```

- Перед вливанием ветка перебазируется на свежий `main` (`git rebase main`), и все проверки
  должны быть зелёными: `npm run lint && npm run typecheck && npm test && npm run build`.
- Ветка вливается в `main` только fast-forward в общей копии:
  `git -C /workspace/max-chat merge --ff-only <ветка>`. Кто вливает — решает Руководитель.
- `origin` — GitHub (`Max-Black-De/max-chat`, публичный). В `origin` пушит только Архитектор:
  `main` — только после ff-merge, без force (`git push origin main`); рабочие ветки — по желанию
  (например, чтобы открыть PR и прогнать CI). На каждый push и PR CI запускает lint, typecheck,
  test, build и gitleaks; push в `main` после зелёных проверок деплоит демо на GitHub Pages.
- Ветки, уже влитые в `main`, не переписываются (никаких rebase, amend и force-push).
- После вливания worktree удаляется: `git -C /workspace/max-chat worktree remove /workspace/max-chat-wt/<имя>`.

## Коммиты — Conventional Commits (ТЗ Д-8)

Формат заголовка: `<type>(<scope>)?: <subject>`, например:

```
feat(api): add sendMessage client
fix(polling): delete notification when handler throws
test(notifications): cover quotedMessage text extraction
```

- Типы: `feat`, `fix`, `test`, `docs`, `refactor`, `chore`, `ci` — других commitlint не пропустит.
- `scope` — необязательный, обычно модуль: `api`, `polling`, `notifications`, `store`, `ui`.
- `subject` — коротко, в повелительном наклонении, без точки в конце, не с заглавной буквы.
- Коммиты мелкие и атомарные, по задачам ТЗ §8 (F1, F2, …).

Проверка автоматическая: хук `commit-msg` (husky + commitlint) ставится сам при `npm install`
(скрипт `prepare`). В CI сообщения коммитов PR проверяются той же конфигурацией (`commitlint.config.js`).

Проверить сообщение вручную: `echo "feat: something" | npx commitlint`.

## Безопасность данных (НФТ-3, НФТ-11)

- В репозиторий, тесты, фикстуры, README и сообщения коммитов **не попадают** реальные номера
  телефонов, `chatId`, `idInstance` и токены. Только условные значения: `1101000000`, `10000000`,
  `79990000000`, `your-api-token`.
- Файлы `.env*` (кроме `.env.example`) в `.gitignore`. Учётные данные инстанса вводятся в форме входа,
  в env и в сборку не кладутся.
- Тесты и e2e не ходят в реальный GREEN-API — только моки.

## Перед пушем

```
npm run lint && npm run typecheck && npm test && npm run build
```

То же самое запускает CI (`.github/workflows/ci.yml`). Ещё CI ищет секреты во всей истории git
([gitleaks](https://github.com/gitleaks/gitleaks), правила — `.gitleaks.toml`, включая токен GREEN-API).
Локально, если gitleaks установлен:

```
gitleaks git --config .gitleaks.toml --redact --log-opts="--all" .
```

### Хук pre-push: реальные данные (НФТ-11)

gitleaks не знает реальных `idInstance`, `chatId` и номеров: их нельзя записать в публичный конфиг.
Поэтому есть локальный хук `.husky/pre-push` → `scripts/check-leaks.sh` (POSIX sh + git + grep, Node
не нужен). Он ищет фиксированные строки (`grep -F`) в том, что уходит в `origin`: в сообщениях
коммитов, добавленных строках диффов и именах файлов, только в коммитах, которых в remote ещё нет.

Шаблоны берутся **вне репозитория**:

1. файл из env `MAXCHAT_LEAK_PATTERNS_FILE`, иначе
2. `${XDG_CONFIG_HOME:-$HOME/.config}/max-chat/leak-patterns`;
3. плюс значение env `GREEN_API_TOKEN`, если оно задано.

Формат файла — один литерал на строку; пробелы по краям обрезаются, пустые строки и строки с `#`
в начале пропускаются:

```bash
mkdir -p ~/.config/max-chat
touch ~/.config/max-chat/leak-patterns && chmod 600 ~/.config/max-chat/leak-patterns
# дальше — в редакторе: ваш idInstance, chatId, номера телефонов (в нужных форматах)
```

- **Нет ни одного источника — хук молча пропускает проверку** и пуш не ломает (с
  `MAXCHAT_LEAK_VERBOSE=1` пишет об этом одну строку). Если `MAXCHAT_LEAK_PATTERNS_FILE` задан, но
  файл не читается, — ошибка.
- При совпадении пуш останавливается: «найдено совпадение с шаблоном №N в коммите <sha> файл
  <path>» (N — номер строки в файле шаблонов; для токена — «совпадение с GREEN_API_TOKEN»). Сами
  значения не печатаются и в argv не передаются (только через временный файл с правами 600).
- Аудит всей истории, включая уже опубликованное:

  ```bash
  echo "refs/heads/main $(git rev-parse HEAD) refs/heads/main 0000000000000000000000000000000000000000" |
    MAXCHAT_LEAK_SCAN_ALL=1 MAXCHAT_LEAK_VERBOSE=1 sh scripts/check-leaks.sh
  ```

- Хук ставится вместе с остальными при `npm install` (husky); `HUSKY=0` отключает все хуки.
