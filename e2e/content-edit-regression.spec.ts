import { test, expect } from '@playwright/test';

for (const viewport of [{ name: 'mobile', width: 390, height: 844 }, { name: 'desktop', width: 1440, height: 900 }]) {
  test.describe(viewport.name, () => {
    test.use({ viewport, isMobile: viewport.name === 'mobile', hasTouch: viewport.name === 'mobile', deviceScaleFactor: 1 });
    test('owned and public content match, and editing keeps the original record', async ({ page }, testInfo) => {
      const id = '2108384690509983745';
      const description = '<h2>完整内容预览</h2><p>首段正文，保留<strong>加粗文字</strong>和原有排版。</p><img src="/qa-picture.svg">'
        + '<table><tr><th>项目</th><th>说明</th></tr><tr><td>原始内容</td><td>编辑仍使用同一个内容 ID</td></tr></table>'
        + Array.from({ length: 18 }, (_, i) => `<p>正文第 ${i + 1} 段：长正文应完整显示，可以滚动阅读，个人详情与公开详情使用同一份内容和排版。</p>`).join('')
        + '<p>正文末尾：所有内容已完整展示。</p>';
      const content = { id, authorNickname: '内容作者', title: '编辑原内容与完整详情验证', description, videoUrl: null,
        originalMedia: null, coverMedia: { url: '/qa-picture.svg' }, currentVersion: 3,
        categories: [{ id: '3', name: '资讯' }], tags: [], auditStatus: 'APPROVED', publishStatus: 'PUBLISHED',
        createdAt: '2026-10-09T09:00:00', updatedAt: '2026-10-09T09:00:00' };
      const writes: { method: string; id?: string }[] = [];
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      await page.addInitScript(() => localStorage.setItem('yingliu.app.token', 'qa-session'));
      await page.route('**/qa-picture.svg', route => route.fulfill({ contentType: 'image/svg+xml', body:
        '<svg xmlns="http://www.w3.org/2000/svg" width="760" height="250"><rect width="760" height="250" fill="#eaf1ff"/><circle cx="610" cy="72" r="32" fill="#b7cbf5"/><path d="M0 230L190 80L360 220L470 140L760 250H0" fill="#6f91cf"/></svg>' }));
      await page.route('**/api/v1/**', async route => {
        const path = new URL(route.request().url()).pathname.split('/api/v1')[1];
        const method = route.request().method();
        let data: unknown = {};
        if (path === '/app/me') data = { id: '7', nickname: content.authorNickname, status: 'NORMAL', followingCount: 0, followerCount: 0, likeReceivedCount: 0 };
        else if (path === '/app/me/content') data = [content];
        else if (path === '/app/me/content/page') data = { items: [content], total: 1, nextCursor: null };
        else if (path === '/app/content/options') data = { categories: content.categories, tags: [] };
        else if (path.endsWith('/comments')) data = { items: [], nextCursor: null };
        else if (path === `/app/me/content/${id}`) {
          if (method === 'PUT') {
            writes.push({ method, id });
            const body = route.request().postDataJSON();
            Object.assign(content, { title: body.title, description: body.description, currentVersion: content.currentVersion + 1,
              auditStatus: 'PENDING_REVIEW', publishStatus: 'UNPUBLISHED' });
          }
          data = content;
        } else if (path === '/app/content' && method === 'POST') writes.push({ method });
        else if ((path === `/app/videos/${id}` || path === `/app/content/${id}`)) data = { ...content, author: { id: '7', nickname: content.authorNickname, avatarUrl: null, following: false },
          cover: { id: '8', contentType: 'image/svg+xml', coverUrl: '/qa-picture.svg', width: 760, height: 250 },
          durationMs: null, stats: { playCount: 0, likeCount: 0, favoriteCount: 0, commentCount: 0, watchTimeMs: 0 }, viewerState: { liked: false, favorited: false } };
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ code: 'OK', data }) });
      });
      await page.goto(`content/${id}`);
      await expect(page.getByRole('heading', { name: content.title, exact: true })).toBeVisible();
      const publicBody = await page.locator('.rich-content').innerHTML();
      const publicAuthor = await page.locator('.article-author strong').textContent();
      await page.screenshot({ path: testInfo.outputPath('public-detail.png') });
      await page.goto(`me/content/${id}`);
      await expect(page.getByRole('heading', { name: content.title, exact: true })).toBeVisible();
      expect(await page.locator('.rich-content').innerHTML()).toBe(publicBody);
      expect(await page.locator('.author').textContent()).toContain(publicAuthor);
      await expect(page.locator('.content-article img')).toHaveCount(1);
      expect(await page.locator('main').evaluate(element => getComputedStyle(element).overflowY)).toBe('auto');
      expect(await page.locator('main').evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath('owned-detail-top.png') });
      await page.locator('main').evaluate(element => { element.scrollTop = element.scrollHeight; });
      await expect(page.getByText('正文末尾：所有内容已完整展示。')).toBeInViewport();
      await page.screenshot({ path: testInfo.outputPath('owned-detail-bottom.png') });
      await page.getByRole('button', { name: '编辑并重新提交审核' }).click();
      await expect(page).toHaveURL(new RegExp(`/me/content/${id}/edit$`));
      await expect(page.locator('input[maxlength="120"]')).toHaveValue(content.title);
      await page.locator('input[maxlength="120"]').fill('原记录修改后的标题');
      await page.getByRole('button', { name: '保存并重新提交审核' }).click();
      await expect(page.getByRole('heading', { name: '修改已提交审核' })).toBeVisible();
      expect(writes).toEqual([{ method: 'PUT', id }]);
      await page.getByRole('button', { name: '返回我的内容' }).click();
      await expect(page.locator('.collection-item')).toHaveCount(1);
      await expect(page.locator('.collection-item')).toContainText('原记录修改后的标题');
      await expect(page.locator('.collection-item')).toContainText('审核中');
      await page.screenshot({ path: testInfo.outputPath('edited-original-record.png') });
      expect(errors).toEqual([]);
    });
  });
}
