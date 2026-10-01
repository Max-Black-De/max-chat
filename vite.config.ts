import { defineConfig } from 'vite';
import { configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolveBasePath } from './plugins/base-path.ts';
import { cspMetaPlugin } from './plugins/csp.ts';

// https://vite.dev/config/
export default defineConfig({
  // cspMetaPlugin — только в `vite build` (Д-1, EC-X3); в dev CSP ломает HMR.
  plugins: [react(), cspMetaPlugin()],
  // Д-1: GitHub Pages отдаёт проект по подпути — CI собирает с BASE_PATH=/<repo>/.
  // Без переменной — '/': dev, e2e и локальный preview работают от корня.
  base: resolveBasePath(process.env.BASE_PATH),
  server: {
    port: 5173,
    strictPort: true,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'plugins/**/*.test.ts', 'scripts/**/*.test.ts'],
    // e2e/ — Playwright (`npm run e2e`), не Vitest.
    exclude: [...configDefaults.exclude, 'e2e/**'],
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/__tests__/**',
        'src/test/**',
        'e2e/**',
        'src/main.tsx',
        'src/**/*.d.ts',
      ],
      // НФТ-9: покрытие модулей нормализации, разбора уведомлений, дедупа и reducer ≥ 80 %.
      // Пороги по папкам (glob): api/ (F1) и notifications/ (F5). Папка без файлов под glob
      // проверку не роняет. store/ и polling/ добавятся с логикой (F3, F5, Q2).
      thresholds: {
        'src/api/**/*.ts': { lines: 80, functions: 80, branches: 80, statements: 80 },
        'src/notifications/**/*.ts': { lines: 80, functions: 80, branches: 80, statements: 80 },
      },
    },
  },
});
