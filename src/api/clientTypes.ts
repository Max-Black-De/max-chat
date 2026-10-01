/**
 * Типы конфигурации и результатов клиента F1 — дополнение к контракту `./types`.
 * Здесь только то, чего нет в контракте: опции клиента и формы результатов, которые
 * клиент гарантирует (контракт описывает «идеальные» ответы сервера).
 */
import type {
  Credentials,
  DeleteNotificationResponse,
  GetSettingsResponse,
  ReceiptId,
  StateInstance,
} from './types';

/** Минимальный логгер. По умолчанию клиент ничего не логирует; в лог идут только замаскированные URL. */
export interface GreenApiLogger {
  debug?: (message: string, details?: Record<string, unknown>) => void;
  warn?: (message: string, details?: Record<string, unknown>) => void;
}

/** Таймеры (для тестов с фейковым временем). По умолчанию — глобальные. */
export interface GreenApiTimers {
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (id: unknown) => void;
}

export interface GreenApiClientConfig extends Omit<Credentials, 'apiUrl'> {
  /** По умолчанию `DEFAULT_API_URL` (`https://api.green-api.com`, Р-1). Хвостовой `/` обрезается. */
  apiUrl?: string;
  /** Реализация fetch. По умолчанию `globalThis.fetch`. */
  fetch?: typeof fetch;
  /** Таймаут HTTP-запроса по умолчанию, мс (`REQUEST_TIMEOUT_MS`, 30 с; Р-20). Переопределяется per-call. */
  timeoutMs?: number;
  timers?: GreenApiTimers;
  /**
   * Пауза между встроенными повторами (sendMessage 429, deleteNotification). Должна
   * завершаться отказом при отмене `signal`. По умолчанию — на `timers`.
   */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  logger?: GreenApiLogger;
  /**
   * Необязательный белый список chatId для sendMessage (защита на тарифе Developer, Р-26).
   * Не задан — разрешён любой личный chatId. Реальные chatId в код не зашиваются.
   */
  allowedChatIds?: readonly string[];
}

/** Параметры отдельного вызова (есть у каждого метода). */
export interface RequestOptions {
  /** Отмена запроса (выход, размонтирование, остановка опроса — F5). */
  signal?: AbortSignal;
  /** Таймаут этого вызова, мс. */
  timeoutMs?: number;
}

export interface ReceiveOptions extends RequestOptions {
  /** Long polling, 5–60 с; по умолчанию `RECEIVE_TIMEOUT_SEC` (20). */
  receiveTimeout?: number;
}

/** Ответ getStateInstance: неизвестное значение не роняет клиент, а приходит строкой. */
export interface StateInstanceResult {
  stateInstance: StateInstance | (string & {});
}

/** Ответ getSettings: сервер может прислать не все поля — проверять каждое (`!== "yes"`). */
export type InstanceSettings = Partial<GetSettingsResponse>;

/**
 * Результат receiveNotification. `body` — `unknown`: §5.4 требует удалить даже
 * уведомление с неожиданной структурой, поэтому клиент гарантирует только `receiptId`,
 * а разбор `body` в `NotificationBody` — задача `notifications/` (F5, Д-5).
 */
export interface RawReceivedNotification {
  receiptId: ReceiptId;
  body: unknown;
}

/** deleteNotification: `alreadyDeleted` — `result:false` или 500 `findUnAckedMessage` (§5.4). */
export interface DeleteNotificationResult extends DeleteNotificationResponse {
  alreadyDeleted: boolean;
}
