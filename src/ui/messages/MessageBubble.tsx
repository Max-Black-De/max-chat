import { memo } from 'react';
import { BANNER_TEXTS } from '../../api';
import type { StoredMessage } from '../../store';
import { formatTime, isoDateTime } from '../format';
import { UI_TEXTS } from '../texts';

/**
 * Пузырь сообщения (§4.0 п. 2): свои — справа, входящие — слева, время `HH:MM` (EC-O1), у
 * своих статус «отправляется» / «не отправлено» («отправлено» — без значка, п. 3.3).
 *
 * Текст — только текстом React (без HTML и markdown, ссылки не кликабельны — Р-16, EC-U4),
 * переносы сохраняет CSS `white-space: pre-wrap`. `dir="auto"` — только у элемента с текстом,
 * не у контейнера, чтобы RTL-текст не переворачивал «свои справа» (EC-U5).
 */
export const MessageBubble = memo(function MessageBubble({
  message,
  canRetry,
  onRetry,
}: {
  message: StoredMessage;
  canRetry: boolean;
  onRetry: (localId: string) => void;
}) {
  const own = message.direction === 'out';
  const status = own ? message.status : undefined;
  return (
    <li
      className={`message message--${own ? 'out' : 'in'}`}
      data-testid="message"
      data-direction={message.direction}
      data-status={status}
      data-local-id={message.localId}
    >
      <div className={`message__bubble${status === 'error' ? ' message__bubble--error' : ''}`}>
        {message.unsupported ? (
          <p
            className="message__text message__text--unsupported"
            dir="auto"
            data-testid="message-text"
          >
            {BANNER_TEXTS.unsupportedMessage}
          </p>
        ) : (
          <p className="message__text" dir="auto" data-testid="message-text">
            {message.text}
          </p>
        )}
        <div className="message__meta">
          <time
            className="message__time"
            dateTime={isoDateTime(message.timestamp)}
            data-testid="message-time"
          >
            {formatTime(message.timestamp)}
          </time>
          {status === 'sending' ? (
            <span className="message__status" data-testid="message-status">
              {UI_TEXTS.statusSending}
            </span>
          ) : null}
          {status === 'error' ? (
            <span className="message__status message__status--error" data-testid="message-status">
              {UI_TEXTS.statusError}
            </span>
          ) : null}
        </div>
      </div>
      {status === 'error' ? (
        <div className="message__error" role="alert">
          {message.errorText ? (
            <span className="message__error-text" data-testid="message-error">
              {message.errorText}
            </span>
          ) : null}
          <button
            type="button"
            className="button button--link message__retry"
            disabled={!canRetry}
            onClick={() => {
              onRetry(message.localId);
            }}
            data-testid="message-retry"
          >
            {UI_TEXTS.retry}
          </button>
        </div>
      ) : null}
    </li>
  );
});
