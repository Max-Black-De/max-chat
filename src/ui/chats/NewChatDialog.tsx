import { useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { UI_TEXTS } from '../texts';
import { useChats } from './chatsContext';

/**
 * Диалог «Новый чат» (§4.0 п. 3, ОР-2): поле номера с фокусом, «Создать», ошибка под полем.
 * Пока идёт checkAccount, «Создать» и закрытие неактивны — второго запроса нет (EC-U7).
 * При ошибке диалог остаётся с номером, «Создать» снова активна — это ручной повтор (ВА-7).
 */
export function NewChatDialog({ onClose }: { onClose: () => void }) {
  const { createChat } = useChats();
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const inputId = useId();
  const errorId = useId();
  const titleId = useId();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await createChat(phone);
      if (result.ok) {
        onClose();
        return;
      }
      if (result.reason !== 'aborted') setError(result.error);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && !busyRef.current) onClose();
  };

  return (
    <div className="dialog-backdrop" data-testid="new-chat-backdrop">
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
        data-testid="new-chat-dialog"
      >
        <h2 className="dialog__title" id={titleId}>
          {UI_TEXTS.newChat}
        </h2>
        <form onSubmit={(e) => void submit(e)} noValidate data-testid="new-chat-form">
          <div className="field">
            <label htmlFor={inputId}>{UI_TEXTS.phoneLabel}</label>
            <input
              id={inputId}
              type="tel"
              inputMode="tel"
              autoComplete="off"
              autoFocus
              placeholder={UI_TEXTS.phonePlaceholder}
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
              }}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              data-testid="new-chat-phone"
            />
            {error ? (
              <span className="field__error" id={errorId} role="alert" data-testid="new-chat-error">
                {error}
              </span>
            ) : null}
          </div>
          <div className="dialog__actions">
            <button
              type="button"
              className="button button--ghost"
              onClick={onClose}
              disabled={busy}
              data-testid="new-chat-cancel"
            >
              {UI_TEXTS.cancel}
            </button>
            <button
              type="submit"
              className="button button--primary"
              disabled={busy}
              aria-busy={busy}
              data-testid="new-chat-submit"
            >
              {busy ? (
                <span className="spinner" aria-hidden="true" data-testid="new-chat-spinner" />
              ) : null}
              {UI_TEXTS.create}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
