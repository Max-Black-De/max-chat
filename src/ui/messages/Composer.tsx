import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import {
  COUNTER_VISIBLE_FROM,
  SESSION_TEXTS,
  checkComposerText,
  composerCounter,
  selectCanWrite,
} from '../../store';
import { useSession } from '../session/sessionContext';
import { UI_TEXTS } from '../texts';
import { useMessages } from './messagesContext';

/**
 * Поле ввода и «Отправить» (§4.0 п. 2, п. 3.1, п. 3.5):
 * - многострочное; Enter — отправить, Shift+Enter — перенос; во время набора через IME
 *   (`isComposing`) Enter не отправляет (EC-U6);
 * - пустой текст или только пробелы — кнопка неактивна (EC-U1); длина — `text.length`,
 *   больше 4000 — кнопка неактивна, счётчик «N/4000» (EC-U2); текст уходит как есть, без trim;
 * - вкладка «только чтение» — поле и кнопка неактивны, подсказка (EC-S4).
 * Монтируется на чат (`key` = chatId).
 */
export function Composer({ chatId }: { chatId: string }) {
  const { send } = useMessages();
  const { state: session } = useSession();
  const canWrite = selectCanWrite(session);
  const [text, setText] = useState('');
  const composing = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const check = checkComposerText(text);
  const showCounter = check.length >= COUNTER_VISIBLE_FROM;

  function submit() {
    if (!canWrite || !check.canSend) return;
    if (send(chatId, text)) {
      setText('');
      inputRef.current?.focus();
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== 'Enter' || e.shiftKey) return;
    if (e.nativeEvent.isComposing || composing.current) return;
    e.preventDefault();
    submit();
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    submit();
  }

  return (
    <form className="composer" onSubmit={onSubmit} data-testid="composer">
      <div className="composer__row">
        <textarea
          ref={inputRef}
          className="composer__input"
          rows={1}
          value={text}
          disabled={!canWrite}
          placeholder={UI_TEXTS.composerPlaceholder}
          aria-label={UI_TEXTS.composerLabel}
          aria-invalid={check.tooLong || undefined}
          onChange={(e) => {
            setText(e.target.value);
          }}
          onKeyDown={onKeyDown}
          onCompositionStart={() => {
            composing.current = true;
          }}
          onCompositionEnd={() => {
            composing.current = false;
          }}
          data-testid="composer-input"
        />
        <div className="composer__actions">
          {showCounter ? (
            <span
              className={`composer__counter${check.tooLong ? ' composer__counter--over' : ''}`}
              aria-live="polite"
              data-testid="composer-counter"
            >
              {composerCounter(check.length)}
            </span>
          ) : null}
          <button
            type="submit"
            className="button button--primary composer__send"
            disabled={!canWrite || !check.canSend}
            title={canWrite ? undefined : SESSION_TEXTS.otherTabReadOnly}
            data-testid="send-button"
          >
            {UI_TEXTS.send}
          </button>
        </div>
      </div>
      {canWrite ? null : (
        <p className="composer__hint" data-testid="composer-readonly-hint">
          {SESSION_TEXTS.otherTabReadOnly}
        </p>
      )}
    </form>
  );
}
