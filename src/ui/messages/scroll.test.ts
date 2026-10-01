import { describe, expect, it } from 'vitest';
import { BOTTOM_THRESHOLD_PX, decideScroll, isAtBottom } from './scroll';

describe('автопрокрутка (п. 5.6)', () => {
  it('isAtBottom — с допуском', () => {
    expect(isAtBottom({ scrollTop: 700, scrollHeight: 1000, clientHeight: 300 })).toBe(true);
    expect(
      isAtBottom({
        scrollTop: 700 - BOTTOM_THRESHOLD_PX,
        scrollHeight: 1000,
        clientHeight: 300,
      }),
    ).toBe(true);
    expect(
      isAtBottom({
        scrollTop: 699 - BOTTOM_THRESHOLD_PX,
        scrollHeight: 1000,
        clientHeight: 300,
      }),
    ).toBe(false);
    // Лента короче окна — всегда «внизу».
    expect(isAtBottom({ scrollTop: 0, scrollHeight: 200, clientHeight: 300 })).toBe(true);
  });

  it.each([
    [{ hasNewMessages: false, newestIsOwnSending: false, wasAtBottom: false }, 'none'],
    [{ hasNewMessages: false, newestIsOwnSending: false, wasAtBottom: true }, 'none'],
    [{ hasNewMessages: true, newestIsOwnSending: false, wasAtBottom: true }, 'scroll'],
    [{ hasNewMessages: true, newestIsOwnSending: true, wasAtBottom: false }, 'scroll'],
    [{ hasNewMessages: true, newestIsOwnSending: false, wasAtBottom: false }, 'showButton'],
  ] as const)('decideScroll(%o) = %s', (input, expected) => {
    expect(decideScroll(input)).toBe(expected);
  });
});
