import { blockRealNetwork } from './helpers';
import { describe, expect, it } from 'vitest';
import { GreenApiError, GreenApiErrorCode as C, type GreenApiErrorCode } from '../errors';
import {
  describeError,
  isLoginAllowed,
  stateInstanceText,
  WEBHOOK_URL_SET_TEXT,
} from '../messages';

blockRealNetwork();

const err = (
  code: GreenApiErrorCode,
  extra: Partial<ConstructorParameters<typeof GreenApiError>[0]> = {},
) => new GreenApiError({ code, method: 'getStateInstance', retry: 'none', ...extra });

describe('тексты ошибок для UI (§4.1 п. 1.5, §4.2 п. 2.8, §4.3 п. 3.6)', () => {
  it('вход', () => {
    expect(describeError(err(C.UNAUTHORIZED), 'login')).toBe('Неверный apiTokenInstance');
    expect(describeError(err(C.FORBIDDEN), 'login')).toBe('Неверный idInstance или адрес API');
    expect(describeError(err(C.NETWORK, { apiUrl: 'https://api.example.test' }), 'login')).toBe(
      'Не удалось связаться с https://api.example.test. Проверьте адрес API',
    );
  });

  it('отправка', () => {
    expect(describeError(err(C.ACCOUNT_SUSPENDED), 'send')).toBe(
      'Аккаунт ограничен: отправка только контактам',
    );
    expect(describeError(err(C.INSTANCE_NOT_READY), 'send')).toBe('Инстанс не авторизован');
    expect(describeError(err(C.SERVER), 'send')).toBe('Не отправлено');
  });

  it('новый чат', () => {
    expect(describeError(err(C.CHECK_LIMIT), 'checkAccount')).toBe(
      'Слишком много проверок номеров, повторите позже',
    );
    expect(describeError(err(C.INSTANCE_NOT_READY), 'checkAccount')).toBe(
      'Инстанс не авторизован или запускается',
    );
    expect(
      describeError(
        err(C.BAD_REQUEST, { reason: "Validation failed: 'phoneNumber'" }),
        'checkAccount',
      ),
    ).toBe("Validation failed: 'phoneNumber'");
  });

  it('опрос', () => {
    expect(describeError(err(C.WEBHOOK_URL_SET), 'session')).toBe(WEBHOOK_URL_SET_TEXT);
    expect(describeError(err(C.NETWORK), 'session')).toBe('Нет соединения');
    expect(describeError(new Error('x'), 'session')).toBe('Неизвестная ошибка');
  });

  it('stateInstance (§4.1 п. 1.6)', () => {
    expect(stateInstanceText('authorized')).toBeNull();
    expect(stateInstanceText('notAuthorized')).toMatch(/QR-код/);
    expect(stateInstanceText('starting')).toMatch(/1–5 минут/);
    expect(stateInstanceText('blocked')).toBe('Аккаунт MAX заблокирован');
    expect(stateInstanceText('suspended')).toMatch(/только контактам/);
    expect(stateInstanceText('pendingPassword')).toMatch(/2FA/);
    expect(isLoginAllowed('authorized')).toBe(true);
    expect(isLoginAllowed('suspended')).toBe(true);
    expect(isLoginAllowed('starting')).toBe(false);
  });
});
