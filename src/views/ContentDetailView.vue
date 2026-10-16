<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { getContentDetail, getComments, setLike, setFavorite } from '../api';
import { isAuthenticated } from '../api/http';
import { showToast } from 'vant';
import type { CommentItem, FeedItem } from '../api/types';
import ContentArticle from '../components/ContentArticle.vue';
import CommentPanel from '../components/CommentPanel.vue';
import AvatarImage from '../components/AvatarImage.vue';
import PulseHeart from '../components/PulseHeart.vue';
import { formatCount, timeAgo } from '../utils/format';
import { EVENT_NAMES, track } from '../analytics';
import { createUuid } from '../utils/uuid';
const route = useRoute();
const router = useRouter();
const item = ref<FeedItem>();
const failed = ref(false);
const loading = ref(true);
const videoEl = ref<HTMLVideoElement>();
const commentsOpen = ref(false);
const preview = ref<CommentItem[]>([]);
const previewFailed = ref(false);
const previewLoading = ref(false);
const interactionBusy = ref(false);
let contentGeneration = 0;
let resumePlayback = false;

function requireLogin(openComments = false) {
  if (isAuthenticated()) return true;
  router.push({ name: 'login', query: { redirect: openComments ? `${route.path}?comments=1` : route.fullPath } });
  return false;
}
function writeComment() { if (requireLogin(true)) commentsOpen.value = true; }
async function loadPreview() {
  if (!item.value) return;
  const id = item.value.id;
  previewFailed.value = false; previewLoading.value = true;
  try { const page = await getComments(id, 'HOT', null, 2); if (id === item.value?.id) preview.value = page.items; }
  catch { if (id === item.value?.id) previewFailed.value = true; }
  finally { if (id === item.value?.id) previewLoading.value = false; }
}
async function toggleInteraction(kind: 'like' | 'favorite') {
  if (!item.value || interactionBusy.value || !requireLogin()) return;
  const targetItem = item.value;
  interactionBusy.value = true;
  try {
    if (kind === 'like') {
      const result = await setLike(targetItem.id, !targetItem.viewerState.liked);
      targetItem.viewerState.liked = result.active; targetItem.stats.likeCount = result.count;
    } else {
      const result = await setFavorite(targetItem.id, !targetItem.viewerState.favorited);
      targetItem.viewerState.favorited = result.active; targetItem.stats.favoriteCount = result.count;
    }
  } catch (error) { showToast(error instanceof Error ? error.message : '操作失败，请重试'); }
  finally { interactionBusy.value = false; }
}
function commentsChanged(delta: number) {
  if (item.value?.stats) item.value.stats.commentCount = Math.max(0, item.value.stats.commentCount + delta);
  void loadPreview();
}
watch(commentsOpen, open => {
  if (open) { resumePlayback = Boolean(videoEl.value && !videoEl.value.paused); videoEl.value?.pause(); }
  else if (resumePlayback) { void videoEl.value?.play().catch(() => {}); resumePlayback = false; }
});
let playSessionId = createUuid();
let watchStartedAt: number | null = null;
let pendingWatchMs = 0;
let heartbeat: ReturnType<typeof setInterval> | null = null;

