import { expect, test } from '@playwright/test';

const cover = '/videoshare/h5/default-content-cover.svg';
const item = {
  id: '901', title: '多图设备指南', description: `<p>先检查设备</p><img src="${cover}"><p>确认防护</p><img src="${cover}?second">`,
  videoUrl: null, durationMs: null, cover: { coverUrl: cover },
  author: { id: '1', nickname: '工程部', avatarUrl: null, following: false }, categories: [], tags: [],
  stats: { playCount: 12, likeCount: 2, favoriteCount: 0, commentCount: 0, watchTimeMs: 0 },
  viewerState: { liked: false, favorited: false }, publishedAt: '2026-10-15T00:00:00Z',
};
const api = (data: unknown) => ({ code: 'OK', data });

test('article carousel preserves text and supports keyboard close and focus restoration', async ({ page }) => {
  await page.route('**/api/v1/app/content/901', route => route.fulfill({ json: api(item) }));
  await page.route('**/api/v1/app/videos/901/comments?*', route => route.fulfill({ json: api({ items: [], nextCursor: null }) }));
  await page.goto('content/901');
  await expect(page.getByText('先检查设备', { exact: true })).toBeVisible();
  const open = page.getByRole('button', { name: '查看图片（2）' });
  await open.click();
  const dialog = page.getByRole('dialog', { name: item.title });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: '下一张图片' }).click();
  await expect(dialog.getByText('2 / 2')).toBeVisible();
  await page.screenshot({ path: 'D:/PrivateSoftware/gitClaude/ticktok-api/output/vue-bits-carousel.png' });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(open).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'D:/PrivateSoftware/gitClaude/ticktok-api/output/vue-bits-article.png' });
});

test('validation toast can be dismissed by swiping down', async ({ page }) => {
  await page.goto('login');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  const toast = page.locator('.van-toast');
  await expect(toast).toBeVisible();
  const box = (await toast.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 60, { steps: 5 });
  await page.mouse.up();
  await expect(toast).toBeHidden();
});

test('discovery can switch masonry while keeping results and sorting', async ({ page }) => {
  await page.route('**/api/v1/app/discover**', route => route.fulfill({ json: api({
    summary: { totalVideos: 2, todayNewCount: 1, effectivePlayCount: 12, totalWatchTimeMs: 0, averageWatchTimeMs: 0 },
    ranking: [item], videos: [item, { ...item, id: '902', title: '第二条内容' }], categories: [], tags: [], durationStats: [], page: 1, hasMore: false,
  }) }));
  await page.goto('discover');
  await page.getByRole('searchbox').fill('设备');
  await page.getByRole('button', { name: '查询', exact: true }).click();
  const toggle = page.getByRole('switch', { name: '瀑布流视图' });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.masonry-grid .video-result')).toHaveCount(2);
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'D:/PrivateSoftware/gitClaude/ticktok-api/output/vue-bits-masonry.png' });
  await toggle.click();
  await expect(page.locator('.masonry-grid')).toHaveCount(0);
  await expect(page.locator('.video-result')).toHaveCount(2);
});
