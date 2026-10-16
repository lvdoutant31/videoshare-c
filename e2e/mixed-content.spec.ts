import { expect, test, type Page } from '@playwright/test';

const envelope = (data: unknown) => ({ code: 'OK', data, traceId: 'mixed-content' });
const base = {
  durationMs: null, videoUrl: null, cover: null, categories: [{ id: '1', name: '培训' }], tags: [],
  author: { id: '1', nickname: '测试作者', avatarUrl: null, following: false },
  stats: { playCount: 0, likeCount: 0, favoriteCount: 0, commentCount: 0, watchTimeMs: 0 },
  publishedAt: '2026-10-09T08:00:00', viewerState: { liked: false, favorited: false },
};
const article = { ...base, id: 'article', title: '多图内容', description: '<p><strong>保留加粗正文</strong></p><img src="https://images.example/first.png"><p>第二段</p><img src="https://images.example/second.png">' };
const text = { ...base, id: 'text', title: '纯文字内容', description: '<p>纯文字正文</p>' };
const video = { ...base, id: 'video', title: '视频与正文', videoUrl: '/media/test.mp4', durationMs: 1000, description: '<p><strong>视频正文</strong></p>' };

for (const mode of ['recommend', 'following'] as const) {
  test(`${mode} feed returns from article detail to the same item and interactions`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error' || message.type() === 'warning') errors.push(message.text());
    });
    await page.addInitScript(() => {
      localStorage.setItem('yingliu.app.token', 'test-token');
      Math.random = () => 0.999;
    });
    await api(page, '**/api/v1/app/me', { id: 'viewer', nickname: '读者', status: 'NORMAL' });
    let feedRequests = 0;
    await page.route(`**/api/v1/app/feed/${mode}?*`, route => {
      feedRequests += 1;
      return route.fulfill({ json: envelope({ items: [text, article], nextCursor: null }) });
    });
    const likes: boolean[] = [];
    await page.route('**/api/v1/app/videos/article/like', route => {
      likes.push(route.request().postDataJSON().active);
      return route.fulfill({ json: envelope({ active: likes.at(-1), count: likes.at(-1) ? 1 : 0 }) });
    });
    await api(page, '**/api/v1/app/videos/article/comments?*', { items: [], nextCursor: null });
    let commentBody: unknown;
    await page.route('**/api/v1/app/videos/article/comments', route => {
      commentBody = route.request().postDataJSON();
      return route.fulfill({ json: envelope({ id: 'new-comment', status: 'NORMAL' }) });
    });

    await page.goto('feed?video=text');
    await expect(page.locator('.feed-title').first()).toHaveText(text.title);
    if (mode === 'following') {
      await page.getByRole('button', { name: '关注', exact: true }).click();
      await expect(page.locator('.feed-tabs button.active')).toHaveText('关注');
    }
    await page.locator('.feed-viewport').press('ArrowDown');
    const card = page.locator('[data-video-id="article"]');
    await expect(card.locator('.feed-title')).toBeInViewport();
    const gallery = card.locator('.article-gallery');
    const box = (await gallery.boundingBox())!;
    await page.mouse.move(box.x + box.width * .8, box.y + box.height * .3);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * .15, box.y + box.height * .3, { steps: 12 });
    await page.mouse.up();
    await expect(card.locator('.article-pagination')).toHaveText('2 / 2');
    await card.getByRole('button', { name: '点赞', exact: true }).click();
    await expect.poll(() => likes).toEqual([true]);
    await card.locator('.feed-title').click();
    await expect(page).toHaveURL(/content\/article/);
    await expect(page.locator('.rich-content strong')).toHaveText('保留加粗正文');
    if (mode === 'recommend') await page.getByRole('button', { name: '返回', exact: true }).click();
    else await page.goBack();

    await expect(card.locator('.feed-title')).toBeInViewport();
    await expect(card.locator('.article-pagination')).toHaveText('2 / 2');
    await expect(card.locator('.liked')).toBeVisible();
    await expect(page.locator('.feed-tabs button.active')).toHaveText(mode === 'recommend' ? '推荐' : '关注');
    expect(feedRequests).toBe(1);
    await expect(page).toHaveURL(/feed\?video=text$/);
    await expect(page).toHaveTitle('videoshare');
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('returned-article.png') });
    await card.getByRole('button', { name: '点赞', exact: true }).click();
    await expect.poll(() => likes).toEqual([true, false]);
    await card.getByRole('button', { name: '评论', exact: true }).click();
    await page.getByPlaceholder('留下你的精彩评论...').fill('详情返回后评论原图文');
    await page.getByRole('button', { name: '发送评论', exact: true }).click();
    await expect.poll(() => commentBody).toEqual({ content: '详情返回后评论原图文', replyToCommentId: null });
    expect(errors).toEqual([]);
  });
}

