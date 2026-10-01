/**
 * Отправка сообщения (F4, ОР-3, п. 3.2–3.6) без React: проверка поля ввода и вызов sendMessage.
 *
 * Повторы 429 (до 3 раз, `Retry-After` или 1 → 2 → 4 с) делает сам клиент F1 — всё это время
 * сообщение «отправляется» (ВА-8, EC-T7). Остальные ошибки не повторяются: текст под пузырём —
 * `describeError(e, 'send')`, «Повторить» — ручной повтор (EC-D6). Баннеры (квота 466,
 * «инстанс не авторизован», выход по 401/403) показывает сессия по исходу вызова клиента.
 *
 * В тексте ошибки номер и chatId маскируются (`redactPersonalData`): текст сервера из 400
 * попадает под пузырь как есть (ВА-10), а он может содержать chatId.
 */
import {
  describeError,
  FALLBACK_TEXTS,
  MAX_MESSAGE_LENGTH,
  messageLength,
  redactPersonalData,
  type ChatId,
  type GreenApiClient,
} from '../api';

export interface ComposerCheck {
  /** `text.length` — UTF-16, emoji = 2 (п. 3.5, ВА-14). */
  length: number;
  tooLong: boolean;
  /** Пустой текст или только пробелы и переносы — нельзя (EC-U1). */
  blank: boolean;
  canSend: boolean;
}

/** Состояние кнопки «Отправить» (п. 3.5): текст при этом отправляется как есть, без trim. */
export function checkComposerText(text: string): ComposerCheck {
  const length = messageLength(text);
  const tooLong = length > MAX_MESSAGE_LENGTH;
  const blank = text.trim() === '';
  return { length, tooLong, blank, canSend: !blank && !tooLong };
}

/** Счётчик «N/4000» виден с этой длины (и всегда, если лимит превышен). */
export const COUNTER_VISIBLE_FROM = Math.floor(MAX_MESSAGE_LENGTH * 0.9);

export function composerCounter(length: number): string {
  return `${String(length)}/${String(MAX_MESSAGE_LENGTH)}`;
}

export type SendOutcome = { ok: true; idMessage: string } | { ok: false; errorText: string };

/** Один вызов sendMessage (п. 3.2): только `chatId` из checkAccount, текст без изменений. */
export async function sendChatMessage(
  client: GreenApiClient | null,
  chatId: ChatId,
  text: string,
  signal?: AbortSignal,
): Promise<SendOutcome> {
  if (!client) return { ok: false, errorText: FALLBACK_TEXTS.sendGeneric };
  try {
    const { idMessage } = await client.sendMessage(
      { chatId, message: text },
      signal ? { signal } : {},
    );
    return { ok: true, idMessage };
  } catch (e) {
    return { ok: false, errorText: redactPersonalData(describeError(e, 'send')) };
  }
}
