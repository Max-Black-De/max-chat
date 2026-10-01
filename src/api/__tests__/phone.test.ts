import { describe, expect, it } from 'vitest';
import { isNormalizedPhone, normalizePhone, toCheckAccountPhone } from '../phone';

describe('normalizePhone (Р-10, ОР-2 п. 2.2–2.3)', () => {
  it.each([
    ['+7 (999) 000-00-01', '79990000001'],
    ['8 999 000 00 01', '79990000001'],
    ['79990000001', '79990000001'],
    ['+375 29 000-00-01', '375290000001'],
  ])('%j → %j', (input, out) => {
    expect(normalizePhone(input)).toBe(out);
  });

  it.each([
    '',
    '123',
    '9990000001',
    '899900000018',
    '+380 99 000 00 01',
    '7999000000',
    '+1 999 000 00 01',
  ])('%j → null', (input) => {
    expect(normalizePhone(input)).toBeNull();
  });

  it('isNormalizedPhone / toCheckAccountPhone', () => {
    expect(isNormalizedPhone('79990000001')).toBe(true);
    expect(isNormalizedPhone('89990000001')).toBe(false);
    expect(toCheckAccountPhone('79990000001')).toBe(79990000001);
    expect(toCheckAccountPhone(375290000001)).toBe(375290000001);
    expect(toCheckAccountPhone(7.5)).toBeNull();
    expect(toCheckAccountPhone('+79990000001')).toBeNull();
  });
});
