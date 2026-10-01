import { useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { UI_TEXTS } from '../texts';
import { useChats } from './chatsContext';

/**
 * Диалог «Новый чат» (§4.0 п. 3, ОР-2): поле номера с фокусом, «Создать», ошибка под полем.
 * Пока идёт checkAccount, «Создать», «Отмена» и Esc неактивны — второго запроса нет (EC-U7).
 * Запрос ограничен 15 с (п. 2.5, `CHECK_ACCOUNT_TIMEOUT_MS`), поэтому диалог не зависает.
 * При ошибке диалог остаётся с номером, «Создать» снова активна — это ручной повтор (ВА-7).
 * Модальный: фокус по Tab не уходит на фон; куда вернуть фокус после закрытия, решает MainScreen.
 */
/** Как закрыт диалог: «Отмена» / Esc или чат создан (для возврата фокуса, MainScreen). */
export type NewChatCloseReason = 'cancel' | 'created';

const FOCUSABLE = 'input:not([disabled]), button:not([disabled])';

export function NewChatDialog({ onClose }: { onClose: (reason: NewChatCloseReason) => void }) {
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
        onClose('created');
        return;
      }
      if (result.reason !== 'aborted') setError(result.error);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  // Модальный диалог: Tab и Shift+Tab не уходят из него на фон.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' && !busyRef.current) {
      onClose('cancel');
      return;
    }
    if (e.key !== 'Tab') return;
    const focusable = Array.from(e.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE));
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
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
              onClick={() => {
                onClose('cancel');
              }}
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
