import { describe, expect, it } from 'vitest';
import {
  buildMaskedUrl,
  buildMethodUrl,
  normalizeApiUrl,
  validateApiUrl,
  validateCredentials,
} from '../url';
import { DEFAULT_API_URL } from '../constants';
import { GreenApiError, GreenApiErrorCode } from '../errors';
import { createGreenApiClient } from '../client';
import {
  FAKE_CREDS,
  FAKE_TOKEN,
  makeClient,
  mockFetch,
  blockRealNetwork,
  callAt,
  asGreenApiError,
} from '../../test/apiHelpers';

blockRealNetwork();

describe('построение URL (§5.1)', () => {
  it('обрезает хвостовые / и пробелы у apiUrl (Р-1)', () => {
    expect(normalizeApiUrl(' https://api.example.test/// ')).toBe('https://api.example.test');
    expect(normalizeApiUrl('https://api.example.test')).toBe('https://api.example.test');
  });

  it('формат {apiUrl}/waInstance{id}/{method}/{token}, без /v3', () => {
    expect(buildMethodUrl(FAKE_CREDS, 'getStateInstance')).toBe(
      `https://api.example.test/waInstance110000000042/getStateInstance/${FAKE_TOKEN}`,
    );
  });

  it('query receiveTimeout и сегмент receiptId', () => {
    expect(
      buildMethodUrl(FAKE_CREDS, 'receiveNotification', { query: { receiveTimeout: 20 } }),
    ).toBe(
      `https://api.example.test/waInstance110000000042/receiveNotification/${FAKE_TOKEN}?receiveTimeout=20`,
    );
    expect(buildMethodUrl(FAKE_CREDS, 'deleteNotification', { pathSuffix: [12345] })).toBe(
      `https://api.example.test/waInstance110000000042/deleteNotification/${FAKE_TOKEN}/12345`,
    );
  });

  it('apiUrl с путём (например, /v3) сохраняется', () => {
    expect(
      buildMethodUrl({ ...FAKE_CREDS, apiUrl: 'https://api.example.test/v3/' }, 'getSettings'),
    ).toBe(`https://api.example.test/v3/waInstance110000000042/getSettings/${FAKE_TOKEN}`);
  });

  it('токен с небезопасными символами кодируется', () => {
    expect(buildMethodUrl({ ...FAKE_CREDS, apiTokenInstance: 'ab/cd?ef' }, 'getSettings')).toBe(
      'https://api.example.test/waInstance110000000042/getSettings/ab%2Fcd%3Fef',
    );
  });

  it('замаскированный URL содержит *** вместо токена', () => {
    const masked = buildMaskedUrl(FAKE_CREDS, 'deleteNotification', { pathSuffix: [7] });
    expect(masked).toBe('https://api.example.test/waInstance110000000042/deleteNotification/***/7');
    expect(masked).not.toContain(FAKE_TOKEN);
  });

  it('validateCredentials', () => {
    expect(validateCredentials(FAKE_CREDS)).toBeNull();
    expect(validateCredentials({ ...FAKE_CREDS, idInstance: '11a' })).toMatch(/digits/);
    expect(validateCredentials({ ...FAKE_CREDS, idInstance: '' })).toMatch(/digits/);
    expect(validateCredentials({ ...FAKE_CREDS, apiUrl: 'not a url' })).toMatch(/URL/);
    expect(validateCredentials({ ...FAKE_CREDS, apiUrl: 'ftp://x.test' })).toMatch(/https:/);
    expect(validateCredentials({ ...FAKE_CREDS, apiUrl: 'http://x.test' })).toMatch(/https:/);
    expect(validateCredentials({ ...FAKE_CREDS, apiUrl: 'https://x.test/?a=1' })).toMatch(/query/);
    expect(validateCredentials({ ...FAKE_CREDS, apiTokenInstance: '' })).toMatch(
      /apiTokenInstance/,
    );
  });

  it('validateApiUrl: только https:, пусто → адрес по умолчанию (п. 1.2, ВА-2)', () => {
    const ERR = 'Введите адрес вида https://3100.api.green-api.com';
    expect(validateApiUrl('')).toEqual({ ok: true, apiUrl: DEFAULT_API_URL });
    expect(validateApiUrl('   ')).toEqual({ ok: true, apiUrl: DEFAULT_API_URL });
    expect(validateApiUrl(undefined)).toEqual({ ok: true, apiUrl: 'https://api.green-api.com' });
    expect(validateApiUrl(' https://3100.api.green-api.com// ')).toEqual({
      ok: true,
      apiUrl: 'https://3100.api.green-api.com',
    });
    expect(validateApiUrl('HTTPS://3100.api.green-api.com')).toMatchObject({ ok: true });
    for (const bad of [
      'http://3100.api.green-api.com',
      'HTTP://3100.api.green-api.com',
      'ftp://3100.api.green-api.com',
      '3100.api.green-api.com',
      'not a url',
      'https://3100.api.green-api.com/?a=1',
      'https://3100.api.green-api.com/#x',
      'https://user:pass@3100.api.green-api.com',
      'javascript:alert(1)',
    ]) {
      expect(validateApiUrl(bad)).toEqual({ ok: false, error: ERR });
    }
  });

  it('клиент с http:// не создаётся (токен идёт в URL)', () => {
    let e: unknown;
    try {
      createGreenApiClient({ ...FAKE_CREDS, apiUrl: 'http://api.example.test' });
    } catch (x) {
      e = x;
    }
    expect(e).toBeInstanceOf(GreenApiError);
    expect(asGreenApiError(e).code).toBe(GreenApiErrorCode.INVALID_ARGUMENT);
  });

  it('клиент использует нормализованный URL и правильные HTTP-методы', async () => {
    const m = mockFetch(
      { body: { stateInstance: 'authorized' } },
      { body: { webhookUrl: '' } },
      { body: { exist: true, chatId: '10000002', fromCache: false } },
      { body: { idMessage: '1790000000123' } },
      { body: '' },
      { body: { result: true, reason: '' } },
    );
    const c = makeClient(m.fetch);
    await c.getStateInstance();
    await c.getSettings();
    await c.checkAccount('79991234567');
    await c.sendMessage({ chatId: '10000002', message: 'Привет' });
    await c.receiveNotification();
    await c.deleteNotification(42);
    const base = `https://api.example.test/waInstance110000000042`;
    expect(m.calls.map((x) => [x.init.method, x.url])).toEqual([
      ['GET', `${base}/getStateInstance/${FAKE_TOKEN}`],
      ['GET', `${base}/getSettings/${FAKE_TOKEN}`],
      ['POST', `${base}/checkAccount/${FAKE_TOKEN}`],
      ['POST', `${base}/sendMessage/${FAKE_TOKEN}`],
      ['GET', `${base}/receiveNotification/${FAKE_TOKEN}?receiveTimeout=20`],
      ['DELETE', `${base}/deleteNotification/${FAKE_TOKEN}/42`],
    ]);
    for (const call of m.calls) expect(call.init.credentials).toBe('omit');
    // Content-Type — только у POST; других заголовков нет (§5.1).
    expect(callAt(m.calls, 0).init.headers).toBeUndefined();
    expect(callAt(m.calls, 2).init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(callAt(m.calls, 5).init.headers).toBeUndefined();
  });
});
