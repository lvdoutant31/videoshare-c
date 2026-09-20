<script setup lang="ts">
/**
 * 单视频播放器：自动播放/暂停、点击切换、长按倍速、失败重试、流光进度线、静音记忆、页面隐藏暂停、拖动进度条。
 * 只允许当前项播放（单实例策略由 FeedView 通过 active 控制）。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { FeedItem } from '../api/types';
import { formatCount, formatDuration } from '../utils/format';
import { EVENT_NAMES, track } from '../analytics';

const props = defineProps<{
  item: FeedItem;
  active: boolean;
  preload: 'auto' | 'metadata' | 'none';
  loadSource: boolean;
}>();
const emit = defineEmits<{
  (e: 'open-comments', item: FeedItem): void;
  (e: 'open-share', item: FeedItem): void;
  (e: 'open-author', userId: string): void;
  (e: 'like', item: FeedItem): void;
  (e: 'favorite', item: FeedItem): void;
  (e: 'like-double-tap', item: FeedItem): void;
  (e: 'follow-author', authorId: string, active: boolean): void;
  (e: 'effective-play', item: FeedItem, progressMs: number): void;
}>();

const videoEl = ref<HTMLVideoElement | null>(null);
const paused = ref(true);
const failed = ref(false);
const buffering = ref(false);
const progress = ref(0); // 0..1
const rate = ref(1);
const showPausedHint = ref(false);
const ended = ref(false);

const MUTE_KEY = 'yingliu.muted';
const mutedPref = ref(localStorage.getItem(MUTE_KEY) !== '0');
let retryCount = 0;

const mediaSrc = computed(() => (props.loadSource ? props.item.videoUrl ?? undefined : undefined));
const durationLabel = computed(() => formatDuration(props.item.durationMs));
const likeLabel = computed(() => formatCount(props.item.stats.likeCount));
const favoriteLabel = computed(() => formatCount(props.item.stats.favoriteCount));

function persistMuted() {
  localStorage.setItem(MUTE_KEY, mutedPref.value ? '1' : '0');
}

async function play() {
  const video = videoEl.value;
  if (!video || !mediaSrc.value || failed.value) return;
  if (ended.value || (Number.isFinite(video.duration) && video.duration > 0 && video.currentTime >= video.duration - 0.05)) {
    video.currentTime = 0;
    progress.value = 0;
    completeReported = false;
  }
  ended.value = false;
  showPausedHint.value = false;
  video.muted = mutedPref.value;
  try {
    await video.play();
    paused.value = false;
    track(EVENT_NAMES.PLAY_START, { videoId: props.item.id, pageSource: 'recommend_feed' });
  } catch {
    // 自动播放策略拦截：回退静音后重试一次
    video.muted = true;
    try {
      await video.play();
      paused.value = false;
      track(EVENT_NAMES.PLAY_START, { videoId: props.item.id, pageSource: 'recommend_feed' });
    } catch {
      // 仍失败：等用户交互
    }
  }
}

function pause() {
  const video = videoEl.value;
  if (video && !video.paused) {
    track(EVENT_NAMES.PLAY_PAUSE, { videoId: props.item.id, properties: { positionMs: Math.floor(video.currentTime * 1000) } });
  }
  videoEl.value?.pause();
  paused.value = true;
}

watch(
  () => props.active,
  (active) => {
    if (active) {
      play();
    } else {
      pause();
    }
  },
);

watch(
  mediaSrc,
  (source) => {
    failed.value = false;
    retryCount = 0;
    progress.value = 0;
    ended.value = false;
    showPausedHint.value = false;
    effectiveReported = false;
    completeReported = false;
    lastProgressReport = 0;
    if (!source) {
      pause();
      const video = videoEl.value;
      if (video) {
        video.removeAttribute('src');
        video.load();
      }
      return;
    }
    if (props.active) play();
  },
);

function toggle() {
  if (paused.value) {
    showPausedHint.value = false;
    play();
  } else {
    pause();
    showPausedHint.value = true;
  }
}

// 长按倍速
let longPressTimer: ReturnType<typeof setTimeout> | null = null;
let longPressActivated = false;
let lastLongPressAt = 0;
function onPressStart() {
  longPressActivated = false;
  longPressTimer = setTimeout(() => {
    const video = videoEl.value;
    if (!video || video.paused) return;
    longPressActivated = true;
    rate.value = 2;
    video.playbackRate = 2;
  }, 500);
}
function onPressEnd(): boolean {
  if (longPressTimer) clearTimeout(longPressTimer);
  longPressTimer = null;
  const activated = longPressActivated;
  longPressActivated = false;
  if (activated) lastLongPressAt = Date.now();
  if (rate.value !== 1) {
    rate.value = 1;
    if (videoEl.value) videoEl.value.playbackRate = 1;
  }
  return activated;
}

function onError() {
  retryCount += 1;
  if (retryCount <= 1 && mediaSrc.value) {
    // 自动重试一次（下架对象转私有读后旧链接 403，也会走到这里）
    const video = videoEl.value;
    if (video) {
      video.load();
      play();
    }
    return;
  }
  failed.value = true;
  paused.value = true;
  track(EVENT_NAMES.PLAY_FAILED, { videoId: props.item.id, pageSource: 'recommend_feed' });
}

function retry() {
  failed.value = false;
  retryCount = 0;
  play();
}

function onTimeUpdate() {
  const video = videoEl.value;
  if (video && video.duration > 0) {
    progress.value = video.currentTime / video.duration;
  }
  reportProgress();
}

// 播放进度节流上报（每 10 秒一个里程碑，避免高频逐秒上报，PRD）
let lastProgressReport = 0;
function reportProgress() {
  const video = videoEl.value;
  if (!video || video.duration <= 0) return;
  const positionMs = Math.floor(video.currentTime * 1000);
  // 有效播放：累计 ≥2 秒（PRD 数据口径）
  if (positionMs >= 2000 && !effectiveReported) {
    effectiveReported = true;
    emit('effective-play', props.item, positionMs);
  }
  if (positionMs - lastProgressReport >= 10_000) {
    lastProgressReport = positionMs;
    track(EVENT_NAMES.PLAY_PROGRESS, { videoId: props.item.id, properties: { positionMs } });
  }
  if (video.duration - video.currentTime < 0.3 && !completeReported) {
    completeReported = true;
    track(EVENT_NAMES.PLAY_COMPLETE, { videoId: props.item.id, properties: { durationMs: Math.floor(video.duration * 1000) } });
  }
}
let effectiveReported = false;
let completeReported = false;

function onWaiting() {
  buffering.value = true;
}
function onPlaying() {
  buffering.value = false;
  paused.value = false;
  ended.value = false;
}
function onNativePause() {
  paused.value = true;
}
function onEnded() {
  buffering.value = false;
  paused.value = true;
  ended.value = true;
  progress.value = 1;
  showPausedHint.value = true;
}

// 单击暂停 / 双击点赞
const DOUBLE_TAP_WINDOW_MS = 300;
const SINGLE_TAP_DELAY_MS = 320;
let lastTap = 0;
let tapTimer: ReturnType<typeof setTimeout> | null = null;
function onTap() {
  const now = Date.now();
  if (now - lastTap < DOUBLE_TAP_WINDOW_MS) {
    if (tapTimer) clearTimeout(tapTimer);
    lastTap = 0;
    emit('like-double-tap', props.item);
    return;
  }
  lastTap = now;
  tapTimer = setTimeout(() => toggle(), SINGLE_TAP_DELAY_MS);
}

let surfacePointerId: number | null = null;
let surfaceStartX = 0;
let surfaceStartY = 0;
let surfaceMoved = false;
let touchStartX = 0;
let touchStartY = 0;
let touchMoved = false;
let lastTouchTapAt = 0;
let suppressSurfaceClickUntil = 0;

function onSurfacePointerDown(event: PointerEvent) {
  if (surfacePointerId !== null || event.isPrimary === false) return;
  surfacePointerId = event.pointerId;
  surfaceStartX = event.clientX;
  surfaceStartY = event.clientY;
  surfaceMoved = false;
  onPressStart();
}
function onSurfacePointerMove(event: PointerEvent) {
  if (event.pointerId !== surfacePointerId) return;
  if (Math.hypot(event.clientX - surfaceStartX, event.clientY - surfaceStartY) > 12) {
    surfaceMoved = true;
    onPressEnd();
  }
}
function finishSurfacePointer(event: PointerEvent) {
  if (event.pointerId !== surfacePointerId) return;
  surfacePointerId = null;
  const wasLongPress = onPressEnd();
  if (surfaceMoved || wasLongPress) suppressSurfaceClickUntil = Date.now() + 500;
}
function onSurfacePointerUp(event: PointerEvent) {
  finishSurfacePointer(event);
}
function onSurfacePointerCancel(event: PointerEvent) {
  finishSurfacePointer(event);
}
function onSurfaceTouchStart(event: TouchEvent) {
  if (event.touches.length !== 1) return;
  touchStartX = event.touches[0].clientX;
  touchStartY = event.touches[0].clientY;
  touchMoved = false;
}
function onSurfaceTouchMove(event: TouchEvent) {
  if (event.touches.length !== 1) return;
  if (Math.hypot(event.touches[0].clientX - touchStartX, event.touches[0].clientY - touchStartY) > 12) {
    touchMoved = true;
  }
}
function onSurfaceTouchEnd() {
  lastTouchTapAt = Date.now();
  if (touchMoved || Date.now() - lastLongPressAt < 500) {
    suppressSurfaceClickUntil = Date.now() + 500;
    return;
  }
  onTap();
}
function onSurfaceClick() {
  // 触摸路径已在 touchend 处理，忽略其随后生成的兼容 click。
  if (Date.now() - lastTouchTapAt < 500 || Date.now() < suppressSurfaceClickUntil) return;
  onTap();
}

onMounted(() => {
  if (props.active) play();
  document.addEventListener('visibilitychange', onVisibilityChange);
});
onBeforeUnmount(() => {
  if (longPressTimer) clearTimeout(longPressTimer);
  if (tapTimer) clearTimeout(tapTimer);
  document.removeEventListener('visibilitychange', onVisibilityChange);
  pause();
});

// 页面隐藏（切后台/锁屏/切 Tab）自动暂停；返回前台不自动出声，等用户操作（PRD）
function onVisibilityChange() {
  if (document.hidden) pause();
}

// 拖动进度条 seek（touch + mouse 兼容）
const progressBarEl = ref<HTMLDivElement | null>(null);
const seeking = ref(false);
let seekPointerId: number | null = null;

function seekTo(clientX: number) {
  const bar = progressBarEl.value;
  const video = videoEl.value;
  if (!bar || !video || !video.duration || failed.value) return;
  const rect = bar.getBoundingClientRect();
  if (rect.width <= 0) return;
  const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  video.currentTime = ratio * video.duration;
  progress.value = ratio;
  if (ratio < 0.999) {
    ended.value = false;
    completeReported = false;
  }
}
function onSeekStart(event: PointerEvent) {
  if (failed.value || event.isPrimary === false) return;
  seekPointerId = event.pointerId;
  seeking.value = true;
  progressBarEl.value?.setPointerCapture?.(event.pointerId);
  seekTo(event.clientX);
}
function onSeekMove(event: PointerEvent) {
  if (!seeking.value || event.pointerId !== seekPointerId) return;
  seekTo(event.clientX);
}
function onSeekEnd(event: PointerEvent) {
  if (event.pointerId !== seekPointerId) return;
  progressBarEl.value?.releasePointerCapture?.(event.pointerId);
  seekPointerId = null;
  seeking.value = false;
}

// 供父组件（评论面板打开等场景）控制播放
defineExpose({ play, pause, toggle });
</script>

<template>
  <div class="feed-item">
    <video
      ref="videoEl"
      class="feed-video"
      :src="mediaSrc"
      :poster="item.cover?.coverUrl ?? undefined"
      :preload="preload"
      playsinline
      webkit-playsinline
      x5-playsinline
      :muted="mutedPref"
      @error="onError"
      @timeupdate="onTimeUpdate"
      @waiting="onWaiting"
      @playing="onPlaying"
      @pause="onNativePause"
      @ended="onEnded"
    />
    <div class="feed-shade" />
    <div
      class="player-hit-area"
      role="button"
      :tabindex="active ? 0 : -1"
      :aria-label="ended ? '重新播放' : paused ? '播放视频' : '暂停视频'"
      @pointerdown="onSurfacePointerDown"
      @pointermove="onSurfacePointerMove"
      @pointerup="onSurfacePointerUp"
      @pointercancel="onSurfacePointerCancel"
      @touchstart="onSurfaceTouchStart"
      @touchmove="onSurfaceTouchMove"
      @touchend="onSurfaceTouchEnd"
      @click="onSurfaceClick"
      @keydown.enter.prevent="toggle"
      @keydown.space.prevent="toggle"
    />
    <div class="player-hint" v-if="(showPausedHint || ended) && !failed">
      <van-icon :name="ended ? 'replay' : 'play'" />
    </div>
    <div class="player-hint failed" v-else-if="failed">
      <van-icon name="replay" />
      <p>内容不可播放或已下架</p>
      <button @click="retry">重试</button>
    </div>
    <van-loading v-if="buffering && !paused && !failed" class="feed-buffering" color="#fff" size="30" />

    <div class="feed-meta" @click="onTap">
      <strong @click.stop="emit('open-author', item.author.id)">@{{ item.author.nickname }}</strong>
      <p>{{ item.description }}</p>
      <div class="feed-tags" v-if="item.tags.length">
        <span v-for="tag in item.tags" :key="tag.id">#{{ tag.name }}</span>
      </div>
      <div class="music-ticker">
        <van-icon name="music-o" />
        <span>原声 - {{ item.author.nickname }}</span>
      </div>
    </div>

    <aside class="action-bar" @click="onTap">
      <button class="creator-anchor" aria-label="打开作者主页" @click.stop="emit('open-author', item.author.id)">
        <img :src="item.author.avatarUrl ?? ''" alt="作者头像" @click.stop="emit('open-author', item.author.id)" />
        <span :class="{ followed: item.author.following }" @click.stop="emit('follow-author', item.author.id, !item.author.following)">{{ item.author.following ? '✓' : '+' }}</span>
      </button>
      <button class="action-item" aria-label="点赞" @click.stop="emit('like', item)">
        <van-icon name="like" class="liked" v-if="item.viewerState.liked" />
        <van-icon name="like-o" v-else />
        <small>{{ likeLabel }}</small>
      </button>
      <button class="action-item" aria-label="评论" @click.stop="emit('open-comments', item)">
        <van-icon name="chat-o" />
        <small>{{ item.stats.commentCount }}</small>
      </button>
      <button class="action-item" aria-label="收藏" @click.stop="emit('favorite', item)">
        <van-icon name="star" class="saved" v-if="item.viewerState.favorited" />
        <van-icon name="star-o" v-else />
        <small>{{ favoriteLabel }}</small>
      </button>
      <button class="action-item" aria-label="分享" @click.stop="emit('open-share', item)">
        <van-icon name="share-o" />
        <small>分享</small>
      </button>
      <div class="vinyl">
        <img :src="item.cover?.coverUrl ?? ''" alt="音乐封面" />
      </div>
    </aside>

    <div
      ref="progressBarEl"
      class="flow-progress"
      :class="{ seeking }"
      @pointerdown.stop.prevent="onSeekStart"
      @pointermove.stop.prevent="onSeekMove"
      @pointerup.stop.prevent="onSeekEnd"
      @pointercancel.stop.prevent="onSeekEnd"
    ><i :style="{ transform: `scaleX(${progress})` }" /></div>
    <span class="feed-duration">{{ durationLabel }}</span>
    <span class="feed-rate" v-if="rate === 2">2x 倍速</span>
  </div>
</template>

<style scoped>
.feed-item { position: relative; flex: 0 0 100%; width: 100%; height: 100%; }
.player-hit-area { position: absolute; z-index: 2; inset: 0; touch-action: none; cursor: pointer; }
.player-hit-area:focus-visible { outline: 2px solid var(--cyan); outline-offset: -4px; }
.player-hint { z-index: 4; }
.feed-duration { position: absolute; z-index: 9; right: 14px; bottom: 92px; padding: 2px 8px; border-radius: 10px; color: #fff; background: #0006; font-size: 11px; pointer-events: none; }
.feed-rate { position: absolute; z-index: 9; left: 50%; top: 120px; transform: translateX(-50%); padding: 4px 12px; border-radius: 14px; color: var(--cyan); background: #0009; font-size: 12px; pointer-events: none; }
.feed-buffering { position: absolute; z-index: 9; top: 50%; left: 50%; transform: translate(-50%, -50%); }
.flow-progress { position: absolute; z-index: 9; left: 0; right: 0; bottom: 86px; height: 14px; background: transparent; pointer-events: auto; display: flex; align-items: center; cursor: pointer; touch-action: none; }
.flow-progress::before { content: ""; position: absolute; left: 0; right: 0; height: 2px; border-radius: 2px; background: #ffffff33; }
.flow-progress i { position: absolute; left: 0; height: 2px; border-radius: 2px; background: linear-gradient(90deg, var(--cyan), var(--coral)); transform-origin: left; }
.flow-progress.seeking::before { height: 4px; }
.flow-progress.seeking i { height: 4px; }
</style>
