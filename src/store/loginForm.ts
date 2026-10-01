/** Проверка формы входа (§4.1 п. 1.2, ВА-2, Д-3/EC-T8, EC-T9). Чистые функции. */
import { LOGIN_FORM_TEXTS, validateApiUrl } from '../api';
import type { SessionCredentials } from './sessionCredentials';
import { hostWarningText } from './texts';

export interface LoginFormInput {
  idInstance: string;
  apiTokenInstance: string;
  apiUrl: string;
}

export type LoginFormField = keyof LoginFormInput;
export type LoginFormErrors = Partial<Record<LoginFormField, string>>;

export type LoginFormResult =
  | { ok: true; credentials: SessionCredentials; hostWarning: string | null }
  | { ok: false; errors: LoginFormErrors };

/** Домены GREEN-API без предупреждения (п. 1.2, EC-T9; [док using-green-api-hosts]). */
export const GREEN_API_DOMAINS: readonly string[] = ['green-api.com', 'greenapi.com'];

/**
 * `URL.hostname` — `green-api.com` / `greenapi.com` или их поддомен. Сравнение по границе
 * домена: `xgreen-api.com`, `evilgreen-api.com`, `green-api.com.example.test` — не GREEN-API.
 */
export function isGreenApiHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, '');
  return GREEN_API_DOMAINS.some((d) => h === d || h.endsWith(`.${d}`));
}

/**
 * Неблокирующее предупреждение под полем apiUrl: текст, если адрес — корректный `https:` URL,
 * но хост не GREEN-API; иначе `null` (некорректный адрес даёт ошибку поля, не предупреждение).
 */
export function apiUrlHostWarning(raw: string): string | null {
  const v = validateApiUrl(raw);
  if (!v.ok) return null;
  let host: string;
  try {
    host = new URL(v.apiUrl).hostname;
  } catch {
    return null;
  }
  return isGreenApiHost(host) ? null : hostWarningText(host);
}

/**
 * Значения обрезаются по краям; пустое idInstance / токен — «Заполните поле»; idInstance не из
 * цифр — «ID инстанса — только цифры» (длина не проверяется); apiUrl — `validateApiUrl`
 * (пусто → адрес по умолчанию, только `https:`), текст ошибки — всегда из `LOGIN_FORM_TEXTS`
 * (клиент может отдавать код ошибки, а не текст). Предупреждение о хосте вход не блокирует.
 */
export function validateLoginForm(input: LoginFormInput): LoginFormResult {
  const idInstance = input.idInstance.trim();
  const apiTokenInstance = input.apiTokenInstance.trim();
  const errors: LoginFormErrors = {};
  if (!idInstance) errors.idInstance = LOGIN_FORM_TEXTS.required;
  else if (!/^\d+$/.test(idInstance)) errors.idInstance = LOGIN_FORM_TEXTS.idInstanceDigits;
  if (!apiTokenInstance) errors.apiTokenInstance = LOGIN_FORM_TEXTS.required;
  const url = validateApiUrl(input.apiUrl);
  if (!url.ok) errors.apiUrl = LOGIN_FORM_TEXTS.apiUrlFormat;
  if (!url.ok || Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    credentials: { idInstance, apiTokenInstance, apiUrl: url.apiUrl },
    hostWarning: apiUrlHostWarning(url.apiUrl),
  };
}
