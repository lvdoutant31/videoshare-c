import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { loginWithWecom, getWecomAuthorizeUrl, replace, route, showToast } = vi.hoisted(() => ({
  loginWithWecom: vi.fn(),
  getWecomAuthorizeUrl: vi.fn(),
  replace: vi.fn(),
  route: { query: {} as Record<string, unknown> },
  showToast: vi.fn(),
}));

vi.mock('../api', () => ({ getWecomAuthorizeUrl }));
vi.mock('../api/http', () => ({ isAuthenticated: () => false }));
vi.mock('../stores/auth', () => ({ useAuthStore: () => ({ loginWithWecom }) }));
vi.mock('../analytics', () => ({ EVENT_NAMES: { LOGIN_METHOD_SELECTED: 'login' }, track: vi.fn() }));
vi.mock('vant', () => ({ showToast, VanIcon: true }));
vi.mock('vue-router', () => ({ useRoute: () => route, useRouter: () => ({ replace }) }));

import LoginView from './LoginView.vue';

describe('LoginView WeCom OAuth', () => {
  beforeEach(() => {
    route.query = {};
    loginWithWecom.mockReset();
    getWecomAuthorizeUrl.mockReset();
    replace.mockReset();
    showToast.mockReset();
    sessionStorage.clear();
    window.history.replaceState({}, '', '/h5/login');
  });

  it('submits the server-issued mock state and redirects after successful login', async () => {
    getWecomAuthorizeUrl.mockResolvedValue({ authorizeUrl: 'http://localhost/h5/login?wecom=mock', state: 'issued-state' });
    loginWithWecom.mockResolvedValue(undefined);
    const wrapper = mount(LoginView, { global: { stubs: { 'van-icon': true } } });

    await wrapper.get('button').trigger('click');
    await flushPromises();

    expect(loginWithWecom).toHaveBeenCalledWith('mock-code', 'issued-state');
    expect(replace).toHaveBeenCalledWith('/feed');
  });

  it('rejects a callback whose state does not match the saved authorization state', async () => {
    route.query = { code: 'code-1', state: 'wrong-state' };
    sessionStorage.setItem('wecom-oauth-state', 'expected-state');
    mount(LoginView, { global: { stubs: { 'van-icon': true } } });
    await flushPromises();

    expect(loginWithWecom).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith('授权状态无效或已过期，请重新登录');
    expect(window.location.search).not.toContain('code=');
  });

  it('accepts a matching callback state and redirects only to the saved internal path', async () => {
    route.query = { code: 'code-1', state: 'expected-state' };
    sessionStorage.setItem('wecom-oauth-state', 'expected-state');
    sessionStorage.setItem('wecom-oauth-redirect', '/videos/1?from=wecom');
    loginWithWecom.mockResolvedValue(undefined);
    mount(LoginView, { global: { stubs: { 'van-icon': true } } });
    await flushPromises();

    expect(loginWithWecom).toHaveBeenCalledWith('code-1', 'expected-state');
    expect(replace).toHaveBeenCalledWith('/videos/1?from=wecom');
    expect(window.location.search).not.toContain('state=');
  });

  it('consumes callback state before the request so replay cannot authenticate', async () => {
    route.query = { code: 'code-1', state: 'expected-state' };
    sessionStorage.setItem('wecom-oauth-state', 'expected-state');
    loginWithWecom.mockRejectedValue(new Error('授权已失效'));
    mount(LoginView, { global: { stubs: { 'van-icon': true } } });
    await flushPromises();

    expect(loginWithWecom).toHaveBeenCalledOnce();
    expect(sessionStorage.getItem('wecom-oauth-state')).toBeNull();
    expect(showToast).toHaveBeenCalledWith('授权已失效');

    mount(LoginView, { global: { stubs: { 'van-icon': true } } });
    await flushPromises();
    expect(loginWithWecom).toHaveBeenCalledOnce();
  });

  it('shows an authorization failure without falling back to phone login', async () => {
    getWecomAuthorizeUrl.mockRejectedValue(new Error('企业微信服务未配置'));
    const wrapper = mount(LoginView, { global: { stubs: { 'van-icon': true } } });

    await wrapper.get('button').trigger('click');
    await flushPromises();

    expect(loginWithWecom).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith('企业微信服务未配置');
  });

  it('rejects an external redirect after login', async () => {
    route.query = { redirect: '//example.com' };
    getWecomAuthorizeUrl.mockResolvedValue({ authorizeUrl: 'http://localhost/h5/login?wecom=mock', state: 'issued-state' });
    loginWithWecom.mockResolvedValue(undefined);
    const wrapper = mount(LoginView, { global: { stubs: { 'van-icon': true } } });

    await wrapper.get('button').trigger('click');
    await flushPromises();

    expect(replace).toHaveBeenCalledWith('/feed');
  });
});
