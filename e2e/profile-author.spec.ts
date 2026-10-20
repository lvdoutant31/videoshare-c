import { expect, test, type Page } from '@playwright/test';
import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const envelope = (data: unknown) => ({ code: 'OK', message: 'ok', data, traceId: 'profile-author' });
const authorId = '2097975613254594562';
const user = { id: authorId, nickname: 'admin', avatarUrl: null, bio: '', status: 'NORMAL', followingCount: 0, followerCount: 1, likeReceivedCount: 7, wecomBound: false };
const names = ['设备实拍展示', '季度工作会议', '安全生产活动', '精益改善培训', '企业文化宣传', '制造工艺记录'];
const mediaRoot = resolve('../ticktok-api/document/media/covers/video');
const covers = existsSync(mediaRoot) ? readdirSync(mediaRoot).filter(name => name.endsWith('.jpg')) : [];
function item(index: number, prefix = '作品') {
  return { id: String(2109000000000000000n - BigInt(index)), title: `${prefix} ${index + 1} · ${names[index % names.length]}`, description: '<p>图文正文</p>',
    durationMs: null, videoUrl: null, cover: { id: String(index), coverUrl: `/__profile-cover/${index % Math.max(covers.length, 1)}.jpg` }, tags: [], categories: [],
    author: { id: authorId, nickname: 'admin', avatarUrl: null, following: false },
    stats: { playCount: 30, likeCount: 7, favoriteCount: 3, commentCount: 0, watchTimeMs: 0 },
    viewerState: { liked: true, favorited: true }, publishedAt: '2026-10-12T08:00:00Z' };
}
function own(index: number, status = 'PUBLISHED') {
  const value = item(index);
  return { id: value.id, title: value.title, authorNickname: 'admin', description: value.description, coverMedia: { url: value.cover.coverUrl },
    videoUrl: index % 3 === 2 ? null : '/videoshare/h5/media/flower.mp4', originalMedia: index % 3 === 2 ? null : { url: '/videoshare/h5/media/flower.mp4' },
    auditStatus: 'APPROVED', publishStatus: status, likeCount: index === 0 ? 27 : index * 3, playCount: index === 0 ? 12345 : index * 100,
    createdAt: '2026-10-12T08:00:00Z', updatedAt: '2026-10-12T08:00:00Z', currentVersion: 1, categories: [], tags: [] };
}
function paginate<T extends { id: string }>(values: T[], url: URL) {
  const cursor = url.searchParams.get('cursor');
  const start = cursor ? values.findIndex(value => value.id === cursor) + 1 : 0;
  const limit = Number(url.searchParams.get('limit') ?? 20);
  const items = values.slice(start, start + limit);
  return { items, nextCursor: start + items.length < values.length ? items.at(-1)!.id : null };
}
async function setup(page: Page) {
  await page.addInitScript(() => localStorage.setItem('yingliu.app.token', 'profile-test-token'));
  await page.route('**/__profile-cover/*.jpg', route => covers.length
    ? route.fulfill({ path: resolve(mediaRoot, covers[Number(new URL(route.request().url()).pathname.split('/').pop()!.split('.')[0]) % covers.length]), contentType: 'image/jpeg' })
    : route.fulfill({ path: resolve('public/default-content-cover.svg'), contentType: 'image/svg+xml' }));
  await page.route('**/api/v1/app/**', async route => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace('/api/v1/app', '');
    let data: unknown = null;
    if (path === '/me') data = user;
    else if (path === '/discover') data = { summary: { totalVideos: 27, totalWatchTimeMs: 0, effectivePlayCount: 0, averageWatchTimeMs: 0, todayNewCount: 0 }, categories: [], durationStats: [], tags: [], ranking: [], videos: [] };
    else if (path === '/users') data = { items: [{ ...user, worksCount: 27, following: false }], nextCursor: null };
    else if (path === `/users/${authorId}` || path === '/users/99') data = { ...user, id: path.endsWith('/99') ? '99' : authorId, worksCount: 27, following: false };
    else if (path.endsWith('/videos')) data = paginate(Array.from({ length: 27 }, (_, index) => item(index)), url);
    else if (path.endsWith('/likes') && path.startsWith('/users/')) data = paginate(Array.from({ length: 23 }, (_, index) => item(index, '作者点赞')), url);
    else if (path === '/me/content/page') data = { ...paginate(Array.from({ length: 127 }, (_, index) => own(index, url.searchParams.get('status') === 'OFF_SHELF' ? 'OFF_SHELF' : 'PUBLISHED')), url), total: 127 };
    else if (path === '/me/favorites' || path === '/me/likes') data = paginate(Array.from({ length: 24 }, (_, index) => item(index, path.endsWith('likes') ? '我的点赞' : '我的收藏')), url);
    else if (path === '/me/history') { const page = paginate(Array.from({ length: 24 }, (_, index) => item(index, '观看记录')), url); data = { ...page, items: page.items.map(video => ({ videoId: video.id, video, lastViewedAt: '2026-10-12T08:00:00Z', progressMs: 0 })) }; }
    else if (path.endsWith('/comments')) data = { items: [], nextCursor: null };
    else if (path.startsWith('/videos/')) data = item(Number(2109000000000000000n - BigInt(path.split('/').pop()!)), '内容详情');
    else if (path.startsWith('/me/content/')) data = own(0);
    else if (path === '/me/agreements' || path === '/me/following' || path === '/me/followers') data = [];
    return route.fulfill({ json: envelope(data) });
  });
}
test.beforeEach(async ({ page }) => setup(page));

