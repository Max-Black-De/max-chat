import { avatarInitial, avatarTone } from '../format';

/** Круглый аватар с первой буквой заголовка. Декоративный: `aria-hidden`, имя читается рядом. */
export function Avatar({
  chatId,
  title,
  size = 'md',
}: {
  chatId: string;
  title: string;
  size?: 'md' | 'sm';
}) {
  return (
    <span
      className={`avatar avatar--${String(avatarTone(chatId))} avatar--${size}`}
      aria-hidden="true"
      data-testid="chat-avatar"
    >
      {avatarInitial(title)}
    </span>
  );
}
