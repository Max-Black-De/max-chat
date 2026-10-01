/**
 * Р-5, Д-3/EC-I7 (v1.3.7): уведомление чужое, только если `instanceData.idInstance` есть и не
 * равен idInstance сессии. Сравнение строками (`instanceData.idInstance` приходит числом).
 * Нет `instanceData` или в нём нет `idInstance` — проверка пропускается, уведомление
 * обрабатывается как обычно (`true`). Чистый предикат для F5.
 */
export function isNotificationForInstance(body: unknown, idInstance: string): boolean {
  return !hasInstanceId(body) || instanceIdOf(body) === idInstance;
}

/** Есть ли в body `instanceData.idInstance` (любое значение, кроме `undefined` / `null`). */
export function hasInstanceId(body: unknown): boolean {
  if (typeof body !== 'object' || body === null) return false;
  const data = (body as { instanceData?: unknown }).instanceData;
  if (typeof data !== 'object' || data === null) return false;
  const id = (data as { idInstance?: unknown }).idInstance;
  return id !== undefined && id !== null;
}

/** `instanceData.idInstance` строкой; не число и не строка — `null` (такое считается чужим). */
function instanceIdOf(body: unknown): string | null {
  const id = (body as { instanceData: { idInstance: unknown } }).instanceData.idInstance;
  return typeof id === 'number' || typeof id === 'string' ? String(id) : null;
}
