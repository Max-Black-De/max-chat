// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { resolveBasePath } from './base-path.ts';

describe('resolveBasePath', () => {
  it.each([
    [undefined, '/'],
    ['', '/'],
    ['  ', '/'],
    ['/', '/'],
    ['/max-chat/', '/max-chat/'],
    ['max-chat', '/max-chat/'],
    ['/max-chat', '/max-chat/'],
    [' /a//b/ ', '/a/b/'],
  ])('%j → %s', (raw, expected) => {
    expect(resolveBasePath(raw)).toBe(expected);
  });
});
