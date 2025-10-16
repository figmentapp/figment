import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  appType: 'mpa',
  base: './',
  publicDir: './assets',
  resolve: {
    alias: {
      '@mediapipe/tasks-vision': resolve(__dirname, 'node_modules/@mediapipe/tasks-vision/vision_bundle.mjs'),
    },
  },
  plugins: [tailwindcss(), react()],
  build: {
    outDir: resolve(__dirname, './build/'),
    chunkSizeWarningLimit: 1_000_000,
  },
});
