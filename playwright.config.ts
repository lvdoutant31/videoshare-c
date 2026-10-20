import { defineConfig, devices } from '@playwright/test';

/**
 * 移动端 E2E（基线二）：基于 mock 模式 + 本地 dev server。
 * 测试会自动启动 mock 模式的 Vite 服务。
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  retries: 1,
  use: {
    baseURL: 'http://127.0.0.1:5173/videoshare/h5/',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    browserName: 'chromium',
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1',
    url: 'http://127.0.0.1:5173/videoshare/h5/',
    reuseExistingServer: true,
    timeout: 120_000,
    env: { VITE_USE_MOCK: 'false', VITE_ANALYTICS_ENABLED: 'false' },
  },
  projects: [{ name: 'mobile-chromium', use: {} }],
});
