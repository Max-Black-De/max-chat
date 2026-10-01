import { describe, expect, it } from 'vitest';
import { isNotificationForInstance } from './instanceFilter';

describe('isNotificationForInstance (Р-5, EC-I7)', () => {
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
  });
  it.each([null, undefined, 'x', 42, {}, { instanceData: null }, body(undefined), body({})])(
    'битое body %j — false',
    (b) => {
      expect(isNotificationForInstance(b, '1101000000')).toBe(false);
    },
  );
  it('пустой idInstance сессии — false', () => {
    expect(isNotificationForInstance(body(0), '')).toBe(false);
  });
});
