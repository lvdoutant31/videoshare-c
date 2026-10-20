<script setup lang="ts">
import { computed, nextTick, onActivated, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { getAuthorVideos, getAuthorLikedVideos, getFavoriteVideos, getLikedVideos, getHistory, clearHistory } from '../api';
import { getMyContentPage, type ContentStatus, type MyContentItem } from '../api/content';
import type { FeedItem, HistoryItem } from '../api/types';
import { showConfirmDialog, showToast } from 'vant';
import { formatCount, formatDateTime } from '../utils/format';
import { richTextImages } from '../utils/richText';
import SwipeRow from './vue-bits/SwipeRow.vue';
import VideoThumbnail from './VideoThumbnail.vue';

const props = withDefaults(defineProps<{
  kind: 'works' | 'favorites' | 'likes' | 'history' | 'author-works' | 'author-likes';
  userId?: string; active?: boolean; status?: ContentStatus;
}>(), { active: true, status: 'PUBLISHED' });
const emit = defineEmits<{ total: [number] }>();
const router = useRouter();
interface Entry { id: string; title: string; coverUrl: string | null; videoUrl: string | null; isVideo: boolean; playCount: number | null; likeCount?: number | null; viewedAt?: string; status?: string }
const items = ref<Entry[]>([]);
const loading = ref(false);
const error = ref(false);
const finished = ref(false);
const cursor = ref<string | null>(null);
let started = false;
let busy = false;
let generation = 0;
const emptyLabel = computed(() => ({ works: '当前状态下还没有作品', favorites: '还没有收藏内容', likes: '还没有点赞内容', history: '暂无观看历史', 'author-works': '暂无公开作品', 'author-likes': '暂无公开的点赞内容' })[props.kind]);

function ownStatus(item: MyContentItem) {
  if (item.publishStatus === 'OFF_SHELF') return '已下架';
  if (item.publishStatus === 'PUBLISHED') return '已发布';
  if (['PENDING_REVIEW', 'CLAIMED'].includes(item.auditStatus)) return '审核中';
  if (['REJECTED', 'REVISION_REQUIRED'].includes(item.auditStatus)) return '需修改';
  return '未发布';
}
function entry(item: FeedItem | HistoryItem | MyContentItem): Entry {
  if ('auditStatus' in item) return { id: item.id, title: item.title, coverUrl: item.coverMedia?.url ?? richTextImages(item.description)[0] ?? null,
    videoUrl: item.videoUrl, isVideo: Boolean(item.originalMedia || item.videoUrl),
    playCount: item.playCount ?? null, likeCount: item.likeCount ?? null, status: ownStatus(item) };
  const video = 'video' in item ? item.video : item;
  return { id: video.id, title: video.title, coverUrl: video.cover?.coverUrl ?? richTextImages(video.description)[0] ?? null,
    videoUrl: video.videoUrl, isVideo: Boolean(video.videoUrl), playCount: video.stats.playCount,
    viewedAt: 'video' in item ? item.lastViewedAt : undefined };
}
function fetchPage(nextCursor: string | null) {
  return props.kind === 'works' ? getMyContentPage(props.status, nextCursor)
    : props.kind === 'author-works' ? getAuthorVideos(props.userId!, nextCursor, 18)
    : props.kind === 'author-likes' ? getAuthorLikedVideos(props.userId!, nextCursor)
    : props.kind === 'favorites' ? getFavoriteVideos(nextCursor)
    : props.kind === 'likes' ? getLikedVideos(nextCursor) : getHistory(nextCursor);
}
async function loadMore() {
  if (busy || finished.value || !props.active) return;
  const version = generation;
  busy = true; started = true; loading.value = true; error.value = false;
  try {
    const page = await fetchPage(cursor.value);
    if (version !== generation) return;
    const seen = new Set(items.value.map(item => item.id));
    items.value.push(...page.items.map(entry).filter(item => !seen.has(item.id)));
    cursor.value = page.nextCursor;
    finished.value = page.nextCursor == null;
    if ('total' in page) emit('total', page.total);
  } catch { if (version === generation) error.value = true; }
  finally { if (version === generation) { busy = false; loading.value = false; } }
}
async function refresh() {
  if (busy || !started || !props.active) return;
  const version = generation;
  const previousCount = items.value.length;
  busy = true;
  try {
    const refreshed: Entry[] = [];
    let nextCursor: string | null = null;
    let total: number | undefined;
    do {
      const page = await fetchPage(nextCursor);
      if (version !== generation) return;
      refreshed.push(...page.items.map(entry));
      nextCursor = page.nextCursor;
      if ('total' in page) total = page.total;
    } while (nextCursor && refreshed.length < previousCount);
    items.value = refreshed; cursor.value = nextCursor; finished.value = nextCursor == null; error.value = false;
    if (total !== undefined) emit('total', total);
  } catch { if (version === generation) showToast('列表刷新失败，稍后再试'); }
  finally { if (version === generation) { busy = false; loading.value = false; } }
}
function reset() {
  generation++; busy = false; started = false; loading.value = false; error.value = false;
  items.value = []; cursor.value = null; finished.value = false;
  if (props.active) void loadMore();
}
watch(() => [props.kind, props.userId, props.status], reset);
watch(() => props.active, active => { if (active) void (started ? refresh() : loadMore()); }, { immediate: true });
function open(item: Entry) {
  router.push(props.kind === 'works' ? { name: 'my-content-detail', params: { contentId: item.id } }
    : item.isVideo ? { name: 'feed', query: { video: item.id } } : { name: 'content-detail', params: { contentId: item.id } });
}
onActivated(async () => { await nextTick(); void refresh(); });
async function removeHistory() {
  try { await showConfirmDialog({ title: '清空观看历史', message: '清空后不可恢复，确定继续吗？' }); } catch { return; }
  try { await clearHistory(); reset(); showToast('已清空'); } catch { showToast('清空失败'); }
}
defineExpose({ reset });
</script>

<template>
  <section class="content-collection" :aria-label="{ works: '作品', favorites: '收藏', likes: '喜欢', history: '历史', 'author-works': '作者作品', 'author-likes': '作者喜欢' }[kind]">
    <div v-if="kind === 'history' && items.length" class="collection-tools"><button @click="removeHistory">清空历史</button></div>
    <van-list v-model:loading="loading" v-model:error="error" :finished="finished || !active" :immediate-check="false"
      :offset="240" error-text="加载失败，点击重试" :finished-text="items.length ? '没有更多了' : ''" @load="loadMore">
      <div class="collection-grid">
        <component :is="kind === 'works' ? SwipeRow : 'div'" v-for="item in items" :key="item.id" class="collection-cell" height="auto" :full-swipe="false" :haptic="false" row-color="var(--paper)" text-color="var(--text-strong)" :label="item.title" :actions="[{ id:'open', label:'查看', color:'#2563eb', onSelect: () => open(item) }]">
        <button class="collection-item" :aria-label="item.title" @click="open(item)">
          <div class="collection-cover">
            <VideoThumbnail :cover-url="item.coverUrl" :video-url="item.videoUrl" :alt="item.title" />
            <template v-if="kind === 'works'">
              <span class="collection-type" :class="{ 'collection-type--with-status': item.status && item.status !== '已发布' }" :aria-label="item.isVideo ? '视频' : '图文'"><van-icon :name="item.isVideo ? 'play' : 'photo-o'" aria-hidden="true" /><span class="collection-type-label">{{ item.isVideo ? '视频' : '图文' }}</span></span>
              <span class="collection-stats">
                <span class="collection-likes" :aria-label="item.likeCount == null ? '点赞数暂不可用' : `点赞 ${item.likeCount} 次`"><van-icon name="like-o" aria-hidden="true" />{{ item.likeCount == null ? '—' : formatCount(item.likeCount) }}</span>
                <span class="collection-plays" :aria-label="item.playCount == null ? '播放量暂不可用' : `播放 ${item.playCount} 次`"><van-icon name="play-circle-o" aria-hidden="true" />{{ item.playCount == null ? '—' : formatCount(item.playCount) }}</span>
              </span>
            </template>
            <span v-else class="collection-meta"><van-icon :name="item.isVideo ? 'play' : 'photo-o'" /> {{ item.isVideo ? formatCount(item.playCount ?? 0) : '图文' }}</span>
            <span v-if="item.status && item.status !== '已发布'" class="collection-status">{{ item.status }}</span>
          </div>
          <strong>{{ item.title }}</strong>
          <small v-if="item.viewedAt">{{ formatDateTime(item.viewedAt) }}</small>
        </button>
        </component>
      </div>
      <p v-if="finished && !items.length" class="collection-empty">{{ emptyLabel }}</p>
    </van-list>
    <button v-if="!finished && !loading && !error" class="collection-more" @click="loadMore">加载更多</button>
  </section>
</template>

<style scoped>
.content-collection { padding: 4px 12px 24px; }
.collection-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px 8px; }
.collection-cell { min-width:0; }
.collection-cell :deep(.swipe-row-toggle) { clip-path:none; width:44px; height:44px; top:auto; bottom:0; right:0; transform:none; background:var(--paper); border-radius:50%; font-size:20px; overflow:visible; }
.collection-cell :deep([data-phase]) { min-width:0; }
.collection-item { width:100%; min-width: 0; padding: 0; text-align: left; color: #20242e; }
.collection-cover { position: relative; aspect-ratio: 118 / 150; overflow: hidden; border-radius: 8px; background: #f1f3f6; }
.collection-cover :deep(img), .collection-cover :deep(video) { width: 100%; height: 100%; object-fit: cover; }
.collection-meta { position: absolute; inset: auto 0 0; padding: 5px 6px; color: #fff; background: #0005; font-size: 11px; }
.collection-type { position: absolute; top: 7px; left: 7px; display: flex; align-items: center; gap: 3px; padding: 3px 5px; color: #fff; background: #17203599; border-radius: 4px; font-size: 10px; }
.collection-stats { position: absolute; inset: auto 0 0; display: flex; justify-content: space-between; align-items: center; gap: 4px; padding: 18px 7px 8px; color: #fff; background: linear-gradient(transparent, #101827c9); font-size: 11px; font-weight: 600; font-variant-numeric: tabular-nums; text-shadow: 0 1px 2px #0008; }
.collection-stats > span { display: inline-flex; align-items: center; gap: 3px; white-space: nowrap; }
.collection-stats .van-icon { font-size: 13px; }
.collection-status { position: absolute; top: 7px; right: 7px; padding: 3px 5px; font-size: 10px; background: #ffffffed; border-radius: 4px; }
.collection-cell:has(.swipe-row-toggle) .collection-item strong { padding-right:44px; }
.collection-item strong { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; min-height: 34px; margin-top: 7px; overflow: hidden; font-size: 12px; line-height: 17px; font-weight: 500; }
.collection-item:focus-visible { outline: 2px solid #4268f6; outline-offset: 3px; border-radius: 8px; }
.collection-item small { display: block; color: #858a94; font-size: 10px; line-height: 16px; }
.collection-empty { padding: 64px 12px; text-align: center; color: #858a94; font-size: 13px; }
.collection-more { display: block; margin: 18px auto 0; padding: 8px 20px; border: 1px solid #e5e8ef; border-radius: 5px; color: #4268f6; font-size: 13px; }
.collection-tools { display: flex; justify-content: flex-end; padding: 10px 0; color: #858a94; font-size: 12px; }
@media (max-width: 360px) { .collection-type--with-status .collection-type-label { display: none; } }
@media (min-width: 768px) { .collection-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 18px 12px; } .collection-cell:has(.swipe-row-toggle) .collection-item strong { padding-right:44px; }
.collection-item strong { font-size: 13px; } }
</style>