async function api(page: Page, pattern: string, data: unknown) {
  await page.route(pattern, route => route.fulfill({ json: envelope(data) }));
}
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { Math.random = () => 0.999; });
  for (const item of [article, text, video]) {
    await api(page, `**/api/v1/app/content/${item.id}`, item);
    await api(page, `**/api/v1/app/videos/${item.id}/comments?*`, { items: [], nextCursor: null });
  }
  await api(page, '**/api/v1/app/feed/recommend?*', { items: [article, text, video], nextCursor: null });
  await api(page, '**/api/v1/app/videos/article', article);
  await api(page, '**/api/v1/app/videos/text', text);
  await api(page, '**/api/v1/app/videos/video', video);
  await page.route('**/media/test.mp4', route => route.fulfill({ status: 204 }));
  await api(page, '**/api/v1/app/discover?*', { summary: { totalVideos: 3, totalWatchTimeMs: 0, effectivePlayCount: 0, averageWatchTimeMs: 0, todayNewCount: 3 }, categories: [], durationStats: [], tags: [], ranking: [article, text, video], videos: [article, text, video] });
  await page.route('https://images.example/*', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600"><rect width="400" height="600" fill="#3b566e"/></svg>' }));
});

test('cached feed pauses media on exit, resumes on return and opens a newly selected video', async ({ page }) => {
  const secondVideo = { ...video, id: 'second-video', title: '另一条视频' };
  await api(page, '**/api/v1/app/feed/recommend?*', { items: [video, secondVideo], nextCursor: null });
  await api(page, '**/api/v1/app/discover?*', { summary: { totalVideos: 2, totalWatchTimeMs: 0, effectivePlayCount: 0, averageWatchTimeMs: 0, todayNewCount: 2 }, categories: [], durationStats: [], tags: [], ranking: [secondVideo], videos: [secondVideo] });
  // A playable silent WAV exercises the browser media lifecycle without an external video fixture.
  const sampleRate = 8000;
  const dataSize = sampleRate * 2 * 20;
  const media = Buffer.alloc(44 + dataSize);
  media.write('RIFF', 0);
  media.writeUInt32LE(36 + dataSize, 4);
  media.write('WAVEfmt ', 8);
  media.writeUInt32LE(16, 16);
  media.writeUInt16LE(1, 20);
  media.writeUInt16LE(1, 22);
  media.writeUInt32LE(sampleRate, 24);
  media.writeUInt32LE(sampleRate * 2, 28);
  media.writeUInt16LE(2, 32);
  media.writeUInt16LE(16, 34);
  media.write('data', 36);
  media.writeUInt32LE(dataSize, 40);
  await page.route('**/media/test.mp4', route => route.fulfill({ contentType: 'audio/wav', body: media }));

  await page.goto('feed?video=video');
  const player = page.locator('[data-video-id="video"] video');
  await expect.poll(() => player.evaluate((element: HTMLVideoElement) => element.paused)).toBe(false);
  const cachedPlayer = (await player.elementHandle())!;
  await page.getByRole('button', { name: '搜索', exact: true }).click();
  await expect(page).toHaveURL(/discover$/);
  await expect.poll(() => cachedPlayer.evaluate((element: HTMLVideoElement) => element.paused)).toBe(true);
  await page.goBack();
  await expect(page).toHaveURL(/feed\?video=video$/);
  await expect.poll(() => cachedPlayer.evaluate((element: HTMLVideoElement) => element.isConnected && !element.paused)).toBe(true);
  await page.getByRole('button', { name: '搜索', exact: true }).click();
  await page.getByRole('button', { name: /另一条视频/ }).first().click();
  await expect(page).toHaveURL(/feed\?video=second-video$/);
  await expect(page.locator('[data-video-id="second-video"] .feed-title')).toBeInViewport();
  await expect.poll(() => cachedPlayer.evaluate((element: HTMLVideoElement) => element.paused)).toBe(true);
});

test('mixed feed preserves image order, horizontal gallery and vertical content navigation', async ({ page }) => {
  await page.goto('feed?video=article');
  const gallery = page.locator('.article-gallery').first();
  await expect(gallery.locator('img')).toHaveCount(2);
  await expect(gallery.locator('img').first()).toHaveAttribute('src', 'https://images.example/first.png');
  const box = (await gallery.boundingBox())!;
  await page.mouse.move(box.x + box.width * .8, box.y + box.height * .3);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * .15, box.y + box.height * .3, { steps: 12 });
  await page.mouse.up();
  await expect(page.locator('.article-pagination').first()).toHaveText('2 / 2');
  await page.mouse.move(box.x + box.width * .5, box.y + box.height * .55);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * .5, box.y + box.height * .3, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('.feed-title').nth(1)).toBeInViewport();
  await expect(page.locator('.default-content-cover')).toBeVisible();
  await page.locator('.feed-title').nth(1).click();
  await expect(page).toHaveURL(/content\/text/);
  await expect(page.locator('.rich-content')).toHaveText('纯文字正文');
});

test('home article opens full rich text and video title expands body', async ({ page }) => {
  await page.goto('discover');
  await page.getByRole('button', { name: /多图内容/ }).first().click();
  await expect(page).toHaveURL(/content\/article/);
  await expect(page.locator('.rich-content strong')).toHaveText('保留加粗正文');
  await expect(page.locator('.rich-content img')).toHaveCount(2);
  await page.goto('feed?video=video');
  await expect(page.locator('.feed-title').first()).toHaveText('视频与正文');
  await page.locator('.feed-title').first().click();
  await expect(page.locator('.content-popup .rich-content strong')).toHaveText('视频正文');
});

