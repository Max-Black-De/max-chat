import { describe, expect, it } from 'vitest';
import { formatPhone } from '../phoneFormat';

describe('formatPhone (Р-15, ВА-21)', () => {
  it.each([
    ['79990000000', '+7 999 000-00-00'],
    ['79991234567', '+7 999 123-45-67'],
    ['375291234567', '+375 29 123-45-67'],
    ['12345', '+12345'],
    ['', ''],
  ])('%s → %s', (input, expected) => {
    expect(formatPhone(input)).toBe(expected);
  });
});
