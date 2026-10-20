import { expect, test } from '@playwright/test';

const api = (data: unknown) => ({ code: 'OK', message: 'ok', data, traceId: 'e2e-trace' });
const user = {
  id: '10001', nickname: '张三', avatarUrl: null, bio: '设备服务工程师', status: 'NORMAL',
  likeReceivedCount: 12, followingCount: 3, followerCount: 8, wecomBound: false,
};

test('发现页使用真实接口数据且发布按钮不越出导航栏', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  await page.route('**/api/v1/app/discover**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(api({
      summary: { totalVideos: 2, totalWatchTimeMs: 0, effectivePlayCount: 0, averageWatchTimeMs: 0, todayNewCount: 0 },
      categories: [], tags: [], durationStats: [], videos: [],
      ranking: [
        { id: 'v1', title: '折弯机安全操作指南', description: null, durationMs: 60000, videoUrl: null, author: { id: '1', nickname: '工程部', avatarUrl: null, following: false }, cover: null, tags: [], stats: { playCount: 800, likeCount: 50, favoriteCount: 10, commentCount: 5 }, publishedAt: '2026-09-24T00:00:00Z', viewerState: { liked: false, favorited: false } },
        { id: 'v2', title: '设备日常点检流程', description: null, durationMs: 60000, videoUrl: null, author: { id: '1', nickname: '工程部', avatarUrl: null, following: false }, cover: null, tags: [], stats: { playCount: 400, likeCount: 20, favoriteCount: 5, commentCount: 2 }, publishedAt: '2026-09-23T00:00:00Z', viewerState: { liked: false, favorited: false } },
      ],
    })),
  }));

  await page.route('**/api/v1/app/content/v2', route => route.fulfill({ json: api({ id: 'v2', title: '设备日常点检流程', description: '<p>操作说明</p>', author: { id: '1', nickname: '工程部', avatarUrl: null }, stats: { commentCount: 0 }, viewerState: {} }) }));
  await page.route('**/api/v1/app/videos/v2/comments?*', route => route.fulfill({ json: api({ items: [], nextCursor: null }) }));
  await page.goto('discover');
  await expect(page.getByRole('list').getByText('折弯机安全操作指南')).toBeVisible();
  await expect(page.getByRole('list').getByText('设备日常点检流程')).toBeVisible();
  await expect(page.getByText('重庆火锅有多能吃辣')).toHaveCount(0);

  const navBox = await page.locator('.bottom-nav').boundingBox();
  const createBox = await page.locator('.create-button span').boundingBox();
  expect(navBox).not.toBeNull();
  expect(createBox).not.toBeNull();
  expect(createBox!.y).toBeGreaterThanOrEqual(navBox!.y);
  expect(createBox!.y + createBox!.height).toBeLessThanOrEqual(navBox!.y + navBox!.height);

  await page.getByRole('list').getByRole('button', { name: /设备日常点检流程/ }).click();
  await expect(page).toHaveURL(/\/content\/v2$/);
  await expect(page.getByRole('heading', { name: '设备日常点检流程' })).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test('账号注册展示姓名字段，个人中心可进入并保存资料', async ({ page }) => {
  await page.goto('login');
  await expect(page.getByRole('heading', { name: '账号登录' })).toBeVisible();
  await page.getByRole('button', { name: '立即注册' }).click();
  await expect(page.getByPlaceholder('请输入真实姓名')).toBeVisible();

  await page.addInitScript(() => localStorage.setItem('yingliu.app.token', 'e2e-token'));
  await page.route('**/api/v1/app/me', async route => {
    if (route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON() as { nickname: string; bio: string };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(api({ ...user, ...body })) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(api(user)) });
  });
  await page.route('**/api/v1/app/me/agreements', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(api([])),
  }));
  await page.route('**/api/v1/app/me/content/page?*', route => route.fulfill({ json: api({ items: [], nextCursor: null, total: 0 }) }));

  await page.goto('me');
  await expect(page.getByRole('button', { name: '设置', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await expect(page.getByText('账号登录')).toBeVisible();
  const nameInput = page.getByPlaceholder('请输入姓名');
  await nameInput.fill('李工');
  await page.getByRole('button', { name: '保存资料' }).click();
  await expect(page.getByText('已保存')).toBeVisible();
});
