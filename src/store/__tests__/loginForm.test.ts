import { describe, expect, it } from 'vitest';
import { apiUrlHostWarning, isGreenApiHost, validateLoginForm } from '../loginForm';

const ok = { idInstance: ' 1101000000 ', apiTokenInstance: ' tok ', apiUrl: '' };

describe('validateLoginForm (п. 1.2, ВА-2, EC-T8, EC-T9)', () => {
  it('значения обрезаются, пустой apiUrl → по умолчанию', () => {
    expect(validateLoginForm(ok)).toEqual({
      ok: true,
      credentials: {
        idInstance: '1101000000',
        apiTokenInstance: 'tok',
        apiUrl: 'https://api.green-api.com',
      },
      hostWarning: null,
    });
  });
  it('пустые поля → «Заполните поле»; idInstance не из цифр', () => {
    expect(validateLoginForm({ idInstance: ' ', apiTokenInstance: '', apiUrl: '' })).toEqual({
      ok: false,
      errors: { idInstance: 'Заполните поле', apiTokenInstance: 'Заполните поле' },
    });
    expect(validateLoginForm({ ...ok, idInstance: '11a' })).toEqual({
      ok: false,
      errors: { idInstance: 'ID инстанса — только цифры' },
    });
  });
  it('длина idInstance не проверяется', () => {
    expect(validateLoginForm({ ...ok, idInstance: '1' }).ok).toBe(true);
    expect(validateLoginForm({ ...ok, idInstance: '1'.repeat(30) }).ok).toBe(true);
  });
  it('http:// и мусор в apiUrl → ошибка у поля', () => {
    for (const apiUrl of ['http://api.green-api.com', 'api.green-api.com', 'ftp://x'])
      expect(validateLoginForm({ ...ok, apiUrl })).toEqual({
        ok: false,
        errors: { apiUrl: 'Введите адрес вида https://3100.api.green-api.com' },
      });
  });
  it('хвостовые / срезаются, /v3 допустим, чужой хост — предупреждение без блокировки', () => {
    const r1 = validateLoginForm({ ...ok, apiUrl: 'https://3100.api.green-api.com/v3//' });
    expect(r1).toMatchObject({
      ok: true,
      credentials: { apiUrl: 'https://3100.api.green-api.com/v3' },
      hostWarning: null,
    });
    const r2 = validateLoginForm({ ...ok, apiUrl: 'https://proxy.example/' });
    expect(r2).toMatchObject({ ok: true, credentials: { apiUrl: 'https://proxy.example' } });
    expect(r2.ok && r2.hostWarning).toBe(
      'Адрес не похож на сервер GREEN-API: токен будет отправлен на proxy.example. Продолжайте, только если уверены',
    );
  });
});

describe('isGreenApiHost / apiUrlHostWarning (EC-T9: граница домена)', () => {
  it.each([
    ['api.green-api.com', true],
    ['3100.api.green-api.com', true],
    ['green-api.com', true],
    ['greenapi.com', true],
    ['x.greenapi.com.', true],
    ['API.GREEN-API.COM', true],
    ['evilgreen-api.com', false],
    ['xgreen-api.com', false],
    ['green-api.com.example.test', false],
    ['greenapi.co', false],
  ])('%s → %s', (host, expected) => {
    expect(isGreenApiHost(host)).toBe(expected);
  });
  it('некорректный адрес — ошибка поля, не предупреждение', () => {
    expect(apiUrlHostWarning('http://evil.example')).toBeNull();
    expect(apiUrlHostWarning('')).toBeNull();
    expect(apiUrlHostWarning('https://evilgreen-api.com')).toMatch(/evilgreen-api\.com/);
  });
});
