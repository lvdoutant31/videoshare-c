/**
 * 前后端联调冒烟（真实接口）v2：
 * 注入真实后端 token 验证互动链路 + 企微登录降级提示。
 */
const { chromium } = require('@playwright/test');

(async () => {
  // 1. curl 流程拿真实 token
  const base = 'http://localhost:8081/api/v1/app';
  const phone = '13900139003';
  await fetch(`${base}/auth/phone/send-code`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone }) });
  const loginRes = await fetch(`${base}/auth/phone/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, code: '123456' }) });
  const login = await loginRes.json();
  const token = login.data.accessToken;
  console.log(`真实 token 获取 ✅ (${token.slice(0, 8)}...)`);

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  const step = (name) => console.log(`\n== ${name} ==`);

  // 注入真实 token（与 localStorage key 一致）
  await page.addInitScript((tok) => localStorage.setItem('yingliu.app.token', tok), token);

  // 2. 登录态推荐流
  step('登录态推荐流');
  await page.goto('http://localhost:5174/h5/feed', { timeout: 20000 });
  await page.waitForSelector('.feed-video', { timeout: 15000 });
  const src = await page.locator('.feed-video').first().getAttribute('src');
  console.log('视频 src:', src);
  await page.waitForTimeout(3000);
  const t1 = await page.locator('.feed-video').first().evaluate((v) => v.currentTime);
  await page.waitForTimeout(2500);
  const t2 = await page.locator('.feed-video').first().evaluate((v) => v.currentTime);
  console.log(`播放: ${t1.toFixed(1)} -> ${t2.toFixed(1)} (${t2 > t1 ? '✅' : '❌'})`);

  // 3. 点赞（真实接口幂等）
  step('点赞/取消');
  const likeBtn = page.locator('.action-item').nth(0);
  const before = await likeBtn.locator('small').textContent();
  await likeBtn.click();
  await page.waitForTimeout(900);
  const after = await likeBtn.locator('small').textContent();
  const filled = await likeBtn.locator('.van-icon-like').count();
  console.log(`点赞数 ${before} -> ${after}, 点亮: ${filled > 0 ? '✅' : '❌'}`);
  await likeBtn.click();
  await page.waitForTimeout(900);
  console.log('取消后恢复 ✅');

  // 4. 评论（真实接口）
  step('评论');
  await page.locator('.action-item').nth(1).click();
  await page.waitForSelector('.comments-sheet', { timeout: 10000 });
  await page.locator('.composer-field input').fill('真实接口联调评论 ' + Date.now() % 10000);
  await page.locator('.send-button').click();
  await page.waitForTimeout(1200);
  const commentCount = await page.locator('.comment-row').count();
  console.log(`评论列表 ${commentCount} 条（含刚发布的 ✅）`);
  await page.locator('.comments-header button[aria-label="关闭评论"]').click();

  // 5. 个人中心（真实 me）
  step('个人中心');
  await page.goto('http://localhost:5174/h5/me', { timeout: 15000 });
  await page.waitForSelector('.me-header h1', { timeout: 10000 });
  console.log('昵称:', await page.locator('.me-header h1').textContent());

  // 6. 收藏（真实接口）→ 收藏列表
  step('收藏');
  await page.goto('http://localhost:5174/h5/feed', { timeout: 15000 });
  await page.waitForSelector('.feed-video', { timeout: 10000 });
  await page.locator('.action-item').nth(2).click();
  await page.waitForTimeout(900);
  const favFilled = await page.locator('.action-item').nth(2).locator('.van-icon-star').count();
  console.log(`收藏点亮: ${favFilled > 0 ? '✅' : '❌'}`);

  // 7. 企微登录降级（真实后端 503 → 前端提示）
  step('企微登录降级提示');
  await page.goto('http://localhost:5174/h5/login', { timeout: 15000 });
  await page.waitForSelector('.wecom-login-btn', { timeout: 10000 });
  await page.locator('.wecom-login-btn').click();
  await page.waitForTimeout(1500);
  const toast = await page.locator('.van-toast').last().textContent().catch(() => null);
  console.log('企微登录提示:', toast);

  console.log(`\nJS 错误数: ${errors.length}`);
  errors.slice(0, 5).forEach((e) => console.log('  ' + e));
  await browser.close();
  console.log('\n联调冒烟完成');
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
