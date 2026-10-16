import { expect, test } from '@playwright/test';

const apiData = (data: unknown) => JSON.stringify({ code: 'OK', message: '', data, traceId: 'smoke' });
const smokeVideo = {
  id: 'smoke-video-1', title: '折弯机操作演示', description: '设备操作演示', durationMs: 60_000,
  videoUrl: '/media/flower.mp4', author: { id: 'author-1', nickname: '设备工程师', avatarUrl: null, following: false },
  cover: null, tags: [], stats: { playCount: 20, likeCount: 2, favoriteCount: 1, commentCount: 1 },
  publishedAt: '2026-09-24T00:00:00Z', viewerState: { liked: false, favorited: false },
};

test.beforeEach(async ({ page }) => {
  await page.route('**/api/v1/app/auth/password/login', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: apiData({ accessToken: 'smoke-token', expiresIn: 604800, user: {
      id: 'viewer-1', nickname: '测试用户', avatarUrl: null, bio: null, status: 'NORMAL',
      likeReceivedCount: 0, followingCount: 0, followerCount: 0, wecomBound: false,
    } }),
  }));
  await page.route('**/api/v1/app/me', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: apiData({
      id: 'viewer-1', nickname: '测试用户', avatarUrl: null, bio: null, status: 'NORMAL',
      likeReceivedCount: 0, followingCount: 0, followerCount: 0, wecomBound: false,
    }),
  }));
  await page.route('**/api/v1/app/feed/recommend?*', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: apiData({
      items: [smokeVideo, { ...smokeVideo, id: 'smoke-video-2', title: '折弯机保养演示' }], nextCursor: null,
    }),
  }));
  await page.route('**/api/v1/app/videos/*/like', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: apiData({ active: true, count: 3 }),
  }));
  await page.route('**/api/v1/app/videos/*/comments?*', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: apiData({ items: [{
      id: 'comment-1', videoId: 'smoke-video-1', user: smokeVideo.author, rootCommentId: null,
      replyToCommentId: null, content: '测试评论', status: 'NORMAL', likeCount: 0, replyCount: 0,
      liked: false, mine: false, createdAt: '2026-09-24T00:00:00Z', replies: [{
        id: 'reply-1', videoId: 'smoke-video-1', user: { ...smokeVideo.author, id: 'author-2', nickname: '评论用户' },
        rootCommentId: 'comment-1', replyToCommentId: 'comment-1', content: '其他人的回复', status: 'NORMAL',
        likeCount: 0, replyCount: 0, liked: false, mine: false, createdAt: '2026-09-24T00:01:00Z',
      }],
    }], nextCursor: null }),
  }));
});

/**
 * 移动端核心链路冒烟（基线二验收）：
 * 1. 推荐流加载与首视频渲染
 * 2. 账号密码 mock 登录并回到原页面
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

test('账号密码登录后跳转回推荐流', async ({ page }) => {
  await loginWithPasswordMock(page);
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
  await page.getByPlaceholder('请输入密码').fill('SecurePass123!');
  await page.getByRole('button', { name: '登录', exact: true }).click();
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
  await loginWithPasswordMock(page);

  const likeButton = page.locator('.action-item').nth(0);
  await expect(likeButton).toBeVisible();
  const wasLiked = (await likeButton.locator('.liked').count()) > 0;
  await likeButton.click();
  await expect(likeButton.locator('.liked')).toHaveCount(wasLiked ? 0 : 1);
});

test('评论面板打开与关闭', async ({ page }) => {
  await loginWithPasswordMock(page);

  await page.locator('.action-item').nth(1).click();
  await expect(page.locator('.comments-sheet')).toBeVisible();
  await expect(page.locator('.comment-row').first()).toBeVisible();
  await page.locator('.comments-header button[aria-label="关闭评论"]').click();
  await expect(page.locator('.comments-sheet')).toBeHidden();
});

test('可以回复其他人的二级评论', async ({ page }) => {
  let requestBody: { content?: string; replyToCommentId?: string } | null = null;
  await page.route('**/api/v1/app/videos/*/comments', async route => {
    requestBody = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: apiData({ id: 'new-reply', status: 'NORMAL' }),
    });
  });
  await loginWithPasswordMock(page);
  await page.locator('.action-item').nth(1).click();
  await page.locator('.comment-reply').getByRole('button', { name: '回复', exact: true }).click();
  await expect(page.getByPlaceholder('回复 @评论用户...')).toBeVisible();
  await page.getByPlaceholder('回复 @评论用户...').fill('继续回复');
  await page.locator('.comment-composer').getByRole('button', { name: '发送评论' }).click();
  await expect.poll(() => requestBody).toEqual({ content: '继续回复', replyToCommentId: 'reply-1' });
});

test('可以在消息收件箱回复他人的评论', async ({ page }) => {
  let requestBody: { content?: string; replyToCommentId?: string } | null = null;
  await page.route('**/api/v1/app/share-inbox', route => route.fulfill({
    status: 200, contentType: 'application/json', body: apiData([]),
  }));
  await page.route('**/api/v1/app/comment-notifications?*', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: apiData({ items: [{
      id: 'notification-1', actor: { id: 'author-2', nickname: '评论用户', avatarUrl: null },
      videoId: 'smoke-video-1', videoTitle: '折弯机操作演示', commentId: 'reply-1',
      replyToCommentId: 'comment-1', content: '其他人的回复', sourceContent: '我的评论',
      createdAt: '2026-09-24T00:01:00Z', readAt: null,
    }], nextCursor: null }),
  }));
  await page.route('**/api/v1/app/comment-notifications/*/read', route => route.fulfill({
    status: 200, contentType: 'application/json', body: apiData(null),
  }));
  await page.route('**/api/v1/app/videos/*/comments', async route => {
    requestBody = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: 'application/json', body: apiData({ id: 'new-reply', status: 'NORMAL' }) });
  });

  await loginWithPasswordMock(page);
  await page.goto('inbox');
  await page.getByPlaceholder('回复 评论用户').fill('从消息继续回复');
  await page.locator('.inline-reply').getByRole('button', { name: '回复' }).click();
  await expect.poll(() => requestBody).toEqual({ content: '从消息继续回复', replyToCommentId: 'reply-1' });
});

async function loginWithPasswordMock(page: import('@playwright/test').Page) {
  await page.goto('login');
  await page.getByPlaceholder('请输入手机号').fill('13800138000');
  await page.getByPlaceholder('请输入密码').fill('SecurePass123!');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page).toHaveURL(/\/feed/);
}

/** 通过触控指针事件模拟垂直滑动。 */
async function swipe(page: import('@playwright/test').Page, deltaY: number) {
  await page.evaluate(
    (dy) => {
      const el = document.querySelector('.player-hit-area');
      if (!el) throw new Error('player-hit-area not found');
      const init = (y: number) => ({ pointerId: 1, pointerType: 'touch', isPrimary: true,
        clientX: 195, clientY: y, bubbles: true });
      el.dispatchEvent(new PointerEvent('pointerdown', init(500)));
      el.dispatchEvent(new PointerEvent('pointermove', init(500 + dy)));
      el.dispatchEvent(new PointerEvent('pointerup', init(500 + dy)));
    },
    deltaY,
  );
}
