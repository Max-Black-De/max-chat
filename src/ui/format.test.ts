import { describe, expect, it } from 'vitest';
import { messageTexts } from '../test/fixtures/inputs';
import {
  AVATAR_TONES,
  PREVIEW_MAX_CODE_POINTS,
  avatarInitial,
  avatarTone,
  dayKey,
  formatDayLabel,
  previewText,
  withDaySeparators,
} from './format';
import { sortMessages, type StoredMessage } from '../store';

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

/** Секунды для местного времени браузера: тесты не зависят от TZ окружения. */
const at = (y: number, m: number, d: number, h = 12, min = 0, sec = 0) =>
  new Date(y, m - 1, d, h, min, sec).getTime() / 1000;
const nowAt = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();

describe('разделители дат (Д-6b)', () => {
  const now = nowAt(2026, 10, 1, 9);

  it('«Сегодня», «Вчера», «12 сентября», с годом — если год не текущий', () => {
    expect(formatDayLabel(at(2026, 10, 1, 0, 0, 0), now)).toBe('Сегодня');
    expect(formatDayLabel(at(2026, 10, 1, 23, 59, 59), now)).toBe('Сегодня');
    expect(formatDayLabel(at(2026, 9, 30, 23, 59, 59), now)).toBe('Вчера');
    expect(formatDayLabel(at(2026, 9, 30, 0, 0, 0), now)).toBe('Вчера');
    expect(formatDayLabel(at(2026, 9, 29, 23, 59), now)).toBe('29 сентября');
    expect(formatDayLabel(at(2026, 9, 12), now)).toBe('12 сентября');
    expect(formatDayLabel(at(2026, 5, 1), now)).toBe('1 мая');
    expect(formatDayLabel(at(2025, 9, 12), now)).toBe('12 сентября 2025');
  });

  it('«Вчера» — по календарю: 1 января после полуночи → 31 декабря прошлого года', () => {
    const newYear = new Date(2027, 0, 1, 0, 30).getTime();
    expect(formatDayLabel(at(2026, 12, 31, 23, 50), newYear)).toBe('Вчера');
    expect(formatDayLabel(at(2026, 12, 30, 10), newYear)).toBe('30 декабря 2026');
    expect(formatDayLabel(at(2027, 1, 1, 0, 10), newYear)).toBe('Сегодня');
  });

  it('битый timestamp — без подписи и без разделителя', () => {
    expect(formatDayLabel(Number.NaN, now)).toBe('');
    expect(dayKey(Number.NaN)).toBe('');
    expect(withDaySeparators([{ timestamp: Number.NaN }])).toEqual([
      { kind: 'message', message: { timestamp: Number.NaN } },
    ]);
  });

  it('граница суток: разделитель перед первым сообщением каждого дня, после сортировки §6.2', () => {
    const m = (localId: string, timestamp: number): StoredMessage => ({
      localId,
      chatId: '10000000',
      direction: 'in',
      text: localId,
      timestamp,
    });
    // Порядок поступления не совпадает с timestamp (EC-O2).
    const shuffled = [
      m('d2-a', at(2026, 10, 1, 0, 0, 0)),
      m('d1-b', at(2026, 9, 30, 23, 59, 59)),
      m('d1-a', at(2026, 9, 30, 8)),
      m('d2-b', at(2026, 10, 1, 0, 0, 1)),
    ];
    const items = withDaySeparators(sortMessages(shuffled));
    expect(items.map((i) => (i.kind === 'day' ? `day:${i.key}` : i.message.localId))).toEqual([
      'day:2026-09-30',
      'd1-a',
      'd1-b',
      'day:2026-10-01',
      'd2-a',
      'd2-b',
    ]);
  });
});
