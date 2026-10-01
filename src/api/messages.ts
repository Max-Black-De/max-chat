import { GreenApiErrorCode, isGreenApiError, isQuotaError } from './errors';
import type { QuotaSummary } from './quota';
import type { StateInstanceResult } from './clientTypes';

type StateInstance = StateInstanceResult['stateInstance'];

/**
 * Тексты для пользователя (ТЗ §4.1–§4.3, §5.4, §5.5). Без React — UI (F2–F6)
 * берёт отсюда строки. Ни один текст не содержит токен; `description` из 466
 * и `quotaExceeded` не используется (там чужие chatId).
 */

export const QUOTA_TEXTS = {
  /** 466 на sendMessage (`chats`) — под пузырём + баннер. */
  sendChats:
    'Не отправлено: исчерпан лимит бесплатного тарифа Developer — не больше 3 чатов в месяц, этот чат в него не входит. Напишите в уже используемый чат или смените тариф в личном кабинете GREEN-API',
  /** 466 на checkAccount (`checks`) — в диалоге «Новый чат». */
  checkAccountChecks:
    'Исчерпан месячный лимит проверок номеров (100 на тарифе Developer). Откройте уже созданный чат или повторите в следующем месяце',
  /** Уведомление `quotaExceeded` — закрываемый баннер вверху. */
  notificationBanner:
    'Лимит тарифа Developer исчерпан: новые чаты сверх 3 в месяц не работают — сообщения в них не отправляются и не приходят. Лимит обновляется 1-го числа',
} as const;

/** Текст для квоты в зависимости от места (§5.5). */
export function quotaText(
  quota: QuotaSummary,
  where: 'send' | 'checkAccount' | 'notification',
): string {
  if (where === 'notification') return QUOTA_TEXTS.notificationBanner;
  if (where === 'checkAccount' || quota.kind === 'checks') return QUOTA_TEXTS.checkAccountChecks;
  return QUOTA_TEXTS.sendChats;
}

/** Тексты по stateInstance при входе (§4.1 п. 1.6). `null` для `authorized`. */
export function stateInstanceText(state: StateInstance): string | null {
  switch (state) {
    case 'authorized':
      return null;
    case 'notAuthorized':
      return 'Инстанс не авторизован. Отсканируйте QR-код в личном кабинете';
    case 'starting':
      return 'Инстанс запускается, повторите через 1–5 минут';
    case 'blocked':
      return 'Аккаунт MAX заблокирован';
    case 'suspended':
      return 'На аккаунте временные ограничения: отправка только контактам';
    case 'pendingPassword':
      return 'Требуется пароль 2FA — завершите авторизацию в личном кабинете';
    default:
      return `Неизвестное состояние инстанса: ${state}`;
  }
}

/** Разрешён ли вход при данном stateInstance (§4.1 п. 1.6: `suspended` — вход с баннером). */
export function isLoginAllowed(state: StateInstance): boolean {
  return state === 'authorized' || state === 'suspended';
}

export const WEBHOOK_URL_SET_TEXT =
  'В настройках инстанса указан Webhook URL — получать сообщения в этом окне невозможно. Очистите поле Webhook URL в личном кабинете и подождите около минуты.';

/** Контекст, в котором показывается ошибка. */
export type ErrorContext = 'login' | 'session' | 'checkAccount' | 'send';

/**
 * Текст ошибки для пользователя по контексту. Для неизвестных ошибок —
 * общий текст. Никогда не возвращает токен.
 */
export function describeError(error: unknown, context: ErrorContext): string {
  if (!isGreenApiError(error)) return 'Неизвестная ошибка';
  if (isQuotaError(error))
    return quotaText(error.quota, context === 'checkAccount' ? 'checkAccount' : 'send');
  const C = GreenApiErrorCode;
  switch (error.code) {
    case C.UNAUTHORIZED:
      return 'Неверный apiTokenInstance';
    case C.FORBIDDEN:
      return 'Неверный idInstance или адрес API';
    case C.ACCOUNT_SUSPENDED:
      return 'Аккаунт ограничен: отправка только контактам';
    case C.INSTANCE_NOT_READY:
      return context === 'send'
        ? 'Инстанс не авторизован'
        : 'Инстанс не авторизован или запускается';
    case C.INSTANCE_EXPIRED:
      return 'Инстанс просрочен или удалён — проверьте его в личном кабинете GREEN-API';
    case C.WEBHOOK_URL_SET:
      return WEBHOOK_URL_SET_TEXT;
    case C.CHECK_LIMIT:
      return 'Слишком много проверок номеров, повторите позже';
    case C.BAD_REQUEST:
      return error.reason ?? 'Сервер отклонил запрос';
    case C.RATE_LIMITED:
      return 'Слишком много запросов, повторите позже';
    case C.NETWORK:
    case C.TIMEOUT:
      return context === 'login' && error.apiUrl
        ? `Не удалось связаться с ${error.apiUrl}. Проверьте адрес API`
        : context === 'send'
          ? 'Не отправлено: нет соединения с сервером'
          : 'Нет соединения';
    case C.ABORTED:
      return 'Запрос отменён';
    case C.CHAT_ID_NOT_ALLOWED:
      return 'Отправка в этот чат запрещена настройками приложения';
    case C.INVALID_ARGUMENT:
      return 'Некорректные данные запроса';
    default:
      return context === 'send' ? 'Не отправлено' : 'Ошибка сервера GREEN-API, повторите позже';
  }
}
