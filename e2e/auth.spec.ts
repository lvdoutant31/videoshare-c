import { expect, test } from '@playwright/test';

test.describe('三环云账号入口', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('login');
  });

  test('密码登录、注册和管理员重置提示可切换', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    await expect(page.getByRole('heading', { name: '账号登录' })).toBeVisible();
    await expect(page.getByPlaceholder('请输入密码')).toBeVisible();
    await expect(page.getByText('验证码登录')).toHaveCount(0);
    await expect(page.getByText('企业微信登录')).toHaveCount(0);

    await page.getByRole('button', { name: '立即注册' }).click();
    await expect(page.getByRole('heading', { name: '注册账号' })).toBeVisible();
    await expect(page.getByPlaceholder('请输入真实姓名')).toBeVisible();
    await expect(page.getByPlaceholder('至少 8 位字符')).toBeVisible();
    await expect(page.getByPlaceholder('请再次输入密码')).toBeVisible();
    await expect(page.getByRole('button', { name: '注册', exact: true })).toBeVisible();

    await page.getByRole('button', { name: '返回登录' }).first().click();
    await page.getByRole('button', { name: '忘记密码' }).click();
    await expect(page.getByRole('heading', { name: '忘记密码' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '请联系系统管理员' })).toBeVisible();
    await expect(page.getByText('密码重置暂由管理员人工处理')).toBeVisible();
    expect(consoleErrors).toEqual([]);
  });

  test('手机号和密码校验阻止无效提交', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await expect(page.getByText('请输入正确的 11 位手机号')).toBeVisible();
    expect(consoleErrors).toEqual([]);
  });
});
