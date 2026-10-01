/**
 * Форматирование для списка чатов и ленты. Чистые функции.
 */
import { UI_TEXTS } from './texts';

/** `HH:MM` в часовом поясе браузера (Р-21). `timestamp` — секунды. */
export function formatTime(timestamp: number): string {
  const d = new Date(timestamp * 1000);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** ISO-время для `<time dateTime>`; для битого `timestamp` — `undefined` (атрибута нет). */
export function isoDateTime(timestamp: number): string | undefined {
  const d = new Date(timestamp * 1000);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** Длина превью в кодовых точках. Остальное обрезает CSS (`text-overflow: ellipsis`). */
export const PREVIEW_MAX_CODE_POINTS = 120;

/**
 * Превью в одну строку (§4.0 п. 2): переносы и повторные пробелы — один пробел. Длинный текст
 * обрезается по кодовым точкам (`Array.from`), чтобы не разорвать суррогатную пару (EC-U3).
 */
export function previewText(text: string, max: number = PREVIEW_MAX_CODE_POINTS): string {
  const line = text.replace(/\s+/g, ' ').trim();
  const points = Array.from(line);
  return points.length > max ? `${points.slice(0, max).join('')}…` : line;
}

/**
 * Буква для аватара: первая буква или цифра заголовка (по кодовым точкам, EC-U3), иначе «#».
 * Чистое оформление: аватар скрыт от скринридеров, заголовок читается текстом.
 */
export function avatarInitial(title: string): string {
  for (const ch of title) {
    if (/[\p{L}\p{N}]/u.test(ch)) return ch.toLocaleUpperCase('ru');
  }
  return '#';
}

/** Число вариантов цвета аватара (классы `avatar--0` … `avatar--5` в CSS). */
export const AVATAR_TONES = 6;

/** Стабильный вариант цвета по chatId: один чат — один цвет в списке и в шапке. */
export function avatarTone(chatId: string): number {
  let h = 0;
  for (let i = 0; i < chatId.length; i += 1) h = (h * 31 + chatId.charCodeAt(i)) >>> 0;
  return h % AVATAR_TONES;
}

/** Узкий экран (Д-6e): одна колонка. Граница совпадает с `@media` в `global.css`. */
export const NARROW_MEDIA_QUERY = '(max-width: 767px)';

export function isNarrowViewport(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(NARROW_MEDIA_QUERY).matches;
}

/** Родительный падеж месяцев для «12 сентября» (Д-6b). Свой список — не зависит от ICU браузера. */
const MONTHS_GENITIVE = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
] as const;

function localDate(timestamp: number): Date | null {
  const d = new Date(timestamp * 1000);
  return Number.isNaN(d.getTime()) ? null : d;
}

function dateKeyOf(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Календарный день сообщения в часовом поясе браузера: `YYYY-MM-DD` (Д-6b, Р-21). Для битого
 * `timestamp` — пустая строка. `timestamp` — секунды.
 */
export function dayKey(timestamp: number): string {
  const d = localDate(timestamp);
  return d ? dateKeyOf(d) : '';
}

/**
 * Подпись разделителя дат (Д-6b): «Сегодня», «Вчера», «12 сентября», для другого года —
 * «12 сентября 2025». «Вчера» — по календарю, а не «24 часа назад» (переход на летнее время).
 * `now` — миллисекунды, по умолчанию текущее время.
 */
export function formatDayLabel(timestamp: number, now: number = Date.now()): string {
  const d = localDate(timestamp);
  if (!d) return '';
  const today = new Date(now);
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  const key = dateKeyOf(d);
  if (key === dateKeyOf(today)) return UI_TEXTS.today;
  if (key === dateKeyOf(yesterday)) return UI_TEXTS.yesterday;
  const dayMonth = `${String(d.getDate())} ${MONTHS_GENITIVE[d.getMonth()] ?? ''}`;
  return d.getFullYear() === today.getFullYear()
    ? dayMonth
    : `${dayMonth} ${String(d.getFullYear())}`;
}

/** Элемент ленты: разделитель дня перед первым сообщением этого дня или само сообщение. */
export type DayGroupItem<T> =
  { kind: 'day'; key: string; timestamp: number } | { kind: 'message'; message: T };

/**
 * Разделители дат для уже отсортированной по `timestamp` ленты (§6.2): перед первым сообщением
 * каждого календарного дня. Сообщения с битым временем разделителя не получают.
 */
export function withDaySeparators<T extends { timestamp: number }>(
  sorted: readonly T[],
): DayGroupItem<T>[] {
  const out: DayGroupItem<T>[] = [];
  let last: string | null = null;
  for (const message of sorted) {
    const key = dayKey(message.timestamp);
    if (key !== '' && key !== last) {
      out.push({ kind: 'day', key, timestamp: message.timestamp });
      last = key;
    }
    out.push({ kind: 'message', message });
  }
  return out;
}
