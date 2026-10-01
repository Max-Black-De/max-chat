/**
 * Маскирование токена (НФТ-3, §4.1 п. 1.10): токен не должен попадать
 * в тексты ошибок, логи, toString/JSON.
 */

export const TOKEN_MASK = '***';

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

/** Обрезает длинные строки (ответы сервера в тексте ошибки). */
export function truncate(text: string, max = 300): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** Маскирует токен в URL (и в любой строке) — для логгеров вне клиента (НФТ-3). */
export function maskUrl(url: string, token: string): string {
  return redactSecret(url, token);
}
