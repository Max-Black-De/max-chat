/**
 * Р-5, Д-3/EC-I7: уведомление с `instanceData.idInstance`, не равным idInstance сессии, не
 * показывается и удаляется. Сравнение строками (`instanceData.idInstance` приходит числом).
 * Чистый предикат для F5: `true` — уведомление этого инстанса; нет `instanceData` / битое — `false`.
 */
export function isNotificationForInstance(body: unknown, idInstance: string): boolean {
  if (typeof body !== 'object' || body === null) return false;
  const data = (body as { instanceData?: unknown }).instanceData;
  if (typeof data !== 'object' || data === null) return false;
  const id = (data as { idInstance?: unknown }).idInstance;
  if (typeof id !== 'number' && typeof id !== 'string') return false;
  return idInstance !== '' && String(id) === idInstance;
}
