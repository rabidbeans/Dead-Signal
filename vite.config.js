import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { port: 5173, host: true },
  build: { target: 'es2020', chunkSizeWarningLimit: 2000, assetsInlineLimit: 0, assetsDir: 'build' },
});
