/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Д-1 (деплой на GitHub Pages, позже): base должен совпадать с путём репозитория,
  // например BASE_PATH=/max-chat/ в CI. Локально и на Vercel — '/'.
  base: process.env.BASE_PATH ?? '/',
  server: {
    port: 5173,
    strictPort: true,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/main.tsx', 'src/**/*.d.ts'],
      // НФТ-9: покрытие модулей нормализации, разбора уведомлений, дедупа и reducer ≥ 80 %.
      // Пороги включаются, когда появится логика (F3, F5, Q2).
    },
  },
});
