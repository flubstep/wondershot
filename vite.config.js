import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { port: 5178 },
  optimizeDeps: { exclude: ['@mediapipe/tasks-vision'] },
});
