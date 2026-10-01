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
