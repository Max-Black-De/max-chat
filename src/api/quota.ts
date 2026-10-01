import type { QuotaKind } from './types';
import type { GreenApiMethod } from './url';

/**
 * Разбор квоты тарифа Developer: тело 466 (три формата) и уведомление
 * `quotaExceeded` (§5.5).
 */

/** Где нашлись данные квоты. `fallback` — тело не JSON/не распознано. */
export type QuotaSource = 'invokeStatus' | 'correspondentsStatus' | 'quotaData' | 'fallback';

/**
 * Сводка квоты (в отличие от сырого `QuotaInfo` из контракта — без `description`).
 * Безопасные для лога поля квоты: только method/used/total/status (§5.5).
 * `description` (со списком чужих chatId) сюда намеренно не попадает.
 */
export interface QuotaSummary {
  kind: QuotaKind;
  source: QuotaSource;
  method?: string;
  used?: number;
  total?: number;
  status?: string;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** `used`/`total` бывают string и number — принимаем оба (§5.5). */
function toCount(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && /^\s*\d+\s*$/.test(v)) return Number(v);
  return undefined;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

function fallbackKind(calledMethod: GreenApiMethod | undefined): QuotaKind {
  return calledMethod === 'checkAccount' ? 'checks' : 'chats';
}

function build(
  kind: QuotaKind,
  source: QuotaSource,
  raw: Record<string, unknown> | undefined,
): QuotaSummary {
  const info: QuotaSummary = { kind, source };
  if (raw) {
    const method = str(raw.method);
    const used = toCount(raw.used);
    const total = toCount(raw.total);
    const status = str(raw.status);
    if (method !== undefined) info.method = method;
    if (used !== undefined) info.used = used;
    if (total !== undefined) info.total = total;
    if (status !== undefined) info.status = status;
  }
  return info;
}

/**
 * Разбор тела ответа 466. `body` — уже распарсенный JSON или `undefined`,
 * если тело не JSON. Вид квоты (§5.5):
 * - `checks`: `invokeStatus.method === "checkAccount"` или 466 на checkAccount с нераспознанным телом;
 * - `chats`: есть `correspondentsStatus`, или `quotaData.method === "correspondents"`,
 *   или 466 на sendMessage (и прочих методах) с нераспознанным телом.
 */
export function parseQuota466Body(body: unknown, calledMethod?: GreenApiMethod): QuotaSummary {
  if (isRecord(body)) {
    const invoke = body.invokeStatus;
    if (isRecord(invoke)) {
      const m = str(invoke.method);
      const kind: QuotaKind =
        m === 'checkAccount'
          ? 'checks'
          : m === 'correspondents'
            ? 'chats'
            : fallbackKind(calledMethod);
      return build(kind, 'invokeStatus', invoke);
    }
    const corr = body.correspondentsStatus;
    if (isRecord(corr)) return build('chats', 'correspondentsStatus', corr);
    const qd = body.quotaData;
    if (isRecord(qd)) {
      const m = str(qd.method);
      const kind: QuotaKind =
        m === 'correspondents'
          ? 'chats'
          : m === 'checkAccount'
            ? 'checks'
            : fallbackKind(calledMethod);
      return build(kind, 'quotaData', qd);
    }
  }
  return build(fallbackKind(calledMethod), 'fallback', undefined);
}

/**
 * Разбор тела уведомления из очереди. Возвращает QuotaSummary, если это
 * `typeWebhook === "quotaExceeded"`, иначе null. `timestamp` не требуется (§5.5).
 */
export function parseQuotaExceededNotification(body: unknown): QuotaSummary | null {
  if (!isRecord(body) || body.typeWebhook !== 'quotaExceeded') return null;
  const qd = body.quotaData;
  if (!isRecord(qd)) return { kind: 'chats', source: 'fallback' };
  const m = str(qd.method);
  return build(m === 'checkAccount' ? 'checks' : 'chats', 'quotaData', qd);
}
