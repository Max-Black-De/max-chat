import { describe, expect, it } from 'vitest';
import { failSendingMessages } from '../sendingRecovery';

interface Msg {
  localId: string;
  status: 'sending' | 'sent' | 'error';
  errorText?: string;
}

describe('failSendingMessages (ВА-20, §6.3 п. 5, EC-D5)', () => {
  it('sending → error с текстом «Статус неизвестен…», остальные без изменений', () => {
    const msgs: Msg[] = [
      { localId: 'a', status: 'sent' },
      { localId: 'b', status: 'sending' },
      { localId: 'c', status: 'error', errorText: 'x' },
    ];
    const out = failSendingMessages(msgs);
    expect(out).toEqual([
      { localId: 'a', status: 'sent' },
      {
        localId: 'b',
        status: 'error',
        errorText:
          'Статус неизвестен: возможно, сообщение уже доставлено. Проверьте в MAX, прежде чем повторять',
      },
      { localId: 'c', status: 'error', errorText: 'x' },
    ]);
    expect(out[0]).toBe(msgs[0]);
    expect(msgs[1]?.status).toBe('sending'); // вход не мутируется
  });
  it('нет «отправляется» → тот же массив', () => {
    const msgs: Msg[] = [{ localId: 'a', status: 'sent' }];
    expect(failSendingMessages(msgs)).toBe(msgs);
    expect(failSendingMessages([])).toEqual([]);
  });
});
