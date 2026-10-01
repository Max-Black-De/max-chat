import { TOKEN_MASK } from './mask';
import type { ApiMethodName, Credentials } from './types';

/** Методы GREEN-API, которые вызывает клиент (§5.2). */
export type GreenApiMethod = ApiMethodName;

/** Обрезает пробелы и хвостовые `/` у apiUrl (Р-1). */
export function normalizeApiUrl(apiUrl: string): string {
  return apiUrl.trim().replace(/\/+$/, '');
}

/** Проверка формата учётных данных. Возвращает текст проблемы или null. */
export function validateCredentials(c: Credentials): string | null {
  const apiUrl = normalizeApiUrl(c.apiUrl);
  let parsed: URL;
  try {
    parsed = new URL(apiUrl);
  } catch {
    return 'apiUrl is not a valid URL';
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return 'apiUrl must be http(s)';
  if (parsed.search || parsed.hash) return 'apiUrl must not contain query or hash';
  if (!/^\d+$/.test(c.idInstance)) return 'idInstance must contain only digits';
  if (!c.apiTokenInstance || /\s/.test(c.apiTokenInstance))
    return 'apiTokenInstance is empty or contains whitespace';
  return null;
}

export interface BuildUrlParams {
  /** Дополнительные сегменты пути после токена (receiptId для deleteNotification). */
  pathSuffix?: readonly (string | number)[];
  query?: Readonly<Record<string, string | number>>;
}

function build(
  apiUrl: string,
  idInstance: string,
  method: GreenApiMethod,
  tokenSegment: string,
  p: BuildUrlParams,
): string {
  const suffix = (p.pathSuffix ?? []).map((s) => `/${encodeURIComponent(String(s))}`).join('');
  const entries = Object.entries(p.query ?? {});
  const qs = entries.length
    ? `?${entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&')}`
    : '';
  return `${normalizeApiUrl(apiUrl)}/waInstance${encodeURIComponent(idInstance)}/${method}/${tokenSegment}${suffix}${qs}`;
}

/**
 * `{apiUrl}/waInstance{idInstance}/{method}/{apiTokenInstance}[/{suffix}][?query]` (§5.1).
 * Результат содержит токен — использовать только для fetch, никогда не логировать.
 */
export function buildMethodUrl(
  c: Credentials,
  method: GreenApiMethod,
  p: BuildUrlParams = {},
): string {
  return build(c.apiUrl, c.idInstance, method, encodeURIComponent(c.apiTokenInstance), p);
}

/** Тот же URL, но с `***` вместо токена — для логов и ошибок. */
export function buildMaskedUrl(
  c: Pick<Credentials, 'apiUrl' | 'idInstance'>,
  method: GreenApiMethod,
  p: BuildUrlParams = {},
): string {
  return build(c.apiUrl, c.idInstance, method, TOKEN_MASK, p);
}
