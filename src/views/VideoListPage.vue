<script setup lang="ts">
/**
 * 收藏/点赞/历史 视频列表页（§2.3 favorites/likes、§2.5 history）。
 */
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { showConfirmDialog, showToast } from 'vant';
import { clearHistory as apiClearHistory, getFavoriteVideos, getHistory, getLikedVideos } from '../api';
import type { FeedItem, HistoryItem } from '../api/types';
import { formatCount, formatDateTime } from '../utils/format';

const props = defineProps<{ kind: 'favorites' | 'likes' | 'history' }>();
const router = useRouter();

const items = ref<(FeedItem | HistoryItem)[]>([]);
const loading = ref(false);
const loadFailed = ref(false);
const title = computed(() => ({ favorites: '我的收藏', likes: '我的点赞', history: '观看历史' })[props.kind]);

async function loadItems() {
  loading.value = true;
  loadFailed.value = false;
  try {
    const page = props.kind === 'history'
      ? await getHistory()
      : props.kind === 'favorites'
        ? await getFavoriteVideos()
        : await getLikedVideos();
    items.value = page.items;
  } catch {
    items.value = [];
    loadFailed.value = true;
    showToast('加载失败，请稍后重试');
  } finally {
    loading.value = false;
  }
}

watch(() => props.kind, loadItems, { immediate: true });

function videoOf(item: FeedItem | HistoryItem): FeedItem {
  return 'video' in item ? item.video : item;
}

function open(item: FeedItem | HistoryItem) {
  router.push({ name: 'feed', query: { video: videoOf(item).id } });
}

async function clearHistory() {
  if (props.kind !== 'history') return;
  try {
    await showConfirmDialog({ title: '清空观看历史', message: '清空后不可恢复，确定继续吗？' });
  } catch {
    return;
  }
  try {
    await apiClearHistory();
    items.value = [];
    showToast('已清空');
  } catch {
    showToast('清空失败');
  }
}
</script>

<template>
  <div class="page light-page">
    <header class="profile-nav">
      <button aria-label="返回" @click="router.back()"><van-icon name="arrow-left" /></button>
      <strong>{{ title }}</strong>
      <button v-if="kind === 'history' && items.length" aria-label="清空历史" @click="clearHistory"><van-icon name="delete-o" /></button>
      <button v-else aria-label="更多"><van-icon name="ellipsis" /></button>
    </header>
    <div class="profile-scroll">
      <div v-if="loading" class="empty-state"><van-loading size="28" /></div>
      <div v-else-if="items.length" class="video-list">
        <article v-for="item in items" :key="videoOf(item).id" class="video-list-item" @click="open(item)">
          <div class="thumb">
            <img :src="videoOf(item).cover?.coverUrl ?? ''" alt="封面" />
            <span v-if="'video' in item">{{ formatDateTime((item as HistoryItem).lastViewedAt) }}</span>
            <span v-else>{{ formatCount(videoOf(item).stats.playCount) }}</span>
          </div>
          <div class="copy">
            <strong>{{ videoOf(item).title }}</strong>
            <small style="display: block; margin-top: 6px">@{{ videoOf(item).author.nickname }}</small>
            <small v-if="'video' in item">观看于 {{ formatDateTime((item as HistoryItem).lastViewedAt) }}</small>
            <small v-else>点赞 {{ formatCount(videoOf(item).stats.likeCount) }} · 评论 {{ formatCount(videoOf(item).stats.commentCount) }}</small>
          </div>
        </article>
      </div>
      <div v-else class="empty-state">
        <van-icon :name="kind === 'history' ? 'clock-o' : kind === 'favorites' ? 'star-o' : 'like-o'" />
        <p v-if="loadFailed">加载失败，稍后再试</p>
        <p v-else>{{ kind === 'history' ? '暂无观看历史' : kind === 'favorites' ? '还没有收藏的视频' : '还没有点赞的视频' }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.light-page { color: var(--text-strong); background: #fff; }
.profile-nav { top: 0; }
.profile-scroll { top: 48px; }
</style>
