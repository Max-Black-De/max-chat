import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { selectCanWrite, sortMessages, type StoredMessage } from '../../store';
import { formatDayLabel, withDaySeparators } from '../format';
import { useSession } from '../session/sessionContext';
import { UI_TEXTS } from '../texts';
import { MessageBubble } from './MessageBubble';
import { useMessages } from './messagesContext';
import { decideScroll, isAtBottom } from './scroll';

/**
 * Лента выбранного чата (§4.0 п. 2): сортировка по `timestamp` (§6.2), разделители дат перед
 * первым сообщением каждого дня (Д-6b), автопрокрутка к новому сообщению, если пользователь был
 * внизу, иначе кнопка «↓ новые сообщения» (п. 5.6).
 * Монтируется на чат (`key` = chatId): при открытии чата лента прокручена вниз.
 */
export function MessageList({ chatId }: { chatId: string }) {
  const { getChatMessages, ensureLoaded, retry } = useMessages();
  const { state: session } = useSession();
  const canWrite = selectCanWrite(session);

  useEffect(() => {
    ensureLoaded(chatId);
  }, [chatId, ensureLoaded]);

  const { messages } = getChatMessages(chatId);
  const sorted = useMemo(() => sortMessages(messages), [messages]);
  const items = useMemo(() => withDaySeparators(sorted), [sorted]);

  const listRef = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [scrollRequest, setScrollRequest] = useState(0);
  const [prev, setPrev] = useState<readonly StoredMessage[] | null>(null);

  // Новые сообщения — решение при рендере (данные прошлого рендера), прокрутка — в эффекте.
  if (prev !== sorted) {
    setPrev(sorted);
    const seen = new Set(prev?.map((m) => m.localId));
    const fresh = sorted.filter((m) => !seen.has(m.localId));
    const decision =
      prev === null
        ? 'scroll'
        : decideScroll({
            hasNewMessages: fresh.length > 0,
            newestIsOwnSending: fresh.some((m) => m.direction === 'out' && m.status === 'sending'),
            wasAtBottom: atBottom,
          });
    if (decision === 'scroll') {
      setScrollRequest((n) => n + 1);
      setShowNew(false);
    } else if (decision === 'showButton') setShowNew(true);
  }

  useLayoutEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [scrollRequest]);

  const onScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const bottom = isAtBottom(el);
    setAtBottom(bottom);
    if (bottom) setShowNew(false);
  }, []);

  const onRetry = useCallback(
    (localId: string) => {
      retry(chatId, localId);
    },
    [chatId, retry],
  );

  return (
    <div className="chat-body" data-testid="chat-body">
      <div
        className="message-list"
        ref={listRef}
        onScroll={onScroll}
        role="log"
        aria-label={UI_TEXTS.messagesLabel}
        data-testid="message-list"
      >
        {sorted.length === 0 ? (
          <p className="message-list__empty" data-testid="messages-empty">
            {UI_TEXTS.noMessages}
          </p>
        ) : (
          <ol className="message-list__items">
            {items.map((item) =>
              item.kind === 'day' ? (
                <li key={`day-${item.key}`} className="date-separator" data-testid="date-separator">
                  <time className="date-separator__label" dateTime={item.key}>
                    {formatDayLabel(item.timestamp)}
                  </time>
                </li>
              ) : (
                <MessageBubble
                  key={item.message.localId}
                  message={item.message}
                  canRetry={canWrite}
                  onRetry={onRetry}
                />
              ),
            )}
          </ol>
        )}
      </div>
      {showNew ? (
        <button
          type="button"
          className="message-list__new"
          onClick={() => {
            setShowNew(false);
            setAtBottom(true);
            setScrollRequest((n) => n + 1);
          }}
          data-testid="new-messages-button"
        >
          {UI_TEXTS.newMessages}
        </button>
      ) : null}
    </div>
  );
}
