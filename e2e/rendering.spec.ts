/**
 * Отображение текста (Д-3, docs/edge-cases.md), на моках:
 * - EC-U5 / V-26: RTL и bidi в своём **и входящем** пузыре — `dir="auto"` только у текста,
 *   свои справа, входящие слева, перенос длинных слов без горизонтальной прокрутки, плюс
 *   снимок ленты (направление и текст каждого пузыря; свой RTL-пузырь у Фронтенда — `chat-send.spec.ts`, здесь не дублируется);
 * - EC-U3 / V-25: превью с emoji в списке чатов обрезает CSS, без «�» и одиночных суррогатов.
 */
import {
  bodyResponse,
  checkAccountResponses,
  deleteResponses,
  emptyReceiveResponses,
  incomingMessage,
  messageTexts,
  sendMessageResponses,
  settingsResponses,
  stateResponses,
  textMessageData,
} from '../src/test/fixtures';
import { delayed, expect, test, type GreenApiMock } from './support/greenApi';
import { loginAndOpenChat } from './support/session';

const EMPTY = delayed(emptyReceiveResponses.emptyBody, 300);

test.beforeEach(({ greenApi }) => {
  greenApi
    .on('getStateInstance', stateResponses.authorized)
    .on('getSettings', settingsResponses.ok)
    .on('checkAccount', checkAccountResponses.exists)
    .on('receiveNotification', EMPTY)
    .on('deleteNotification', deleteResponses.ok)
    .on('sendMessage', [
      sendMessageResponses.sent,
      sendMessageResponses.sent2,
      sendMessageResponses.sentRace,
    ]);
});

/** После создания чата receive по очереди отдаёт входящие `texts`, затем пусто. */
function incomingAfterChat(greenApi: GreenApiMock, texts: readonly string[]) {
  let i = 0;
  greenApi.on('receiveNotification', () => {
    if (greenApi.callsTo('checkAccount').length === 0 || i >= texts.length) return EMPTY;
    const text = texts[i] ?? '';
    i += 1;
    return bodyResponse(
      incomingMessage({
        idMessage: `10000000000000005${String(i)}`,
        timestamp: 1790000100 + i,
        messageData: textMessageData(text),
      }),
      150 + i,
    );
  });
}

test('EC-U5 / V-26: входящие RTL и U+202E — слева, свои — справа, dir="auto" только у текста', async ({
  page,
  greenApi,
}) => {
  const incoming = [messageTexts.rtlText, messageTexts.bidiOverride, messageTexts.longWord];
  incomingAfterChat(greenApi, incoming);
  await loginAndOpenChat(page);
  await expect.poll(() => greenApi.callsTo('deleteNotification').length).toBe(incoming.length);
  const input = page.getByTestId('composer-input');
  await input.fill(messageTexts.rtlText);
  await input.press('Enter');

  const bubbles = page.getByTestId('message');
  await expect(bubbles).toHaveCount(incoming.length + 1);
  const list = await page.getByTestId('message-list').boundingBox();
  if (!list) throw new Error('лента не видна');
  for (const bubble of await bubbles.all()) {
    await expect(bubble).not.toHaveAttribute('dir');
    await expect(bubble.getByTestId('message-text')).toHaveAttribute('dir', 'auto');
    const box = await bubble.boundingBox();
    if (!box) throw new Error('пузырь не виден');
    expect(box.width).toBeLessThanOrEqual(list.width);
    const direction = await bubble.getAttribute('data-direction');
    if (direction === 'in') expect(box.x - list.x).toBeLessThan(40);
    else expect(list.x + list.width - (box.x + box.width)).toBeLessThan(40);
  }
  await expect(page.locator('[data-testid="message"][data-direction="in"]')).toHaveCount(
    incoming.length,
  );
  // Длинное слово переносится — горизонтальной прокрутки ленты нет.
  const overflow = await page
    .getByTestId('message-list')
    .evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  // Снимок ленты: порядок, направление и тексты пузырей. Пиксельный `toHaveScreenshot` не храним —
  // эталон зависит от шрифтов машины (локально и в CI разные), см. отчёт Q2.
  const snapshot = await bubbles.evaluateAll((els) =>
    els.map((el) => [
      el.getAttribute('data-direction'),
      el.querySelector('[data-testid="message-text"]')?.textContent,
    ]),
  );
  expect(snapshot).toEqual([...incoming.map((t) => ['in', t]), ['out', messageTexts.rtlText]]);
});

test('EC-U3 / V-25: превью с emoji обрезается CSS в одну строку, без «�» и одиночных суррогатов', async ({
  page,
}) => {
  await loginAndOpenChat(page);
  const input = page.getByTestId('composer-input');
  const preview = page.getByTestId('chat-item-preview');
  for (const text of [messageTexts.previewEmojiBoundary, messageTexts.previewOnlyEmoji]) {
    await input.fill(text);
    await input.press('Enter');
    // Полный текст в DOM: обрезка не в JS.
    await expect(preview).toHaveText(text);
    const info = await preview.evaluate((el) => {
      const s = getComputedStyle(el);
      const text = el.textContent;
      return {
        whiteSpace: s.whiteSpace,
        overflow: s.overflowX,
        textOverflow: s.textOverflow,
        clipped: el.scrollWidth > el.clientWidth,
        replacement: text.includes('\uFFFD'),
        loneSurrogate:
          /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(text),
        oneLine: el.getBoundingClientRect().height < parseFloat(s.fontSize) * 2,
      };
    });
    expect(info).toEqual({
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      clipped: true,
      replacement: false,
      loneSurrogate: false,
      oneLine: true,
    });
  }
});
