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
});
