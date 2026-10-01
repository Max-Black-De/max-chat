/**
 * notifications/ — разбор body уведомлений в доменные события (задача F5, ТЗ §5.3, Д-5).
 *
 * Будет содержать (чистые функции, без сети и React):
 * - `parseNotification(unknown)` — рантайм-разбор на type guards без `any`;
 *   неизвестное / битое → ветка «unknown» (только удалить из очереди);
 * - маршрутизацию по `typeWebhook` (таблица §5.3): incoming / outgoing / outgoingAPI →
 *   сообщение в известном личном чате; группы, каналы, неизвестные чаты, статусы,
 *   stateInstanceChanged → игнор (Р-5, Р-14); quotaExceeded → событие квоты (§5.5);
 * - извлечение текста из `messageData` (§5.3, порядок 1–5) с заглушкой для нетекстовых (Р-11).
 *
 * Покрытие тестами ≥ 80 % (НФТ-9, Д-2), фикстуры — с условными значениями (НФТ-11).
 */
export { extractMessageText, type ExtractedText } from './extractText';
