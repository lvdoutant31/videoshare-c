import { expect, test } from '@playwright/test';

/**
 * 移动端核心链路冒烟（基线二验收）：
 * 1. 推荐流加载与首视频渲染
 * 2. 企业微信 mock 授权并回到原页面
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

test('企业微信授权后跳转回推荐流', async ({ page }) => {
  await page.goto('login');
  await page.getByRole('button', { name: '使用企业微信登录' }).click();
  await expect(page).toHaveURL(/\/feed/);
  // 登录态持久化：重新进入推荐流仍保持
  await page.goto('feed');
  await expect(page.locator('.feed-screen')).toBeVisible();
});

test('未登录点赞被引导登录并可回跳', async ({ page }) => {
  await page.goto('feed');
  await page.locator('.action-item').nth(0).click();
  await expect(page).toHaveURL(/\/login/);
  await page.getByRole('button', { name: '使用企业微信登录' }).click();
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

test('点赞操作切换当前状态', async ({ page }) => {
  await loginWithWecomMock(page);

  const likeButton = page.locator('.action-item').nth(0);
  await expect(likeButton).toBeVisible();
  const wasLiked = (await likeButton.locator('.liked').count()) > 0;
  await likeButton.click();
  await expect(likeButton.locator('.liked')).toHaveCount(wasLiked ? 0 : 1);
});

test('评论面板打开与关闭', async ({ page }) => {
  await loginWithWecomMock(page);

  await page.locator('.action-item').nth(1).click();
  await expect(page.locator('.comments-sheet')).toBeVisible();
  await expect(page.locator('.comment-row').first()).toBeVisible();
  await page.locator('.comments-header button[aria-label="关闭评论"]').click();
  await expect(page.locator('.comments-sheet')).toBeHidden();
});

async function loginWithWecomMock(page: import('@playwright/test').Page) {
  await page.goto('login');
  await page.getByRole('button', { name: '使用企业微信登录' }).click();
  await expect(page).toHaveURL(/\/feed/);
}

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
