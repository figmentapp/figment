import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import reactRefresh from '@vitejs/plugin-react-refresh';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { resolve } from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  publicDir: './assets',
  plugins: [
    tailwindcss(),
    reactRefresh(),
    viteStaticCopy({
      targets: [
        // Copy ONNX Runtime Web .wasm files
        {
          src: 'node_modules/onnxruntime-web/dist/*.wasm',
          dest: 'onnxruntime-web',
        },
        {
          src: 'node_modules/onnxruntime-web/dist/*.mjs',
          dest: 'onnxruntime-web',
        },
        // Copy MediaPipe .wasm files
        {
          src: 'node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_internal.wasm',
          dest: 'mediapipe',
        },
        {
          src: 'node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_internal.js',
          dest: 'mediapipe',
        },
        {
          src: 'node_modules/@mediapipe/tasks-vision/vision_bundle.mjs',
          dest: 'mediapipe',
        },
      ],
      // Enable file watching in dev mode
      watch: {
        reloadPageOnChange: true,
      },
    }),
  ],
  build: {
    outDir: resolve(__dirname, './build/'),
    chunkSizeWarningLimit: 1_000_000,
  },
});
