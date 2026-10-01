import { describe, expect, it } from 'vitest';
import { hasInstanceId, isNotificationForInstance } from './instanceFilter';

describe('isNotificationForInstance (Р-5 v1.3.7, EC-I7)', () => {
  const body = (idInstance: unknown) => ({
    typeWebhook: 'incomingMessageReceived',
    instanceData: { idInstance, wid: '79990000000@c.us', typeInstance: 'v3' },
  });
  it('число из уведомления сравнивается со строкой сессии', () => {
    expect(isNotificationForInstance(body(1101000000), '1101000000')).toBe(true);
    expect(isNotificationForInstance(body('1101000000'), '1101000000')).toBe(true);
  });
  it('чужой idInstance — false', () => {
    expect(isNotificationForInstance(body(1101000001), '1101000000')).toBe(false);
    expect(isNotificationForInstance(body('1101000001'), '1101000000')).toBe(false);
  });
  it.each([
    null,
    undefined,
    'x',
    42,
    {},
    { instanceData: null },
    { instanceData: 'x' },
    { instanceData: {} },
    body(undefined),
    body(null),
  ])('нет instanceData или idInstance (%j) — проверка пропускается, true', (b) => {
    expect(hasInstanceId(b)).toBe(false);
    expect(isNotificationForInstance(b, '1101000000')).toBe(true);
  });
  it.each([body({}), body(true), body([])])(
    'idInstance есть, но не число и не строка (%j) — чужой',
    (b) => {
      expect(hasInstanceId(b)).toBe(true);
      expect(isNotificationForInstance(b, '1101000000')).toBe(false);
    },
  );
  it('пустой idInstance сессии при заданном idInstance уведомления — false', () => {
    expect(isNotificationForInstance(body(0), '')).toBe(false);
  });
});
