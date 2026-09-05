import { defineConfig, devices } from '@playwright/test';

/**
 * 移动端 E2E（基线二）：基于 mock 模式 + 本地 dev server。
 * 启动方式：先运行 `npm run dev`（vite，端口 5173），再 `npx playwright test`。
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  retries: 1,
  use: {
    baseURL: 'http://localhost:5173/h5/',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    browserName: 'chromium',
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  },
  projects: [{ name: 'mobile-chromium', use: {} }],
});
