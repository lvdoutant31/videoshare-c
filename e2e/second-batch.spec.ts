import { expect, test } from '@playwright/test';

const api = (data: unknown) => ({ code: 'OK', data });
for (const width of [390, 1440]) {
  test(`recent searches and content-type pagination at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    const items = Array.from({ length: 44 }, (_, index) => ({
      id: String(10000 + index), title: `安全培训${index % 2 ? '图文' : '视频'} ${index + 1}`, description: '<p>安全培训要点</p>',
      videoUrl: index % 2 ? null : '/qa-video.mp4', durationMs: index % 2 ? null : 60000,
      author: { id: '1', nickname: '安全员', avatarUrl: null, following: false },
      cover: { coverUrl: '/videoshare/h5/default-content-cover.svg' }, categories: [{ id: '3', name: '安全培训' }], tags: [],
      stats: { playCount: 0, likeCount: 1, favoriteCount: 1, commentCount: 0 },
      publishedAt: '2026-10-19T00:00:00Z', viewerState: { liked: false, favorited: false },
    }));
    const requests: URL[] = [];
    await page.route('**/api/v1/app/discover?*', route => {
      const url = new URL(route.request().url()); requests.push(url);
      const type = url.searchParams.get('contentType');
      const filtered = items.filter(item => type === 'VIDEO' ? !!item.videoUrl : type === 'ARTICLE' ? !item.videoUrl : true);
      const number = Number(url.searchParams.get('page') ?? 1);
      const limit = Number(url.searchParams.get('limit') ?? 20);
      return route.fulfill({ json: api({
        summary: { totalVideos: 44, totalWatchTimeMs: 0, effectivePlayCount: 0, averageWatchTimeMs: 0, todayNewCount: 44 },
        categories: [{ id: '3', name: '安全培训', videoCount: 44 }], durationStats: [], tags: [], ranking: items.slice(0, 5),
        videos: filtered.slice((number - 1) * limit, number * limit), page: number, hasMore: number * limit < filtered.length,
      }) });
    });
    await page.goto('discover');
    await page.getByRole('searchbox').fill('安全培训');
    await page.getByRole('button', { name: '查询', exact: true }).click();
    await page.locator('.media-type').getByRole('button', { name: '视频', exact: true }).click();
    await expect(page.locator('.video-result')).toHaveCount(20);
    await page.getByRole('button', { name: '加载更多', exact: true }).click();
    await expect(page.locator('.video-result')).toHaveCount(22);
    expect(requests.some(url => url.searchParams.get('contentType') === 'VIDEO' && url.searchParams.get('page') === '2')).toBe(true);
    await expect(page.locator('.video-result').filter({ hasText: '图文' })).toHaveCount(0);
    await page.locator('.discover-scroll').evaluate(element => { element.scrollTop = 0; });
    await page.locator('.media-type').getByRole('button', { name: '图文', exact: true }).click();
    await expect(page.locator('.video-result')).toHaveCount(20);
    await page.getByRole('button', { name: '最新', exact: true }).click();
    await expect(page).toHaveURL(/contentType=ARTICLE/);
    await page.reload();
    await expect(page.locator('.media-type').getByRole('button', { name: '图文', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.recent-words button')).toHaveText(['安全培训']);
    expect(await page.locator('.discover-scroll').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('search-improvements.png') });
    await page.getByRole('button', { name: '清空记录', exact: true }).click();
    await page.reload();
    await expect(page.getByRole('region', { name: '最近搜索' })).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test('a failing like cannot undo a successful favorite and repeated likes are locked', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('yingliu.app.token', 'qa-token'));
  const item = { id: '901', title: '互动回归', description: '<p>测试图文</p>', videoUrl: null, durationMs: null,
    author: { id: '1', nickname: '作者', avatarUrl: null, following: false }, cover: null, categories: [], tags: [],
    stats: { playCount: 0, likeCount: 3, favoriteCount: 2, commentCount: 0 }, viewerState: { liked: false, favorited: false } };
  let rejectLike!: () => void;
  const likeGate = new Promise<void>(resolve => { rejectLike = resolve; });
  let likeCalls = 0;
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown = {};
    if (path.endsWith('/app/me')) data = { id: 'viewer', nickname: '测试用户', status: 'NORMAL' };
    else if (path.endsWith('/app/feed/recommend')) data = { items: [item], nextCursor: null };
    else if (path.endsWith('/like')) {
      likeCalls++; await likeGate;
      await route.fulfill({ status: 503, json: { code: 'UNAVAILABLE', message: '稍后重试' } }); return;
    } else if (path.endsWith('/favorite')) data = { active: true, count: 8 };
    await route.fulfill({ json: api(data) });
  });
  await page.goto('feed');
  const like = page.getByRole('button', { name: '点赞', exact: true });
  const favorite = page.getByRole('button', { name: '收藏', exact: true });
  await like.click();
  await expect(like).toBeDisabled();
  await favorite.click();
  await expect(favorite).toHaveAttribute('aria-pressed', 'true');
  await expect(favorite).toHaveText('8');
  rejectLike();
  await expect(like).toBeEnabled();
  await expect(like).toHaveAttribute('aria-pressed', 'false');
  await expect(like).toHaveText('3');
  await expect(favorite).toHaveAttribute('aria-pressed', 'true');
  await expect(favorite).toHaveText('8');
  expect(likeCalls).toBe(1);
});
