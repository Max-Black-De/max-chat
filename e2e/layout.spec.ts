/**
 * F6: макет в настоящей вёрстке (§4.0 п. 2, п. 4, Р-28, Д-6e) и проверки отображения текста
 * EC-U3 / EC-U5 / EC-N12 без снимков (снимки — в плане QA `rendering.spec.ts`).
 * Чаты и ленты — в localStorage до загрузки (`support/layoutSeed.ts`), API — моки `greenApi`.
 */
import {
  CHAT_IDS,
  NAMES,
  deleteResponses,
  emptyReceiveResponses,
  settingsResponses,
  stateResponses,
} from '../src/test/fixtures';
import { type Locator, type Page } from '@playwright/test';
import { delayed, expect, test } from './support/greenApi';
import { LONG_NAME, expectNoHorizontalScroll, login, seedStorage } from './support/layoutSeed';

const DESKTOP = { width: 1280, height: 800 };
const NARROW = { width: 375, height: 812 };

test.beforeEach(async ({ page, greenApi }) => {
  greenApi
    .on('getStateInstance', stateResponses.authorized)
    .on('getSettings', settingsResponses.incomingOff)
    .on('receiveNotification', delayed(emptyReceiveResponses.emptyBody, 300))
    .on('deleteNotification', deleteResponses.ok);
  await seedStorage(page);
});

const item = (page: Page, chatId: string) =>
  page.locator(`[data-testid="chat-item"][data-chat-id="${chatId}"]`);

async function box(locator: Locator) {
  const b = await locator.boundingBox();
  if (!b) throw new Error('элемент не отрисован');
  return b;
}

test.describe('широкий экран (≥ 1024 px, макет MVP)', () => {
  test.use({ viewport: DESKTOP });

  test('две колонки: «Сообщения» и список слева, баннеры над окном чата справа', async ({
    page,
  }) => {
    await login(page);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Сообщения');
    const sidebar = await box(page.locator('.sidebar'));
    expect(Math.round(sidebar.width)).toBe(340);
    await item(page, CHAT_IDS.primary).click();
    await expect(page.getByTestId('chat-window')).toBeVisible();
    await expect(page.getByTestId('chat-list')).toBeVisible();
    // «Назад» — только на узком экране.
    await expect(page.getByTestId('chat-back')).toBeHidden();

    const banner = await box(page.getByTestId('banner-p2'));
    const header = await box(page.getByTestId('chat-header'));
    expect(banner.x).toBeGreaterThanOrEqual(sidebar.x + sidebar.width - 1);
    expect(banner.y + banner.height).toBeLessThanOrEqual(header.y + 1);
    await expectNoHorizontalScroll(page);
  });

  test('EC-U5: dir="auto" только у текста; свои справа, входящие слева; длинное переносится', async ({
    page,
  }) => {
    await login(page);
    await item(page, CHAT_IDS.primary).click();
    const list = page.getByTestId('message-list');
    await expect(page.getByTestId('message')).toHaveCount(10);

    // dir — только у элементов текста, не у пузыря и не у строки ленты.
    const dirOwners = await list
      .locator('[dir]')
      .evaluateAll((els) => els.map((el) => el.getAttribute('data-testid')));
    expect(new Set(dirOwners)).toEqual(new Set(['message-text']));
    await expect(list.locator('li[dir], .message__bubble[dir]')).toHaveCount(0);

    const area = await box(list);
    for (const bubble of await page.getByTestId('message').all()) {
      const b = await box(bubble.locator('.message__bubble'));
      const own = (await bubble.getAttribute('data-direction')) === 'out';
      if (own) expect(area.x + area.width - (b.x + b.width)).toBeLessThan(40);
      else expect(b.x - area.x).toBeLessThan(40);
      // EC-U4: длинное слово и URL не вылезают за ленту.
      expect(b.width).toBeLessThanOrEqual(area.width * 0.71);
    }
    const overflow = await list.evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);

    // Ошибка отправки и заглушка неподдерживаемого типа.
    await expect(page.locator('[data-status="error"]').getByTestId('message-retry')).toBeVisible();
    await expect(
      page.getByTestId('message-text').filter({ hasText: 'не поддерживается' }),
    ).toHaveCount(1);
  });

  test('EC-U3: превью в одну строку с многоточием, без «�» и разорванных суррогатов', async ({
    page,
  }) => {
    await login(page);
    for (const chatId of [CHAT_IDS.secondary, CHAT_IDS.newRecipient]) {
      const preview = item(page, chatId).getByTestId('chat-item-preview');
      const info = await preview.evaluate((el) => {
        const cs = getComputedStyle(el);
        const text = el.textContent;
        return {
          text,
          whiteSpace: cs.whiteSpace,
          textOverflow: cs.textOverflow,
          height: el.getBoundingClientRect().height,
          lineHeight: parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.3,
          clipped: el.scrollWidth > el.clientWidth,
        };
      });
      expect(info.text).not.toContain('\uFFFD');
      expect(info.text).not.toMatch(
        /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/,
      );
      expect(info.whiteSpace).toBe('nowrap');
      expect(info.textOverflow).toBe('ellipsis');
      expect(info.height).toBeLessThan(info.lineHeight * 1.6);
      expect(info.clipped).toBe(true);
    }
    // Счётчик непрочитанных: больше 99 — «99+».
    await expect(item(page, CHAT_IDS.secondary).getByTestId('chat-item-unread')).toHaveText('99+');
  });

  test('EC-N12: длинное имя — многоточие в шапке и списке, номер подзаголовком', async ({
    page,
  }) => {
    await login(page);
    const title = item(page, CHAT_IDS.secondary).getByTestId('chat-item-title');
    await expect(title).toHaveText(LONG_NAME);
    expect(await title.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
    await item(page, CHAT_IDS.secondary).click();
    const header = page.getByTestId('chat-title');
    await expect(header).toHaveAttribute('title', LONG_NAME);
    expect(await header.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
    const h = await box(page.getByTestId('chat-header'));
    expect(h.height).toBeLessThan(80);
    await expect(page.getByTestId('chat-subtitle')).toHaveText('+7 999 000-00-02');
  });

  test('клавиатура: фокус виден, Enter на пункте списка открывает чат', async ({ page }) => {
    await login(page);
    await page.getByTestId('logout-button').focus();
    await page.keyboard.press('Tab');
    const first = page.getByTestId('chat-item').first();
    await expect(first).toBeFocused();
    const outline = await first.evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(outline).toBe('solid');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('chat-window')).toBeVisible();
    await expect(first).toHaveAttribute('aria-current', 'true');
  });
});

