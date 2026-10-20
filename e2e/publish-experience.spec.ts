import { expect, test } from '@playwright/test';

for (const width of [390, 1440]) {
  test(`publication loading, drafts and navigation at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem('yingliu.app.token', 'qa-token'));
    let releaseOptions!: () => void;
    const optionsGate = new Promise<void>(resolve => { releaseOptions = resolve; });
    await page.route('**/api/v1/**', async route => {
      const path = new URL(route.request().url()).pathname;
      let data: unknown = {};
      if (path.endsWith('/app/me')) {
        await new Promise(resolve => setTimeout(resolve, 700));
        data = { id: 'qa-author', nickname: '测试作者', status: 'NORMAL' };
      } else if (path.endsWith('/app/content/options')) {
        await optionsGate;
        data = { categories: [{ id: '3', name: '安全培训' }], tags: [] };
      }
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ code: 'OK', data }) });
    });
    await page.goto('publish');
    await expect(page.getByText('正在准备发布页面')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('publish-loading.png') });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(page.locator('.ring-spin')).toHaveCSS('animation-name', 'none');
    releaseOptions();
    await page.getByRole('button', { name: '发布图文' }).click();
    await page.getByText('作者：测试作者', { exact: true }).waitFor();
    await page.getByPlaceholder('给内容起一个标题').fill('安全生产学习记录');
    await page.locator('.tiptap').fill('今天的安全培训要点，离开后应可以继续编辑。');
    await page.getByLabel('安全培训').check();
    await expect(page.getByText('草稿已保存到本机', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '返回', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('离开当前页面');
    await page.getByRole('button', { name: '继续编辑', exact: true }).click();
    await expect(page.getByPlaceholder('给内容起一个标题')).toHaveValue('安全生产学习记录');
    await page.screenshot({ path: testInfo.outputPath('publish-draft.png') });
    page.on('dialog', dialog => dialog.accept());
    await page.reload();
    // /me returns later than options: restoration must wait for the account identity.
    await expect(page.getByPlaceholder('给内容起一个标题')).toHaveValue('安全生产学习记录');
    await expect(page.locator('.tiptap')).toContainText('今天的安全培训要点');
    await expect(page.getByLabel('安全培训')).toBeChecked();
    expect(await page.locator('main').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}

test('video upload waits for the server, keeps failed input and retries', async ({ page }, testInfo) => {
  await page.addInitScript(() => localStorage.setItem('yingliu.app.token', 'qa-token'));
  let releaseUpload!: () => void;
  const uploadGate = new Promise<void>(resolve => { releaseUpload = resolve; });
  let attempts = 0;
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown = {};
    if (path.endsWith('/app/me')) data = { id: 'qa-author', nickname: '测试作者', status: 'NORMAL' };
    if (path.endsWith('/app/content/options')) data = { categories: [{ id: '3', name: '安全培训' }], tags: [] };
    if (path.endsWith('/app/content') && route.request().method() === 'POST') {
      attempts++;
      await uploadGate;
      if (attempts === 1) {
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'UNAVAILABLE', message: '上传服务暂时不可用' }) });
        return;
      }
      data = { id: '100', auditStatus: 'PENDING_REVIEW' };
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ code: 'OK', data }) });
  });
  await page.goto('publish');
  await page.getByRole('button', { name: '发布视频' }).click();
  await page.getByPlaceholder('给内容起一个标题').fill('安全培训视频');
  await page.getByLabel('安全培训').check();
  await page.locator('input[accept=".mp4,.webm,.mov"]').setInputFiles({ name: 'training.mp4', mimeType: 'video/mp4', buffer: Buffer.from('test video data') });
  await page.getByRole('button', { name: '提交审核', exact: true }).click();
  await expect(page.getByRole('progressbar', { name: '视频上传进度' })).toBeVisible();
  await expect(page.locator('.upload-status')).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath('video-upload-loading.png') });
  releaseUpload();
  await expect(page.getByRole('alert')).toContainText('上传服务暂时不可用');
  await expect(page.getByText('training.mp4')).toBeVisible();
  await page.getByRole('button', { name: '提交审核', exact: true }).click();
  await expect(page.getByRole('heading', { name: '已提交审核' })).toBeVisible();
  expect(attempts).toBe(2);
  expect(await page.evaluate(() => localStorage.getItem('yingliu.publish.draft:qa-author'))).toBeNull();
});
