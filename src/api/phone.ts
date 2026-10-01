/**
 * Нормализация номера телефона (Р-10, ОР-2 п. 2.2–2.3). Чистые функции, без сети.
 */

/** Текст ошибки формата (Р-10). */
export const PHONE_FORMAT_ERROR = 'Введите номер в формате +7XXXXXXXXXX или +375XXXXXXXXX';

/**
 * Удаляет всё, кроме цифр; 11 цифр с ведущей `8` → `7`. Допустимо: 11 цифр с `7`
 * или 12 цифр с `375`. Возвращает нормализованный номер (строка цифр) или `null`.
 *
 * `+7 (999) 000-00-01`, `8 999 000 00 01`, `79990000001` → `"79990000001"`.
 */
export function normalizePhone(input: string): string | null {
  let digits = input.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('8')) digits = `7${digits.slice(1)}`;
  return isNormalizedPhone(digits) ? digits : null;
}

/** Номер уже в нормализованном виде (Р-10). */
export function isNormalizedPhone(digits: string): boolean {
  return /^(7\d{10}|375\d{9})$/.test(digits);
}

/**
 * Номер для тела checkAccount — **целое число** (§4.2 п. 2.5). Принимает только уже
 * нормализованный номер (строка цифр или безопасное целое); иначе `null`.
 */
export function toCheckAccountPhone(phone: string | number): number | null {
  const s =
    typeof phone === 'number'
      ? Number.isSafeInteger(phone) && phone > 0
        ? String(phone)
        : ''
      : phone;
  return isNormalizedPhone(s) ? Number(s) : null;
}