test.describe('узкий экран (< 768 px, Д-6e)', () => {
  test.use({ viewport: NARROW });

  test('вход: карточка без горизонтального скролла', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('login-form')).toBeVisible();
    await expectNoHorizontalScroll(page);
    const card = await box(page.getByTestId('login-form'));
    expect(card.width).toBeLessThanOrEqual(NARROW.width);
  });

  test('одна колонка: список → чат → «Назад»; всё в ширину экрана', async ({ page }) => {
    await login(page);
    await expect(page.getByTestId('chat-list')).toBeVisible();
    await expect(page.getByTestId('chat-empty')).toBeHidden();
    // Баннеры видны и над списком.
    await expect(page.getByTestId('banner-p2')).toBeVisible();
    await expectNoHorizontalScroll(page);

    await item(page, CHAT_IDS.primary).click();
    await expect(page.getByTestId('chat-window')).toBeVisible();
    await expect(page.getByTestId('chat-list')).toBeHidden();
    await expect(page.getByTestId('chat-title')).toHaveText(NAMES.primary);
    const back = page.getByTestId('chat-back');
    await expect(back).toBeVisible();
    await expect(back).toBeFocused();
    await expect(page.getByTestId('banner-p2')).toBeVisible();
    // Поле ввода и «Отправить» помещаются в экран.
    const send = await box(page.getByTestId('send-button'));
    expect(send.x + send.width).toBeLessThanOrEqual(NARROW.width);
    expect(send.y + send.height).toBeLessThanOrEqual(NARROW.height);
    await expectNoHorizontalScroll(page);

    await back.click();
    await expect(page.getByTestId('chat-list')).toBeVisible();
    await expect(page.getByTestId('chat-window')).toBeHidden();
    await expect(item(page, CHAT_IDS.primary)).toBeFocused();
  });

  test('диалог «Новый чат» помещается в экран', async ({ page }) => {
    await login(page);
    await page.getByTestId('new-chat-button').click();
    const dialog = await box(page.getByTestId('new-chat-dialog'));
    expect(dialog.x).toBeGreaterThanOrEqual(0);
    expect(dialog.x + dialog.width).toBeLessThanOrEqual(NARROW.width);
    await expectNoHorizontalScroll(page);
  });
});
