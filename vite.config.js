import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  publicDir: './assets',
  plugins: [tailwindcss(), react()],
  build: {
    outDir: resolve(__dirname, './build/'),
    chunkSizeWarningLimit: 1_000_000,
  },
});
