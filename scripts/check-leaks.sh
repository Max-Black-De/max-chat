#!/bin/sh
# Локальная pre-push-проверка на утечки реальных данных (НФТ-11, Д-8).
#
# Вызывается из .husky/pre-push. Ищет фиксированные литералы (grep -F) в том, что уходит в remote:
# в сообщениях коммитов, в добавленных строках диффов и в именах файлов. Диапазон — из stdin
# pre-push: `<local ref> <local sha> <remote ref> <remote sha>` на строку.
#
# Источник шаблонов (вне репозитория, реальные значения в репо не попадают):
#   1) файл из env MAXCHAT_LEAK_PATTERNS_FILE;
#   2) иначе ${XDG_CONFIG_HOME:-$HOME/.config}/max-chat/leak-patterns;
#   3) дополнительно значение env GREEN_API_TOKEN, если задано.
# Формат файла: один литерал на строку; пробелы по краям обрезаются; пустые строки и строки,
# начинающиеся с `#`, игнорируются.
#
# MAXCHAT_LEAK_SCAN_ALL=1 — ручной аудит всей истории local_sha (без исключения того, что уже
# в remote), например:
#   echo "refs/heads/main $(git rev-parse HEAD) refs/heads/main 0000000000000000000000000000000000000000" |
#     MAXCHAT_LEAK_SCAN_ALL=1 MAXCHAT_LEAK_VERBOSE=1 sh scripts/check-leaks.sh
#
# Нет ни одного источника — выход 0 молча (с MAXCHAT_LEAK_VERBOSE=1 — одна строка в stderr).
# MAXCHAT_LEAK_PATTERNS_FILE задан, но файл не читается — ошибка (явная настройка не игнорируется).
# Совпадение — exit 1 с номером шаблона (номер строки в файле), sha и путём; само значение
# и шаблон не печатаются. Значения передаются grep только через временные файлы (права 600),
# не через argv.
#
# Зависимости: POSIX sh, git, grep, mktemp. Node не нужен.

set -u

say() { printf 'check-leaks: %s\n' "$*" >&2; }
verbose() { if [ -n "${MAXCHAT_LEAK_VERBOSE:-}" ]; then say "$@"; fi; }

ZERO_SHA_RE='^0+$'
is_zero() { printf '%s\n' "$1" | grep -Eq "$ZERO_SHA_RE"; }

# --- источник шаблонов -------------------------------------------------------------------------
if [ -n "${MAXCHAT_LEAK_PATTERNS_FILE:-}" ]; then
  patterns_src=$MAXCHAT_LEAK_PATTERNS_FILE
  if [ ! -r "$patterns_src" ] || [ -d "$patterns_src" ]; then
    say "MAXCHAT_LEAK_PATTERNS_FILE задан, но файл не читается: $patterns_src"
    exit 1
  fi
else
  patterns_src="${XDG_CONFIG_HOME:-$HOME/.config}/max-chat/leak-patterns"
  if [ ! -r "$patterns_src" ] || [ -d "$patterns_src" ]; then
    patterns_src=""
  fi
fi

umask 077
tmp=$(mktemp -d "${TMPDIR:-/tmp}/check-leaks.XXXXXX") || {
  say "не удалось создать временный каталог"
  exit 1
}
trap 'rm -rf "$tmp"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP

cr=$(printf '\r')
# Нормализованные шаблоны: "<номер строки в файле>" в $tmp/ids, значение в $tmp/p.<номер>,
# все значения вместе — в $tmp/all (для быстрой первой проверки).
: >"$tmp/all"
: >"$tmp/ids"
if [ -n "$patterns_src" ]; then
  n=0
  while IFS= read -r line || [ -n "$line" ]; do
    n=$((n + 1))
    line=${line%"$cr"}
    # обрезка пробельных символов по краям
    line=${line#"${line%%[![:space:]]*}"}
    line=${line%"${line##*[![:space:]]}"}
    case $line in '' | '#'*) continue ;; esac
    printf '%s\n' "$line" >"$tmp/p.$n"
    printf '%s\n' "$line" >>"$tmp/all"
    printf '%s\n' "$n" >>"$tmp/ids"
  done <"$patterns_src"
fi
if [ -n "${GREEN_API_TOKEN:-}" ]; then
  # printf — встроенная команда sh: значение не попадает в argv внешних процессов.
  printf '%s\n' "$GREEN_API_TOKEN" >"$tmp/p.token"
  printf '%s\n' "$GREEN_API_TOKEN" >>"$tmp/all"
  printf '%s\n' token >>"$tmp/ids"
