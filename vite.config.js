import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  appType: 'mpa',
  base: './',
  publicDir: './assets',
  plugins: [tailwindcss(), react()],
  resolve: {
    conditions: ['onnxruntime-web-use-extern-wasm'],
  },
  build: {
    outDir: resolve(import.meta.dirname, './build/'),
    chunkSizeWarningLimit: 1_000_000,
  },
  optimizeDeps: {
    exclude: ['onnxruntime-web'],
  },
  test: {
    // Keep Vitest away from the Playwright E2E specs in tests/e2e.
    include: ['src/**/*.{test,spec}.{js,jsx}'],
  },
});
