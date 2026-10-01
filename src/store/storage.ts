/**
 * Обёртка над localStorage для данных приложения (Р-2, Д-3/EC-D8, EC-S4). Общая для F3–F5.
 *
 * - Ключи с версией схемы: `maxchat:<idInstance>:v1:<раздел>`.
 * - Каждое чтение и запись — в `try`. Повреждённый или нечитаемый раздел пропускается
 *   (`read` возвращает `undefined`), работа начинается с пустого.
 * - Если запись не удалась (`QuotaExceededError`, приватный режим, нет localStorage),
 *   хранилище переходит в режим «только память»: значения живут до перезагрузки, один раз
 *   вызывается `onWriteFailure` (баннер) и один `console.warn` без содержимого.
 * - Режим «только чтение» (`setReadOnly(true)`) — для неопрашивающей вкладки (Р-12, EC-S4):
 *   запись в localStorage не идёт, значения держатся только в памяти этой вкладки. После
 *   `setReadOnly(false)` память сбрасывается и чтение снова идёт из localStorage (EC-S10).
 * - Токен сюда не пишется никогда (НФТ-3): учётные данные — в `sessionCredentials.ts`.
 */
import { STORAGE_PREFIX } from './constants';

/** Версия схемы данных в ключах (EC-D8). При несовместимой смене — `v2`. */
export const STORAGE_SCHEMA_VERSION = 'v1';

/** Ключ раздела: `maxchat:<idInstance>:v1:<section>`. */
export function storageKey(idInstance: string, section: string): string {
  return `${STORAGE_PREFIX}:${idInstance}:${STORAGE_SCHEMA_VERSION}:${section}`;
}

/** Минимальный интерфейс Web Storage (для инъекции в тестах). */
export type StorageBackend = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface AppStorageOptions {
  idInstance: string;
  /** По умолчанию `window.localStorage` (если доступен). `null` — сразу режим «только память». */
  backend?: StorageBackend | null;
  readOnly?: boolean;
  /** Вызывается один раз при первой неудачной записи (баннер Р-2). */
  onWriteFailure?: () => void;
  /** По умолчанию `console.warn`. Получает только техническое сообщение, без данных. */
  warn?: (message: string) => void;
}

export interface AppStorage {
  readonly idInstance: string;
  /**
   * Прочитать раздел. `validate` проверяет форму данных; не прошло, не JSON, ошибка чтения —
   * `undefined` (раздел считается пустым).
   */
  read<T>(section: string, validate: (value: unknown) => value is T): T | undefined;
  /** Записать раздел. `true` — записано в localStorage, `false` — только в память. */
  write(section: string, value: unknown): boolean;
  remove(section: string): void;
  setReadOnly(readOnly: boolean): void;
  isReadOnly(): boolean;
  /** Была ли неудачная запись (работаем в памяти). */
  hasWriteFailed(): boolean;
}

function defaultBackend(): StorageBackend | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    // Доступ к localStorage может бросать (политики браузера, sandbox-iframe).
    return null;
  }
}

export function createAppStorage(options: AppStorageOptions): AppStorage {
  const backend = options.backend === undefined ? defaultBackend() : options.backend;
  const warn =
    options.warn ??
    ((m: string) => {
      console.warn(m);
    });
  /** Копия в памяти: значение или `null` — «удалено в этой вкладке» (режимы память / только чтение, EC-S10). */
  const memory = new Map<string, string | null>();
  let readOnly = options.readOnly ?? false;
  let failed = false;

  const fail = (what: string) => {
    if (failed) return;
    failed = true;
    warn(`maxchat storage: ${what} failed, working in memory`);
    options.onWriteFailure?.();
  };
  if (backend === null) fail('localStorage access');

  return {
    idInstance: options.idInstance,

    read<T>(section: string, validate: (value: unknown) => value is T): T | undefined {
      const key = storageKey(options.idInstance, section);
      let raw: string | null | undefined = memory.get(key);
      if (!memory.has(key) && backend) {
        try {
          raw = backend.getItem(key);
        } catch {
          raw = null;
        }
      }
      if (raw === undefined || raw === null) return undefined;
      try {
        const value: unknown = JSON.parse(raw);
        return validate(value) ? value : undefined;
      } catch {
        return undefined;
      }
    },

    write(section, value) {
      const key = storageKey(options.idInstance, section);
      let raw: string;
      try {
        raw = JSON.stringify(value);
      } catch {
        fail('serialization');
        return false;
      }
      memory.set(key, raw);
      if (readOnly || failed || !backend) return false;
      try {
        backend.setItem(key, raw);
        // Запись удалась — копия в памяти не нужна, источник истины — localStorage.
        memory.delete(key);
        return true;
      } catch {
        fail('write');
        return false;
      }
    },

    remove(section) {
      const key = storageKey(options.idInstance, section);
      if (readOnly || failed || !backend) {
        memory.set(key, null);
        return;
      }
      memory.delete(key);
      try {
        backend.removeItem(key);
      } catch {
        // удаление необязательно для работы
      }
    },

    setReadOnly(value) {
      // Вкладка захватила замок (EC-S10): изменения, жившие только в её памяти, отбрасываются —
      // источник истины снова localStorage, его и перечитывают (счётчик может вернуться).
      if (readOnly && !value && !failed && backend) memory.clear();
      readOnly = value;
    },
    isReadOnly: () => readOnly,
    hasWriteFailed: () => failed,
  };
}
