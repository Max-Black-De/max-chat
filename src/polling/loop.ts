/**
 * Цикл опроса очереди (ТЗ §6.1, §5.4, Р-20): receive → handle → delete, строго один receive в
 * полёте. Чистый TypeScript, без React: клиент, обработчик, пауза и отмена — снаружи.
 *
 * Правило таймеров (EC-P17, §6.1 п. 5): цикл — `async`-функция с `await fetch`; пауза backoff —
 * `await` одного таймера, который ставится только после того, как запрос завершился. Без
 * `setInterval` и без таймера из колбэка другого таймера.
 *
 * Поздние ответы (EC-S7, EC-P16, §6.1 п. 3): после каждого `await` проверяется отмена и номер
 * сессии; ответ, пришедший после выхода или смены сессии, не обрабатывается и не удаляется.
 */
import {
  GreenApiErrorCode,
  isGreenApiError,
  isQuotaError,
  isSessionInvalidError,
  type GreenApiClient,
} from '../api';
import {
  BACKOFF_INITIAL_MS,
  BACKOFF_MAX_MS,
  EMPTY_RECEIVE_MIN_MS,
  EMPTY_RECEIVE_PAUSE_MS,
  NOT_AUTHORIZED_PAUSE_MS,
} from './constants';

/** Почему цикл остановился. */
export type PollStopReason =
  /** Отмена (выход, размонтирование, потеря замка) или ответ чужой / прошлой сессии. */
  | 'aborted'
  /** 401 / 403 / expired / deleted: сессию завершает контроллер (EC-P13). */
  | 'sessionInvalid'
  /** 400 `custom webhook url is set` на receive или delete: П-1 (EC-P12). */
  | 'webhookUrlSet';

/** Что делать после ошибки receive (§5.4). */
export type ReceiveErrorAction =
  | { kind: 'stop'; reason: PollStopReason }
  /** Тело не JSON, но `receiptId` извлечён: удалить и сразу дальше (§5.4, ВА-18). */
  | { kind: 'delete'; receiptId: number }
  /** `instance is starting or not authorized`: пауза 30 с (EC-P11). */
  | { kind: 'pause'; ms: number }
  /** Сеть, таймаут, 429, 466, 499, 5xx, непустой не-JSON без receiptId и прочее (EC-P2, EC-P8). */
  | { kind: 'backoff' };

export function classifyReceiveError(error: unknown): ReceiveErrorAction {
  if (!isGreenApiError(error)) return { kind: 'backoff' };
  if (error.code === GreenApiErrorCode.ABORTED || error.code === GreenApiErrorCode.SESSION_CLOSED)
    return { kind: 'stop', reason: 'aborted' };
  if (isSessionInvalidError(error)) return { kind: 'stop', reason: 'sessionInvalid' };
  if (error.code === GreenApiErrorCode.WEBHOOK_URL_SET)
    return { kind: 'stop', reason: 'webhookUrlSet' };
  if (error.code === GreenApiErrorCode.INVALID_JSON && error.receiptId !== undefined)
    return { kind: 'delete', receiptId: error.receiptId };
  if (error.code === GreenApiErrorCode.INSTANCE_NOT_READY || error.retry === 'pause')
    return { kind: 'pause', ms: NOT_AUTHORIZED_PAUSE_MS };
  return { kind: 'backoff' };
}

/** Пауза после `failures` подряд неудачных receive (с нуля): 1 → 2 → 4 → 8 → 16 → 30 → 30 с. */
export function backoffDelay(failures: number): number {
  const n = Math.max(0, Math.floor(failures));
  return Math.min(BACKOFF_INITIAL_MS * 2 ** Math.min(n, 30), BACKOFF_MAX_MS);
}

function abortError(): DOMException {
  return new DOMException('The operation was aborted.', 'AbortError');
}

/**
 * Пауза с отменой. Один таймер на паузу: `AbortSignal.timeout(ms)` (если есть), иначе один
 * `setTimeout`. Отмена `signal` → отказ с `AbortError`.
 */
export function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    let cleanup: () => void = () => undefined;
    const onAbort = () => {
      cleanup();
      reject(abortError());
    };
    const done = () => {
      cleanup();
      resolve();
    };
    if (typeof AbortSignal.timeout === 'function') {
      const timer = AbortSignal.timeout(ms);
      timer.addEventListener('abort', done, { once: true });
      cleanup = () => {
        timer.removeEventListener('abort', done);
        signal?.removeEventListener('abort', onAbort);
      };
    } else {
      const id = globalThis.setTimeout(done, ms);
      cleanup = () => {
        globalThis.clearTimeout(id);
        signal?.removeEventListener('abort', onAbort);
      };
    }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export type PollSleep = (ms: number, signal: AbortSignal) => Promise<void>;
export type PollWarn = (message: string, data?: Record<string, unknown>) => void;

