import { expect, test } from '@playwright/test';

const envelope = (data: unknown) => ({ code: 'OK', data, traceId: 'report-flow' });
const item = {
  id: '11', title: '举报流程测试内容', description: '<p>正文</p>', videoUrl: null, durationMs: null, cover: null, tags: [],
  author: { id: '22', nickname: '作者', avatarUrl: null, following: false },
  stats: { playCount: 0, likeCount: 0, favoriteCount: 0, commentCount: 1, watchTimeMs: 0 },
  publishedAt: '2026-10-12T08:00:00', viewerState: { liked: false, favorited: false },
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('yingliu.app.token', 'test-token'));
  await page.route('**/api/v1/app/me', route => route.fulfill({ json: envelope({ id: '21', nickname: '举报者', status: 'NORMAL' }) }));
  await page.route('**/api/v1/app/feed/recommend?*', route => route.fulfill({ json: envelope({ items: [item], nextCursor: null }) }));
  await page.route('**/api/v1/app/report-reasons?*', route => route.fulfill({ json: envelope([{ code: 'VIOLENCE', name: '暴力内容', targetTypes: ['VIDEO', 'COMMENT', 'USER'] }]) }));
  await page.route('**/api/v1/app/users/22', route => route.fulfill({ json: envelope({ id: '22', nickname: '作者', following: false, likeReceivedCount: 0, followingCount: 0, followerCount: 0 }) }));
  await page.route('**/api/v1/app/users/22/videos?*', route => route.fulfill({ json: envelope({ items: [], nextCursor: null }) }));
  await page.route('**/api/v1/app/videos/11/comments?*', route => route.fulfill({ json: envelope({ items: [{
    id: '31', videoId: '11', content: '评论正文', user: { id: '22', nickname: '作者', avatarUrl: null },
    likeCount: 0, replyCount: 0, liked: false, mine: false, status: 'NORMAL', createdAt: '2026-10-12T08:00:00',
  }], nextCursor: null }) }));
});

for (const targetType of ['VIDEO', 'COMMENT', 'USER'] as const) {
  test(`${targetType} report selects configured reason and sends the original target and description`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    const path = targetType === 'VIDEO' ? 'videos/11' : targetType === 'COMMENT' ? 'comments/31' : 'users/22';
    let submitted: unknown;
    await page.route(`**/api/v1/app/${path}/report`, route => {
      submitted = route.request().postDataJSON();
      return route.fulfill({ json: envelope(null) });
    });
    await page.goto(targetType === 'USER' ? 'author/22' : 'feed');
    if (targetType === 'USER') await page.getByRole('button', { name: '更多', exact: true }).click();
    else if (targetType === 'COMMENT') {
      await page.getByRole('button', { name: '评论', exact: true }).click();
      await page.getByRole('button', { name: '举报', exact: true }).click();
    } else {
      await page.getByRole('button', { name: '分享', exact: true }).click();
      await page.getByRole('button', { name: /举报视频/ }).click();
    }
    await page.getByRole('button', { name: '暴力内容', exact: true }).click();
    await page.getByPlaceholder('补充说明（选填）').fill('流程测试补充说明');
    await page.getByRole('button', { name: '提交举报', exact: true }).click();
    await expect.poll(() => submitted).toEqual({ reasonCode: 'VIOLENCE', description: '流程测试补充说明' });
    await expect(page.getByText('举报已提交，我们会尽快处理')).toBeVisible();
    expect(errors).toEqual([]);
  });
}
