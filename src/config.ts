/**
 * Конфигурация сборки из env Vite (все переменные необязательны, см. .env.example).
 *
 * Учётные данные инстанса (idInstance, apiTokenInstance) в env **не задаются**:
 * они вводятся в форме входа (ТЗ ОР-1), а всё `VITE_*` попадает в бандл (НФТ-3, Д-1).
 */
import { DEFAULT_API_URL } from './api/constants';

export interface AppConfig {
  /** Предзаполнение поля apiUrl на форме входа (Р-1). */
  defaultApiUrl: string;
  /** Д-7: загрузка истории чата через getChatHistory. По умолчанию выключено (Р-4). */
  featureHistory: boolean;
}

/** Обрезает пробелы и хвостовые `/` у адреса API (Р-1). */
export function normalizeApiUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '');
}

type EnvSource = Partial<Record<'VITE_DEFAULT_API_URL' | 'VITE_FEATURE_HISTORY', string>>;

export function readConfig(env: EnvSource = import.meta.env): AppConfig {
  const apiUrl = normalizeApiUrl(env.VITE_DEFAULT_API_URL ?? '');
  return {
    defaultApiUrl: apiUrl === '' ? DEFAULT_API_URL : apiUrl,
    featureHistory: env.VITE_FEATURE_HISTORY?.trim().toLowerCase() === 'true',
  };
}

export const config: AppConfig = readConfig();
