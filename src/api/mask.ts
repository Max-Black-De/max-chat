/**
 * Маскирование токена (НФТ-3, §4.1 п. 1.10): токен не должен попадать
 * в тексты ошибок, логи, toString/JSON.
 */

import { TOKEN_MASK } from './constants';

export { TOKEN_MASK };

/** Замаскированное представление токена (без символов и длины исходного). */
export function maskToken(token: string): string {
  // Пустой токен показываем пустым, любой другой — одинаковым `***` (без длины и символов).
  return token.length > 0 ? TOKEN_MASK : '';
}

/**
 * Удаляет из строки все вхождения секрета (как есть и в URL-кодированном виде).
 * Пустой/слишком короткий секрет не трогаем, чтобы не «маскировать» всё подряд.
 */
export function redactSecret(text: string, secret: string): string {
  if (!secret || secret.length < 4) return text;
  let out = text;
  const variants = new Set([secret, encodeURIComponent(secret)]);
  for (const v of variants) {
    out = out.split(v).join(TOKEN_MASK);
  }
  return out;
}

/** Замена номеров телефонов и chatId в тексте ответа сервера. */
export const PERSONAL_DATA_MASK = '<id>';

/**
 * Номера телефонов и chatId (`79990000001`, `+79990000001`, `-10000000`, `…@c.us`, `…@g.us`)
 * в тексте причины от сервера — тот попадает в `GreenApiError.reason` и в лог, а номер и chatId
 * туда попадать не должны (§5.4, НФТ-3). Маскируются серии от 6 цифр (с суффиксом `@…`):
 * в текстах причин GREEN-API, по которым классифицируются ошибки, таких чисел нет.
 */
export function redactPersonalData(text: string): string {
  return text.replace(/[+-]?\d{6,}(?:@[\w.]+)?/g, PERSONAL_DATA_MASK);
}

/** Текст причины от сервера для `reason`/лога: без токена, номеров и chatId, не длиннее 300. */
export function sanitizeReason(text: string, secret: string): string {
  return truncate(redactPersonalData(redactSecret(text, secret)));
}

/** Обрезает длинные строки (ответы сервера в тексте ошибки). */
export function truncate(text: string, max = 300): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** Маскирует токен в URL (и в любой строке) — для логгеров вне клиента (НФТ-3). */
export function maskUrl(url: string, token: string): string {
  return redactSecret(url, token);
}
