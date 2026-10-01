import { DEFAULT_API_URL } from './constants';
import { TOKEN_MASK } from './mask';
import { LOGIN_FORM_TEXTS } from './messages';
import type { ApiMethodName, Credentials } from './types';

/** Методы GREEN-API, которые вызывает клиент (§5.2). */
export type GreenApiMethod = ApiMethodName;

/** Обрезает пробелы и хвостовые `/` у apiUrl (Р-1). */
export function normalizeApiUrl(apiUrl: string): string {
  return apiUrl.trim().replace(/\/+$/, '');
}

export type ApiUrlValidation = { ok: true; apiUrl: string } | { ok: false; error: string };

/**
 * Проверка поля «Адрес API» формы входа (§4.1 п. 1.2, ВА-2). Чистая функция.
 * Пусто → `DEFAULT_API_URL`; пробелы по краям и хвостовые `/` убираются; адрес должен
 * разбираться как URL с протоколом `https:` (`http://` — ошибка: токен идёт в URL),
 * без query/hash. Ошибка — текст «Введите адрес вида https://3100.api.green-api.com».
 */
export function validateApiUrl(raw: string | null | undefined): ApiUrlValidation {
  const trimmed = normalizeApiUrl(raw ?? '');
  if (!trimmed) return { ok: true, apiUrl: DEFAULT_API_URL };
  const fail = { ok: false, error: LOGIN_FORM_TEXTS.apiUrlFormat } as const;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return fail;
  }
  if (parsed.protocol !== 'https:' || !parsed.hostname) return fail;
  if (parsed.search || parsed.hash || parsed.username || parsed.password) return fail;
  return { ok: true, apiUrl: trimmed };
}

/** Проверка формата учётных данных. Возвращает текст проблемы или null. */
export function validateCredentials(c: Credentials): string | null {
  if (!validateApiUrl(c.apiUrl).ok) return 'apiUrl must be an https: URL without query or hash';
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