test('个人内容 Tab 支持方向键、首尾跳转和关联面板，作品不显示下拉框', async ({ page }) => {
  await page.goto('me');
  const works = page.getByRole('tab', { name: '作品 127' });
  await expect(works).toHaveAttribute('tabindex', '0');
  await works.focus();
  await page.keyboard.press('ArrowRight');
  const favorites = page.getByRole('tab', { name: '收藏', exact: true });
  await expect(favorites).toBeFocused();
  await expect(favorites).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#me-favorites')).toHaveAttribute('aria-labelledby', 'me-tab-favorites');
  await page.keyboard.press('End');
  await expect(page.getByRole('tab', { name: '历史', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(works).toBeFocused();
  await page.keyboard.press('End');
  await page.keyboard.press('Home');
  await expect(works).toBeFocused();
  await expect(page.locator('[role="tab"][tabindex="0"]')).toHaveCount(1);
  await expect(page.getByRole('combobox', { name: '作品状态' })).toHaveCount(0);
});

test('窄屏状态标记与作品类型不重叠，长昵称仍保持页面宽度', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.route('**/api/v1/app/me', route => route.fulfill({ json: envelope({ ...user, nickname: '很长的昵称用于检验移动端个人资料布局不会超出屏幕宽度' }) }));
  await page.route('**/api/v1/app/me/content/page?*', route => route.fulfill({ json: envelope({ items: [own(0, 'OFF_SHELF')], nextCursor: null, total: 1 }) }));
  await page.goto('me');
  await expect(page.getByRole('tab', { name: '作品 1' })).toBeVisible();
  const card = page.locator('#me-works .collection-item').first();
  await expect(card.locator('.collection-status')).toHaveText('已下架');
  const type = await card.locator('.collection-type').boundingBox();
  const status = await card.locator('.collection-status').boundingBox();
  expect(type!.x + type!.width).toBeLessThanOrEqual(status!.x);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('我的作品左右显示真实点赞和播放数，窄屏不重叠且仍能管理作品', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('me');
  const card = page.locator('#me-works .collection-item').first();
  await expect(card.getByLabel('点赞 27 次')).toBeVisible();
  await expect(card.getByLabel('播放 12345 次')).toBeVisible();
  await expect(card.locator('.collection-plays')).toHaveText('1.2w');
  const article = page.locator('#me-works .collection-item').nth(2);
  await expect(article.locator('.collection-type')).toHaveText('图文');
  await expect(article.locator('.collection-likes')).toHaveText('6');
  for (const width of [390, 320, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    const likes = await card.locator('.collection-likes').boundingBox();
    const plays = await card.locator('.collection-plays').boundingBox();
    expect(likes!.x + likes!.width).toBeLessThanOrEqual(plays!.x);
    expect(Math.abs(likes!.y - plays!.y)).toBeLessThan(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await card.click();
  await expect(page.getByRole('button', { name: '编辑并重新提交审核', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '撤下', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('作者搜索进入主页，显示真实总数，加载第二页和作者喜欢，返回保留位置', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('discover');
  await page.locator('.search-kind').getByRole('button', { name: '作者', exact: true }).click();
  await page.getByRole('searchbox', { name: '作者关键词' }).fill('admin');
  await page.getByRole('button', { name: '查询', exact: true }).click();
  await expect(page.locator('.author-result')).toContainText('27 件作品');
  await page.locator('.author-result').click();
  await expect(page.getByRole('tab', { name: '作品 27' })).toBeVisible();
  await expect(page.getByRole('tab', { name: '私密' })).toHaveCount(0);
  const works = page.locator('[role="tabpanel"]').first();
  await expect(works.locator('.collection-item')).toHaveCount(18);
  await page.locator('.profile-scroll').evaluate(element => { element.scrollTop = element.scrollHeight; });
  await expect(works.locator('.collection-item')).toHaveCount(27);
  await works.locator('.collection-item').last().scrollIntoViewIfNeeded();
  const position = await page.locator('.profile-scroll').evaluate(element => element.scrollTop);
  await works.locator('.collection-item').last().click();
  await expect(page).toHaveURL(/\/content\//);
  await page.getByRole('button', { name: '返回', exact: true }).click();
  await expect(page.getByRole('tab', { name: '作品 27' })).toHaveAttribute('aria-selected', 'true');
  await expect.poll(() => page.locator('.profile-scroll').evaluate(element => element.scrollTop)).toBeCloseTo(position, -1);
  await page.getByRole('tab', { name: '喜欢', exact: true }).click();
  await expect(page.locator('[role="tabpanel"]').last().locator('.collection-item').first()).toContainText('作者点赞');
  expect(errors).toEqual([]);
});

test('我的四个 Tab 读取各自接口，收藏续加载及返回保留 Tab 和位置', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('me');
  await expect(page.getByRole('tab', { name: '作品 127' })).toBeVisible();
  await expect(page.locator('#me-works .collection-item')).toHaveCount(20);
  await page.getByRole('tab', { name: '收藏', exact: true }).click();
  await expect(page.locator('#me-favorites .collection-item')).toHaveCount(20);
  await page.locator('.me-scroll').evaluate(element => { element.scrollTop = element.scrollHeight; });
  await expect(page.locator('#me-favorites .collection-item')).toHaveCount(24);
  await page.locator('#me-favorites .collection-item').last().scrollIntoViewIfNeeded();
  const position = await page.locator('.me-scroll').evaluate(element => element.scrollTop);
  await page.locator('#me-favorites .collection-item').last().click();
  await page.getByRole('button', { name: '返回', exact: true }).click();
  await expect(page.getByRole('tab', { name: '收藏', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect.poll(() => page.locator('.me-scroll').evaluate(element => element.scrollTop)).toBeCloseTo(position, -1);
  await page.getByRole('tab', { name: '喜欢', exact: true }).click();
  await expect(page.locator('#me-likes .collection-item').first()).toContainText('我的点赞');
  await page.getByRole('tab', { name: '历史', exact: true }).click();
  await expect(page.locator('#me-history .collection-item').first()).toContainText('观看记录');
  await expect(page.locator('#me-history .collection-item small').first()).not.toBeEmpty();
  await page.getByRole('tab', { name: '收藏', exact: true }).click();
  await expect.poll(() => page.locator('.me-scroll').evaluate(element => element.scrollTop)).toBeCloseTo(position, -1);
  expect(errors).toEqual([]);
});

test('作品直接展示全部状态，无下拉框且仍能管理审核中作品', async ({ page }) => {
  const values = [own(0), { ...own(1, 'UNPUBLISHED'), auditStatus: 'PENDING_REVIEW' }, own(2, 'OFF_SHELF')];
  const statuses: (string | null)[] = [];
  await page.route('**/api/v1/app/me/content/page?*', route => {
    statuses.push(new URL(route.request().url()).searchParams.get('status'));
    return route.fulfill({ json: envelope({ items: values, nextCursor: null, total: 3 }) });
  });
  await page.route(`**/api/v1/app/me/content/${values[1].id}`, route => route.fulfill({ json: envelope(values[1]) }));
  await page.goto('me');
  await expect(page.getByRole('tab', { name: '作品 3' })).toBeVisible();
  await expect(page.getByRole('combobox')).toHaveCount(0);
  await expect(page.locator('#me-works .collection-item')).toHaveCount(3);
  await expect(page.locator('#me-works .collection-status')).toHaveText(['审核中', '已下架']);
  await page.locator('#me-works .collection-item').nth(1).click();
  await expect(page).toHaveURL(/\/me\/content\//);
  await expect(page.getByRole('button', { name: '编辑并重新提交审核' })).toBeVisible();
  await page.goto('me/content');
  await expect(page.getByRole('combobox')).toHaveCount(0);
  await expect(page.locator('.collection-item')).toHaveCount(3);
  expect(statuses.length).toBeGreaterThanOrEqual(2);
  expect(statuses.every(status => status === 'ALL')).toBe(true);
});

test('撤下作品后返回保留本人作品并刷新状态和数量', async ({ page }) => {
  let removed = false;
  const target = own(0);
  await page.route('**/api/v1/app/me/content/page?*', route => route.fulfill({ json: envelope({
    items: [{ ...target, publishStatus: removed ? 'OFF_SHELF' : 'PUBLISHED' }, own(1)], nextCursor: null, total: 2,
  }) }));
  await page.route(`**/api/v1/app/me/content/${target.id}`, route => route.fulfill({ json: envelope({ ...target, publishStatus: removed ? 'OFF_SHELF' : 'PUBLISHED' }) }));
  await page.route(`**/api/v1/app/me/content/${target.id}/off-shelf`, route => { removed = true; return route.fulfill({ json: envelope(null) }); });
  await page.goto('me');
  await expect(page.getByRole('tab', { name: '作品 2' })).toBeVisible();
  await page.locator('#me-works .collection-item').first().click();
  await page.getByRole('button', { name: '撤下', exact: true }).click();
  await page.getByRole('button', { name: '确认', exact: true }).click();
  await expect(page.getByText('已下架', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '返回', exact: true }).click();
  await expect(page.locator('#me-works .collection-item')).toHaveCount(2);
  await expect(page.locator('#me-works .collection-item').first().locator('.collection-status')).toHaveText('已下架');
  await expect(page.getByRole('tab', { name: '作品 2' })).toBeVisible();
});

test('取消点赞后返回喜欢 Tab 会移除该内容', async ({ page }) => {
  let liked = true;
  const value = { ...item(0, '待取消点赞'), videoUrl: '/videoshare/h5/media/flower.mp4' };
  const current = () => ({ ...value, viewerState: { liked, favorited: false } });
  await page.route('**/api/v1/app/me/likes?*', route => route.fulfill({ json: envelope({ items: liked ? [current()] : [], nextCursor: null }) }));
  await page.route('**/api/v1/app/feed/recommend?*', route => route.fulfill({ json: envelope({ items: [current()], nextCursor: null }) }));
  await page.route(`**/api/v1/app/videos/${value.id}`, route => route.fulfill({ json: envelope(current()) }));
  await page.route(`**/api/v1/app/videos/${value.id}/like`, route => { liked = route.request().postDataJSON().active; return route.fulfill({ json: envelope({ active: liked, count: liked ? 7 : 6 }) }); });
  await page.goto('me');
  await page.getByRole('tab', { name: '喜欢', exact: true }).click();
  await page.locator('#me-likes .collection-item').click();
  await page.getByRole('button', { name: '点赞', exact: true }).click();
  await expect.poll(() => liked).toBe(false);
  await page.goBack();
  await expect(page.getByRole('tab', { name: '喜欢', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#me-likes .collection-item')).toHaveCount(0);
});

test('在其他页面新增点赞后，缓存的喜欢 Tab 会展示新增内容', async ({ page }) => {
  let liked = false;
  const value = { ...item(0, '新点赞内容'), videoUrl: '/videoshare/h5/media/flower.mp4' };
  const current = () => ({ ...value, viewerState: { liked, favorited: false } });
  await page.route('**/api/v1/app/me/likes?*', route => route.fulfill({ json: envelope({ items: liked ? [current()] : [], nextCursor: null }) }));
  await page.route('**/api/v1/app/feed/recommend?*', route => route.fulfill({ json: envelope({ items: [current()], nextCursor: null }) }));
  await page.route(`**/api/v1/app/videos/${value.id}/like`, route => { liked = route.request().postDataJSON().active; return route.fulfill({ json: envelope({ active: liked, count: 1 }) }); });
  await page.goto('me');
  await page.getByRole('tab', { name: '喜欢', exact: true }).click();
  await expect(page.getByText('还没有点赞内容', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '视频', exact: true }).click();
  await page.getByRole('button', { name: '点赞', exact: true }).click();
  await expect.poll(() => liked).toBe(true);
  await page.getByRole('button', { name: '我', exact: true }).click();
  await expect(page.locator('#me-likes .collection-item')).toContainText('新点赞内容');
});

test('设置集中保留资料编辑、关注、粉丝、消息和退出入口', async ({ page }) => {
  await page.goto('me');
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await expect(page.getByRole('button', { name: '我的关注', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '我的粉丝', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '消息', exact: true })).toBeVisible();
  await expect(page.getByPlaceholder('请输入姓名')).toHaveValue('admin');
  await page.getByRole('button', { name: '退出登录', exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByRole('button', { name: '退出登录', exact: true })).toBeVisible();
});

test('列表接口失败显示重试并能恢复', async ({ page }) => {
  let attempts = 0;
  await page.route('**/api/v1/app/me/likes?*', route => ++attempts === 1 ? route.fulfill({ status: 503, json: { code: 'TEMP_UNAVAILABLE' } })
    : route.fulfill({ json: envelope({ items: [item(0, '重试成功')], nextCursor: null }) }));
  await page.goto('me');
  await page.getByRole('tab', { name: '喜欢', exact: true }).click();
  await page.getByText('加载失败，点击重试', { exact: true }).click();
  await expect(page.locator('#me-likes .collection-item')).toContainText('重试成功');
});

test('信息流请求较慢时，切页返回仍显示最初指定的内容', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let requested = false;
  const target = item(11);
  await page.route('**/api/v1/app/feed/recommend?*', async route => {
    requested = true; await gate; await route.fulfill({ json: envelope({ items: [], nextCursor: null }) });
  });
  await page.goto(`feed?video=${target.id}`);
  await expect.poll(() => requested).toBe(true);
  await page.getByRole('button', { name: '我', exact: true }).click();
  release();
  await expect(page.getByRole('tab', { name: '作品 127' })).toBeVisible();
  await page.goBack();
  await expect(page.locator('.feed-item').first()).toHaveAttribute('data-video-id', target.id);
});

test('手机与桌面布局截图，无横向溢出且主导航不遮挡内容', async ({ page }, testInfo) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('me');
  await expect(page.getByRole('tab', { name: '作品 127' })).toBeVisible();
  await expect(page.locator('.collection-cover img').first()).toBeVisible();
  await page.screenshot({ path: `${testInfo.outputDir}/profile-mobile.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: `${testInfo.outputDir}/profile-desktop.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.getByRole('button', { name: '设置', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('作品操作入口可以展开，查看返回后卡片仍然保留', async ({ page }) => {
  await page.goto('me');
  const row = page.locator('#me-works .collection-cell').first();
  await row.getByRole('button', { name: '更多操作' }).click();
  await row.getByRole('button', { name: '查看', exact: true }).click();
  await expect(page.getByRole('button', { name: '编辑并重新提交审核', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '返回', exact: true }).click();
  await expect(page.locator('#me-works .collection-item').first()).toBeVisible();
});
