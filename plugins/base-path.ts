/**
 * `base` Vite из переменной окружения `BASE_PATH` (Д-1).
 *
 * GitHub Pages отдаёт проект по подпути репозитория (`/max-chat/`), поэтому CI собирает с
 * `BASE_PATH=/<repo>/`. Без переменной — `/`: dev-сервер, e2e и локальный `preview` работают от корня.
 * Значение нормализуется к виду `/путь/` (ведущий и хвостовой `/`).
 */
export function resolveBasePath(raw: string | undefined): string {
  const trimmed = raw?.trim() ?? '';
  const segments = trimmed.split('/').filter((segment) => segment !== '');
  return segments.length === 0 ? '/' : `/${segments.join('/')}/`;
}
