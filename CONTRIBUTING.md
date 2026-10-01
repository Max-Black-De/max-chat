# Как вносить изменения

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
