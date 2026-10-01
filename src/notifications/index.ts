/**
 * notifications/ — разбор body уведомлений в доменные события (задача F5, ТЗ §5.3, Д-5).
 *
 * Чистые функции, без сети и React:
 * - `routeNotification(unknown, { idInstance })` — рантайм-разбор на type guards без `any` и
 *   маршрутизация по `typeWebhook` (таблица §5.3): incoming / outgoing / outgoingAPI →
 *   сообщение личного чата; группы, каналы, боты, чужой инстанс, статусы,
 *   stateInstanceChanged, неизвестные и битые → игнор (Р-5, Р-14); quotaExceeded → квота (§5.5);
 * - `extractMessageText` — текст из `messageData` (§5.3, порядок 1–5), заглушка для
 *   нетекстовых (Р-11);
 * - `isNotificationForInstance` — фильтр чужого idInstance (Р-5, EC-I7);
 * - `notificationTypeForLog` — безопасный для лога тип уведомления.
 *
 * Покрытие тестами ≥ 80 % (НФТ-9, Д-2), фикстуры — с условными значениями (НФТ-11).
 */
export { extractMessageText, type ExtractedText } from './extractText';
export { isNotificationForInstance } from './instanceFilter';
export {
  notificationTypeForLog,
  routeNotification,
  type IgnoreReason,
  type RouteContext,
  type RoutedMessage,
  type RoutedMessageSource,
  type RoutedNotification,
} from './route';
