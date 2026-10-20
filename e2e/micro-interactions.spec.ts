import { expect, test, type Page } from '@playwright/test';

const evidence = 'C:/Users/吴骏/.codex/visualizations/2026/10/14/01a137b8-99ad-7930-a7c9-73037c1ee04c';
const item = {
  id: 'micro-article', title: '设备点检操作指南', description: '<p>检查设备、确认防护装置并记录异常。</p>',
  videoUrl: null, durationMs: null, cover: { coverUrl: '/videoshare/h5/default-content-cover.svg' },
  author: { id: 'author', nickname: '工程部', avatarUrl: null, following: false },
  categories: [{ id: '10', name: '设备操作' }], tags: [], publishedAt: '2026-10-14T00:00:00Z',
  stats: { playCount: 980, likeCount: 9, favoriteCount: 2, commentCount: 0, watchTimeMs: 0 },
  viewerState: { liked: false, favorited: false },
};
const api = (data: unknown) => ({ code: 'OK', data });
async function fixtures(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('yingliu.app.token', 'fixture-token');
    const state = window as typeof window & { motionEvents: number[] };
    state.motionEvents = [];
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (keyframes, options) {
      state.motionEvents.push(typeof options === 'number' ? options : Number(options?.duration ?? 0));
      return animate.call(this, keyframes, options);
    };
  });
  await page.route('**/api/v1/app/**', route => route.fulfill({ json: api({}) }));
  await page.route('**/api/v1/app/me', route => route.fulfill({ json: api({ id: 'viewer', nickname: '读者', status: 'NORMAL' }) }));
  await page.route('**/api/v1/app/feed/recommend?*', route => route.fulfill({ json: api({ items: [item], nextCursor: null }) }));
  await page.route('**/api/v1/app/content/micro-article', route => route.fulfill({ json: api(item) }));
  await page.route('**/api/v1/app/videos/micro-article/comments?*', route => route.fulfill({ json: api({ items: [], nextCursor: null }) }));
  await page.route('**/api/v1/app/discover?*', route => {
    const params = new URL(route.request().url()).searchParams;
    const second = params.get('page') === '2';
    const videos = second ? [{ ...item, id: 'micro-second', title: '点检记录说明' }] : [item];
    return route.fulfill({ json: api({
      summary: { totalVideos: 2, totalWatchTimeMs: 0, effectivePlayCount: 980, averageWatchTimeMs: 0, todayNewCount: 2 },
      categories: [{ id: '10', name: '设备操作', videoCount: 2 }], tags: [], durationStats: [],
      ranking: [item], videos, page: second ? 2 : 1, hasMore: !second,
    }) });
  });
}
const motions = (page: Page) => page.evaluate(() => (window as typeof window & { motionEvents: number[] }).motionEvents);

test('segmented search keeps keyboard selection, pagination and detail return stable', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await fixtures(page);
  await page.goto('discover');
  await expect(page.getByRole('heading', { name: '热门排行' })).toBeVisible();
  expect(await motions(page)).toContain(200);
  await page.getByRole('searchbox').fill('点检');
  await page.getByRole('button', { name: '查询', exact: true }).click();
  await expect(page.locator('.video-result')).toHaveCount(1);
  const latest = page.getByRole('button', { name: '最新', exact: true });
  await latest.focus(); await latest.press('Space');
  await expect(latest).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '最热', exact: true }).click();
  await page.getByRole('button', { name: '综合', exact: true }).click();
  await expect(page.getByRole('button', { name: '综合', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.video-result')).toHaveCount(1);
  const beforeAppend = (await motions(page)).filter(duration => duration === 200).length;
  await page.getByRole('button', { name: '加载更多', exact: true }).click();
  await expect(page.locator('.video-result')).toHaveCount(2);
  expect((await motions(page)).filter(duration => duration === 200)).toHaveLength(beforeAppend);
  await page.screenshot({ path: `${evidence}/micro-search-${testInfo.project.name}.png` });
  await page.locator('.video-result').first().click();
  await expect(page.getByRole('heading', { name: item.title, exact: true })).toBeVisible();
  await page.getByRole('button', { name: '返回', exact: true }).click();
  await expect(page.locator('.video-result')).toHaveCount(2);
  expect((await motions(page)).filter(duration => duration === 200)).toHaveLength(beforeAppend);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page).toHaveTitle('videoshare');
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('article interaction waits for confirmation and preserves the count on request failure', async ({ page }, testInfo) => {
  await fixtures(page);
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  let requests = 0;
  await page.route('**/api/v1/app/videos/micro-article/like', async route => {
    requests++;
    if (requests === 1) { await pending; await route.fulfill({ json: api({ active: true, count: 10 }) }); }
    else await route.fulfill({ status: 500, json: { code: 'INTERNAL_ERROR', message: '请重试' } });
  });
  await page.route('**/api/v1/app/videos/micro-article/favorite', route => route.fulfill({ json: api({ active: true, count: 3 }) }));
  await page.goto('content/micro-article');
  const like = page.getByRole('button', { name: '点赞内容', exact: true });
  await like.click();
  await expect(like).toBeDisabled();
  await expect(like).toHaveAttribute('aria-pressed', 'false');
  await expect(like).toHaveText('9');
  release();
  await expect(like).toHaveAttribute('aria-pressed', 'true');
  await expect(like).toHaveText('10');
  expect(await motions(page)).toContain(560);
  await like.click();
  await expect(page.getByText('请重试', { exact: true })).toBeVisible();
  await expect(like).toHaveAttribute('aria-pressed', 'true');
  await expect(like).toHaveText('10');
  const favorite = page.getByRole('button', { name: '收藏内容', exact: true });
  await favorite.click();
  await expect(favorite).toHaveAttribute('aria-pressed', 'true');
  await expect(favorite).toHaveText('3');
  await page.screenshot({ path: `${evidence}/micro-detail-${testInfo.project.name}.png` });
  expect(requests).toBe(2);
});

test('reduced motion disables effects while feed buttons keep native click and keyboard behavior', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await fixtures(page);
  await page.route('**/api/v1/app/videos/micro-article/like', route => route.fulfill({ json: api({ active: true, count: 10 }) }));
  await page.goto('discover');
  await expect(page.getByRole('heading', { name: '热门排行' })).toBeVisible();
  expect(await motions(page)).toEqual([]);
  expect(await page.locator('.segment-indicator').evaluate(element => parseFloat(getComputedStyle(element).transitionDuration))).toBeLessThan(0.001);
  await page.goto('feed');
  const like = page.getByRole('button', { name: '点赞', exact: true });
  await expect(like).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(page.getByRole('button', { name: '收藏', exact: true })).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await like.focus(); await like.press('Enter');
  await expect(like).toHaveAttribute('aria-pressed', 'true');
  await expect(like).toHaveText('10');
  expect(await motions(page)).toEqual([]);
});
