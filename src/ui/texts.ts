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
} as const;