fi

if [ ! -s "$tmp/all" ]; then
  verbose "нет источника шаблонов — проверка пропущена"
  exit 0
fi

if [ -n "${MAXCHAT_LEAK_VERBOSE:-}" ]; then
  if [ -n "${GREEN_API_TOKEN:-}" ]; then token_note=', плюс GREEN_API_TOKEN'; else token_note=''; fi
  verbose "шаблонов из файла: $(grep -cv '^token$' "$tmp/ids" | tr -d ' ')$token_note"
fi

# --- что сканировать -----------------------------------------------------------------------------
empty_tree=$(git hash-object -t tree /dev/null) || exit 1

# Добавленные строки (без заголовков +++), имена файлов и сообщение одного коммита.
commit_message() { git log -1 --format=%B "$1"; }
commit_base() {
  if git rev-parse -q --verify "$1^1" >/dev/null; then printf '%s\n' "$1^1"; else printf '%s\n' "$empty_tree"; fi
}
commit_files() { git -c core.quotePath=false diff --no-renames --name-only "$(commit_base "$1")" "$1"; }
added_lines() {
  # $1 — коммит, $2 — путь (необязательно)
  if [ $# -gt 1 ]; then
    git diff --no-color --no-ext-diff --no-renames -U0 "$(commit_base "$1")" "$1" -- ":(literal)$2"
  else
    git diff --no-color --no-ext-diff --no-renames -U0 "$(commit_base "$1")" "$1"
  fi | grep '^+' | grep -v '^+++ '
}

label() {
  if [ "$1" = token ]; then printf 'совпадение с GREEN_API_TOKEN'; else printf 'совпадение с шаблоном №%s' "$1"; fi
}

found=0
report() {
  say "найдено $(label "$1") $2"
  found=1
}

scan_commit() {
  c=$1
  commit_message "$c" >"$tmp/msg"
  commit_files "$c" >"$tmp/files"
  added_lines "$c" >"$tmp/added"
  # Быстрая проверка всего коммита; подробно — только при совпадении.
  if ! cat "$tmp/msg" "$tmp/files" "$tmp/added" | grep -qF -f "$tmp/all"; then
    return 0
  fi
  while IFS= read -r id; do
    pf="$tmp/p.$id"
    if grep -qF -f "$pf" "$tmp/msg"; then
      report "$id" "в сообщении коммита $c"
    fi
    while IFS= read -r path; do
      # Путь, в котором есть любой шаблон, сам не печатается.
      shown=$path
      if printf '%s\n' "$path" | grep -qF -f "$tmp/all"; then shown='<путь скрыт: содержит шаблон>'; fi
      if printf '%s\n' "$path" | grep -qF -f "$pf"; then
        report "$id" "в коммите $c в имени файла $shown"
      elif added_lines "$c" "$path" | grep -qF -f "$pf"; then
        report "$id" "в коммите $c файл $shown"
      fi
    done <"$tmp/files"
  done <"$tmp/ids"
}

scanned=0
while read -r local_ref local_sha remote_ref remote_sha _rest; do
  [ -n "${local_sha:-}" ] || continue
  if is_zero "$local_sha"; then
    verbose "удаление $remote_ref — пропуск"
    continue
  fi
  if [ -n "${MAXCHAT_LEAK_SCAN_ALL:-}" ]; then
    # Ручной аудит: вся история local_sha, без учёта того, что уже есть в remote.
    git rev-list "$local_sha" >"$tmp/commits" || exit 1
  elif ! is_zero "$remote_sha" && git cat-file -e "$remote_sha^{commit}" 2>/dev/null; then
    git rev-list "$remote_sha..$local_sha" >"$tmp/commits" || exit 1
  else
    # Новая ветка в remote (или его sha нет локально): всё, чего ещё нет ни в одной remote-ветке.
    git rev-list "$local_sha" --not --remotes >"$tmp/commits" || exit 1
  fi
  while IFS= read -r c; do
    scan_commit "$c"
    scanned=$((scanned + 1))
  done <"$tmp/commits"
  verbose "$local_ref → $remote_ref: проверено коммитов $(wc -l <"$tmp/commits" | tr -d ' ')"
done

if [ "$found" -ne 0 ]; then
  say "пуш остановлен. Значения не выводятся; уберите их из коммитов и повторите пуш."
  exit 1
fi
verbose "совпадений нет (коммитов: $scanned)"
exit 0
