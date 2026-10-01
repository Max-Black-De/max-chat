import { describe, expect, it } from 'vitest';
import { CHECK_ACCOUNT_TEXTS, QUOTA_TEXTS } from '../../api';
import { redactIdentifiers } from '../privacy';

describe('redactIdentifiers (номер и chatId — персональные данные)', () => {
  it('серии от 7 цифр заменяются', () => {
    expect(redactIdentifiers('x 79990000001 +79990000001 -10000000 y')).toBe('x *** *** *** y');
  });

  it('тексты ТЗ не меняются', () => {
    for (const t of [...Object.values(CHECK_ACCOUNT_TEXTS), ...Object.values(QUOTA_TEXTS)])
      expect(redactIdentifiers(t)).toBe(t);
  });
});