function onVideoPlaying() {
  if (!item.value) return;
  track(EVENT_NAMES.PLAY_START, { playSessionId, videoId: item.value.id, pageSource: 'content_detail' });
  startWatchClock();
}
function startWatchClock() {
  if (watchStartedAt === null && document.visibilityState !== 'hidden') watchStartedAt = performance.now();
}
function flushWatchProgress() {
  if (watchStartedAt !== null) {
    pendingWatchMs += Math.max(0, performance.now() - watchStartedAt);
    watchStartedAt = performance.now();
  }
  const video = videoEl.value;
  if (!item.value || !video || pendingWatchMs < 1) return;
  const watchedDeltaMs = Math.floor(pendingWatchMs);
  pendingWatchMs -= watchedDeltaMs;
  track(EVENT_NAMES.PLAY_PROGRESS, {
    playSessionId, videoId: item.value.id, pageSource: 'content_detail',
    properties: {
      watchedDeltaMs,
      positionMs: Math.max(0, Math.floor(video.currentTime * 1000)),
      durationMs: Number.isFinite(video.duration) && video.duration > 0 ? Math.floor(video.duration * 1000) : item.value.durationMs,
      playbackRate: video.playbackRate,
      visible: document.visibilityState !== 'hidden',
    },
  });
}
function stopWatchClock() {
  if (watchStartedAt !== null) {
    pendingWatchMs += Math.max(0, performance.now() - watchStartedAt);
    watchStartedAt = null;
  }
  flushWatchProgress();
}
function onVideoPause() {
  if (!item.value || videoEl.value?.ended) return;
  stopWatchClock();
  track(EVENT_NAMES.PLAY_PAUSE, {
    playSessionId, videoId: item.value.id, pageSource: 'content_detail',
    properties: { positionMs: Math.max(0, Math.floor((videoEl.value?.currentTime ?? 0) * 1000)) },
  });
}
function onVisibilityChange() {
  if (document.visibilityState === 'hidden') stopWatchClock();
  else if (videoEl.value && !videoEl.value.paused && !videoEl.value.ended) startWatchClock();
}
function onVideoEnded() {
  stopWatchClock();
  if (item.value) track(EVENT_NAMES.PLAY_COMPLETE, {
    playSessionId, videoId: item.value.id, pageSource: 'content_detail',
    properties: { durationMs: Math.floor((videoEl.value?.duration ?? 0) * 1000) },
  });
}
async function load() {
  const generation = ++contentGeneration;
  stopWatchClock(); playSessionId = createUuid();
  commentsOpen.value = false; preview.value = [];
  loading.value = true; failed.value = false; item.value = undefined;
  try {
    const response = await getContentDetail(String(route.params.contentId));
    if (generation !== contentGeneration) return;
    item.value = response;
    void loadPreview();
    if (route.query?.comments === '1') commentsOpen.value = true;
  }
  catch { if (generation === contentGeneration) failed.value = true; }
  finally { if (generation === contentGeneration) loading.value = false; }
}
watch(() => route.params.contentId, load, { immediate: true });
heartbeat = setInterval(flushWatchProgress, 5_000);
document.addEventListener('visibilitychange', onVisibilityChange);
onBeforeUnmount(() => {
  contentGeneration++;
  stopWatchClock();
  if (heartbeat) clearInterval(heartbeat);
  document.removeEventListener('visibilitychange', onVisibilityChange);
});
</script>
<template>
  <main class="detail-page">
    <header><button aria-label="返回" @click="router.back()"><van-icon name="arrow-left" /></button><strong>内容详情</strong><span /></header>
    <van-loading v-if="loading">正在加载…</van-loading>
    <section v-else-if="failed"><p>内容不可用或已下架</p><button @click="load">重试</button></section>
    <ContentArticle v-else-if="item" :title="item.title" :author-nickname="item.author.nickname" :description="item.description">
      <template #author><span /></template>
      <template #before><button class="article-author" @click="router.push({ name: 'author', params: { userId: item.author.id } })"><AvatarImage :src="item.author.avatarUrl" :alt="item.author.nickname" /><span><strong>{{ item.author.nickname }}</strong><small v-if="item.publishedAt">{{ timeAgo(item.publishedAt) }}</small></span><van-icon name="arrow" /></button></template>
      <template #media><video v-if="item.videoUrl" ref="videoEl" :src="item.videoUrl" :poster="item.cover?.coverUrl ?? undefined" controls playsinline @playing="onVideoPlaying" @waiting="stopWatchClock" @pause="onVideoPause" @ended="onVideoEnded" /></template>
      <section class="article-comments" aria-label="评论预览">
        <header><h2>评论 {{ formatCount(item.stats?.commentCount ?? 0) }}</h2><button @click="commentsOpen = true">查看全部 <van-icon name="arrow" /></button></header>
        <p v-if="previewLoading" role="status">正在加载评论…</p>
        <button v-else-if="previewFailed" class="preview-retry" @click="loadPreview">评论加载失败，点击重试</button>
        <article v-for="comment in preview" v-else :key="comment.id" class="preview-comment"><AvatarImage :src="comment.user.avatarUrl" :alt="comment.user.nickname" /><div><strong>{{ comment.user.nickname }}</strong><p>{{ comment.content }}</p><small>{{ timeAgo(comment.createdAt) }}</small></div></article>
        <p v-if="!previewLoading && !previewFailed && !preview.length">还没有评论，来分享你的想法吧</p>
      </section>
    </ContentArticle>
    <footer v-if="item" class="article-toolbar">
      <button class="write-comment" @click="writeComment"><van-icon name="edit" /> 写评论…</button>
      <button aria-label="查看评论" @click="commentsOpen = true"><van-icon name="comment-o" /><span>{{ formatCount(item.stats?.commentCount ?? 0) }}</span></button>
      <PulseHeart label="点赞内容" icon="like" :active="item.viewerState?.liked ?? false" :count="item.stats?.likeCount ?? 0" :disabled="interactionBusy" @click="toggleInteraction('like')" />
      <PulseHeart label="收藏内容" icon="star" :active="item.viewerState?.favorited ?? false" :count="item.stats?.favoriteCount ?? 0" :disabled="interactionBusy" @click="toggleInteraction('favorite')" />
    </footer>
    <CommentPanel v-model:open="commentsOpen" :video="item ?? null" @changed="commentsChanged" />
  </main>
