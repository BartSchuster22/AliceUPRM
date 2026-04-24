import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  use: {
    baseURL: process.env.UPRM_ADMIN_E2E_BASE_URL || 'http://127.0.0.1:4001',
    headless: true,
  },
  retries: 0,
  workers: 1,
});
