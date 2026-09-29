import { defineConfig } from '@playwright/test';

/**
 * Browser behaviour checks run against the installed Google Chrome (no browser download).
 * Start `pnpm dev` first, or let the webServer entry start it. BASE_URL points the suite at
 * another server (e.g. a worktree's own dev server) and skips the built-in one.
 */
const baseURL = process.env.BASE_URL ?? 'http://127.0.0.1:5199';

export default defineConfig({
  testDir: 'tests/browser',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL,
    launchOptions: {
      executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      args: ['--use-angle=metal', '--ignore-gpu-blocklist'],
    },
    viewport: { width: 1200, height: 1000 },
  },
  webServer: process.env.BASE_URL
    ? undefined
    : { command: 'pnpm dev', url: 'http://127.0.0.1:5199', reuseExistingServer: true, timeout: 60_000 },
});
