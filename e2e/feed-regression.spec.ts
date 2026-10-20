import { expect, test, type Page } from '@playwright/test';

const author = { id: 'author-1', nickname: '测试作者', avatarUrl: null, following: false };
const feedItems = ['video-1', 'video-2'].map((id, index) => ({
  id,
  title: `测试视频${index + 1}`,
  description: `用于验证滑动切换的第 ${index + 1} 条视频`,
  durationMs: 90_000,
  videoUrl: null,
  author: { ...author },
  cover: null,
  tags: [],
  stats: { playCount: 10 + index, likeCount: 1, favoriteCount: 0, commentCount: 0 },
  publishedAt: '2026-09-08T00:00:00Z',
  viewerState: { liked: false, favorited: false },
}));

function apiData(data: unknown) {
  return JSON.stringify({ code: 'OK', message: '', data, traceId: 'e2e' });
}

async function swipe(page: Page, deltaY: number) {
  await page.evaluate((dy) => {
    const el = document.querySelector<HTMLElement>('.player-hit-area');
    if (!el) throw new Error('player-hit-area not found');
    const init = (y: number) => ({
      pointerId: 1,
      pointerType: 'touch',
      isPrimary: true,
      clientX: 195,
      clientY: y,
      bubbles: true,
    });
    el.dispatchEvent(new PointerEvent('pointerdown', init(500)));
    el.dispatchEvent(new PointerEvent('pointermove', init(500 + dy)));
    el.dispatchEvent(new PointerEvent('pointerup', init(500 + dy)));
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }, deltaY);
  await page.waitForTimeout(420);
}

async function tapVideoSurface(page: Page) {
  await page.locator('.player-hit-area').first().evaluate((element) => (element as HTMLElement).click());
  await page.waitForTimeout(340);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('yingliu.app.token', 'e2e-token'));
  await page.route('**/api/v1/app/me', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: apiData({
      id: 'viewer-1',
      nickname: '测试用户',
      avatarUrl: null,
      bio: null,
      status: 'NORMAL',
      likeReceivedCount: 0,
      followingCount: 0,
      followerCount: 0,
      wecomBound: true,
    }),
  }));
  await page.route('**/api/v1/app/feed/recommend?*', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: apiData({ items: feedItems, nextCursor: null }),
  }));
});

test('两条推荐视频可连续滑动，末尾提示只在越界后出现', async ({ page }) => {
  await page.goto('feed');
  await expect(page.locator('.feed-item')).toHaveCount(2);
  await expect(page.getByText('没有更多了')).toBeHidden();

  await swipe(page, -260);
  await expect(page.locator('.feed-track')).toHaveAttribute('style', /translateY\(-100%\)/);
  await expect(page.getByText('没有更多了')).toBeHidden();

  await swipe(page, -260);
  await expect(page.getByText('没有更多了')).toBeVisible();

  await swipe(page, 260);
  await expect(page.locator('.feed-track')).toHaveAttribute('style', /translateY\(0%\)/);
  await expect(page.getByText('没有更多了')).toBeHidden();
});

test('推荐流始终只让当前视频持有媒体源', async ({ page }) => {
  await page.unroute('**/api/v1/app/feed/recommend?*');
  await page.route('**/api/v1/app/feed/recommend?*', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: apiData({
      items: feedItems.map((item) => ({ ...item, videoUrl: '/videoshare/h5/media/flower.mp4' })),
      nextCursor: null,
    }),
  }));

  await page.goto('feed');
  const players = page.locator('.feed-video');
  await expect(players).toHaveCount(2);
  await expect(page.locator('.feed-video[src]')).toHaveCount(1);
  await expect(players.first()).toHaveAttribute('src', /flower\.mp4$/);
  await expect(players.first()).not.toHaveAttribute('poster', /.+/);
  await expect(players.nth(1)).not.toHaveAttribute('src', /.+/);
  await expect(page.locator('.video-thumbnail video')).toHaveCount(0);
  await expect.poll(() => players.first().evaluate((element) => element.paused)).toBe(false);

  await swipe(page, -260);
  await expect(page.locator('.feed-video[src]')).toHaveCount(1);
  await expect(players.first()).not.toHaveAttribute('src', /.+/);
  await expect(players.nth(1)).toHaveAttribute('src', /flower\.mp4$/);
  await expect(page.locator('.player-hit-area').first()).toHaveAttribute('aria-label', '播放视频');
  await expect.poll(() => players.nth(1).evaluate((element) => element.paused)).toBe(false);
});

