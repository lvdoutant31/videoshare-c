import { expect, test } from '@playwright/test';

test('search sorting, pagination and detail return preserve the search state', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const items = Array.from({ length: 22 }, (_, i) => ({
    id: String(10001 + i), title: `设备点检流程 ${i + 1}`, description: '<p>设备点检操作说明</p>',
    durationMs: null, videoUrl: null, author: { id: '1', nickname: '工程部', avatarUrl: null, following: false },
    cover: null, categories: [{ id: '10', name: '设备操作' }], tags: [],
    stats: { playCount: 100 + i, likeCount: 0, favoriteCount: 0, commentCount: 0, watchTimeMs: 0 },
    publishedAt: '2026-10-14T00:00:00Z', viewerState: { liked: false, favorited: false },
  }));
  const api = (data: unknown) => ({ code: 'OK', data });
  const requests: URL[] = [];
  await page.route('**/api/v1/app/discover**', route => {
    const url = new URL(route.request().url()); requests.push(url);
    const pageNumber = Number(url.searchParams.get('page') ?? '1');
    const sorted = url.searchParams.get('sort') === 'LATEST' ? [...items].reverse() : items;
    return route.fulfill({ json: api({
      summary: { totalVideos: 22, totalWatchTimeMs: 0, effectivePlayCount: 22, averageWatchTimeMs: 0, todayNewCount: 22 },
      categories: [{ id: '10', name: '设备操作', videoCount: 22 }], durationStats: [], tags: [], ranking: items.slice(0, 5),
      videos: sorted.slice((pageNumber - 1) * 20, pageNumber * 20), page: pageNumber, hasMore: pageNumber === 1,
    }) });
  });
  await page.route('**/api/v1/app/content/*', route => route.fulfill({ json: api(items.find(item => route.request().url().endsWith('/' + item.id))) }));
  await page.route('**/api/v1/app/videos/*/comments?*', route => route.fulfill({ json: api({ items: [], nextCursor: null }) }));
  await page.goto('discover');
  await expect(page.getByRole('heading', { name: '热门排行' })).toBeVisible();
  await page.getByRole('searchbox').fill('设备');
  await page.getByRole('button', { name: '查询', exact: true }).click();
  await expect(page.locator('.video-result')).toHaveCount(20);
  await expect(page.locator('.ranking-section')).toHaveCount(0);
  await page.getByRole('button', { name: '最新', exact: true }).click();
  await expect(page).toHaveURL(/sort=LATEST/);
  await expect(page.locator('.video-result').first()).toContainText('设备点检流程 22');
  await page.getByRole('button', { name: '加载更多', exact: true }).click();
  await expect(page.locator('.video-result')).toHaveCount(22);
  await expect(page.getByText('已显示全部结果')).toBeVisible();
  expect(requests.some(url => url.searchParams.get('page') === '2' && url.searchParams.get('sort') === 'LATEST')).toBe(true);
  await page.locator('.video-result').last().scrollIntoViewIfNeeded();
  const scrollTop = await page.locator('.discover-scroll').evaluate(element => element.scrollTop);
  await page.locator('.video-result').last().click();
  await expect(page).toHaveURL(/\/content\/10001$/);
  await page.getByRole('button', { name: '返回', exact: true }).click();
  await expect(page.locator('.video-result')).toHaveCount(22);
  await expect(page.getByRole('searchbox')).toHaveValue('设备');
  await expect(page.getByRole('button', { name: '最新', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => page.locator('.discover-scroll').evaluate(element => element.scrollTop)).toBe(scrollTop);
  await page.getByRole('button', { name: '最热', exact: true }).click();
  await expect(page.locator('.video-result')).toHaveCount(20);
  await expect(page.locator('.video-result').first()).toContainText('设备点检流程 1');
  await page.reload();
  await expect(page.getByRole('searchbox')).toHaveValue('设备');
  await expect(page.getByRole('button', { name: '最热', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});
