import { expect, test } from '@playwright/test';

const longTitle = '设备点检完整操作指南：检查液压系统、确认防护装置、记录异常并完成交接，'.repeat(4);
const items = [
  { id: '10001', title: longTitle, videoUrl: null, durationMs: null },
  { id: '10002', title: '设备点检视频演示', videoUrl: '/fixture.mp4', durationMs: 65000 },
  { id: '10003', title: '安全操作图文说明', videoUrl: null, durationMs: null },
].map(item => ({
  ...item, description: '<p>完整设备点检说明</p>',
  author: { id: '1', nickname: '工程部', avatarUrl: null, following: false },
  cover: { coverUrl: '/videoshare/h5/default-content-cover.svg' },
  categories: [{ id: '10', name: '设备操作' }], tags: [{ id: '100', name: '点检' }],
  stats: { playCount: 980, likeCount: 20, favoriteCount: 6, commentCount: 0, watchTimeMs: 0 },
  publishedAt: '2026-10-14T00:00:00Z', viewerState: { liked: false, favorited: false },
}));
const api = (data: unknown) => ({ code: 'OK', data });
const response = (empty = false) => api({
  summary: { totalVideos: 3, totalWatchTimeMs: 0, effectivePlayCount: 10, averageWatchTimeMs: 0, todayNewCount: 3 },
  categories: [{ id: '10', name: '设备操作', videoCount: 3 }], tags: [{ id: '100', name: '点检' }],
  durationStats: [], ranking: items, videos: empty ? [] : items, page: 1, hasMore: false,
});

test('same-page search displays complete metadata and returns to the default homepage', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.route('**/api/v1/app/discover**', route => route.fulfill({ json: response() }));
  await page.route('**/api/v1/app/content/10001', route => route.fulfill({ json: api(items[0]) }));
  await page.route('**/api/v1/app/videos/10001/comments?*', route => route.fulfill({ json: api({ items: [], nextCursor: null }) }));
  await page.goto('discover');
  await expect(page.getByRole('heading', { name: '热门排行' })).toBeVisible();
  await expect(page.locator('#summary-body')).toBeHidden();
  await page.getByRole('button', { name: '展开内容概览' }).click();
  await expect(page.locator('#summary-body')).toBeVisible();
  await page.getByRole('region', { name: '内容筛选' }).getByRole('button', { name: /^设备操作/ }).click();
  await page.getByRole('button', { name: '# 点检', exact: true }).click();
  await page.getByRole('searchbox').fill('设备');
  await page.getByRole('button', { name: '查询', exact: true }).click();
  await expect(page.getByRole('heading', { name: '搜索：设备' })).toBeVisible();
  await expect(page.locator('.ranking-section')).toHaveCount(0);
  await expect(page.locator('.content-summary')).toHaveCount(0);
  await expect(page.locator('.result-copy > small').first()).toHaveText('工程部 · 设备操作');
  await expect(page.locator('.result-cover > i').nth(0)).toHaveText('图文');
  await expect(page.locator('.result-cover > i').nth(1)).toHaveText('01:05');
  expect(await page.locator('.result-copy > strong').first().evaluate(element => {
    const range = document.createRange(); range.selectNodeContents(element);
    return range.getBoundingClientRect().bottom <= element.getBoundingClientRect().bottom + 1;
  })).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: '最新', exact: true }).click();
  await page.getByRole('button', { name: '清空关键词', exact: true }).click();
  const cleared = new URL(page.url());
  expect(cleared.searchParams.has('q')).toBe(false);
  expect(cleared.searchParams.get('category')).toBe('10');
  expect(cleared.searchParams.get('tag')).toBe('100');
  expect(cleared.searchParams.get('sort')).toBe('LATEST');
  await expect(page.getByRole('searchbox')).toHaveValue('');
  await page.getByRole('button', { name: '返回首页', exact: true }).click();
  await expect(page).toHaveURL(/\/discover$/);
  await expect(page.getByRole('heading', { name: '热门排行' })).toBeVisible();
  await expect(page.locator('#summary-body')).toBeHidden();
  await page.locator('.ranking-entry').first().click();
  await expect(page).toHaveURL(/\/content\/10001$/);
  await page.getByRole('button', { name: '返回', exact: true }).click();
  await expect(page.getByRole('heading', { name: '热门排行' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('loading placeholders and empty-state actions preserve search intent', async ({ page }) => {
  let releaseHome!: () => void;
  let releaseSearch!: () => void;
  const homeGate = new Promise<void>(resolve => { releaseHome = resolve; });
  const searchGate = new Promise<void>(resolve => { releaseSearch = resolve; });
  let first = true;
  await page.route('**/api/v1/app/discover**', async route => {
    const keyword = new URL(route.request().url()).searchParams.get('keyword');
    if (first) { first = false; await homeGate; }
    if (keyword === '不存在') await searchGate;
    await route.fulfill({ json: response(keyword === '不存在') });
  });
  await page.goto('discover');
  await expect(page.getByRole('status', { name: '正在加载首页', exact: true })).toBeVisible();
  releaseHome();
  await expect(page.getByRole('heading', { name: '热门排行' })).toBeVisible();
  await page.getByRole('region', { name: '内容筛选' }).getByRole('button', { name: /^设备操作/ }).click();
  await page.getByRole('searchbox').fill('不存在');
  await page.getByRole('button', { name: '查询', exact: true }).click();
  await expect(page.getByRole('status', { name: '正在加载搜索结果', exact: true })).toBeVisible();
  await expect(page.locator('.filter-empty')).toHaveCount(0);
  releaseSearch();
  await expect(page.getByText('没有符合条件的内容')).toBeVisible();
  await page.getByRole('button', { name: '修改关键词', exact: true }).click();
  await expect(page.getByRole('searchbox')).toBeFocused();
  expect(await page.getByRole('searchbox').evaluate((element: HTMLInputElement) => [element.selectionStart, element.selectionEnd])).toEqual([0, 3]);
  expect(new URL(page.url()).searchParams.get('q')).toBe('不存在');
  await page.getByRole('button', { name: '清除筛选条件', exact: true }).click();
  expect(new URL(page.url()).searchParams.has('category')).toBe(false);
  expect(new URL(page.url()).searchParams.get('q')).toBe('不存在');
  await page.getByRole('searchbox').fill('设备');
  await page.getByRole('button', { name: '查询', exact: true }).click();
  await expect(page.locator('.video-result')).toHaveCount(3);
  await expect(page.locator('.filter-empty')).toHaveCount(0);
});
