/**
 * ВА-20, §6.3 п. 5, EC-D5: при загрузке страницы и при выходе сообщения в статусе «отправляется»
 * получают «не отправлено» с текстом «Статус неизвестен…»; автоповтора нет, «Повторить» доступна.
 * Чистая функция — хранилище сообщений (F3/F4) вызывает её при чтении из localStorage и на выходе.
 */
import { SEND_TEXTS } from '../api';

export interface RecoverableMessage {
  /** У входящих статуса нет. */
  status?: string | undefined;
  errorText?: string | undefined;
}

/** Возвращает тот же массив, если менять нечего (для дешёвого сравнения в сторе). */
export function failSendingMessages<M extends RecoverableMessage>(
  messages: readonly M[],
): readonly M[] {
  if (!messages.some((m) => m.status === 'sending')) return messages;
  return messages.map((m) =>
    m.status === 'sending' ? { ...m, status: 'error', errorText: SEND_TEXTS.statusUnknown } : m,
  );
}
