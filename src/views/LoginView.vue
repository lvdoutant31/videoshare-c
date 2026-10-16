<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { showDialog, showToast } from 'vant';
import { register } from '../api';
import { useAuthStore } from '../stores/auth';
import authBackground from '../assets/auth-enterprise.png';

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();

const phone = ref('');
const agreement = ref(false);
const mode = ref<'login' | 'register' | 'forgot'>('login');
const name = ref('');
const password = ref('');
const confirmPassword = ref('');
const showPassword = ref(false);
const submitting = ref(false);

function validPhone(): boolean {
  if (/^1\d{10}$/.test(phone.value.trim())) return true;
  showToast('请输入正确的 11 位手机号');
  return false;
}

function switchMode(next: typeof mode.value) {
  mode.value = next;
  password.value = ''; confirmPassword.value = ''; showPassword.value = false; agreement.value = false;
}

function safeRedirect(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/feed';
  try {
    const target = new URL(value, window.location.origin);
    return target.origin === window.location.origin ? `${target.pathname}${target.search}${target.hash}` : '/feed';
  } catch { return '/feed'; }
}

async function submitForm() {
  if (submitting.value || !validPhone()) return;
  if (password.value.length < 8 || password.value.length > 64) return showToast('密码需为 8–64 位字符');
  if (mode.value === 'register') {
    if (!name.value.trim()) return showToast('请输入真实姓名');
    if (password.value !== confirmPassword.value) return showToast('两次输入的密码不一致');
    if (!agreement.value) return showToast('请先阅读并同意用户协议和隐私政策');
  }
  submitting.value = true;
  try {
    if (mode.value === 'register') {
      await register(phone.value.trim(), password.value, name.value.trim(), '2026-08');
      switchMode('login');
      showToast('注册成功，请使用密码登录');
      return;
    }
    await auth.login(phone.value.trim(), password.value);
    showToast('登录成功');
    await router.replace(safeRedirect(route.query.redirect));
  } catch (error) {
    showToast(errorMessage(error, '操作失败，请稍后重试'));
  } finally {
    submitting.value = false;
  }
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
function readAgreement(title: string) {
  showDialog({ title, message: `尚未配置在线《${title}》正文，请联系系统管理员获取。`, confirmButtonText: '知道了' });
}
</script>

<template>
  <main class="auth-screen" :class="{ 'auth-register': mode === 'register' }" :style="{ '--auth-bg': `url(${authBackground})` }">
    <section class="auth-brand" aria-label="湖北三环锻压设备有限公司">
      <img :src="authBackground" alt="湖北三环锻压设备有限公司厂区与企业标识" />
      <div class="brand-company"><h1>湖北三环锻压设备有限公司</h1><p>记录制造现场，分享身边的改变</p></div>
    </section>

    <section class="auth-panel" aria-live="polite">
      <header class="auth-panel-header">
        <p class="auth-overline">湖北三环锻压设备有限公司</p>
        <h2>{{ mode === 'login' ? '账号登录' : mode === 'register' ? '注册账号' : '忘记密码' }}</h2>
        <p>{{ mode === 'register' ? '创建账号，参与交流与分享' : '登录后参与交流与分享' }}</p>
      </header>

      <section v-if="mode === 'forgot'" class="auth-reset-note">
        <h3>请联系系统管理员</h3><p>密码重置暂由管理员人工处理</p>
        <button class="auth-primary" type="button" @click="switchMode('login')">返回登录</button>
      </section>
      <form v-else class="auth-form" @submit.prevent="submitForm">
          <label v-if="mode === 'register'" class="auth-field">
            <span>真实姓名</span><span class="auth-input-wrap"><van-icon name="user-o" /><input :disabled="submitting" v-model="name" maxlength="30" autocomplete="name" placeholder="请输入真实姓名" /></span>
          </label>
          <label class="auth-field">
            <span>手机号</span>
            <span class="auth-input-wrap">
              <van-icon name="phone-o" />
              <input :disabled="submitting" v-model="phone" type="tel" inputmode="numeric" maxlength="11" autocomplete="tel" placeholder="请输入手机号" />
            </span>
          </label>
          <label class="auth-field">
            <span>密码</span>
            <span class="auth-input-wrap">
              <van-icon name="lock" />
              <input :disabled="submitting" v-model="password" :type="showPassword ? 'text' : 'password'" maxlength="64" :autocomplete="mode === 'register' ? 'new-password' : 'current-password'" :placeholder="mode === 'register' ? '至少 8 位字符' : '请输入密码'" />
              <button class="password-toggle" type="button" :aria-label="showPassword ? '隐藏密码' : '显示密码'" @click="showPassword = !showPassword"><van-icon :name="showPassword ? 'eye-o' : 'closed-eye'" /></button>
            </span>
          </label>
          <label v-if="mode === 'register'" class="auth-field">
            <span>确认密码</span><span class="auth-input-wrap"><van-icon name="lock" /><input :disabled="submitting" v-model="confirmPassword" type="password" maxlength="64" autocomplete="new-password" placeholder="请再次输入密码" /></span>
          </label>
          <div v-if="mode === 'login'" class="auth-options"><span /><button type="button" :disabled="submitting" @click="switchMode('forgot')">忘记密码</button></div>
          <label v-if="mode === 'register'" class="auth-agreement-check">
            <input v-model="agreement" type="checkbox" />
            <span>我已阅读并同意 <a href="#user-agreement" @click.prevent="readAgreement('用户协议')">《用户协议》</a> 和 <a href="#privacy-policy" @click.prevent="readAgreement('隐私政策')">《隐私政策》</a></span>
          </label>
          <button class="auth-primary" type="submit" :disabled="submitting" :aria-busy="submitting">
            {{ submitting ? '请稍候...' : mode === 'register' ? '注册' : '登录' }}
          </button>
      </form>
      <p v-if="mode === 'login'" class="auth-switch">还没有账号？<button type="button" :disabled="submitting" @click="switchMode('register')">立即注册</button></p>
      <p v-else-if="mode === 'register'" class="auth-switch">已有账号？<button type="button" :disabled="submitting" @click="switchMode('login')">返回登录</button></p>
    </section>
    <footer class="auth-footer">© 2026 湖北三环锻压设备有限公司 · 安全访问</footer>
  </main>
</template>
