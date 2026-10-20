<script setup lang="ts">
/**
 * 单视频播放器：自动播放/暂停、点击切换、长按倍速、失败重试、流光进度线、静音记忆、页面隐藏暂停、拖动进度条。
 * 只允许当前项播放（单实例策略由 FeedView 通过 active 控制）。
 */
import { computed, nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue';
import type { FeedItem, PlaybackSource } from '../api/types';
import { getVideoSources } from '../api';
import { loadVideoAt } from '../utils/videoPlayback';
import { formatCount, formatDuration } from '../utils/format';
import { EVENT_NAMES, track } from '../analytics';
import { createUuid } from '../utils/uuid';
import { showImagePreview, showToast } from 'vant';
import AvatarImage from './AvatarImage.vue';
import VideoThumbnail from './VideoThumbnail.vue';
import PulseHeart from './PulseHeart.vue';
import { richTextImages, richTextText } from '../utils/richText';
import { useAuthStore } from '../stores/auth';
import { isAuthenticated } from '../api/http';

const props = defineProps<{
  item: FeedItem;
  active: boolean;
  preload: 'auto' | 'metadata' | 'none';
  loadSource: boolean;
  likePending?: boolean;
  favoritePending?: boolean;
  followPending?: boolean;
}>();
const auth = useAuthStore();
const isOwnAuthor = computed(() => isAuthenticated() && auth.user?.id === props.item.author.id);
const emit = defineEmits<{
  (e: 'open-comments', item: FeedItem): void;
  (e: 'open-content', item: FeedItem): void;
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
const actualDuration = ref(0);
const durationSeconds = computed(() => actualDuration.value || (props.item.durationMs ?? 0) / 1000);
const rate = ref(1);
const showPausedHint = ref(false);
const ended = ref(false);

let retryCount = 0;
let playSessionId = createUuid();
let watchStartedAt: number | null = null;
let pendingWatchMs = 0;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let deactivated = false;

const selectedSource = ref<string | null>(null);
const sources = ref<PlaybackSource[]>([]);
const qualityOpen = ref(false);
const qualityLoading = ref(false);
const switchingQuality = ref(false);
let sourceController: AbortController | undefined;
const mediaSrc = computed(() => (props.loadSource ? selectedSource.value ?? props.item.videoUrl ?? undefined : undefined));
const qualityLabel = computed(() => sources.value.find(source => source.url === mediaSrc.value)?.label ?? '清晰度');
watch(() => props.item.id, () => {
  sourceController?.abort(); selectedSource.value = null; sources.value = []; qualityOpen.value = false;
});
async function openQuality() {
  if (qualityLoading.value || switchingQuality.value) return;
  if (qualityOpen.value) { qualityOpen.value = false; return; }
  if (!sources.value.length) {
    const id = props.item.id;
    qualityLoading.value = true;
    try { const available = await getVideoSources(id); if (props.item.id !== id) return; sources.value = available; }
    catch { showToast('清晰度加载失败，请重试'); return; }
    finally { qualityLoading.value = false; }
  }
  if (props.active && !deactivated) qualityOpen.value = true;
}
async function selectQuality(source: PlaybackSource) {
  qualityOpen.value = false;
  const video = videoEl.value;
  if (!video || switchingQuality.value || !props.active || source.url === mediaSrc.value) return;
  const previous = mediaSrc.value;
  if (!previous) return;
  cancelSeek(); onPressEnd();
  const position = video.currentTime;
  const playbackRate = video.playbackRate;
  const resume = !paused.value && !video.ended;
  stopWatchClock(true);
  switchingQuality.value = true; bufferedProgress.value = 0;
  sourceController?.abort();
  const controller = new AbortController(); sourceController = controller;
  const apply = async (url: string) => {
    selectedSource.value = url;
    await nextTick();
    await loadVideoAt(video, url, position, playbackRate, controller.signal);
  };
  try { await apply(source.url); }
  catch {
    if (controller.signal.aborted) return;
    showToast('此清晰度暂不可用，正在恢复原画面');
    try { await apply(previous); }
    catch { if (!controller.signal.aborted) { failed.value = true; showToast('播放恢复失败，请重试'); } }
  } finally {
    if (sourceController === controller) switchingQuality.value = false;
  }
  if (controller.signal.aborted) return;
  if (resume && props.active && !deactivated && !failed.value) {
    try { await video.play(); paused.value = false; } catch { paused.value = true; }
  } else { video.pause(); paused.value = true; }
}
const durationLabel = computed(() => formatDuration(Math.round(durationSeconds.value * 1000)));
const articleImages = computed(() => richTextImages(props.item.description));
const descriptionPreview = computed(() => {
  const body = richTextText(props.item.description).replace(/\s+/g, ' ').trim();
  const title = props.item.title.trim();
  return body.startsWith(title) ? body.slice(title.length).replace(/^[\s:????|??-]+/, '').trim() : body;
});
const galleryIndex = ref(0);
const defaultContentCover = `${import.meta.env.BASE_URL}default-content-cover.svg`;

let galleryPointer: number | null = null;
let galleryStartX = 0;
let galleryStartScroll = 0;
let galleryStartY = 0;
let galleryMoved = false;
function galleryDown(event: PointerEvent) {
  galleryPointer = event.pointerId;
  const gallery = event.currentTarget as HTMLElement;
  gallery.setPointerCapture(event.pointerId);
  gallery.style.scrollSnapType = 'none';
  galleryStartX = event.clientX;
  galleryStartY = event.clientY;
  galleryMoved = false;
  galleryStartScroll = (event.currentTarget as HTMLElement).scrollLeft;
}
function galleryMove(event: PointerEvent) {
  if (galleryPointer === event.pointerId) {
    if (Math.abs(event.clientX - galleryStartX) > 8 || Math.abs(event.clientY - galleryStartY) > 8) galleryMoved = true;
    (event.currentTarget as HTMLElement).scrollLeft = galleryStartScroll + galleryStartX - event.clientX;
  }
}
function galleryEnd(event: PointerEvent) {
  if (galleryPointer !== event.pointerId) return;
  galleryPointer = null;
  const gallery = event.currentTarget as HTMLElement;
  const dx = event.clientX - galleryStartX;
  const dy = event.clientY - galleryStartY;
  const previous = Math.round(galleryStartScroll / Math.max(gallery.clientWidth, 1));
  const step = Math.abs(dx) >= 50 && Math.abs(dx) > Math.abs(dy) * 1.2 ? (dx < 0 ? 1 : -1) : 0;
  const target = Math.max(0, Math.min(articleImages.value.length - 1, previous + step));
  gallery.scrollTo({ left: target * gallery.clientWidth, behavior: 'smooth' });
  if (gallery.hasPointerCapture(event.pointerId)) gallery.releasePointerCapture(event.pointerId);
  if (event.type !== 'pointercancel' && !galleryMoved && articleImages.value.length) {
    showImagePreview({ images: articleImages.value, startPosition: galleryIndex.value, closeable: true, closeIcon: 'cross' });
  }
}
function updateGalleryIndex(event: Event) {
  const gallery = event.currentTarget as HTMLElement;
  galleryIndex.value = Math.round(gallery.scrollLeft / Math.max(gallery.clientWidth, 1));
}

let playGeneration = 0;
async function play() {
  const video = videoEl.value;
  if (!video || !mediaSrc.value || failed.value || deactivated) return;
  const generation = ++playGeneration;
  if (ended.value || (Number.isFinite(video.duration) && video.duration > 0 && video.currentTime >= video.duration - 0.05)) {
    stopWatchClock(true);
    playSessionId = createUuid();
    video.currentTime = 0;
    progress.value = 0;
    completeReported = false;
  }
  ended.value = false;
  showPausedHint.value = false;
  video.muted = false;
  try {
    await video.play();
    if (generation !== playGeneration) return;
    if (deactivated) { pause(); return; }
    paused.value = false;
    track(EVENT_NAMES.PLAY_START, { playSessionId, videoId: props.item.id, pageSource: 'recommend_feed' });
  } catch {
    if (deactivated || generation !== playGeneration) return;
    // 移动端通常禁止无手势的有声自动播放；静音重试保证上下滑切换后继续播放。
    video.muted = true;
    try {
      await video.play();
      if (generation !== playGeneration) return;
      if (deactivated) { pause(); return; }
      paused.value = false;
      track(EVENT_NAMES.PLAY_START, { playSessionId, videoId: props.item.id, pageSource: 'recommend_feed' });
    } catch {
      if (generation === playGeneration) paused.value = true;
    }
  }
}

function pause() {
  playGeneration++;
  const video = videoEl.value;
  stopWatchClock(true);
  if (video && !video.paused) {
    track(EVENT_NAMES.PLAY_PAUSE, { playSessionId, videoId: props.item.id, properties: { positionMs: Math.floor(video.currentTime * 1000) } });
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
      qualityOpen.value = false;
      cancelSeek();
      pause();
    }
  },
);

watch(
  mediaSrc,
  (source) => {
    if (source && switchingQuality.value) return;
    if (!source) sourceController?.abort();
    stopWatchClock(true);
    playSessionId = createUuid();
    failed.value = false;
    retryCount = 0;
    progress.value = 0;
    actualDuration.value = 0; bufferedProgress.value = 0;
    ended.value = false;
    showPausedHint.value = false;
    effectiveReported = false;
    completeReported = false;
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
  if (seeking.value || switchingQuality.value) return;
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
  if (switchingQuality.value) return;
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
  stopWatchClock(true);
  track(EVENT_NAMES.PLAY_FAILED, { playSessionId, videoId: props.item.id, pageSource: 'recommend_feed' });
}

function retry() {
  failed.value = false;
  retryCount = 0;
  play();
}

function onTimeUpdate() {
  const video = videoEl.value;
  if (video && video.duration > 0 && !seeking.value && !switchingQuality.value) {
    progress.value = video.currentTime / video.duration;
  }
  updateBuffered();
  if (seeking.value || switchingQuality.value) return;
  reportProgress();
}

function reportProgress() {
  const video = videoEl.value;
  if (!video || video.duration <= 0) return;
  const positionMs = Math.floor(video.currentTime * 1000);
  // 有效播放：累计 ≥2 秒（PRD 数据口径）
  if (positionMs >= 2000 && !effectiveReported) {
    effectiveReported = true;
    emit('effective-play', props.item, positionMs);
  }
  if (video.duration - video.currentTime < 0.3 && !completeReported) {
    completeReported = true;
    track(EVENT_NAMES.PLAY_COMPLETE, { playSessionId, videoId: props.item.id, properties: { durationMs: Math.floor(video.duration * 1000) } });
  }
}
let effectiveReported = false;
let completeReported = false;

function onWaiting() {
  stopWatchClock(true);
  buffering.value = true;
}
function onPlaying() {
  if (deactivated) { pause(); return; }
  buffering.value = false;
  paused.value = false;
  ended.value = false;
  if (!seeking.value && !switchingQuality.value) startWatchClock();
}
function onNativePause() {
  stopWatchClock(true);
  paused.value = true;
}
function onEnded() {
  stopWatchClock(true);
  buffering.value = false;
  paused.value = true;
  ended.value = true;
  progress.value = 1;
  showPausedHint.value = true;
}

function startWatchClock() {
  if (watchStartedAt !== null || document.visibilityState === 'hidden' || buffering.value || seeking.value || switchingQuality.value) return;
  watchStartedAt = performance.now();
}

function captureWatchDelta() {
  if (watchStartedAt === null) return;
  const now = performance.now();
  pendingWatchMs += Math.max(0, now - watchStartedAt);
  watchStartedAt = now;
}

function flushWatchProgress() {
  captureWatchDelta();
  const video = videoEl.value;
  const watchedDeltaMs = Math.floor(pendingWatchMs);
  if (!video || watchedDeltaMs <= 0) return;
  pendingWatchMs -= watchedDeltaMs;
  track(EVENT_NAMES.PLAY_PROGRESS, {
    playSessionId,
    videoId: props.item.id,
    pageSource: 'recommend_feed',
    properties: {
      watchedDeltaMs,
      positionMs: Math.max(0, Math.floor(video.currentTime * 1000)),
      durationMs: Number.isFinite(video.duration) && video.duration > 0 ? Math.floor(video.duration * 1000) : props.item.durationMs,
      playbackRate: video.playbackRate,
      visible: document.visibilityState !== 'hidden',
    },
  });
}

function stopWatchClock(flush: boolean) {
  if (watchStartedAt !== null) {
    captureWatchDelta();
    watchStartedAt = null;
  }
  if (flush) flushWatchProgress();
}

// 单击暂停 / 双击点赞
const DOUBLE_TAP_WINDOW_MS = 300;
const SINGLE_TAP_DELAY_MS = 320;
let lastTap = 0;
let tapTimer: ReturnType<typeof setTimeout> | null = null;
function onTap() {
  if (seeking.value || switchingQuality.value) return;
  if (ended.value) {
    if (tapTimer) clearTimeout(tapTimer);
    lastTap = 0;
    toggle();
    return;
  }
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
  heartbeatTimer = setInterval(flushWatchProgress, 5_000);
  document.addEventListener('visibilitychange', onVisibilityChange);
});
onDeactivated(() => {
  deactivated = true;
  cancelSeek(); qualityOpen.value = false;
  onPressEnd();
  if (tapTimer) clearTimeout(tapTimer);
  pause();
});
onActivated(() => {
  const returning = deactivated;
  deactivated = false;
  if (returning && props.active) play();
});
onBeforeUnmount(() => {
  deactivated = true;
  sourceController?.abort(); cancelSeek();
  if (longPressTimer) clearTimeout(longPressTimer);
  if (tapTimer) clearTimeout(tapTimer);
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  document.removeEventListener('visibilitychange', onVisibilityChange);
  pause();
});

// 页面隐藏（切后台/锁屏/切 Tab）自动暂停；返回前台不自动出声，等用户操作（PRD）
function onVisibilityChange() {
  if (document.hidden) { cancelSeek(); pause(); }
}

// Pointer movement updates only the preview; release performs a single seek.
const progressBarEl = ref<HTMLDivElement | null>(null);
const seeking = ref(false);
const bufferedProgress = ref(0);
const seekSeconds = computed(() => progress.value * durationSeconds.value);
const seekTimeLabel = computed(() => formatDuration(Math.round(seekSeconds.value * 1000)));
let seekPointerId: number | null = null;
let seekShouldResume = false;

function seekTo(clientX: number) {
  const bar = progressBarEl.value;
  const video = videoEl.value;
  if (!bar || !video || !Number.isFinite(video.duration) || video.duration <= 0 || failed.value) return;
  const rect = bar.getBoundingClientRect();
  if (rect.width <= 0) return;
  const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  progress.value = ratio;
}
function onSeekStart(event: PointerEvent) {
  const video = videoEl.value;
  if (failed.value || switchingQuality.value || seeking.value || event.isPrimary === false || (event.button != null && event.button !== 0)
      || !video || !Number.isFinite(video.duration) || video.duration <= 0) return;
  onPressEnd();
  if (tapTimer) clearTimeout(tapTimer);
  tapTimer = null; lastTap = 0;
  stopWatchClock(true);
  seekShouldResume = !paused.value && !ended.value;
  video.pause(); paused.value = true;
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
  seekTo(event.clientX);
  seekPointerId = null;
  seeking.value = false;
  progressBarEl.value?.releasePointerCapture?.(event.pointerId);
  commitSeek();
}
function commitSeek() {
  const video = videoEl.value;
  if (!video || !Number.isFinite(video.duration) || video.duration <= 0) { seekShouldResume = false; return; }
  const target = Math.min(progress.value * video.duration, Math.max(0, video.duration - 0.1));
  ended.value = false; completeReported = false;
  const unchanged = Math.abs(video.currentTime - target) < 0.01;
  video.currentTime = target;
  if (unchanged) onSeeked();
}
function onSeeked() {
  updateBuffered();
  if (!seekShouldResume) return;
  seekShouldResume = false;
  if (!props.active || deactivated || document.hidden) return;
  void videoEl.value?.play().then(() => {
    if (!props.active || deactivated || document.hidden) { videoEl.value?.pause(); return; }
    paused.value = false;
  }).catch(() => { paused.value = true; });
}
function cancelSeek() {
  if (seekPointerId !== null) {
    try { progressBarEl.value?.releasePointerCapture?.(seekPointerId); } catch { /* capture already lost */ }
  }
  seekPointerId = null; seeking.value = false;
  const video = videoEl.value;
  if (video && Number.isFinite(video.duration) && video.duration > 0) progress.value = video.currentTime / video.duration;
  onSeeked();
}
function onSeekKey(event: KeyboardEvent) {
  const video = videoEl.value;
  if (!video || switchingQuality.value || failed.value || !Number.isFinite(video.duration) || video.duration <= 0) return;
  const target = ['ArrowRight', 'ArrowUp'].includes(event.key) ? video.currentTime + 5 : ['ArrowLeft', 'ArrowDown'].includes(event.key) ? video.currentTime - 5
    : event.key === 'Home' ? 0 : event.key === 'End' ? video.duration : null;
  if (target === null) return;
  event.preventDefault(); event.stopPropagation();
  seekShouldResume = !paused.value && !ended.value;
  progress.value = Math.max(0, Math.min(1, target / video.duration));
  commitSeek();
}
function updateBuffered() {
  const video = videoEl.value;
  bufferedProgress.value = 0;
  if (!video || !Number.isFinite(video.duration) || video.duration <= 0) return;
  for (let i = 0; i < video.buffered.length; i++) {
    if (video.buffered.start(i) <= video.currentTime + 0.1 && video.buffered.end(i) >= video.currentTime) {
      bufferedProgress.value = Math.min(1, video.buffered.end(i) / video.duration); break;
    }
  }
}
function onLoadedMetadata() {
  const duration = videoEl.value?.duration;
  actualDuration.value = duration && Number.isFinite(duration) && duration > 0 ? duration : 0;
  updateBuffered();
}

// 供父组件（评论面板打开等场景）控制播放
defineExpose({ play, pause, toggle, isPlaying: () => !paused.value && !ended.value });
</script>

<template>
  <div class="feed-item" :data-video-id="item.id">
    <video v-if="item.videoUrl"
      ref="videoEl"
      class="feed-video"
      :src="mediaSrc"
      :preload="preload"
      playsinline
      webkit-playsinline
      x5-playsinline
      @error="onError"
      @timeupdate="onTimeUpdate"
      @progress="updateBuffered"
      @loadedmetadata="onLoadedMetadata"
      @durationchange="onLoadedMetadata"
      @seeked="onSeeked"
      @waiting="onWaiting"
      @playing="onPlaying"
      @pause="onNativePause"
      @ended="onEnded"
    />
    <div v-if="item.videoUrl" class="feed-shade" />
    <div
      v-if="!item.videoUrl"
      class="article-gallery"
      aria-label="图文图片，可左右滑动"
      @pointerdown="galleryDown"
      @pointermove="galleryMove"
      @pointerup="galleryEnd"
      @pointercancel="galleryEnd"
      @scroll.passive="updateGalleryIndex"
    >
      <img v-for="(image, index) in articleImages" :key="`${image}-${index}`" :src="image" :alt="`${item.title} ${index + 1}`" loading="lazy" draggable="false" />
      <div v-if="!articleImages.length" class="article-placeholder"><img class="default-content-cover" :src="defaultContentCover" alt="文字内容默认封面" /><p>{{ descriptionPreview }}</p></div>
    </div>
    <div v-if="!item.videoUrl" class="article-shade" />
    <span v-if="!item.videoUrl && articleImages.length > 1" class="article-pagination">{{ galleryIndex + 1 }} / {{ articleImages.length }}</span>
    <div
      v-if="item.videoUrl"
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
      <button class="feed-title" @click.stop="emit('open-content', item)">{{ item.title }}</button>
      <p v-if="descriptionPreview" @click.stop="emit('open-content', item)">{{ descriptionPreview }}</p>
      <div class="feed-tags" v-if="item.tags.length">
        <span v-for="tag in item.tags" :key="tag.id">#{{ tag.name }}</span>
      </div>
      <div v-if="item.videoUrl" class="music-ticker">
        <van-icon name="music-o" />
        <span>原声 - {{ item.author.nickname }}</span>
      </div>
    </div>

    <aside class="action-bar" @click="onTap">
      <button class="creator-anchor" aria-label="打开作者主页" @click.stop="emit('open-author', item.author.id)">
        <AvatarImage :src="item.author.avatarUrl" alt="作者头像" @click.stop="emit('open-author', item.author.id)" />
        <span v-if="!isOwnAuthor" :class="{ followed: item.author.following }" :aria-busy="followPending" @click.stop="!followPending && emit('follow-author', item.author.id, !item.author.following)">{{ followPending ? '…' : item.author.following ? '✓' : '+' }}</span>
      </button>
      <PulseHeart class="action-item" label="点赞" icon="like" :disabled="likePending" :active="item.viewerState.liked" :count="item.stats.likeCount" @click="emit('like', item)" />
      <button class="action-item" aria-label="评论" @click.stop="emit('open-comments', item)">
        <van-icon name="chat-o" />
        <small>{{ item.stats.commentCount }}</small>
      </button>
      <PulseHeart class="action-item" label="收藏" icon="star" :disabled="favoritePending" :active="item.viewerState.favorited" :count="item.stats.favoriteCount" @click="emit('favorite', item)" />
      <button class="action-item" aria-label="分享" @click.stop="emit('open-share', item)">
        <van-icon name="share-o" />
        <small>分享</small>
      </button>
      <div class="vinyl">
        <VideoThumbnail :cover-url="item.cover?.coverUrl" :video-url="item.videoUrl" alt="视频预览图" />
      </div>
    </aside>

    <div
      v-if="item.videoUrl"
      ref="progressBarEl"
      class="flow-progress"
      :class="{ seeking }"
      role="slider" tabindex="0" aria-label="视频播放进度" aria-valuemin="0"
      :aria-valuemax="Math.round(durationSeconds)"
      :aria-valuenow="Math.round(seekSeconds)" :aria-valuetext="`${seekTimeLabel} / ${durationLabel}`"
      @keydown.stop="onSeekKey"
      @click.stop.prevent
      @pointerdown.stop.prevent="onSeekStart"
      @pointermove.stop.prevent="onSeekMove"
      @pointerup.stop.prevent="onSeekEnd"
      @pointercancel.stop.prevent="cancelSeek"
      @lostpointercapture="seeking && cancelSeek()"
    ><span class="buffered-progress" :style="{ transform: `scaleX(${bufferedProgress})` }" /><i :style="{ transform: `scaleX(${progress})` }" />
      <span class="seek-thumb" :style="{ left: `${progress * 100}%` }" />
      <output v-if="seeking" class="seek-preview">{{ seekTimeLabel }} / {{ durationLabel }}</output>
    </div>
    <div v-if="item.videoUrl" class="quality-control" @click.stop @pointerdown.stop @pointerup.stop @keydown.stop>
      <button type="button" class="quality-trigger" aria-label="选择视频清晰度" :aria-expanded="qualityOpen" :disabled="switchingQuality || qualityLoading" @click="openQuality">{{ switchingQuality ? '切换中…' : qualityLoading ? '加载中…' : qualityLabel }}</button>
      <div v-if="qualityOpen" class="quality-options" role="group" aria-label="视频清晰度" @keydown.esc.stop="qualityOpen = false">
        <button v-for="source in sources" :key="source.id" type="button" :aria-pressed="source.url === mediaSrc" @click="selectQuality(source)">{{ source.label }}<small v-if="source.width && source.height">{{ source.width }} × {{ source.height }}</small></button>
        <p v-if="!sources.length">暂无其他清晰度</p>
        <button type="button" @click="qualityOpen = false">关闭</button>
      </div>
    </div>
    <span v-if="item.videoUrl" class="feed-duration">{{ durationLabel }}</span>
    <span class="feed-rate" v-if="rate === 2">2x 倍速</span>
  </div>
</template>

<style scoped>
.feed-item { position: relative; flex: 0 0 100%; width: 100%; height: 100%; }
.article-gallery { position:absolute; inset:0; z-index:1; display:flex; overflow-x:auto; overflow-y:hidden; scrollbar-width:none; background:#111; touch-action:none; }
.article-gallery::-webkit-scrollbar { display:none; }
.article-gallery img { flex:0 0 100%; width:100%; height:100%; object-fit:contain; scroll-snap-align:center; user-select:none; }
.article-placeholder { position:relative; flex:0 0 100%; display:grid; place-items:center; padding:56px 26px; color:#fff; text-align:center; }
.article-placeholder .default-content-cover { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }
.article-placeholder span { position:relative; padding:8px 14px; border:1px solid #ffffff88; border-radius:20px; background:#10182788; font-size:13px; letter-spacing:.08em; }
.article-shade { position:absolute; z-index:2; inset:0; background:linear-gradient(180deg,#0005 0%,transparent 35%,transparent 56%,#0009 83%,#050505 100%); pointer-events:none; }
.article-pagination { position:absolute; z-index:9; top:18px; right:18px; padding:4px 8px; border-radius:12px; color:#fff; background:#0008; font-size:11px; }
.feed-title { display:-webkit-box; max-width:100%; margin:8px 0 4px; padding:0; overflow:hidden; color:#fff; background:transparent; border:0; font-size:16px; font-weight:750; line-height:1.35; text-align:left; -webkit-line-clamp:2; -webkit-box-orient:vertical; pointer-events:auto; }
.feed-meta p { pointer-events:auto; cursor:pointer; }
.player-hit-area { position: absolute; z-index: 2; inset: 0; touch-action: none; cursor: pointer; }
.player-hit-area:focus-visible { outline: 2px solid var(--cyan); outline-offset: -4px; }
.player-hint { z-index: 4; }
  .feed-duration { position: absolute; z-index: 9; left: 14px; right:auto; bottom: 28px; padding: 2px 8px; border-radius: 10px; color: #fff; background: #0006; font-size: 11px; pointer-events: none; }
.feed-rate { position: absolute; z-index: 9; left: 50%; top: 120px; transform: translateX(-50%); padding: 4px 12px; border-radius: 14px; color: var(--cyan); background: #0009; font-size: 12px; pointer-events: none; }
.feed-buffering { position: absolute; z-index: 9; top: 50%; left: 50%; transform: translate(-50%, -50%); }
.flow-progress { position: absolute; z-index: 9; left: 0; right: 0; bottom: 0; height: 44px; background: transparent; pointer-events: auto; display: flex; align-items: center; cursor: pointer; touch-action: none; }
.flow-progress::before { content: ""; position: absolute; left: 0; right: 0; top:28px; height: 2px; border-radius: 2px; background: #ffffff33; }
.flow-progress i { position: absolute; left: 0; top:28px; bottom:auto; width:100%; height: 2px; border-radius: 2px; background: linear-gradient(90deg, var(--cyan), var(--coral)); transform-origin: left; }
.flow-progress.seeking::before { top:27px; height: 4px; }
.flow-progress.seeking i { top:27px; height: 4px; }
.buffered-progress { position:absolute; left:0; top:28px; width:100%; height:2px; background:#ffffff66; transform-origin:left; }
.seek-thumb { position:absolute; top:23px; width:12px; height:12px; border-radius:50%; background:white; transform:translateX(-50%); opacity:0; pointer-events:none; }
.seeking .seek-thumb,.flow-progress:focus-visible .seek-thumb { opacity:1; }
.seek-preview { position:absolute; left:50%; bottom:40px; transform:translateX(-50%); padding:8px 14px; border-radius:8px; background:#111c; color:white; font-size:18px; font-variant-numeric:tabular-nums; white-space:nowrap; pointer-events:none; }
.flow-progress:focus-visible { outline:2px solid white; outline-offset:-2px; }
.quality-control { position:absolute; z-index:12; right:14px; top:16px; color:white; }
.quality-trigger { min-height:44px; padding:4px 10px; border-radius:8px; background:#1118; font-size:12px; }
.quality-options { position:absolute; top:48px; right:0; min-width:160px; padding:6px; border-radius:12px; background:#151922f5; box-shadow:0 4px 24px #0004; }
.quality-options button { display:flex; flex-direction:column; align-items:flex-start; justify-content:center; width:100%; min-height:44px; padding:8px 12px; border-radius:8px; font-size:14px; }
.quality-options button[aria-pressed=true] { color:#8dbaff; background:#ffffff14; }
.quality-options small { font-size:11px; opacity:.7; }.quality-options p { padding:8px; font-size:13px; }
.quality-control button:focus-visible { outline:2px solid white; outline-offset:-2px; }
</style>
