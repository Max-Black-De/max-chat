/**
 * Маршрутизация body уведомления (ТЗ §5.3, §5.5, Р-5, Р-11, Р-14, Р-15). Чистая функция:
 * принимает `unknown`, никогда не бросает исключение, сеть и React не трогает.
 *
 * Итог — что сделать с уведомлением до `deleteNotification` (удаляется оно всегда):
 * - `message` — сообщение личного чата для слияния в ленту (§6.3); известен ли чат, решает
 *   вызывающий код (`applyNotification` → `unknownChat`, EC-N2/N3);
 * - `quota` — `quotaExceeded`: баннер квоты, в ленты ничего не добавляется (§5.5);
 * - `ignore` — не показывать: чужой инстанс, группа / канал / бот, статус, смена состояния,
 *   неизвестный тип, битое body. `type` — безопасный для лога тип уведомления.
 *
 * Из `senderData` берутся только `chatId`, `chatType` и `chatName`: `senderPhoneNumber`,
 * `sender`, `senderName` не читаются и не попадают ни в результат, ни в лог (Р-11, v1.3.6).
 */
import { parseQuotaExceededNotification, type QuotaSummary } from '../api';
import { extractMessageText } from './extractText';
import { isNotificationForInstance } from './instanceFilter';

/** Откуда сообщение: входящее, отправлено с телефона, отправлено через API (§5.3). */
export type RoutedMessageSource = 'incoming' | 'outgoingPhone' | 'outgoingApi';

/** Сообщение для ленты. Совпадает по форме с `NotificationMessage` стора (F4). */
export interface RoutedMessage {
  chatId: string;
  /** Только строка: 18-значные id теряют точность в Number (EC-I1). */
  idMessage: string;
  source: RoutedMessageSource;
  /** Текст; у заглушки — пустая строка (caption и прочее содержимое не сохраняются, Р-11). */
  text: string;
  /** Секунды (как в уведомлении). */
  timestamp: number;
  /** Нетекстовое сообщение — пузырь-заглушка (Р-11, EC-N6). */
  unsupported?: true;
}

export type IgnoreReason =
  /** Чужой `instanceData.idInstance` (Р-5, EC-I7). */
  | 'foreignInstance'
  /** Группа, канал, бот или нет `chatType` у входящего (Р-5, EC-N1, EC-N4). */
  | 'notPersonalChat'
  /** `outgoingMessageStatus` — в MVP не показывается (Р-14, EC-N10). */
  | 'status'
  /** `stateInstanceChanged` (Р-14, EC-N10). */
  | 'stateChanged'
  /** Неизвестный `typeWebhook` (EC-N5). */
  | 'unknownType'
  /** Не объект, нет `senderData` / `chatId`, `idMessage` не строка, нет `timestamp` (EC-N7). */
  | 'malformed';

export type RoutedNotification =
  | { kind: 'message'; message: RoutedMessage; chatName?: string; type: string }
  | { kind: 'quota'; quota: QuotaSummary; type: 'quotaExceeded' }
  | { kind: 'ignore'; reason: IgnoreReason; type: string };

export interface RouteContext {
  /** idInstance текущей сессии (строкой). */
  idInstance: string;
}

const MESSAGE_SOURCES: Readonly<Record<string, RoutedMessageSource>> = {
  incomingMessageReceived: 'incoming',
  outgoingMessageReceived: 'outgoingPhone',
  outgoingAPIMessageReceived: 'outgoingApi',
};

const SAFE_TYPE = /^[A-Za-z]{1,40}$/;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Тип уведомления для лога: только латинские буквы до 40 символов, иначе `unknown`.
 * Так в лог не попадёт ни текст, ни номер, ни chatId из битого body (Р-5, НФТ-3).
 */
export function notificationTypeForLog(body: unknown): string {
  const t = isRecord(body) ? body.typeWebhook : undefined;
  return typeof t === 'string' && SAFE_TYPE.test(t) ? t : 'unknown';
}

export function routeNotification(body: unknown, ctx: RouteContext): RoutedNotification {
  const type = notificationTypeForLog(body);
  if (!isRecord(body) || typeof body.typeWebhook !== 'string')
    return { kind: 'ignore', reason: 'malformed', type };
  if (!isNotificationForInstance(body, ctx.idInstance))
    return { kind: 'ignore', reason: 'foreignInstance', type };

  const typeWebhook = body.typeWebhook;
  if (typeWebhook === 'quotaExceeded') {
    const quota = parseQuotaExceededNotification(body) ?? { kind: 'chats', source: 'fallback' };
    return { kind: 'quota', quota, type: 'quotaExceeded' };
  }
  if (typeWebhook === 'outgoingMessageStatus') return { kind: 'ignore', reason: 'status', type };
  if (typeWebhook === 'stateInstanceChanged')
    return { kind: 'ignore', reason: 'stateChanged', type };

  const source = MESSAGE_SOURCES[typeWebhook];
  if (!source) return { kind: 'ignore', reason: 'unknownType', type };

  const sender = body.senderData;
  if (!isRecord(sender)) return { kind: 'ignore', reason: 'malformed', type };
  const chatType = sender.chatType;
  // Входящее — только из личного чата (§5.3). У исходящих `chatType` может не быть; если есть
  // и это не `user` (группа, канал, бот), тоже не показываем (Р-5, EC-N1, EC-N4).
  if (source === 'incoming' ? chatType !== 'user' : chatType !== undefined && chatType !== 'user')
    return { kind: 'ignore', reason: 'notPersonalChat', type };

  const chatId = sender.chatId;
  const idMessage = body.idMessage;
  const timestamp = body.timestamp;
  if (
    typeof chatId !== 'string' ||
    !chatId ||
    typeof idMessage !== 'string' ||
    !idMessage ||
    typeof timestamp !== 'number' ||
    !Number.isFinite(timestamp)
  )
    return { kind: 'ignore', reason: 'malformed', type };

  const extracted = extractMessageText(body.messageData);
  const message: RoutedMessage =
    extracted.kind === 'text'
      ? { chatId, idMessage, source, text: extracted.text, timestamp }
      : // Р-11: от нетекстового сообщения не берём ничего, кроме факта (caption, превью, ссылки).
        { chatId, idMessage, source, text: '', timestamp, unsupported: true };

  // Р-15, EC-N12: непустое имя личного чата — из входящих и из исходящих.
  const chatName = sender.chatName;
  return typeof chatName === 'string' && chatName.trim()
    ? { kind: 'message', message, chatName, type }
    : { kind: 'message', message, type };
}
