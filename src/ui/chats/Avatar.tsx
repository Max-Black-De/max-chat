import { avatarInitial, avatarTone } from '../format';

/**
 * Круглый аватар с первой буквой заголовка. Декоративный: `aria-hidden`, имя читается рядом.
 * Размер задаёт CSS по месту (список — 48 px, шапка чата — 40 px).
 */
export function Avatar({ chatId, title }: { chatId: string; title: string }) {
  return (
    <span
      className={`avatar avatar--${String(avatarTone(chatId))}`}
      aria-hidden="true"
      data-testid="chat-avatar"
    >
      {avatarInitial(title)}
    </span>
  );
}
