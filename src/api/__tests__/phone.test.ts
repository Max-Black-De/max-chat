import { describe, expect, it } from 'vitest';
import { isNormalizedPhone, normalizePhone, toCheckAccountPhone } from '../phone';

describe('normalizePhone (Р-10, ОР-2 п. 2.2–2.3)', () => {
  it.each([
    ['+7 (999) 123-45-67', '79991234567'],
    ['8 999 123 45 67', '79991234567'],
    ['79991234567', '79991234567'],
    ['+375 29 123-45-67', '375291234567'],
  ])('%j → %j', (input, out) => {
    expect(normalizePhone(input)).toBe(out);
  });

  it.each([
    '',
    '123',
    '9991234567',
    '899912345678',
    '+380 99 123 45 67',
    '7999123456',
    '+1 999 123 45 67',
  ])('%j → null', (input) => {
    expect(normalizePhone(input)).toBeNull();
  });

  it('isNormalizedPhone / toCheckAccountPhone', () => {
    expect(isNormalizedPhone('79991234567')).toBe(true);
    expect(isNormalizedPhone('89991234567')).toBe(false);
    expect(toCheckAccountPhone('79991234567')).toBe(79991234567);
    expect(toCheckAccountPhone(375291234567)).toBe(375291234567);
    expect(toCheckAccountPhone(7.5)).toBeNull();
    expect(toCheckAccountPhone('+79991234567')).toBeNull();
  });
});
