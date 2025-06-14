import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import reactRefresh from '@vitejs/plugin-react-refresh';
import { resolve } from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  publicDir: './src/ui/assets',
  plugins: [tailwindcss(), reactRefresh()],
  build: {
    outDir: resolve(__dirname, './build/'),
    chunkSizeWarningLimit: 1_000_000,
  },
});
