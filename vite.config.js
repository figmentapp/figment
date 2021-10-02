import { defineConfig } from 'vite';
import reactRefresh from '@vitejs/plugin-react-refresh';
import { resolve } from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  root: resolve(__dirname, './src/ui'),
  plugins: [reactRefresh()],
  build: {
    chunkSizeWarningLimit: 1_000_000,
  },
});