test('关注与推荐列表可以双向切换', async ({ page }) => {
  const requests: string[] = [];
  await page.route('**/api/v1/app/feed/following?*', async (route) => {
    requests.push(new URL(route.request().url()).pathname);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: apiData({
        items: [{ ...feedItems[0], author: { ...author, following: true } }],
        nextCursor: null,
      }),
    });
  });

  await page.goto('feed');
  await expect(page.locator('.feed-item')).toHaveCount(2);
  await page.getByRole('button', { name: '关注', exact: true }).click();
  await expect(page.locator('.feed-item')).toHaveCount(1);
  await expect(page.locator('.feed-tabs button.active')).toHaveText('关注');
  expect(requests).toEqual(['/api/v1/app/feed/following']);

  await page.getByRole('button', { name: '推荐', exact: true }).click();
  await expect(page.locator('.feed-item')).toHaveCount(2);
  await expect(page.locator('.feed-tabs button.active')).toHaveText('推荐');
});

test('视频按视口缩放且首页底栏使用浅色统一样式', async ({ page }) => {
  await page.goto('feed');
  const video = page.locator('.feed-video').first();
  await expect(video).toBeVisible();
  const style = await video.evaluate((element) => {
    const computed = getComputedStyle(element);
    return {
      objectFit: computed.objectFit,
      width: element.clientWidth,
      height: element.clientHeight,
      navBackground: getComputedStyle(document.querySelector('.bottom-nav')!).backgroundColor,
    };
  });
  expect(style.objectFit).toBe('contain');
  expect(style.width).toBe(390);
  expect(style.height).toBe(844);
  expect(style.navBackground).toBe('rgb(255, 255, 255)');
});

test('视频支持暂停、继续和拖动进度条', async ({ page }) => {
  await page.unroute('**/api/v1/app/feed/recommend?*');
  await page.route('**/api/v1/app/feed/recommend?*', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: apiData({
      items: [{ ...feedItems[0], videoUrl: '/videoshare/h5/media/flower.mp4' }],
      nextCursor: null,
    }),
  }));

  await page.goto('feed');
  const video = page.locator('.feed-video').first();
  const surface = page.locator('.player-hit-area').first();
  const progress = page.locator('.flow-progress').first();
  await expect(video).toBeVisible();
  await expect.poll(() => video.evaluate((element) => element.duration)).toBeGreaterThan(0);
  await expect.poll(() => video.evaluate((element) => element.paused)).toBe(false);
  await expect(surface).toHaveAttribute('aria-label', '暂停视频');

  await tapVideoSurface(page);
  await expect.poll(() => video.evaluate((element) => element.paused)).toBe(true);
  await expect(surface).toHaveAttribute('aria-label', '播放视频');

  await tapVideoSurface(page);
  await expect.poll(() => video.evaluate((element) => element.paused)).toBe(false);
  await expect(surface).toHaveAttribute('aria-label', '暂停视频');

  const box = await progress.boundingBox();
  if (!box) throw new Error('progress bar not visible');
  await page.mouse.move(box.x + box.width * 0.25, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.75, box.y + box.height / 2);
  await page.mouse.up();
  await expect.poll(() => video.evaluate((element) => element.currentTime / element.duration)).toBeGreaterThan(0.7);
});