</template>
<style scoped>
.detail-page { height:100dvh; padding:0 16px calc(96px + env(safe-area-inset-bottom)); overflow-y:auto; background:var(--paper); color:var(--text-strong); }
.detail-page > header { position:sticky; top:0; z-index:10; max-width:760px; margin:0 auto 20px; min-height:60px; display:grid; grid-template-columns:44px 1fr 44px; align-items:center; text-align:center; background:var(--paper); border-bottom:1px solid var(--line); }
.detail-page button { min-height:44px; border-radius:8px; }
.article-author { display:flex; align-items:center; gap:12px; width:100%; margin:0 0 20px; text-align:left; }
.article-author > img { width:44px; height:44px; border-radius:50%; }
.article-author > span { flex:1; }.article-author small { display:block; margin-top:4px; color:var(--text-muted); font-size:12px; }
.article-author > .van-icon { color:var(--text-muted); }
.article-comments { border-top:1px solid var(--line); margin-top:28px; padding-top:16px; }
.article-comments > header { display:flex; justify-content:space-between; align-items:center; gap:16px; }
.article-comments h2 { margin:0; font-size:20px; }.article-comments > p { color:var(--text-muted); font-size:14px; }
.article-comments button { color:var(--accent); }
.preview-comment { display:flex; gap:12px; padding:16px 0; }.preview-comment > img { width:40px; height:40px; border-radius:50%; }
.preview-comment p { margin:8px 0; line-height:1.6; overflow-wrap:anywhere; }.preview-comment small { font-size:12px; color:var(--text-muted); }
.article-toolbar { position:fixed; z-index:20; bottom:0; left:50%; transform:translateX(-50%); width:min(100%,792px); display:flex; align-items:center; gap:8px; padding:12px 16px max(12px,env(safe-area-inset-bottom)); border-top:1px solid var(--line); background:var(--paper); }
.article-toolbar button { display:flex; align-items:center; justify-content:center; gap:5px; min-width:44px; font-size:13px; }
.article-toolbar :deep(.van-icon) { font-size:22px; }.article-toolbar [aria-pressed="true"] { color:var(--accent); }
.article-toolbar .write-comment { flex:1; padding:0 12px; background:var(--soft); color:var(--text-muted); text-align:left; justify-content:flex-start; }
@media(max-width:359px) { .article-toolbar { gap:4px; padding-inline:12px; }.article-toolbar button { flex-wrap:wrap; gap:2px; }.article-toolbar .write-comment { padding:0 8px; font-size:12px; } }
</style>
