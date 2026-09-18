<script setup lang="ts">
/**
 * 账号设置页（PRD 手机端 §1）：资料编辑、企微身份状态、协议同意、账号注销申请。
 */
import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { showConfirmDialog, showToast } from 'vant';
import { acceptAgreement, getAgreements, requestCancellation } from '../api';
import { useAuthStore } from '../stores/auth';
import type { AgreementInfo } from '../api/types';

const router = useRouter();
const auth = useAuthStore();

const draft = reactive({ nickname: '', bio: '' });
const saving = ref(false);
const agreements = ref<AgreementInfo[]>([]);

onMounted(() => {
  if (auth.user) {
    draft.nickname = auth.user.nickname;
    draft.bio = auth.user.bio ?? '';
  }
  getAgreements()
    .then((list) => {
      agreements.value = list;
    })
    .catch(() => showToast('协议状态加载失败'));
});

async function saveProfile() {
  const nickname = draft.nickname.trim();
  if (!nickname) {
    showToast('昵称不能为空');
    return;
  }
  saving.value = true;
  try {
    await auth.patchProfile({ nickname, bio: draft.bio.trim() });
    showToast('已保存');
  } catch (error) {
    showToast(error instanceof Error ? error.message : '保存失败');
  } finally {
    saving.value = false;
  }
}

async function agree(type: 'USER_AGREEMENT' | 'PRIVACY_POLICY') {
  try {
    await acceptAgreement(type);
    const target = agreements.value.find((a) => a.type === type);
    if (target) target.agreedAt = new Date().toISOString();
    showToast('已同意最新版本');
  } catch {
    showToast('操作失败');
  }
}

async function cancelAccount() {
  try {
    await showConfirmDialog({
      title: '注销账号',
      message: '注销后账号资料将匿名化且不可恢复，确定申请注销吗？',
      confirmButtonText: '确认注销',
      confirmButtonColor: '#d43c3c',
    });
  } catch {
    return;
  }
  try {
    await requestCancellation();
    showToast('注销申请已提交，审核通过后生效');
  } catch {
    showToast('提交失败，请稍后重试');
  }
}
</script>

<template>
  <div class="page light-page">
    <header class="profile-nav">
      <button aria-label="返回" @click="router.back()"><van-icon name="arrow-left" /></button>
      <strong>账号设置</strong>
      <button aria-label="更多"><van-icon name="ellipsis" /></button>
    </header>

    <div class="settings-scroll">
      <section class="settings-section">
        <h3>个人资料</h3>
        <div class="field-row">
          <label>昵称</label>
          <input v-model="draft.nickname" maxlength="30" placeholder="请输入昵称" />
        </div>
        <div class="field-row">
          <label>简介</label>
          <textarea v-model="draft.bio" rows="2" maxlength="100" placeholder="介绍一下自己（选填）" />
        </div>
        <button class="primary-btn" :disabled="saving" @click="saveProfile">{{ saving ? '保存中...' : '保存资料' }}</button>
      </section>

      <section class="settings-section">
        <h3>登录方式</h3>
        <div class="field-row static">
          <span>企业微信</span>
          <small>{{ auth.user?.wecomBound ? '唯一登录方式 · 已绑定' : '身份状态异常' }}</small>
        </div>
      </section>

      <section class="settings-section">
        <h3>协议与政策</h3>
        <div v-for="agreement in agreements" :key="agreement.type" class="field-row static">
          <span>{{ agreement.type === 'USER_AGREEMENT' ? '用户协议' : '隐私政策' }}</span>
          <small>当前版本 {{ agreement.currentVersion }}</small>
          <button class="link-btn" @click="agree(agreement.type)">同意最新</button>
        </div>
      </section>

      <section class="settings-section danger-zone">
        <h3>账号</h3>
        <button class="danger-btn" @click="cancelAccount">申请注销账号</button>
      </section>
    </div>
  </div>
</template>

<style scoped>
.light-page { color: var(--text-strong); background: #f7f8fa; }
.profile-nav { top: 0; background: #fff; }
.settings-scroll { position: absolute; top: 48px; bottom: 0; left: 0; right: 0; overflow-y: auto; }
.settings-section { margin-top: 10px; padding: 4px 16px 16px; background: #fff; }
.settings-section h3 { margin: 0; padding: 12px 0 4px; color: #9a9ba0; font-size: 12px; font-weight: 500; }
.field-row { min-height: 46px; display: grid; grid-template-columns: 64px 1fr auto; align-items: center; gap: 10px; border-bottom: 1px solid #f4f4f6; font-size: 14px; }
.field-row:last-child { border-bottom: 0; }
.field-row label { color: #45464b; }
.field-row input { min-width: 0; border: 0; outline: 0; background: transparent; font-size: 14px; text-align: right; }
.field-row textarea { width: 100%; grid-column: 1 / -1; border: 1px solid #e8e9ec; border-radius: 8px; padding: 8px 10px; outline: 0; resize: none; font-size: 13px; background: #fafafb; }
.field-row.static span { color: #45464b; }
.field-row.static small { color: #9a9ba0; font-size: 12px; }
.primary-btn { width: 100%; height: 42px; margin-top: 14px; border-radius: 21px; color: #fff; background: var(--indigo); font-size: 14px; }
.primary-btn:disabled { opacity: .5; }
.link-btn { color: var(--indigo); font-size: 13px; }
.danger-zone { margin-bottom: 24px; }
.danger-btn { width: 100%; height: 44px; margin-top: 8px; border-radius: 8px; color: #d43c3c; background: #fdecec; font-size: 14px; }
</style>
