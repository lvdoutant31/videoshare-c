import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import LoginView from './LoginView.vue';

const mocks = vi.hoisted(() => ({ register: vi.fn(), login: vi.fn(), replace: vi.fn(), toast: vi.fn(), query: {} as Record<string, unknown> }));
vi.mock('../api', () => ({ register: mocks.register }));
vi.mock('../stores/auth', () => ({ useAuthStore: () => ({ login: mocks.login }) }));
vi.mock('vue-router', () => ({ useRouter: () => ({ replace: mocks.replace }), useRoute: () => ({ query: mocks.query }) }));
vi.mock('vant', () => ({ showToast: mocks.toast }));
const create = () => mount(LoginView, { global: { stubs: { 'van-icon': true } } });

describe('password login and registration', () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.query = {};
    mocks.login.mockResolvedValue(undefined); mocks.register.mockResolvedValue(undefined);
  });

  it('offers password login and administrator reset without SMS', async () => {
    const wrapper = create();
    expect(wrapper.text()).toContain('账号登录');
    expect(wrapper.text()).not.toMatch(/验证码|企业微信/);
    await wrapper.get('.auth-options button').trigger('click');
    expect(wrapper.text()).toContain('密码重置暂由管理员人工处理');
    expect(wrapper.find('form').exists()).toBe(false);
  });

  it.each(['/publish', '/me/favorites?from=login'])('returns to an internal page: %s', async redirect => {
    mocks.query = { redirect };
    const wrapper = create();
    await wrapper.get('input[type=tel]').setValue('13800138000');
    await wrapper.get('input[type=password]').setValue('SecurePass123!');
    await wrapper.get('form').trigger('submit'); await flushPromises();
    expect(mocks.login).toHaveBeenCalledWith('13800138000', 'SecurePass123!');
    expect(mocks.replace).toHaveBeenCalledWith(redirect);
  });

  it.each(['https://example.com', '//example.com', '/\\example.com'])('rejects external redirects: %s', async redirect => {
    mocks.query = { redirect };
    const wrapper = create();
    await wrapper.get('input[type=tel]').setValue('13800138000');
    await wrapper.get('input[type=password]').setValue('SecurePass123!');
    await wrapper.get('form').trigger('submit'); await flushPromises();
    expect(mocks.replace).toHaveBeenCalledWith('/feed');
  });

  it('registers separately and returns to login without automatically signing in', async () => {
    const wrapper = create();
    await wrapper.get('.auth-switch button').trigger('click');
    await wrapper.get('input[autocomplete=name]').setValue(' 张三 ');
    await wrapper.get('input[type=tel]').setValue('13800138000');
    const passwords = wrapper.findAll('input[type=password]');
    await passwords[0].setValue('SecurePass123!'); await passwords[1].setValue('SecurePass123!');
    await wrapper.get('input[type=checkbox]').setValue(true);
    await wrapper.get('form').trigger('submit'); await flushPromises();
    expect(mocks.register).toHaveBeenCalledWith('13800138000', 'SecurePass123!', '张三', '2026-08');
    expect(mocks.login).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('账号登录');
    expect((wrapper.get('input[type=password]').element as HTMLInputElement).value).toBe('');
  });

  it('blocks inconsistent passwords and missing agreement', async () => {
    const wrapper = create();
    await wrapper.get('.auth-switch button').trigger('click');
    await wrapper.get('input[autocomplete=name]').setValue('张三');
    await wrapper.get('input[type=tel]').setValue('13800138000');
    const passwords = wrapper.findAll('input[type=password]');
    await passwords[0].setValue('SecurePass123!'); await passwords[1].setValue('Different123!');
    await wrapper.get('form').trigger('submit'); await flushPromises();
    expect(mocks.toast).toHaveBeenLastCalledWith('两次输入的密码不一致');
    await passwords[1].setValue('SecurePass123!');
    await wrapper.get('form').trigger('submit'); await flushPromises();
    expect(mocks.toast).toHaveBeenLastCalledWith('请先阅读并同意用户协议和隐私政策');
    expect(mocks.register).not.toHaveBeenCalled();
  });

  it('keeps the form usable when authentication fails', async () => {
    mocks.login.mockRejectedValue(new Error('手机号或密码错误'));
    const wrapper = create();
    await wrapper.get('input[type=tel]').setValue('13800138000');
    await wrapper.get('input[type=password]').setValue('WrongPass123!');
    await wrapper.get('form').trigger('submit'); await flushPromises();
    expect(mocks.toast).toHaveBeenCalledWith('手机号或密码错误');
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(wrapper.get('button[type=submit]').attributes('disabled')).toBeUndefined();
  });
});
