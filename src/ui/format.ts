/**
 * Форматирование для списка чатов и ленты. Чистые функции.
 */

/** `HH:MM` в часовом поясе браузера (Р-21). `timestamp` — секунды. */
export function formatTime(timestamp: number): string {
  const d = new Date(timestamp * 1000);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
