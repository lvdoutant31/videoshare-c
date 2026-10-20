<script setup lang="ts">
/**
 * 站内转发：接收人选择页（M05）——搜索/最近联系人/多选 ≤20/逐项发送结果。
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { showToast } from 'vant';
import { getRecentRecipients, searchRecipients, sendInternalShare } from '../api';
import type { ShareRecipient } from '../api/types';
import AvatarImage from '../components/AvatarImage.vue';

const route = useRoute();
const router = useRouter();

const MAX_RECIPIENTS = 20;

const videoId = computed(() => String(route.query.video ?? ''));
const query = ref('');
const loading = ref(false);
const recent = ref<ShareRecipient[]>([]);
const results = ref<ShareRecipient[]>([]);
const selected = ref<Map<string, ShareRecipient>>(new Map());
const sending = ref(false);
const sent = ref<{ batchId: string; successCount: number; failed: { nickname: string; reason: string }[] } | null>(null);

const selectedList = computed(() => [...selected.value.values()]);
const canSend = computed(() => selectedList.value.length > 0 && !sending.value);

async function load() {
  loading.value = true;
  try {
    const q = query.value.trim();
    if (q) {
      results.value = await searchRecipients(q);
    } else {
      results.value = [];
      recent.value = await getRecentRecipients();
    }
  } catch {
    showToast('加载失败');
  } finally {
    loading.value = false;
  }
}

watch(query, () => {
  if (query.value.trim()) {
    load();
  } else {
    results.value = [];
    recent.value = [];
    load();
  }
});

onMounted(load);

function toggle(user: ShareRecipient) {
  if (selected.value.has(user.id)) {
    selected.value.delete(user.id);
  } else if (selectedList.value.length >= MAX_RECIPIENTS) {
    showToast(`最多选择 ${MAX_RECIPIENTS} 名接收人`);
    return;
  } else {
    selected.value.set(user.id, user);
  }
  selected.value = new Map(selected.value); // 触发响应式
}

async function send() {
  if (!canSend.value || !videoId.value) return;
  sending.value = true;
  sent.value = null;
  try {
    const result = await sendInternalShare(videoId.value, selectedList.value.map((u) => u.id));
    const failed = result.results
      .filter((r) => !r.success)
      .map((r) => ({ nickname: selected.value.get(r.recipientId)?.nickname ?? r.recipientId, reason: r.code ?? '发送失败' }));
    sent.value = { batchId: result.batchId, successCount: result.results.filter((r) => r.success).length, failed };
    if (failed.length === 0) {
      showToast(`已发送给 ${result.results.length} 位用户`);
    } else {
      showToast(`${failed.length} 位发送失败`);
    }
  } catch {
    showToast('发送失败，请稍后重试');
  } finally {
    sending.value = false;
  }
}

function done() {
  router.back();
}
</script>

<template>
  <div class="page light-page">
    <header class="profile-nav">
      <button aria-label="返回" @click="router.back()"><van-icon name="arrow-left" /></button>
      <strong>选择接收人</strong>
      <span aria-hidden="true" />
    </header>

    <div class="recipient-search">
      <div class="search-field">
        <van-icon name="search" />
        <input v-model="query" placeholder="按昵称或用户 ID 搜索" />
      </div>
      <span class="selected-count">{{ selectedList.length }}/{{ MAX_RECIPIENTS }}</span>
    </div>

    <div class="recipient-body">
      <van-loading v-if="loading" class="spinner-wrap" size="26" />
      <template v-else>
        <section v-if="!query.trim() && recent.length" class="recipient-section">
          <h3>最近转发</h3>
          <article v-for="user in recent" :key="user.id" class="user-list-item" @click="toggle(user)">
            <AvatarImage :src="user.avatarUrl" alt="头像" />
            <div class="copy"><strong>{{ user.nickname }}</strong><small>videoshare号: {{ user.id }}</small></div>
            <span class="check" :class="{ on: selected.has(user.id) }"><van-icon name="success" /></span>
          </article>
        </section>
        <section v-else-if="query.trim()" class="recipient-section">
          <h3>搜索结果</h3>
          <article v-for="user in results" :key="user.id" class="user-list-item" @click="toggle(user)">
            <AvatarImage :src="user.avatarUrl" alt="头像" />
            <div class="copy"><strong>{{ user.nickname }}</strong><small>videoshare号: {{ user.id }}</small></div>
            <span class="check" :class="{ on: selected.has(user.id) }"><van-icon name="success" /></span>
          </article>
          <div v-if="!results.length" class="empty-state"><van-icon name="search" /><p>未找到相关用户</p></div>
        </section>
        <div v-else class="empty-state"><van-icon name="friends-o" /><p>搜索或选择最近联系人</p></div>
      </template>
    </div>

    <footer class="recipient-footer">
      <template v-if="!sent">
        <button class="send-btn" :disabled="!canSend" @click="send">
          {{ sending ? '发送中...' : `发送 (${selectedList.length})` }}
        </button>
      </template>
      <template v-else>
        <div class="sent-summary">
          <p>成功 {{ sent.successCount }} 位</p>
          <p v-if="sent.failed.length" class="failed">失败 {{ sent.failed.length }} 位：{{ sent.failed.map((f) => f.nickname).join('、') }}</p>
          <p v-else>已写入对方分享收件箱</p>
        </div>
        <button class="send-btn" @click="done">完成</button>
      </template>
    </footer>
  </div>
</template>

<style scoped>
.light-page { color: var(--text-strong); background: #fff; }
.recipient-search { position: absolute; z-index: 5; top: 48px; left: 0; right: 0; height: 56px; display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 12px; padding: 0 16px; background: #fff; border-bottom: 1px solid #f0f0f2; }
.search-field { height: 36px; display: flex; align-items: center; gap: 8px; padding: 0 12px; border-radius: 7px; background: #f1f1f3; color: #8f9095; }
.search-field input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; font-size: 13px; }
.selected-count { color: var(--indigo); font-size: 12px; }
.recipient-body { position: absolute; top: 104px; bottom: 76px; left: 0; right: 0; overflow-y: auto; }
.recipient-section h3 { margin: 0; padding: 12px 16px 4px; color: #9a9ba0; font-size: 12px; }
.check { width: 22px; height: 22px; display: grid; place-items: center; border: 1.5px solid #d7d8dc; border-radius: 50%; color: transparent; font-size: 13px; }
.check.on { border-color: var(--indigo); color: #fff; background: var(--indigo); }
.recipient-footer { position: absolute; bottom: 0; left: 0; right: 0; padding: 10px 16px 22px; border-top: 1px solid #f0f0f2; background: #fff; }
.send-btn { width: 100%; height: 46px; border-radius: 23px; color: #fff; background: var(--indigo); font-size: 15px; font-weight: 600; }
.send-btn:disabled { opacity: .5; }
.sent-summary { margin-bottom: 10px; }
.sent-summary p { margin: 4px 0; color: #3e4045; font-size: 13px; }
.sent-summary p.failed { color: #d43c3c; }
</style>