test('C publishing sends body images and optional video using authenticated multipart', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('yingliu.app.token', 'test-token'));
  await api(page, '**/api/v1/app/me', { id: '1', nickname: '发布者', status: 'NORMAL' });
  await api(page, '**/api/v1/app/content/options', { categories: [{ id: '1', name: '培训' }], tags: [] });
  let body = '';
  let authorization = '';
  await page.route('**/api/v1/app/content', async route => {
    body = route.request().postData() ?? '';
    authorization = route.request().headers().authorization ?? '';
    await route.fulfill({ json: envelope({ id: 'new', auditStatus: 'PENDING_REVIEW' }) });
  });
  await page.goto('publish');
  await page.getByRole('button', { name: /发布图文/ }).click();
  await page.getByPlaceholder('给内容起一个标题').fill('发布图文');
  await page.getByRole('textbox', { name: '正文' }).fill('正文测试');
  const editor = page.getByRole('textbox').last();
  await editor.press('Control+a');
  await page.locator('.rich-toolbar button').first().click();
  await expect(editor.locator('strong')).toHaveCount(1);
  await page.locator('.rich-toolbar button').nth(5).click();
  await expect(editor.locator('strong')).toHaveCount(0);
  await page.locator('.rich-toolbar button').nth(6).click();
  await expect(editor.locator('strong')).toHaveCount(1);
  await page.getByLabel('培训').check();
  await page.getByRole('button', { name: '提交审核', exact: true }).click();
  await expect(page.getByRole('heading', { name: '已提交审核' })).toBeVisible();
  expect(body).toContain('name="description"');
  expect(body).toContain('正文测试');
  expect(body).not.toContain('name="file"');
  expect(authorization).toBe('Bearer test-token');
});

test('publishes multiple images in body order together with optional video', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('yingliu.app.token', 'test-token'));
  await api(page, '**/api/v1/app/me', { id: '1', nickname: '发布者', status: 'NORMAL' });
  await api(page, '**/api/v1/app/content/options', { categories: [{ id: '1', name: '培训' }], tags: [] });
  let imageCount = 0;
  await page.route('**/api/v1/app/content/images', async route => {
    expect(route.request().headers().authorization).toBe('Bearer test-token');
    await route.fulfill({ json: envelope({ url: `/media/images/${++imageCount}.png` }) });
  });
  let payload = '';
  await page.route('**/api/v1/app/content', async route => {
    payload = route.request().postData() ?? '';
    await route.fulfill({ json: envelope({ id: 'new-video', auditStatus: 'PENDING_REVIEW' }) });
  });
  await page.goto('publish');
  await page.getByRole('button', { name: /发布视频/ }).click();
  await page.getByPlaceholder('给内容起一个标题').fill('视频加图片正文');
  await page.locator('input[accept="image/jpeg,image/png,image/gif"]').setInputFiles([
    { name: 'first.png', mimeType: 'image/png', buffer: Buffer.from('first') },
    { name: 'second.png', mimeType: 'image/png', buffer: Buffer.from('second') },
  ]);
  await expect(page.locator('.rich-editor img')).toHaveCount(2);
  await page.locator('input[accept=".mp4,.webm,.mov"]').setInputFiles({ name: 'sample.mp4', mimeType: 'video/mp4', buffer: Buffer.from('video') });
  await page.getByLabel('培训').check();
  await page.getByRole('button', { name: '提交审核', exact: true }).click();
  await expect(page.getByRole('heading', { name: '已提交审核' })).toBeVisible();
  expect(imageCount).toBe(2);
  expect(payload.indexOf('/media/images/1.png')).toBeLessThan(payload.indexOf('/media/images/2.png'));
  expect(payload).toContain('filename="sample.mp4"');
});

test('touch gestures switch images horizontally and content vertically', async ({ page }) => {
  await page.goto('feed?video=article');
  const gallery = page.locator('.article-gallery').first();
  await expect(gallery.locator('img')).toHaveCount(2);
  const box = (await gallery.boundingBox())!;
  const session = await page.context().newCDPSession(page);
  const swipe = async (x1: number, y1: number, x2: number, y2: number) => {
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x1, y: y1 }] });
    for (let step = 1; step <= 10; step++) {
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x1 + (x2 - x1) * step / 10, y: y1 + (y2 - y1) * step / 10 }] });
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  await swipe(box.x + box.width * .8, box.y + box.height * .3, box.x + box.width * .2, box.y + box.height * .3);
  await expect(page.locator('.article-pagination').first()).toHaveText('2 / 2');
  await swipe(box.x + box.width * .5, box.y + box.height * .55, box.x + box.width * .5, box.y + box.height * .3);
  await expect(page.locator('.feed-title').nth(1)).toBeInViewport();
  await session.detach();
});
