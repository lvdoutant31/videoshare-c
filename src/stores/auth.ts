/**
 * 登录态 Pinia store：token、当前用户、登录/退出、协议版本。
 */
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { isAuthenticated, tokenStore } from '../api/http';
import { getMe, logout as apiLogout, phoneLogin, wecomLogin as apiWecomLogin } from '../api';
import type { AppUser } from '../api/types';

/** 当前用户协议版本（与后端约定值一致） */
export const AGREEMENT_VERSION = '2026-08';

export const useAuthStore = defineStore('auth', () => {
  const user = ref<AppUser | null>(null);
  const loaded = ref(false);
  const loading = ref(false);

  const loggedIn = computed(() => isAuthenticated() && user.value != null);

  /** 手机号验证码登录 */
  async function login(phone: string, code: string): Promise<void> {
    const result = await phoneLogin(phone, code, AGREEMENT_VERSION);
    tokenStore.set(result.accessToken);
    user.value = result.user;
  }

  /** 企微 OAuth 回调登录（用 code + state 换取本平台会话） */
  async function loginWithWecom(code: string, state: string): Promise<void> {
    const result = await apiWecomLogin(code, state);
    tokenStore.set(result.accessToken);
    user.value = result.user;
  }

  /** 启动时恢复会话：有 token 则拉取 /app/me */
  async function restore(): Promise<void> {
    if (!isAuthenticated()) {
      loaded.value = true;
      return;
    }
    loading.value = true;
    try {
      user.value = await getMe();
    } catch {
      tokenStore.clear();
      user.value = null;
    } finally {
      loading.value = false;
      loaded.value = true;
    }
  }

  /** 退出登录 */
  async function logout(): Promise<void> {
    try {
      await apiLogout();
    } finally {
      tokenStore.clear();
      user.value = null;
    }
  }

  /** 更新当前用户资料（乐观更新，失败回滚） */
  async function patchProfile(patch: Partial<Pick<AppUser, 'nickname' | 'bio' | 'avatarUrl'>>): Promise<void> {
    if (!user.value) return;
    const previous = user.value;
    user.value = { ...previous, ...patch };
    try {
      user.value = await getMe();
    } catch {
      user.value = previous;
      throw new Error('资料更新失败，已恢复原状');
    }
  }

  return { user, loaded, loading, loggedIn, login, loginWithWecom, restore, logout, patchProfile };
});
