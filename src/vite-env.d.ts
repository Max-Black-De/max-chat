/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Адрес API по умолчанию на форме входа (Р-1). Необязательно. */
  readonly VITE_DEFAULT_API_URL?: string;
  /** `true` включает Д-7 (история чата). По умолчанию выключено. */
  readonly VITE_FEATURE_HISTORY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
