<script setup lang="ts">
/**
 * 推荐流页：全屏竖屏播放、上下滑切换、点赞/收藏/关注乐观更新、游标分页、评论/分享入口。
 * 参照视觉：localhost:5173/h5 现有原型（feed-header / feed-meta / action-bar / bottom-nav）。
 */
import { computed, onActivated, onDeactivated, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { showToast } from 'vant';
import { addHistory, getFollowingFeed, getRecommendFeed, getVideoDetail, setFavorite, setFollow, setLike } from '../api';
import { isAuthenticated } from '../api/http';
import type { FeedItem } from '../api/types';
import FeedPlayer from '../components/FeedPlayer.vue';
import CommentPanel from '../components/CommentPanel.vue';
import ShareSheet from '../components/ShareSheet.vue';
import ReportSheet from '../components/ReportSheet.vue';
import { EVENT_NAMES, track } from '../analytics';
import { safeRichText } from '../utils/richText';
import { shuffleFeedPage } from '../utils/feedOrder';
import { useAuthStore } from '../stores/auth';
import LoadingState from '../components/LoadingState.vue';
import { pendingInteractions } from '../utils/pendingInteractions';

const FEED_PAGE_SIZE = 20;

type PlayerInstance = InstanceType<typeof FeedPlayer>;
const playerRefs = ref<PlayerInstance[]>([]);

const router = useRouter();
const auth = useAuthStore();

const videos = ref<FeedItem[]>([]);
const cursor = ref<string | null>(null);
const loading = ref(false);
const initialLoading = ref(true);
const finished = ref(false);
const loadFailed = ref(false);
const endReached = ref(false);
const feedMode = ref<'following' | 'recommend'>('recommend');

const activeIndex = ref(0);
const pageActive = ref(true);
onActivated(() => { pageActive.value = true; });
onDeactivated(() => { pageActive.value = false; });
const commentsOpen = ref(false);
const shareOpen = ref(false);
const reportOpen = ref(false);
const commentVideo = ref<FeedItem | null>(null);
const shareVideo = ref<FeedItem | null>(null);
const reportVideoItem = ref<FeedItem | null>(null);
const contentItem = ref<FeedItem | null>(null);
const contentOpen = ref(false);
const contentHtml = computed(() => safeRichText(contentItem.value?.description));

const activeItem = computed(() => videos.value[activeIndex.value]);
const firstVisibleIndex = computed(() => Math.max(0, activeIndex.value - 1));
const visibleVideos = computed(() => videos.value.slice(firstVisibleIndex.value, firstVisibleIndex.value + 3));
const visibleActiveIndex = computed(() => activeIndex.value - firstVisibleIndex.value);
const showEndHint = computed(() =>
  endReached.value && finished.value && videos.value.length > 0
  && activeIndex.value === videos.value.length - 1,
);

// 曝光埋点：当前项变化时上报（仅一次/项）
const exposed = new Set<string>();
watch(activeIndex, (index) => {
  const item = videos.value[index];
  if (!item || exposed.has(item.id)) return;
  exposed.add(item.id);
  track(EVENT_NAMES.VIDEO_EXPOSE, { videoId: item.id, pageSource: 'recommend_feed' });
  track(EVENT_NAMES.FEED_SWIPE, { videoId: item.id, pageSource: 'recommend_feed' });
});

function requireLogin(): boolean {
  if (isAuthenticated()) return true;
  router.push({ name: 'login', query: { redirect: router.currentRoute.value.fullPath } });
  return false;
}

async function loadMore(reset = false) {
  if (loading.value || (!reset && finished.value)) return;
  const requestedVideoId = reset && typeof router.currentRoute.value.query.video === 'string'
    ? router.currentRoute.value.query.video : null;
  loading.value = true;
  loadFailed.value = false;
  try {
    const page = feedMode.value === 'following'
      ? await getFollowingFeed(reset ? null : cursor.value, FEED_PAGE_SIZE)
      : await getRecommendFeed(reset ? null : cursor.value, FEED_PAGE_SIZE);
    if (reset) {
      let items = feedMode.value === 'recommend'
        ? shuffleFeedPage(page.items, { isFirstPage: true })
        : page.items;
      if (requestedVideoId) {
        const existing = items.find((item) => item.id === requestedVideoId);
        if (existing) {
          items = [existing, ...items.filter((item) => item.id !== requestedVideoId)];
        } else {
          try {
            const requested = await getVideoDetail(requestedVideoId);
            items = [requested, ...items];
          } catch {
            showToast('对应视频不可用，已为你展示推荐内容');
          }
        }
      }
      videos.value = items;
      activeIndex.value = 0;
      endReached.value = false;
    } else {
      const existingIds = new Set(videos.value.map((item) => item.id));
      const pageItems = feedMode.value === 'recommend' ? shuffleFeedPage(page.items) : page.items;
      videos.value.push(...pageItems.filter((item) => !existingIds.has(item.id)));
    }
    cursor.value = page.nextCursor;
    finished.value = page.nextCursor == null;
  } catch {
    loadFailed.value = true;
    showToast('网络异常，请稍后重试');
  } finally {
    loading.value = false;
    initialLoading.value = false;
  }
}

// ---------- 滑动切换 ----------
const SWIPE_DISTANCE = 60;
const SWIPE_DIRECTION_RATIO = 1.2;
let pointerId: number | null = null;
let startX = 0;
let startY = 0;
let deltaX = 0;
let deltaY = 0;

function isInteractiveTarget(target: EventTarget | null) {
  return target instanceof Element
    && Boolean(target.closest('button, a, input, textarea, select, .flow-progress'));
}

function onPointerDown(event: PointerEvent) {
  if (pointerId !== null || event.isPrimary === false || isInteractiveTarget(event.target)) return;
  pointerId = event.pointerId;
  startX = event.clientX;
  startY = event.clientY;
  deltaX = 0;
  deltaY = 0;
}
function onPointerMove(event: PointerEvent) {
  if (event.pointerId !== pointerId) return;
  deltaX = event.clientX - startX;
  deltaY = event.clientY - startY;
}
function finishPointer(event: PointerEvent, cancelled = false) {
  if (event.pointerId !== pointerId) return;
  pointerId = null;
  if (cancelled || Math.abs(deltaY) < SWIPE_DISTANCE) return;
  if (Math.abs(deltaY) < Math.abs(deltaX) * SWIPE_DIRECTION_RATIO) return;
  if (deltaY < 0) void next();
  else prev();
}
function onPointerUp(event: PointerEvent) {
  finishPointer(event);
}
function onPointerCancel(event: PointerEvent) {
  finishPointer(event, true);
}

async function next() {
  if (activeIndex.value < videos.value.length - 1) {
    activeIndex.value += 1;
    endReached.value = false;
    return;
  }
  if (finished.value) {
    endReached.value = true;
    return;
  }
  const previousCount = videos.value.length;
  await loadMore();
  if (videos.value.length > previousCount) activeIndex.value += 1;
  else endReached.value = true;
}
function prev() {
  endReached.value = false;
  if (activeIndex.value <= 0) {
    // 首条下滑：下拉刷新
    if (loadFailed.value || videos.value.length > 0) loadMore(true);
    return;
  }
  activeIndex.value -= 1;
}

let wheelLocked = false;
function onWheel(event: WheelEvent) {
  if (wheelLocked || Math.abs(event.deltaY) < 30) return;
  wheelLocked = true;
  if (event.deltaY > 0) void next();
  else prev();
  window.setTimeout(() => { wheelLocked = false; }, 380);
}

// ---------- 互动（乐观更新 + 失败回滚） ----------
function snapshot(item: FeedItem) {
  return { viewerState: { ...item.viewerState }, likeCount: item.stats.likeCount, favoriteCount: item.stats.favoriteCount, following: item.author.following };
}

async function like(item: FeedItem) {
  if (!requireLogin()) return;
  const key = `like:${item.id}`;
  if (pendingInteractions.has(key)) return;
  pendingInteractions.add(key);
  const target = !item.viewerState.liked;
  const before = snapshot(item);
  const optimisticCount = Math.max(0, before.likeCount + (target ? 1 : -1));
  item.viewerState = { ...item.viewerState, liked: target };
  item.stats = { ...item.stats, likeCount: optimisticCount };
  track(EVENT_NAMES.LIKE_TOGGLED, { videoId: item.id, properties: { active: target } });
  try {
    const result = await setLike(item.id, target);
    item.viewerState = { ...item.viewerState, liked: result.active };
    item.stats = { ...item.stats, likeCount: Math.max(0, result.count) };
  } catch {
    if (item.viewerState.liked === target) {
      item.viewerState = { ...item.viewerState, liked: before.viewerState.liked };
      item.stats = { ...item.stats, likeCount: before.likeCount };
      showToast('操作失败，已恢复');
    }
  } finally { pendingInteractions.delete(key); }
}

async function favorite(item: FeedItem) {
  if (!requireLogin()) return;
  const key = `favorite:${item.id}`;
  if (pendingInteractions.has(key)) return;
  pendingInteractions.add(key);
  const target = !item.viewerState.favorited;
  const before = snapshot(item);
  item.viewerState = { ...item.viewerState, favorited: target };
  item.stats = { ...item.stats, favoriteCount: Math.max(0, before.favoriteCount + (target ? 1 : -1)) };
  track(EVENT_NAMES.FAVORITE_TOGGLED, { videoId: item.id, properties: { active: target } });
  try {
    const result = await setFavorite(item.id, target);
    item.viewerState = { ...item.viewerState, favorited: result.active };
    item.stats = { ...item.stats, favoriteCount: Math.max(0, result.count) };
  } catch {
    item.viewerState = { ...item.viewerState, favorited: before.viewerState.favorited };
    item.stats = { ...item.stats, favoriteCount: before.favoriteCount };
    showToast('操作失败，已恢复');
  } finally { pendingInteractions.delete(key); }
}
function likeFromDoubleTap(item: FeedItem) { if (!item.viewerState.liked) void like(item); }

async function follow(authorId: string, active: boolean) {
  if (!requireLogin()) return;
  if (String(auth.user?.id ?? '') === authorId) return;
  const key = `follow:${authorId}`;
  if (pendingInteractions.has(key)) return;
  pendingInteractions.add(key);
  const authorItems = videos.value.filter((video) => video.author.id === authorId);
  const previousStates = authorItems.map((item) => item.author.following);
  authorItems.forEach((item) => { item.author = { ...item.author, following: active }; });
  track(EVENT_NAMES.FOLLOW_TOGGLED, { objectId: authorId, properties: { active } });
  try {
    const result = await setFollow(authorId, active);
    authorItems.forEach(item => { item.author = { ...item.author, following: result.active }; });
  } catch {
    authorItems.forEach((item, index) => {
      item.author = { ...item.author, following: previousStates[index] };
    });
    showToast('操作失败，已恢复');
  } finally { pendingInteractions.delete(key); }
}

function openComments(item: FeedItem) {
  if (!requireLogin()) return;
  commentVideo.value = item;
  commentsOpen.value = true;
  track(EVENT_NAMES.COMMENT_PANEL_OPEN, { videoId: item.id, pageSource: 'recommend_feed' });
}

let overlayPlayer: PlayerInstance | undefined;
let resumeAfterOverlay = false;
watch(() => commentsOpen.value || contentOpen.value || shareOpen.value || reportOpen.value, (open) => {
  const player = playerRefs.value[visibleActiveIndex.value];
  if (open) {
    overlayPlayer = player;
    resumeAfterOverlay = player?.isPlaying() ?? false;
    player?.pause();
  } else {
    if (resumeAfterOverlay && pageActive.value && player === overlayPlayer) void player?.play();
    overlayPlayer = undefined;
    resumeAfterOverlay = false;
  }
});
function openShare(item: FeedItem) {
  if (!requireLogin()) return;
  shareVideo.value = item;
  shareOpen.value = true;
}
function openAuthor(userId: string) {
  router.push({ name: 'author', params: { userId } });
}
function openContent(item: FeedItem) {
  if (!item.videoUrl) {
    router.push({ name: 'content-detail', params: { contentId: item.id } });
    return;
  }
  contentItem.value = item;
  contentOpen.value = true;
}

// 有效播放（≥2 秒）写入观看历史（PRD 数据口径）
function onEffectivePlay(item: FeedItem, progressMs: number) {
  if (!isAuthenticated()) return;
  addHistory(item.id, progressMs).catch(() => { /* 历史写入失败不打扰用户 */ });
}

function reportVideo(item: FeedItem) {
  if (!requireLogin()) return;
  reportVideoItem.value = item;
  reportOpen.value = true;
}

function gotoDiscover() {
  router.push({ name: 'discover' });
}

async function switchFeed(mode: 'following' | 'recommend') {
  if (mode === feedMode.value || loading.value) return;
  if (mode === 'following' && !requireLogin()) return;
  feedMode.value = mode;
  videos.value = [];
  cursor.value = null;
  activeIndex.value = 0;
  finished.value = false;
  loadFailed.value = false;
  endReached.value = false;
  initialLoading.value = true;
  await loadMore(true);
}

// 返回缓存页面保留列表和当前项。
onMounted(() => loadMore(true));
</script>

<template>
  <div class="feed-screen">
    <div
      class="feed-viewport"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerCancel"
      @wheel.prevent="onWheel"
      @keydown.down.prevent="next"
      @keydown.up.prevent="prev"
      tabindex="0"
    >
      <div class="feed-track">
        <!-- 只让当前项建立媒体连接，避免隐藏播放器和缩略图重复下载大文件。 -->
        <FeedPlayer
          v-for="(item, index) in visibleVideos"
          :key="item.id"
          class="feed-slide"
          :style="{ transform: `translateY(${(index + firstVisibleIndex - activeIndex) * 100}%)` }"
          ref="playerRefs"
          :item="item"
          :active="pageActive && index === visibleActiveIndex"
          :preload="pageActive && index === visibleActiveIndex ? 'auto' : 'none'"
          :load-source="pageActive && index === visibleActiveIndex"
          :like-pending="pendingInteractions.has(`like:${item.id}`)"
          :favorite-pending="pendingInteractions.has(`favorite:${item.id}`)"
          :follow-pending="pendingInteractions.has(`follow:${item.author.id}`)"
          @open-comments="openComments"
          @open-content="openContent"
          @open-share="openShare"
          @open-author="openAuthor"
          @like="like"
          @favorite="favorite"
          @like-double-tap="likeFromDoubleTap"
          @follow-author="follow"
          @effective-play="onEffectivePlay"
        />
      </div>
    </div>

    <header class="feed-header">
      <strong class="feed-page-title">视频</strong>
      <div class="feed-tabs">
        <button :class="{ active: feedMode === 'following' }" :aria-pressed="feedMode === 'following'" :disabled="loading" @click="switchFeed('following')">关注</button>
        <button :class="{ active: feedMode === 'recommend' }" :aria-pressed="feedMode === 'recommend'" :disabled="loading" @click="switchFeed('recommend')">推荐</button>
      </div>
      <button aria-label="搜索" @click="gotoDiscover"><van-icon name="search" /></button>
    </header>

    <div class="spinner-wrap" v-if="initialLoading">
      <LoadingState dark label="正在加载视频" detail="精彩内容马上呈现" />
    </div>
    <div class="spinner-wrap" v-else-if="loadFailed && videos.length === 0">
      <div class="empty-state">
        <van-icon name="warning-o" />
        <p>加载失败</p>
        <button class="retry-btn" @click="loadMore(true)">重试</button>
      </div>
    </div>
    <div class="spinner-wrap" v-else-if="videos.length === 0">
      <div class="empty-state">
        <van-icon name="friends-o" />
        <p>{{ feedMode === 'following' ? '暂无关注视频' : '暂无推荐视频' }}</p>
      </div>
    </div>

    <div class="load-more" v-if="showEndHint">没有更多了</div>

    <CommentPanel v-model:open="commentsOpen" :video="commentVideo" />
    <van-popup v-model:show="contentOpen" position="bottom" round class="content-popup">
      <article v-if="contentItem" class="content-detail">
        <h2>{{ contentItem.title }}</h2>
        <p class="content-author">@{{ contentItem.author.nickname }}</p>
        <div class="rich-content" v-html="contentHtml" />
      </article>
    </van-popup>
    <ShareSheet v-model:open="shareOpen" :video="shareVideo" @report-video="reportVideo" />
    <ReportSheet v-model:open="reportOpen" target-type="VIDEO" :target-id="reportVideoItem?.id ?? ''" />
  </div>
</template>

<style scoped>
.feed-viewport { position: absolute; inset: 0; overflow: hidden; touch-action: none; }
.feed-track { position: absolute; inset: 0; }
.feed-slide { position: absolute; inset: 0; transition: transform .32s cubic-bezier(.2,.8,.2,1); }
.load-more { position: absolute; z-index: 9; bottom: 100px; width: 100%; text-align: center; color: #ffffffb3; font-size: 12px; pointer-events: none; }
.retry-btn { padding: 6px 20px; border-radius: 16px; color: #fff; background: #ffffff2e; font-size: 13px; }
.content-popup { max-height:80vh; overflow-y:auto; color:#1e293b; background:#fff; }
.content-detail { padding:24px 20px max(24px,env(safe-area-inset-bottom)); }
.content-detail h2 { margin:0; font-size:22px; line-height:1.35; }
.content-author { margin:8px 0 20px; color:#64748b; font-size:12px; }
.rich-content { overflow-wrap:anywhere; white-space:pre-wrap; font-size:15px; line-height:1.8; }
.rich-content :deep(img) { display:block; max-width:100%; height:auto; margin:14px auto; border-radius:8px; }
.rich-content :deep(p) { margin:0 0 12px; }
</style>
