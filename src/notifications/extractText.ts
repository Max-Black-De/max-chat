/**
 * Извлечение текста из `messageData` (ТЗ §5.3, порядок 1–5). Чистая функция:
 * принимает `unknown` и никогда не бросает исключение.
 */

/** Результат: текст или заглушка «Сообщение этого типа не поддерживается» (Р-11). */
export type ExtractedText =
  { kind: 'text'; text: string } | { kind: 'unsupported'; typeMessage: string | null };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function field(obj: unknown, key: string): unknown {
  return isRecord(obj) ? obj[key] : undefined;
}

export function extractMessageText(messageData: unknown): ExtractedText {
  const typeMessage = field(messageData, 'typeMessage');
  const t = typeof typeMessage === 'string' ? typeMessage : null;
  let text: unknown;
  if (t === 'textMessage') {
    // 1. Поле quotedMessage рядом игнорируется (Р-17).
    text = field(field(messageData, 'textMessageData'), 'textMessage');
  } else if (t === 'extendedTextMessage' || t === 'quotedMessage') {
    // 2–3. extendedTextMessageData.text.
    text = field(field(messageData, 'extendedTextMessageData'), 'text');
  }
  // 4–5. Прочие типы, нет поля или не строка → заглушка.
  return typeof text === 'string'
    ? { kind: 'text', text }
    : { kind: 'unsupported', typeMessage: t };
}
