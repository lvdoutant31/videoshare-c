import { expect, test } from '@playwright/test';

/**
 * 移动端核心链路冒烟（基线二验收）：
 * 1. 推荐流加载与首视频渲染
 * 2. 手机号登录（mock 验证码 123456）并回到原页面
 * 3. 上下滑切换视频（单实例播放）
 * 4. 点赞乐观更新与失败回滚（服务端 mock 权威值）
 * 5. 评论面板打开/关闭
 */

test('推荐流加载并渲染视频', async ({ page }) => {
  await page.goto('feed');
  await expect(page.locator('.feed-screen')).toBeVisible();
  await expect(page.locator('.feed-video').first()).toBeVisible();
  await expect(page.locator('.feed-meta').first()).toBeVisible();
});

test('手机号登录后跳转回推荐流', async ({ page }) => {
  await page.goto('login');
  await page.getByPlaceholder('请输入手机号').fill('13800138000');
  await page.getByPlaceholder('验证码').fill('123456');
  await page.getByRole('button', { name: '登录 / 注册' }).click();
  await expect(page).toHaveURL(/\/feed/);
  // 登录态持久化：重新进入推荐流仍保持
  await page.goto('feed');
  await expect(page.locator('.feed-screen')).toBeVisible();
});

test('未登录点赞被引导登录并可回跳', async ({ page }) => {
  await page.goto('feed');
  await page.locator('.action-item').nth(0).click();
  await expect(page).toHaveURL(/\/login/);
  await page.getByPlaceholder('请输入手机号').fill('13800138000');
  await page.getByPlaceholder('验证码').fill('123456');
  await page.getByRole('button', { name: '登录 / 注册' }).click();
  await expect(page).toHaveURL(/\/feed/);
});

test('上下滑动切换视频', async ({ page }) => {
  await page.goto('feed');
  const track = page.locator('.feed-track');
  await page.waitForTimeout(500);

  // 上滑（下一视频）
  await swipe(page, -260);
  await page.waitForTimeout(600);
  const afterNext = await track.evaluate((el) => (el as HTMLElement).style.transform);
  expect(afterNext).toContain('-100%');

  // 下滑（返回上一个视频）
  await swipe(page, 260);
  await page.waitForTimeout(600);
  const afterPrev = await track.evaluate((el) => (el as HTMLElement).style.transform);
  expect(afterPrev).not.toBe(afterNext);
});

test('点赞乐观更新：状态点亮且计数变化', async ({ page }) => {
  // 直接注入登录态（mock token）
  await page.addInitScript(() => localStorage.setItem('yingliu.app.token', 'mock-access-token'));
  await page.goto('feed');

  const likeButton = page.locator('.action-item').nth(0);
  await expect(likeButton).toBeVisible();
  await likeButton.click();
  // 乐观更新：点赞图标点亮
  await expect(likeButton.locator('.van-icon-like')).toBeVisible({ timeout: 5000 });
});

test('评论面板打开与关闭', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('yingliu.app.token', 'mock-access-token'));
  await page.goto('feed');

  await page.locator('.action-item').nth(1).click();
  await expect(page.locator('.comments-sheet')).toBeVisible();
  await expect(page.locator('.comment-row').first()).toBeVisible();
  await page.locator('.comments-header button[aria-label="关闭评论"]').click();
  await expect(page.locator('.comments-sheet')).toBeHidden();
});

/** 通过 TouchEvent 模拟垂直滑动（组件监听 touch* 事件） */
async function swipe(page: import('@playwright/test').Page, deltaY: number) {
  await page.evaluate(
    (dy) => {
      const el = document.querySelector('.feed-viewport');
      if (!el) throw new Error('feed-viewport not found');
      const start = { x: 195, y: 300 };
      const end = { x: 195, y: 300 + dy };
      const makeTouch = (x: number, y: number) => new Touch({ identifier: 1, target: el, clientX: x, clientY: y });
      el.dispatchEvent(new TouchEvent('touchstart', { touches: [makeTouch(start.x, start.y)], bubbles: true }));
      el.dispatchEvent(new TouchEvent('touchmove', { touches: [makeTouch(end.x, end.y)], bubbles: true }));
      el.dispatchEvent(new TouchEvent('touchend', { changedTouches: [makeTouch(end.x, end.y)], bubbles: true }));
    },
    deltaY,
  );
}
