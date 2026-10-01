/**
 * Проверка продакшен-сборки (Д-1, EC-X3): `npm run build && npm run verify:dist`.
 *
 * - в `dist/index.html` ровно одна CSP-meta с политикой из plugins/csp.ts, и она стоит до
 *   первого <script>/<link>;
 * - нет инлайн-скриптов, <style>, атрибутов style= и on*= — их заблокирует CSP;
 * - ссылки на скрипты, стили и favicon начинаются с base (`BASE_PATH`, по умолчанию `/`);
 * - в файлах сборки нет строк, похожих на apiTokenInstance (50 hex-символов).
 *
 * Запускается Node 22 напрямую (type stripping), без зависимостей.
 */
import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { resolveBasePath } from '../plugins/base-path.ts';
import { CSP_POLICY } from '../plugins/csp.ts';

const distDir = join(import.meta.dirname, '..', 'dist');
const base = resolveBasePath(process.env.BASE_PATH);
const errors: string[] = [];

const html = await readFile(join(distDir, 'index.html'), 'utf8');
const head = /<head>([\s\S]*?)<\/head>/i.exec(html)?.[1] ?? '';

const cspMetas = [...html.matchAll(/<meta[^>]+http-equiv="Content-Security-Policy"[^>]*>/gi)];
if (cspMetas.length !== 1) {
  errors.push(`ожидалась 1 CSP-meta, найдено ${String(cspMetas.length)}`);
} else {
  // Vite экранирует `'` как `&#39;`; браузер раскодирует атрибут обратно.
  const content = /content="([^"]*)"/i
    .exec(cspMetas[0]?.[0] ?? '')?.[1]
    ?.replaceAll('&#39;', "'")
    .replaceAll('&quot;', '"')
    .replaceAll('&amp;', '&');
  if (content !== CSP_POLICY) errors.push(`CSP не совпадает с plugins/csp.ts: ${String(content)}`);
  const metaPos = head.indexOf(cspMetas[0]?.[0] ?? '');
  const firstResource = head.search(/<(script|link)\b/i);
  if (metaPos === -1 || (firstResource !== -1 && metaPos > firstResource)) {
    errors.push('CSP-meta должна стоять в <head> до первого <script>/<link>');
  }
}

for (const [tag, attrs = '', body = ''] of html.matchAll(
  /<script\b([^>]*)>([\s\S]*?)<\/script>/gi,
)) {
  if (!/\bsrc="/i.test(attrs) || body.trim() !== '')
    errors.push(`инлайн-скрипт: ${tag.slice(0, 80)}`);
}
if (/<style\b/i.test(html)) errors.push('инлайн <style> в index.html');
if (/\sstyle=/i.test(html)) errors.push('атрибут style= в index.html');
if (/\son[a-z]+=/i.test(html)) errors.push('инлайн-обработчик on*= в index.html');
if (/javascript:/i.test(html)) errors.push('javascript: URL в index.html');

const urls = [...html.matchAll(/<(?:script|link)\b[^>]*?\s(?:src|href)="([^"]+)"/gi)].map(
  (m) => m[1],
);
if (urls.length === 0) errors.push('в index.html нет ссылок на скрипты и стили');
for (const url of urls) {
  if (!url.startsWith(base)) errors.push(`ссылка не под base ${base}: ${url}`);
}
if (!urls.some((url) => url === `${base}favicon.svg`))
  errors.push(`нет favicon ${base}favicon.svg`);

async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (e) =>
      e.isDirectory() ? listFiles(join(dir, e.name)) : [join(dir, e.name)],
    ),
  );
  return nested.flat();
}

const TOKEN_LIKE = /(?<![0-9a-f])[0-9a-f]{50}(?![0-9a-f])/i;
for (const file of await listFiles(distDir)) {
  if (!/\.(html|js|css|json|txt|map|svg)$/.test(file)) continue;
  if (TOKEN_LIKE.test(await readFile(file, 'utf8'))) {
    errors.push(`строка, похожая на apiTokenInstance: ${relative(distDir, file)}`);
  }
}

if (errors.length > 0) {
  console.error(`verify-dist: ошибки (base ${base}):\n- ${errors.join('\n- ')}`);
  process.exit(1);
}
console.log(`verify-dist: OK (base ${base}, CSP-meta на месте, инлайн-скриптов и стилей нет)`);
