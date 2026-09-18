<script setup lang="ts">
/**
 * 登录页（M01）：企业微信是唯一登录方式。
 */
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { showToast } from 'vant';
import { getWecomAuthorizeUrl } from '../api';
import { isAuthenticated } from '../api/http';
import { useAuthStore } from '../stores/auth';
import { EVENT_NAMES, track } from '../analytics';
import companyLogo from '../assets/yangtze-river-industry-logo.png';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const WECOM_STATE_KEY = 'wecom-oauth-state';
const WECOM_REDIRECT_KEY = 'wecom-oauth-redirect';

const wecomSubmitting = ref(false);
async function wecomLogin() {
  if (wecomSubmitting.value) return;
  wecomSubmitting.value = true;
  track(EVENT_NAMES.LOGIN_METHOD_SELECTED, { properties: { method: 'wecom' } });
  try {
    // 真实模式：跳转企微 OAuth 授权页；mock 模式：模拟回调后直接登录
    const { authorizeUrl, state } = await getWecomAuthorizeUrl();
    const isMock = authorizeUrl.includes('wecom=mock');
    if (isMock) {
      await auth.loginWithWecom('mock-code', state);
      showToast('登录成功');
      await redirectAfterLogin();
    } else {
      sessionStorage.setItem(WECOM_STATE_KEY, state);
      sessionStorage.setItem(WECOM_REDIRECT_KEY, safeInternalRedirect(route.query.redirect));
      location.href = authorizeUrl;
    }
  } catch (error) {
    showToast(errorMessage(error, '企业微信授权暂不可用，请稍后重试'));
  } finally {
    wecomSubmitting.value = false;
  }
}

function safeInternalRedirect(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\\\')) return '/feed';
  try {
    const target = new URL(value, window.location.origin);
    return target.origin === window.location.origin ? `${target.pathname}${target.search}${target.hash}` : '/feed';
  } catch {
    return '/feed';
  }
}

async function redirectAfterLogin() {
  const redirect = safeInternalRedirect(sessionStorage.getItem(WECOM_REDIRECT_KEY) ?? route.query.redirect);
  sessionStorage.removeItem(WECOM_REDIRECT_KEY);
  await router.replace(redirect);
}

function clearCallbackQuery() {
  const url = new URL(window.location.href);
  url.searchParams.delete('code');
  url.searchParams.delete('state');
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

// 企微 OAuth 回调返回本页（?code=..&state=..）时完成登录
onMounted(async () => {
  const code = typeof route.query.code === 'string' ? route.query.code : null;
  const state = typeof route.query.state === 'string' ? route.query.state : null;
  if (code && state && isAuthenticated() === false) {
    clearCallbackQuery();
    const expectedState = sessionStorage.getItem(WECOM_STATE_KEY);
    sessionStorage.removeItem(WECOM_STATE_KEY);
    if (state !== expectedState) {
      showToast('授权状态无效或已过期，请重新登录');
      return;
    }
    try {
      await auth.loginWithWecom(code, state);
      await redirectAfterLogin();
    } catch (error) {
      showToast(errorMessage(error, '企微登录失败，请重新授权'));
    }
  }
});
</script>

<template>
  <div class="login-screen">
    <div class="login-grain" aria-hidden="true" />

    <section class="login-brand">
      <img class="login-company-logo" :src="companyLogo" alt="长江产业集团" />
      <h1>VideoShare</h1>
    </section>

    <div class="login-panel">
      <button class="wecom-login-btn" :disabled="wecomSubmitting" :aria-busy="wecomSubmitting" @click="wecomLogin">
        <van-icon name="friends-o" />
        <span>{{ wecomSubmitting ? '正在授权...' : '使用企业微信登录' }}</span>
      </button>

      <div class="login-security-note">
        <van-icon name="shield-o" />
        <span>仅限企业成员登录</span>
      </div>
    </div>

    <p class="login-agreement">
      登录即代表你同意 <a href="javascript:void(0)">《用户协议》</a> 和 <a href="javascript:void(0)">《隐私政策》</a>
    </p>
  </div>
</template>
