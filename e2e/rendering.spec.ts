/**
 * План e2e на отображение текста (Д-3, docs/edge-cases.md). Пишутся после F6
 * (список чатов и пузыри); до этого — `test.fixme`, чтобы план был виден в отчёте.
 * Данные — `messageTexts` из `src/test/fixtures/inputs.ts`.
 */
import { test } from './support/greenApi';

test.describe('text rendering (Д-3)', () => {
  test.fixme('EC-U5 / V-26: bubble text has dir="auto", own bubbles stay on the right (snapshot)', () => {
    // messageTexts.bidiOverride, rtlText, longWord, longUrl в своём и входящем пузыре:
    // dir="auto" только у элемента текста, у контейнера пузыря его нет; свои — справа;
    // перенос внутри слова; снимок `toHaveScreenshot` пузырей.
  });

  test.fixme('EC-U3 / V-25: chat preview with emoji is truncated by CSS without «�»', () => {
    // messageTexts.previewEmojiBoundary, previewOnlyEmoji как последнее сообщение:
    // превью в одну строку, `text-overflow: ellipsis`; textContent превью не содержит U+FFFD
    // и одиночных суррогатов; снимок строки списка.
  });
});