test('点赞、收藏、关注调用目标状态接口并同步同作者卡片', async ({ page }) => {
  const writes: string[] = [];
  await page.route('**/api/v1/app/videos/*/like', async (route) => {
    writes.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`);
    await route.fulfill({ status: 200, contentType: 'application/json', body: apiData({ active: true, count: 2 }) });
  });
  await page.route('**/api/v1/app/videos/*/favorite', async (route) => {
    writes.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`);
    await route.fulfill({ status: 200, contentType: 'application/json', body: apiData({ active: true, count: 1 }) });
  });
  await page.route('**/api/v1/app/users/*/follow', async (route) => {
    writes.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`);
    await route.fulfill({ status: 200, contentType: 'application/json', body: apiData({ active: true, count: 1 }) });
  });

  await page.goto('feed');
  await page.getByRole('button', { name: '点赞' }).first().click();
  await page.getByRole('button', { name: '收藏' }).first().click();
  await expect(page.locator('.action-item .liked').first()).toHaveCSS('color', 'rgb(255, 48, 64)');
  await expect(page.locator('.action-item .saved').first()).toHaveCSS('color', 'rgb(246, 195, 68)');
  await page.locator('.creator-anchor span').first().click();
  await expect.poll(() => writes).toEqual([
    'PUT /api/v1/app/videos/video-1/like',
    'PUT /api/v1/app/videos/video-1/favorite',
    'PUT /api/v1/app/users/author-1/follow',
  ]);
  await expect(page.locator('.creator-anchor span').nth(1)).toHaveText('✓');
});

test('首次点赞先更新本地计数，旧的零计数响应不会清掉 1', async ({ page }) => {
  await page.unroute('**/api/v1/app/feed/recommend?*');
  await page.route('**/api/v1/app/feed/recommend?*', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: apiData({ items: [{ ...feedItems[0], stats: { ...feedItems[0].stats, likeCount: 0 } }], nextCursor: null }),
  }));
  let finishLike!: () => void;
  const responsePending = new Promise<void>((resolve) => { finishLike = resolve; });
  await page.route('**/api/v1/app/videos/video-1/like', async (route) => {
    await responsePending;
    await route.fulfill({ status: 200, contentType: 'application/json', body: apiData({ active: true, count: 0 }) });
  });

  await page.goto('feed');
  const likeButton = page.getByRole('button', { name: '点赞' }).first();
  await likeButton.click();
  await expect(likeButton.locator('small')).toHaveText('1');
  await expect(page.locator('.action-item .liked').first()).toBeVisible();
  finishLike();
  await expect(likeButton.locator('small')).toHaveText('1');
});

test('分享只显示站内和复制链接，复制后直接打开完整正文', async ({ page }) => {
  const article = {
    ...feedItems[0],
    title: '分享正文测试',
    description: '<h2>正文标题</h2><p>正文可通过分享链接直接查看。</p>',
    videoUrl: null,
  };
  await page.unroute('**/api/v1/app/feed/recommend?*');
  await page.route('**/api/v1/app/feed/recommend?*', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: apiData({ items: [article], nextCursor: null }),
  }));
  await page.route('**/api/v1/app/videos/video-1', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: apiData(article),
  }));
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);

  await page.goto('feed');
  await page.getByRole('button', { name: '分享', exact: true }).click();
  await expect(page.getByText('微信', { exact: true })).toHaveCount(0);
  await expect(page.getByText('企业微信', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '复制链接' }).click();
  const copiedUrl = await page.evaluate(() => navigator.clipboard.readText());
  expect(new URL(copiedUrl).pathname).toMatch(/\/content\/video-1$/);

  await page.goto(copiedUrl);
  await expect(page.getByRole('heading', { name: '分享正文测试' })).toBeVisible();
  await expect(page.locator('.rich-content')).toContainText('正文可通过分享链接直接查看');
});

test('图文图片预览显示关闭按钮，点击后可返回列表', async ({ page }) => {
  const article = {
    ...feedItems[0],
    title: '图片预览测试',
    description: '<p>可打开并退出图片预览。</p><img src="/fixture.jpg" />',
    videoUrl: null,
  };
  await page.unroute('**/api/v1/app/feed/recommend?*');
  await page.route('**/api/v1/app/feed/recommend?*', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: apiData({ items: [article], nextCursor: null }),
  }));
  await page.route('**/fixture.jpg', (route) => route.fulfill({
    status: 200,
    contentType: 'image/png',
    body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/pWQAAAAASUVORK5CYII=', 'base64'),
  }));

  await page.goto('feed');
  await page.locator('.article-gallery img').click();
  const closeButton = page.locator('.van-image-preview__close-icon');
  await expect(closeButton).toBeVisible();
  await closeButton.click();
  await expect(page.locator('.van-image-preview')).toBeHidden();
  await expect(page.getByText('图片预览测试')).toBeVisible();
  await expect(page.locator('.feed-meta')).toHaveCSS('bottom', '135px');
});

test('收藏、点赞、关注、粉丝页面读取真实 App 查询接口', async ({ page }) => {
  const queried: string[] = [];
  const responses: Record<string, unknown> = {
    '/api/v1/app/me/favorites': { items: [{ ...feedItems[0], videoUrl: '/videoshare/h5/media/flower.mp4' }], nextCursor: null },
    '/api/v1/app/me/likes': { items: [feedItems[1]], nextCursor: null },
    '/api/v1/app/me/following': [{ ...author, following: true }],
    '/api/v1/app/me/followers': [{ ...author, following: false }],
  };
  await page.route('**/api/v1/app/me/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    queried.push(path);
    await route.fulfill({ status: 200, contentType: 'application/json', body: apiData(responses[path]) });
  });

  for (const path of ['me/favorites', 'me/likes', 'me/following', 'me/followers']) {
    await page.goto(path);
    await expect(page.getByText('测试作者').first()).toBeVisible();
    if (path === 'me/favorites') {
      await expect(page.locator('.video-thumbnail video')).toHaveCount(0);
      await expect(page.locator('.video-thumbnail img')).toHaveCount(0);
    }
  }
  expect(queried).toEqual([
    '/api/v1/app/me/favorites',
    '/api/v1/app/me/likes',
    '/api/v1/app/me/following',
    '/api/v1/app/me/followers',
  ]);
});

test('关注和粉丝列表可在页内双向切换', async ({ page }) => {
  const queried: string[] = [];
  await page.route('**/api/v1/app/me/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    queried.push(path);
    const following = path.endsWith('/following');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: apiData([{ ...author, nickname: following ? '我关注的人' : '我的粉丝', following }]),
    });
  });

  await page.goto('me/following');
  await expect(page.getByText('我关注的人')).toBeVisible();
  await page.locator('.user-list-tabs').getByRole('button', { name: '粉丝', exact: true }).click();
  await expect(page).toHaveURL(/\/me\/followers$/);
  await expect(page.getByRole('article').getByText('我的粉丝')).toBeVisible();
  await expect(page.locator('.user-list-tabs button.active')).toHaveText('粉丝');

  await page.locator('.user-list-tabs').getByRole('button', { name: '关注', exact: true }).click();
  await expect(page).toHaveURL(/\/me\/following$/);
  await expect(page.getByText('我关注的人')).toBeVisible();
  await expect(page.locator('.user-list-tabs button.active')).toHaveText('关注');
  expect(queried).toEqual([
    '/api/v1/app/me/following',
    '/api/v1/app/me/followers',
    '/api/v1/app/me/following',
  ]);
});

test('账号设置展示账号登录且不显示企微入口', async ({ page }) => {
  await page.route('**/api/v1/app/me/agreements', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: apiData([]),
  }));

  await page.goto('me/settings');
  await expect(page.getByText('账号登录', { exact: true })).toBeVisible();
  await expect(page.getByText('手机号 + 密码')).toBeVisible();
  await expect(page.getByText('企业微信', { exact: true })).toHaveCount(0);
});
