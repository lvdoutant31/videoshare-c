<script setup lang="ts">
/**
 * 分享收件箱（M06）：收到的视频卡片列表（§2.5 share-inbox）。
 */
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { showToast } from 'vant';
import { getShareInbox } from '../api';
import type { ShareInboxItem } from '../api/types';
import { timeAgo } from '../utils/format';
import { EVENT_NAMES, track } from '../analytics';

const router = useRouter();
const inbox = ref<ShareInboxItem[]>([]);
const loading = ref(true);

onMounted(async () => {
  try {
    inbox.value = await getShareInbox();
  } catch {
    showToast('收件箱加载失败');
  } finally {
    loading.value = false;
  }
});

function open(item: ShareInboxItem) {
  track(EVENT_NAMES.SHARE_CARD_OPENED, { videoId: item.video.id, objectId: item.id });
  router.push({ name: 'feed', query: { video: item.video.id } });
}
</script>

<template>
  <div class="page light-page">
    <header class="profile-nav">
      <button aria-label="返回" @click="router.back()"><van-icon name="arrow-left" /></button>
      <strong>分享收件箱</strong>
      <button aria-label="更多"><van-icon name="ellipsis" /></button>
    </header>
    <div class="profile-scroll">
      <van-loading v-if="loading" class="spinner-wrap" size="28" />
      <template v-else-if="inbox.length">
        <article v-for="item in inbox" :key="item.id" class="inbox-item" @click="open(item)">
          <div class="thumb"><img :src="item.video.cover?.coverUrl ?? ''" alt="封面" /></div>
          <div class="copy">
            <strong>{{ item.video.title }}</strong>
            <p>{{ item.sender.nickname }} 分享给你</p>
            <small>{{ timeAgo(item.sentAt) }}<span v-if="item.status === 'INVALID'" class="tag invalid">已失效</span></small>
          </div>
        </article>
      </template>
      <div v-else class="empty-state">
        <van-icon name="envelop-o" />
        <p>暂无收到分享</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.light-page { color: var(--text-strong); background: #fff; }
.profile-nav { top: 0; }
.profile-scroll { top: 48px; }
</style>
