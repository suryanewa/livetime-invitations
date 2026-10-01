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
    // Dense geometric checks (swept-lid and cloche clearance at 1–2 ms steps) take several
    // seconds on a busy machine; the default 5 s timeout made them flaky under load. 180 s (tests
    // and the GLB-loading hooks): with parallel rig designers running (load average ~176) five
    // files passed alone but timed out at 60 s.
    testTimeout: 180_000,
    hookTimeout: 180_000,
  },
});
