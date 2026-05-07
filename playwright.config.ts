import { defineConfig, devices } from '@playwright/test';

// E2E_BASE_URL を指定すると外部URL(例: Cloudflare Pages)で実行する。
// 未指定ならローカル http.server を webServer で立てて 4789 で実行する。
const PORT = 4789;
const LOCAL_URL = `http://localhost:${PORT}`;
const E2E_BASE_URL = process.env.E2E_BASE_URL;
const BASE_URL = E2E_BASE_URL || LOCAL_URL;
const isRemote = !!E2E_BASE_URL;

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './tests/.artifacts',
  reporter: [
    ['list'],
    ['html', { outputFolder: './tests/.report', open: 'never' }]
  ],
  fullyParallel: false,
  retries: isRemote ? 1 : 0,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo'
  },
  projects: [
    {
      name: 'iPhone-12-mobile',
      use: { ...devices['iPhone 12'], browserName: 'chromium' }
    },
    {
      name: 'Desktop-Chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 480, height: 900 } }
    }
  ],
  // 外部URLのときは webServer を起動しない
  webServer: isRemote ? undefined : {
    command: `python3 -m http.server ${PORT}`,
    url: LOCAL_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 10_000
  }
});
