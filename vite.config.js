import { defineConfig } from 'vite';
import reactRefresh from '@vitejs/plugin-react-refresh';
import { resolve } from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  root: resolve(__dirname, './src/ui/'),
  base: './',
  publicDir: 'assets',
  plugins: [reactRefresh()],
  build: {
    outDir: resolve(__dirname, './build/'),
    chunkSizeWarningLimit: 1_000_000,
  },
});
