import { describe, expect, it } from 'vitest';
import { messageTexts } from '../test/fixtures/inputs';
import {
  AVATAR_TONES,
  PREVIEW_MAX_CODE_POINTS,
  avatarInitial,
  avatarTone,
  previewText,
} from './format';

/** Есть ли одиночная суррогатная половина (разорванная пара). */
function hasLoneSurrogate(s: string): boolean {
  return /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(s);
}

describe('previewText (§4.0 п. 2, EC-U3)', () => {
  it('переносы и повторные пробелы — один пробел', () => {
    expect(previewText('  привет\n\n  как\tдела  ')).toBe('привет как дела');
  });

  it('эмодзи на границе обрезки не разрывается', () => {
    // 39 букв, эмодзи (2 UTF-16 единицы) — 40-я кодовая точка.
    const text = messageTexts.previewEmojiBoundary;
    for (const max of [39, 40, 41]) {
      const out = previewText(text, max);
      expect(hasLoneSurrogate(out)).toBe(false);
      expect(out).not.toContain('\uFFFD');
      expect(Array.from(out.replace(/…$/, ''))).toHaveLength(max);
    }
    expect(previewText(text, 40).endsWith('😀…')).toBe(true);
    expect(previewText(text, 39).endsWith('а…')).toBe(true);
  });

  it('только эмодзи: режется по кодовым точкам, короткий текст не меняется', () => {
    const text = messageTexts.previewOnlyEmoji;
    expect(Array.from(text).length).toBeLessThan(PREVIEW_MAX_CODE_POINTS);
    expect(previewText(text)).toBe(text);
    const cut = previewText(text, 7);
    expect(cut).toBe(`${'😀'.repeat(7)}…`);
    expect(hasLoneSurrogate(cut)).toBe(false);
  });
});

describe('аватар', () => {
  it('первая буква или цифра заголовка, в верхнем регистре', () => {
    expect(avatarInitial('анна')).toBe('А');
    expect(avatarInitial('+7 999 000-00-01')).toBe('7');
    expect(avatarInitial('😀 Петя')).toBe('П');
    expect(avatarInitial('שלום')).toBe('ש');
    expect(avatarInitial('')).toBe('#');
    expect(avatarInitial('😀😀')).toBe('#');
  });

  it('цвет стабилен для chatId и в диапазоне классов', () => {
    const ids = ['10000000', '10000001', '10000002', '-1', ''];
    for (const id of ids) {
      const tone = avatarTone(id);
      expect(tone).toBe(avatarTone(id));
      expect(tone).toBeGreaterThanOrEqual(0);
      expect(tone).toBeLessThan(AVATAR_TONES);
    }
  });
});
