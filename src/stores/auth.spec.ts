import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from './auth';
import type { AppUser } from '../api/types';

vi.mock('../api', () => ({
  phoneLogin: vi.fn(),
  getMe: vi.fn(),
  logout: vi.fn(),
  wecomLogin: vi.fn(),
}));

vi.mock('../api/http', () => ({
  isAuthenticated: vi.fn(() => true),
  tokenStore: {
    get: vi.fn(() => 'tok'),
    set: vi.fn(),
    clear: vi.fn(),
  },
}));

import { getMe, logout, phoneLogin, wecomLogin } from '../api';
import { isAuthenticated, tokenStore } from '../api/http';

const mockUser: AppUser = {
  id: '10001',
  nickname: '测试用户',
  avatarUrl: null,
  bio: '测试简介',
  status: 'NORMAL',
  likeReceivedCount: 100,
  followingCount: 2,
  followerCount: 3,
  wecomBound: false,
};

describe('auth store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('登录成功写入 token 与用户信息', async () => {
    vi.mocked(phoneLogin).mockResolvedValue({ accessToken: 'tok-1', expiresIn: 2592000, user: mockUser });
    const auth = useAuthStore();

    await auth.login('13800138000', '123456');

    expect(phoneLogin).toHaveBeenCalledWith('13800138000', '123456', expect.any(String));
    expect(tokenStore.set).toHaveBeenCalledWith('tok-1');
    expect(auth.user?.nickname).toBe('测试用户');
    expect(auth.loggedIn).toBe(true);
  });

  it('无 token 时 restore 直接完成且不请求', async () => {
    vi.mocked(isAuthenticated).mockReturnValue(false);
    const auth = useAuthStore();

    await auth.restore();

    expect(getMe).not.toHaveBeenCalled();
    expect(auth.loaded).toBe(true);
    expect(auth.user).toBeNull();
  });

  it('restore 拉取用户失败时清 token 并置空用户', async () => {
    vi.mocked(isAuthenticated).mockReturnValue(true);
    vi.mocked(getMe).mockRejectedValue(new Error('会话失效'));
    const auth = useAuthStore();

    await auth.restore();

    expect(tokenStore.clear).toHaveBeenCalled();
    expect(auth.user).toBeNull();
    expect(auth.loaded).toBe(true);
  });

  it('企微回调登录写入 token 与用户', async () => {
    vi.mocked(wecomLogin).mockResolvedValue({ accessToken: 'wecom-tok', expiresIn: 2592000, user: mockUser });
    const auth = useAuthStore();

    await auth.loginWithWecom('code-1', 'state-1');

    expect(wecomLogin).toHaveBeenCalledWith('code-1', 'state-1');
    expect(tokenStore.set).toHaveBeenCalledWith('wecom-tok');
    expect(auth.loggedIn).toBe(true);
  });

  it('退出登录清 token 并置空用户', async () => {
    vi.mocked(logout).mockResolvedValue(undefined);
    const auth = useAuthStore();
    auth.user = mockUser;

    await auth.logout();

    expect(logout).toHaveBeenCalled();
    expect(tokenStore.clear).toHaveBeenCalled();
    expect(auth.user).toBeNull();
  });
});