export interface PollLoopOptions {
  client: Pick<GreenApiClient, 'receiveNotification' | 'deleteNotification'>;
  /**
   * Обработка body (маршрутизация и слияние в ленту). Ошибка обработчика цикл не прерывает,
   * уведомление всё равно удаляется (§6.1 п. 2.3, EC-P3).
   */
  handle: (body: unknown) => void | Promise<void>;
  /** Отмена: выход, размонтирование, потеря замка (§6.1 п. 3). */
  signal: AbortSignal;
  /** Текущая ли ещё сессия (EC-S7). По умолчанию — да. */
  isCurrent?: () => boolean;
  /** Пауза backoff и 30 с. По умолчанию `abortableSleep`. */
  sleep?: PollSleep;
  /** Лог без персональных данных: только коды, статусы, тип уведомления. */
  warn?: PollWarn;
  /** Часы, мс (для тестов). По умолчанию `Date.now`. */
  now?: () => number;
}

/** Безопасные для лога поля ошибки API: без текста сервера, URL и номеров. */
function errorForLog(error: unknown): Record<string, unknown> {
  if (!isGreenApiError(error)) return { error: error instanceof Error ? error.name : 'unknown' };
  return {
    code: error.code,
    method: error.method,
    ...(error.httpStatus !== undefined ? { httpStatus: error.httpStatus } : {}),
  };
}

/**
 * Цикл опроса до остановки. Никогда не бросает исключение: итог — причина остановки.
 * Сброс backoff — после любого успешного receive.
 */
export async function runPollLoop(options: PollLoopOptions): Promise<PollStopReason> {
  const { client, handle, signal } = options;
  const isCurrent = options.isCurrent ?? (() => true);
  const sleep = options.sleep ?? abortableSleep;
  const warn = options.warn ?? (() => undefined);
  const now = options.now ?? (() => Date.now());
  const alive = () => !signal.aborted && isCurrent();
  let failures = 0;

  /**
   * `null` — продолжать, `backoff` — пауза перед следующим receive (466 на delete — событие
   * очереди, §5.4, v1.3.7), иначе — остановиться с этой причиной.
   */
  async function remove(receiptId: number): Promise<PollStopReason | 'backoff' | null> {
    try {
      // Повторы (1 → 2 → 4 с), «уже удалено» и 500 findUnAckedMessage — внутри клиента (ВА-17).
      await client.deleteNotification(receiptId, { signal });
      return alive() ? null : 'aborted';
    } catch (e) {
      if (!alive()) return 'aborted';
      const action = classifyReceiveError(e);
      if (action.kind === 'stop') return action.reason;
      warn('GREEN-API deleteNotification failed', errorForLog(e));
      if (isQuotaError(e)) return 'backoff';
      // После неудачных повторов — следующий receive; повтор уведомления погасит дедуп (EC-P4).
      return null;
    }
  }

  /** Удалить и решить, что дальше: `null` — продолжать, иначе — стоп. */
  async function removeAndContinue(receiptId: number): Promise<PollStopReason | null> {
    const next = await remove(receiptId);
    if (next !== 'backoff') return next;
    return (await pause(backoffDelay(failures++))) ? null : 'aborted';
  }

  async function pause(ms: number): Promise<boolean> {
    try {
      await sleep(ms, signal);
    } catch {
      return false;
    }
    return alive();
  }

  while (alive()) {
    let received: Awaited<ReturnType<typeof client.receiveNotification>>;
    const startedAt = now();
    try {
      received = await client.receiveNotification({ signal });
    } catch (e) {
      if (!alive()) return 'aborted';
      const action = classifyReceiveError(e);
      if (action.kind === 'stop') return action.reason;
      if (action.kind === 'delete') {
        failures = 0;
        warn('GREEN-API notification is not JSON, deleted', { type: 'invalidJson' });
        const stop = await removeAndContinue(action.receiptId);
        if (stop) return stop;
        continue;
      }
      const ms = action.kind === 'pause' ? action.ms : backoffDelay(failures++);
      warn('GREEN-API receiveNotification failed', { ...errorForLog(e), retryInMs: ms });
      // Пауза ставится здесь — после завершения запроса (EC-P17).
      if (!(await pause(ms))) return 'aborted';
      continue;
    }
    if (!alive()) return 'aborted';
    failures = 0;
    if (received === null) {
      // Пустой ответ — следующий receive (EC-P1). Пришёл быстрее 1 с — сервер не держит long
      // polling: пауза 1 с одним таймером после завершения запроса (§6.1 п. 2.2, п. 5; v1.3.7).
      if (now() - startedAt < EMPTY_RECEIVE_MIN_MS && !(await pause(EMPTY_RECEIVE_PAUSE_MS)))
        return 'aborted';
      continue;
    }
    try {
      await handle(received.body);
    } catch (e) {
      warn('Notification handler failed', { error: e instanceof Error ? e.name : 'unknown' });
    }
    if (!alive()) return 'aborted';
    const stop = await removeAndContinue(received.receiptId);
    if (stop) return stop;
  }
  return 'aborted';
}
