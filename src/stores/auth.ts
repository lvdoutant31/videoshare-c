/**
 * 登录态 Pinia store：token、当前用户、企业微信登录与退出。
 */
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { isAuthenticated, tokenStore } from '../api/http';
import { getMe, logout as apiLogout, wecomLogin as apiWecomLogin } from '../api';
import type { AppUser } from '../api/types';

export const useAuthStore = defineStore('auth', () => {
  const user = ref<AppUser | null>(null);
  const loaded = ref(false);
  const loading = ref(false);

  const loggedIn = computed(() => isAuthenticated() && user.value != null);

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

  return { user, loaded, loading, loggedIn, loginWithWecom, restore, logout, patchProfile };
});
