<script setup lang="ts">
/**
 * 推荐流页：全屏竖屏播放、上下滑切换、点赞/收藏/关注乐观更新、游标分页、评论/分享入口。
 * 参照视觉：localhost:5173/h5 现有原型（feed-header / feed-meta / action-bar / bottom-nav）。
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { showToast } from 'vant';
import { addHistory, getRecommendFeed, setFavorite, setFollow, setLike } from '../api';
import { isAuthenticated } from '../api/http';
import type { FeedItem } from '../api/types';
import FeedPlayer from '../components/FeedPlayer.vue';
import CommentPanel from '../components/CommentPanel.vue';
import ShareSheet from '../components/ShareSheet.vue';
import ReportSheet from '../components/ReportSheet.vue';
import { EVENT_NAMES, track } from '../analytics';

type PlayerInstance = InstanceType<typeof FeedPlayer>;
const playerRefs = ref<PlayerInstance[]>([]);

const router = useRouter();

const videos = ref<FeedItem[]>([]);
const cursor = ref<string | null>(null);
const loading = ref(false);
const initialLoading = ref(true);
const finished = ref(false);
const loadFailed = ref(false);

const activeIndex = ref(0);
const commentsOpen = ref(false);
const shareOpen = ref(false);
const reportOpen = ref(false);
const commentVideo = ref<FeedItem | null>(null);
const shareVideo = ref<FeedItem | null>(null);
const reportVideoItem = ref<FeedItem | null>(null);

const activeItem = computed(() => videos.value[activeIndex.value]);

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
  loading.value = true;
  loadFailed.value = false;
  try {
    const page = await getRecommendFeed(reset ? null : cursor.value, 5);
    if (reset) {
      videos.value = page.items;
      activeIndex.value = 0;
    } else {
      videos.value.push(...page.items);
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
let startY = 0;
let deltaY = 0;
let tracking = false;

function onTouchStart(e: TouchEvent) {
  if (e.touches.length !== 1) return;
  tracking = true;
  startY = e.touches[0].clientY;
  deltaY = 0;
}
function onTouchMove(e: TouchEvent) {
  if (!tracking) return;
  deltaY = e.touches[0].clientY - startY;
}
function onTouchEnd() {
  if (!tracking) return;
  tracking = false;
  if (deltaY < -60) next();
  else if (deltaY > 60) prev();
}

function next() {
  if (activeIndex.value >= videos.value.length - 1) {
    if (!finished.value) loadMore();
    return;
  }
  activeIndex.value += 1;
}
function prev() {
  if (activeIndex.value <= 0) {
    // 首条下滑：下拉刷新
    if (loadFailed.value || videos.value.length > 0) loadMore(true);
    return;
  }
  activeIndex.value -= 1;
}

// ---------- 互动（乐观更新 + 失败回滚） ----------
function snapshot(item: FeedItem) {
  return { viewerState: { ...item.viewerState }, likeCount: item.stats.likeCount, favoriteCount: item.stats.favoriteCount, following: item.author.following };
}

async function like(item: FeedItem) {
  if (!requireLogin()) return;
  const target = !item.viewerState.liked;
  const before = snapshot(item);
  item.viewerState = { ...item.viewerState, liked: target };
  item.stats = { ...item.stats, likeCount: before.likeCount + (target ? 1 : -1) };
  track(EVENT_NAMES.LIKE_TOGGLED, { videoId: item.id, properties: { active: target } });
  try {
    const result = await setLike(item.id, target);
    item.stats = { ...item.stats, likeCount: result.count };
  } catch {
    item.viewerState = before.viewerState;
    item.stats = { ...item.stats, likeCount: before.likeCount };
    showToast('操作失败，已恢复');
  }
}

async function favorite(item: FeedItem) {
  if (!requireLogin()) return;
  const target = !item.viewerState.favorited;
  const before = snapshot(item);
  item.viewerState = { ...item.viewerState, favorited: target };
  item.stats = { ...item.stats, favoriteCount: before.favoriteCount + (target ? 1 : -1) };
  track(EVENT_NAMES.FAVORITE_TOGGLED, { videoId: item.id, properties: { active: target } });
  try {
    const result = await setFavorite(item.id, target);
    item.stats = { ...item.stats, favoriteCount: result.count };
  } catch {
    item.viewerState = before.viewerState;
    item.stats = { ...item.stats, favoriteCount: before.favoriteCount };
    showToast('操作失败，已恢复');
  }
}

async function follow(authorId: string, active: boolean) {
  if (!requireLogin()) return;
  const item = videos.value.find((v) => v.author.id === authorId);
  const before = item ? { ...item.author } : null;
  if (item) item.author = { ...item.author, following: active };
  track(EVENT_NAMES.FOLLOW_TOGGLED, { objectId: authorId, properties: { active } });
  try {
    await setFollow(authorId, active);
  } catch {
    if (item && before) item.author = before;
    showToast('操作失败，已恢复');
  }
}

function openComments(item: FeedItem) {
  if (!requireLogin()) return;
  commentVideo.value = item;
  commentsOpen.value = true;
  track(EVENT_NAMES.COMMENT_PANEL_OPEN, { videoId: item.id, pageSource: 'recommend_feed' });
}

// 打开评论面板时暂停当前视频，关闭后恢复（PRD：评论打开暂停，关闭按原状态恢复）
watch(commentsOpen, (open) => {
  const player = playerRefs.value[activeIndex.value];
  if (!player) return;
  if (open) player.pause();
  else player.play();
});
function openShare(item: FeedItem) {
  if (!requireLogin()) return;
  shareVideo.value = item;
  shareOpen.value = true;
}
function openAuthor(userId: string) {
  router.push({ name: 'author', params: { userId } });
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

// 离开页面时暂停全部（切后台/路由由浏览器自动处理 video）
onMounted(() => loadMore(true));
</script>

<template>
  <div class="feed-screen">
    <div
      class="feed-viewport"
      @touchstart.passive="onTouchStart"
      @touchmove.passive="onTouchMove"
      @touchend.passive="onTouchEnd"
    >
      <div class="feed-track" :style="{ transform: `translateY(-${activeIndex * 100}%)` }">
        <FeedPlayer
          v-for="(item, index) in videos"
          :key="item.id"
          ref="playerRefs"
          :item="item"
          :active="index === activeIndex"
          :preload="Math.abs(index - activeIndex) <= 1"
          @open-comments="openComments"
          @open-share="openShare"
          @open-author="openAuthor"
          @like="like"
          @favorite="favorite"
          @like-double-tap="like"
          @follow-author="follow"
          @effective-play="onEffectivePlay"
        />
      </div>
    </div>

    <header class="feed-header">
      <button aria-label="直播"><van-icon name="tv-o" /></button>
      <div class="feed-tabs">
        <button>关注</button>
        <button class="active">推荐</button>
      </div>
      <button aria-label="搜索" @click="gotoDiscover"><van-icon name="search" /></button>
    </header>

    <div class="spinner-wrap" v-if="initialLoading">
      <van-loading color="#fff" size="36" vertical>加载中...</van-loading>
    </div>
    <div class="spinner-wrap" v-else-if="loadFailed && videos.length === 0">
      <div class="empty-state">
        <van-icon name="warning-o" />
        <p>加载失败</p>
        <button class="retry-btn" @click="loadMore(true)">重试</button>
      </div>
    </div>

    <div class="load-more" v-if="finished && videos.length > 0">没有更多了</div>

    <CommentPanel v-model:open="commentsOpen" :video="commentVideo" />
    <ShareSheet v-model:open="shareOpen" :video="shareVideo" @report-video="reportVideo" />
    <ReportSheet v-model:open="reportOpen" target-type="VIDEO" :target-id="reportVideoItem?.id ?? ''" />
  </div>
</template>

<style scoped>
.feed-viewport { position: absolute; inset: 0; overflow: hidden; }
.feed-track { position: absolute; inset: 0; display: flex; flex-direction: column; transition: transform .32s cubic-bezier(.2,.8,.2,1); }
.load-more { position: absolute; z-index: 9; bottom: 100px; width: 100%; text-align: center; color: #ffffffb3; font-size: 12px; pointer-events: none; }
.retry-btn { padding: 6px 20px; border-radius: 16px; color: #fff; background: #ffffff2e; font-size: 13px; }
</style>
