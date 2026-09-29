import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  server: { port: 5199, strictPort: true, host: '127.0.0.1' },
  preview: { port: 5198, strictPort: true, host: '127.0.0.1' },
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    rollupOptions: {
      input: {
        showcase: resolve(import.meta.dirname, 'index.html'),
        study: resolve(import.meta.dirname, 'study.html'),
        lookdev: resolve(import.meta.dirname, 'lookdev.html'),
        gallery: resolve(import.meta.dirname, 'gallery.html'),
      },
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
