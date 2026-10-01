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
- Пока нет GitHub и PR, ветка вливается в `main` только fast-forward:
  `git -C /workspace/max-chat merge --ff-only <ветка>`. Кто вливает — решает Руководитель.
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

То же самое запускает CI (`.github/workflows/ci.yml`).
