/**
 * Надписи интерфейса F2 (§4.0, §4.1). Тексты ошибок и баннеров — в `api/messages.ts`.
 * Строки в «» взяты из ТЗ; остальные (подписи загрузки, кнопка закрытия) — решение фронтенда.
 */
export const UI_TEXTS = {
  appTitle: 'MAX Chat',
  loginTitle: 'Вход в MAX Chat',
  loginSubtitle: 'Учётные данные инстанса GREEN-API',
  idInstanceLabel: 'ID инстанса (idInstance)',
  tokenLabel: 'Токен (apiTokenInstance)',
  apiUrlLabel: 'Адрес API (apiUrl)',
  advanced: 'Дополнительно',
  showToken: 'показать',
  hideToken: 'скрыть',
  submit: 'Войти',
  submitting: 'Проверяем…',
  restoring: 'Восстанавливаем сессию…',
  cabinetLink: 'Личный кабинет GREEN-API',
  cabinetUrl: 'https://console.green-api.com',
  logout: 'Выйти',
  newChat: 'Новый чат',
  recheck: 'Проверить снова',
  closeBanner: 'Закрыть',
  emptyChat: 'Выберите чат или создайте новый',
  /** Диалог «Новый чат» (§4.0 п. 3). */
  phoneLabel: 'Номер телефона',
  phonePlaceholder: '+7 999 123-45-67',
  create: 'Создать',
  cancel: 'Отмена',
  /** Не из ТЗ: пустой список чатов и подписи для доступности. */
  noChats: 'Чатов пока нет',
  chatListLabel: 'Чаты',
  unreadLabel: 'Непрочитанные',
  /** Окно чата (§4.0 п. 2, п. 3.1–3.5, п. 5.6). */
  send: 'Отправить',
  retry: 'Повторить',
  statusSending: 'отправляется',
  statusError: 'не отправлено',
  newMessages: '↓ новые сообщения',
  /** Не из ТЗ: подсказка в поле ввода и подписи для доступности. */
  composerPlaceholder: 'Сообщение',
  composerLabel: 'Текст сообщения',
  messagesLabel: 'Сообщения',
  noMessages: 'Сообщений пока нет',
  /** Разделители дат в ленте (Д-6b). */
  today: 'Сегодня',
  yesterday: 'Вчера',
  /** Узкий экран (Д-6e): одна колонка, из чата — «Назад» к списку. */
  back: 'Назад',
  backLabel: 'Назад к списку чатов',
  /** Не из ТЗ: подпись к idInstance в шапке списка. */
  instanceLabel: 'Инстанс',
} as const;
