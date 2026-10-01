import { describe, expect, it } from 'vitest';
import {
  SESSION_CREDENTIALS_KEY,
  clearCredentials,
  loadCredentials,
  saveCredentials,
} from '../sessionCredentials';
import { TEST_API_URL, TEST_ID_INSTANCE, TEST_TOKEN, memoryStorage } from '../../test/greenApiMock';

const CREDS = { idInstance: TEST_ID_INSTANCE, apiTokenInstance: TEST_TOKEN, apiUrl: TEST_API_URL };

describe('учётные данные в sessionStorage (Р-2, НФТ-3)', () => {
  it('сохранение, чтение, очистка', () => {
    const b = memoryStorage();
    expect(saveCredentials(CREDS, b)).toBe(true);
    expect(SESSION_CREDENTIALS_KEY).toBe('maxchat:session:v1');
    expect(loadCredentials(b)).toEqual(CREDS);
    clearCredentials(b);
    expect(loadCredentials(b)).toBeNull();
  });

  it('по умолчанию — window.sessionStorage, не localStorage', () => {
    sessionStorage.clear();
    localStorage.clear();
    saveCredentials(CREDS);
    expect(sessionStorage.getItem(SESSION_CREDENTIALS_KEY)).not.toBeNull();
    expect(localStorage.length).toBe(0);
    clearCredentials();
    expect(sessionStorage.getItem(SESSION_CREDENTIALS_KEY)).toBeNull();
  });

  it('мусор и неполные данные → null; лишние поля не читаются', () => {
    for (const raw of [
      '{',
      'null',
      '[]',
      '{"idInstance":"1"}',
      '{"idInstance":"","apiTokenInstance":"t","apiUrl":"u"}',
    ])
      expect(loadCredentials(memoryStorage({ [SESSION_CREDENTIALS_KEY]: raw }))).toBeNull();
    const extra = JSON.stringify({ ...CREDS, evil: 1 });
    expect(loadCredentials(memoryStorage({ [SESSION_CREDENTIALS_KEY]: extra }))).toEqual(CREDS);
  });

  it('sessionStorage бросает / недоступен — без исключений', () => {
    const throwing = {
      getItem: () => {
        throw new Error('x');
      },
      setItem: () => {
        throw new Error('x');
      },
      removeItem: () => {
        throw new Error('x');
      },
    };
    expect(loadCredentials(throwing)).toBeNull();
    expect(saveCredentials(CREDS, throwing)).toBe(false);
    expect(() => {
      clearCredentials(throwing);
    }).not.toThrow();
    expect(loadCredentials(null)).toBeNull();
    expect(saveCredentials(CREDS, null)).toBe(false);
  });
});
