/**
 * Автопрокрутка ленты (п. 5.6): к новому сообщению — если пользователь был внизу, иначе кнопка
 * «↓ новые сообщения». Чистые функции, чтобы проверять без вёрстки (в jsdom размеров нет).
 */

/** Допуск «внизу», px: дробные `scrollTop` и последний пиксель не должны ломать автопрокрутку. */
export const BOTTOM_THRESHOLD_PX = 40;

export interface ScrollMetrics {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

export function isAtBottom(m: ScrollMetrics, threshold: number = BOTTOM_THRESHOLD_PX): boolean {
  return m.scrollHeight - m.scrollTop - m.clientHeight <= threshold;
}

export type ScrollDecision = 'scroll' | 'showButton' | 'none';

/**
 * Что делать после изменения ленты:
 * - новых сообщений нет (статус, слияние) — ничего;
 * - своё только что отправленное — всегда прокрутить (пользователь сам его написал);
 * - иначе прокрутить, если пользователь был внизу, или показать кнопку.
 */
export function decideScroll(input: {
  hasNewMessages: boolean;
  newestIsOwnSending: boolean;
  wasAtBottom: boolean;
}): ScrollDecision {
  if (!input.hasNewMessages) return 'none';
  if (input.newestIsOwnSending || input.wasAtBottom) return 'scroll';
  return 'showButton';
}
