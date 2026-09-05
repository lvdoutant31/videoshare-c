<script setup lang="ts">
/**
 * 登录页（M01）：企业微信是唯一登录方式。
 */
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { showToast } from 'vant';
import { getWecomAuthorizeUrl, sendPhoneCode } from '../api';
import { isAuthenticated } from '../api/http';
import { useAuthStore } from '../stores/auth';
import { EVENT_NAMES, track } from '../analytics';
import companyLogo from '../assets/yangtze-river-industry-logo.png';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

/** 联调/开发放行手机号（真实环境用企微；企微不可用时后端仍可用手机号验证码登录，验证码固定 123456） */
const DEV_PHONE = import.meta.env.VITE_DEV_PHONE ?? '13900139010';

const wecomSubmitting = ref(false);
async function wecomLogin() {
  if (wecomSubmitting.value) return;
  wecomSubmitting.value = true;
  track(EVENT_NAMES.LOGIN_METHOD_SELECTED, { properties: { method: 'wecom' } });
  try {
    // 真实模式：跳转企微 OAuth 授权页；mock 模式：模拟回调后直接登录
    const { authorizeUrl } = await getWecomAuthorizeUrl();
    const isMock = authorizeUrl.includes('wecom=mock');
    if (isMock) {
      await auth.loginWithWecom('mock-code', 'mock-state');
      showToast('登录成功');
      await redirectAfterLogin();
    } else {
      location.href = authorizeUrl;
    }
  } catch {
    // 企微不可用（联调/未接入）：默认放行——用开发账号走手机号接口建立真实会话
    await devPassLogin();
  } finally {
    wecomSubmitting.value = false;
  }
}

/** 企微不可用时的默认放行：发送验证码并用开发手机号登录（后端验证码固定 123456） */
async function devPassLogin() {
  try {
    await sendPhoneCode(DEV_PHONE);
    await auth.login(DEV_PHONE, '123456');
    showToast('已放行登录（开发账号）');
    await redirectAfterLogin();
  } catch {
    showToast('登录服务暂不可用，请稍后重试');
  }
}

async function redirectAfterLogin() {
  const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/feed';
  await router.replace(redirect);
}

// 企微 OAuth 回调返回本页（?code=..&state=..）时完成登录
onMounted(async () => {
  const code = typeof route.query.code === 'string' ? route.query.code : null;
  const state = typeof route.query.state === 'string' ? route.query.state : null;
  if (code && state && isAuthenticated() === false) {
    try {
      await auth.loginWithWecom(code, state);
      await redirectAfterLogin();
    } catch {
      showToast('企微登录失败');
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
