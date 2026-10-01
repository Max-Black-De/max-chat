/**
 * Условные значения для фикстур и моков (НФТ-11, CONTRIBUTING «Безопасность данных»).
 *
 * Репозиторий публичный: реальные chatId, номера, idInstance, имена, idMessage, ссылки
 * и токены сюда не попадают. Все фикстуры строятся только из этих констант;
 * `fixtures.test.ts` проверяет это вайтлистом.
 *
 * Модуль без зависимостей от vitest/jsdom — его можно импортировать и из Playwright.
 */

/** idInstance — строкой (как в форме входа) и числом (как в `instanceData.idInstance`). */
export const ID_INSTANCE = '1101000000';
export const ID_INSTANCE_NUMBER = 1101000000;

/** Условный токен. Никогда не настоящий. */
export const API_TOKEN = 'your-api-token';

/** Условный apiUrl (поддомен по первым 4 цифрам условного idInstance). */
export const API_URL = 'https://1101.api.green-api.com';

/** Время: UNIX-секунды. Все timestamp фикстур — `BASE_TIMESTAMP + n`. */
export const BASE_TIMESTAMP = 1790000000;

/** Номера (integer, как в `senderPhoneNumber` и теле checkAccount). */
export const PHONES = {
  /** Свой аккаунт инстанса (`wid`). */
  own: 79990000000,
  /** Собеседник чата `CHAT_IDS.primary`. */
  primary: 79990000001,
  /** Собеседник чата `CHAT_IDS.secondary`. */
  secondary: 79990000002,
  /** «Новый получатель» (Р-26 п. 5) — номера нет в кеше. */
  newRecipient: 79990000003,
  /** Участник группы (в одном групповом сообщении спайка пришёл реальный номер участника). */
  groupMember: 79990000005,
  /** Номер РБ (Р-10): 12 цифр с 375. */
  belarus: 375290000001,
} as const;

/** Свой аккаунт инстанса в формате `wid` (это не чат). */
export const OWN_WID = `${String(PHONES.own)}@c.us`;

/** chatId — всегда строки. Личные — 8 цифр, группы и каналы — отрицательные, 15 символов. */
export const CHAT_IDS = {
  /** Основной известный личный чат (в e2e Д-2 — чат, созданный по `+7 999 000-00-01`). */
  primary: '10000000',
  /** Второй известный личный чат (подъём наверх, одинаковый idMessage в разных чатах). */
  secondary: '10000001',
  /** Личный чат, которого нет в списке приложения (Р-5). */
  unknown: '10000002',
  /** Чат «нового получателя» (Р-26 п. 5) — на моках даёт 466. */
  newRecipient: '10000003',
  /** Чат с `chatType: "bot"`. */
  bot: '10000004',
  /** Участник группы (`sender` в групповом сообщении). */
  groupMember: '10000005',
  /** Собственный аккаунт инстанса (`sender` в исходящих уведомлениях). */
  own: '10000009',
  /** Группа (`chatType: "group"`). */
  group: '-100000000000000',
  /** Канал (`chatType: "channel"`, `sender === chatId`). */
  channel: '-100000000000001',
} as const;

/** Формат, который приложение **никогда** не отправляет (Р-26 п. 2, §5.5). Только для негативных тестов. */
export const FORBIDDEN_C_US_CHAT_ID = `${String(PHONES.primary)}@c.us`;

/** Условные имена (Р-15: `chatName` личного чата заменяет заголовок). */
export const NAMES = {
  primary: 'Тестовый Пользователь',
  secondary: 'Тестовый Пользователь 2',
  unknown: 'Тестовый Незнакомец',
  bot: 'Тестовый Бот',
  groupMember: 'Тестовый Участник',
  own: 'Тестовый Аккаунт',
  group: 'Тестовая Группа',
  channel: 'Тестовый Канал',
} as const;

/**
 * idMessage — всегда строки.
 * - через API (sendMessage / outgoingAPIMessageReceived) — 13 цифр, миллисекунды:
 *   `floor(idMessage / 1000) === timestamp` [проверено];
 * - входящие и с телефона — 18 цифр [проверено]; в Number теряют точность.
 */
export const ID_MESSAGES = {
  api1: '1790000000000',
  api2: '1790000060000',
  /** Ответ sendMessage, для которого уведомление приходит раньше ответа (гонка §6.3). */
  apiRace: '1790000120000',
  incoming1: '100000000000000001',
  /** Отличается от `incoming1` на 1 — в Number оба превращаются в одно и то же число. */
  incoming2: '100000000000000002',
  incoming3: '100000000000000003',
  phone1: '100000000000000101',
  group1: '100000000000000201',
  /** У части изображений из канала idMessage 13-значный [проверено]. */
  channel1: '1790000300000',
  quotedStanza: '100000000000000301',
} as const;

/** Условные ссылки на медиа (настоящие ссылки хранилища в репозиторий не кладутся). */
export const MEDIA_URL_BASE = 'https://media.example.test/files';

/** Условный «Webhook URL» для П-1. */
export const WEBHOOK_URL = 'https://webhook.example.test/green-api';
