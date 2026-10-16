/**
 * 登录态 Pinia store：token、当前用户、密码登录，以及为后续启用保留的企微回调能力。
 */
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { isAuthenticated, tokenStore } from '../api/http';
import { getMe, logout as apiLogout, passwordLogin as apiPasswordLogin, phoneLogin as apiPhoneLogin, updateMe, wecomLogin as apiWecomLogin } from '../api';
import type { AppUser } from '../api/types';

export const useAuthStore = defineStore('auth', () => {
  const user = ref<AppUser | null>(null);
  const loaded = ref(false);
  const loading = ref(false);

  const loggedIn = computed(() => isAuthenticated() && user.value != null);

  function acceptLogin(result: { accessToken: string; user: AppUser }): void {
    tokenStore.set(result.accessToken);
    user.value = result.user;
  }

  async function login(phone: string, password: string): Promise<void> {
    acceptLogin(await apiPasswordLogin(phone, password));
  }

  /** 手机号验证码登录；新手机号由服务端自动注册。 */
  async function loginWithPhoneCode(phone: string, code: string, agreementVersion: string): Promise<void> {
    acceptLogin(await apiPhoneLogin(phone, code, agreementVersion));
  }

  /** 企微 OAuth 回调登录（用 code + state 换取本平台会话） */
  async function loginWithWecom(code: string, state: string): Promise<void> {
    acceptLogin(await apiWecomLogin(code, state));
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

  /** 主动刷新当前用户及统计数据。 */
  async function refreshProfile(): Promise<void> {
    if (!isAuthenticated()) return;
    user.value = await getMe();
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

  /** 调用资料接口，并以服务端响应作为唯一权威状态。 */
  async function patchProfile(patch: Partial<Pick<AppUser, 'nickname' | 'bio' | 'avatarUrl'>>): Promise<void> {
    if (!user.value) return;
    user.value = await updateMe(patch);
  }

  return { user, loaded, loading, loggedIn, login, loginWithPhoneCode, loginWithWecom, restore, refreshProfile, logout, patchProfile };
});
