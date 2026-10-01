/**
 * CSP для продакшен-сборки (ТЗ §10.2, Д-3/EC-X3).
 *
 * На GitHub Pages нельзя задать HTTP-заголовки, поэтому политика вставляется в `dist/index.html`
 * тегом `<meta http-equiv="Content-Security-Policy">`. Только при сборке (`apply: 'build'`):
 * dev-сервер Vite вставляет инлайн-скрипты и `<style>` для HMR, и CSP их бы заблокировала.
 *
 * Ограничения meta-варианта: `frame-ancestors`, `report-uri`/`report-to` и `sandbox`
 * в meta не действуют (см. README, «Решения и компромиссы»).
 */
import type { Plugin } from 'vite';

/**
 * `connect-src` ограничен только схемой `https:`: apiUrl задаёт пользователь (Р-1),
 * а `http://` форма входа и так не принимает (п. 1.2).
 */
export const CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  'connect-src https:',
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
] as const;

export const CSP_POLICY: string = CSP_DIRECTIVES.join('; ');

export function cspMetaPlugin(policy: string = CSP_POLICY): Plugin {
  return {
    name: 'max-chat:csp-meta',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler: () => [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: policy },
          // В начало <head>: политика действует только на элементы после неё.
          injectTo: 'head-prepend',
        },
      ],
    },
  };
}
