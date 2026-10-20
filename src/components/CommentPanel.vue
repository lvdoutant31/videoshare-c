<script setup lang="ts">
import AnimatedList from './AnimatedList.vue';
/**
 * 评论面板（底部抽屉）：热度/最新排序、两级评论、发表/回复、点赞/删除/举报评论。
 * 打开时由父组件暂停视频，关闭后恢复。
 */
import { computed, nextTick, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { isAuthenticated } from '../api/http';
import { showConfirmDialog, showToast } from 'vant';
import { deleteComment, getComments, getReplies, publishComment, setCommentLike } from '../api';
import type { CommentItem, CommentSort, FeedItem } from '../api/types';
import { timeAgo } from '../utils/format';
import AvatarImage from './AvatarImage.vue';
import ReportSheet from './ReportSheet.vue';

const props = defineProps<{ open: boolean; video: FeedItem | null }>();
const emit = defineEmits<{ (e: 'update:open', value: boolean): void; (e: 'changed', delta: number): void }>();
const router = useRouter();
const route = useRoute();

const comments = ref<CommentItem[]>([]);
const sort = ref<CommentSort>('HOT');
const loading = ref(false);
const failed = ref(false);
const sending = ref(false);
const sheet = ref<HTMLElement>();
const input = ref<HTMLInputElement>();
const cursor = ref<string | null>(null);
let loadGeneration = 0;
let returnFocus: HTMLElement | null = null;
const draft = ref('');
const replyingTo = ref<CommentItem | null>(null);
const reportOpen = ref(false);
const reportCommentId = ref('');

const videoId = computed(() => props.video?.id ?? '');

async function load(sortValue: CommentSort = sort.value, more = false) {
  if (!videoId.value) return;
  const version = ++loadGeneration;
  loading.value = true;
  failed.value = false;
  try {
    const page = await getComments(videoId.value, sortValue, more ? cursor.value : null, 50);
    if (version !== loadGeneration) return;
    comments.value = more ? [...comments.value, ...page.items] : page.items;
    cursor.value = page.nextCursor;
  } catch {
    if (version === loadGeneration) failed.value = true;
  } finally {
    if (version === loadGeneration) loading.value = false;
  }
}

async function loadReplies(comment: CommentItem) {
    if (comment.replyCount === 0) return;
  try {
    comment.replies = await getReplies(comment.id);
  } catch {
    /* 忽略 */
  }
}

watch(
  () => props.open,
  async (open) => {
    if (open) {
      returnFocus = document.activeElement as HTMLElement | null;
      sort.value = 'HOT';
      replyingTo.value = null;
      draft.value = sessionStorage.getItem(`comment-draft:${videoId.value}`) ?? '';
      comments.value = []; cursor.value = null;
      load('HOT');
      await nextTick(); sheet.value?.focus();
    } else { loadGeneration++; loading.value = false; returnFocus?.focus(); }
  },
);

function switchSort(value: CommentSort) {
  if (sort.value === value) return;
  sort.value = value;
  void load(value);
}

function requireLogin() {
  if (isAuthenticated()) return true;
  sessionStorage.setItem(`comment-draft:${videoId.value}`, draft.value);
  const redirect = router.resolve({ path: route.path, query: { ...route.query, comments: '1' } }).fullPath;
  router.push({ name: 'login', query: { redirect } });
  return false;
}
function trapFocus(event: KeyboardEvent) {
  if (event.key === 'Escape') { event.preventDefault(); close(); return; }
  if (event.key !== 'Tab') return;
  const controls = sheet.value?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)');
  if (!controls?.length) return;
  const first = controls[0]; const last = controls[controls.length - 1];
  if (event.shiftKey && (document.activeElement === first || document.activeElement === sheet.value)) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && (document.activeElement === last || document.activeElement === sheet.value)) { event.preventDefault(); first?.focus(); }
}

function close() {
  emit('update:open', false);
}

async function send() {
  const content = draft.value.trim();
  if (!content || !videoId.value || sending.value || !requireLogin()) return;
  sending.value = true;
  const id = videoId.value;
  try {
    const result = await publishComment(id, content, replyingTo.value?.id ?? null);
    sessionStorage.removeItem(`comment-draft:${id}`);
    if (id !== videoId.value) return;
    draft.value = '';
    replyingTo.value = null;
    if (result.status === 'PENDING') {
      showToast('评论正在审核');
    } else {
      showToast('评论成功');
    }
    emit('changed', result.status === 'PENDING' ? 0 : 1);
    if (props.open) void load();
  } catch (error) {
    const message = error instanceof Error ? error.message : '发布失败';
    showToast(message);
  } finally {
    sending.value = false;
    await nextTick();
    if (props.open) input.value?.focus();
  }
}

async function like(comment: CommentItem) {
  if (!requireLogin()) return;
  const target = !comment.liked;
  const before = comment.likeCount;
  comment.liked = target;
  comment.likeCount += target ? 1 : -1;
  try {
    const result = await setCommentLike(comment.id, target);
    comment.likeCount = result.count;
  } catch {
    comment.liked = !target;
    comment.likeCount = before;
  }
}

async function remove(comment: CommentItem) {
  try {
    await showConfirmDialog({ title: '删除评论', message: '确定删除这条评论吗？' });
  } catch {
    return;
  }
  try {
    await deleteComment(comment.id);
    comments.value = comments.value.filter((c) => c.id !== comment.id);
    emit('changed', -1);
    showToast('已删除');
  } catch {
    showToast('删除失败');
  }
}

function report(comment: CommentItem) {
  reportCommentId.value = comment.id;
  reportOpen.value = true;
}

function replyTo(comment: CommentItem) {
  if (!requireLogin()) return;
  replyingTo.value = comment;
  nextTick(() => input.value?.focus());
}
</script>

<template>
  <Transition name="sheet">
    <div v-if="open" class="comments-layer">
      <button class="comments-scrim" aria-label="关闭评论" @click="close" />
      <section ref="sheet" class="comments-sheet" role="dialog" aria-modal="true" aria-label="内容评论" tabindex="-1" @keydown="trapFocus">
        <header class="comments-header">
          <strong>评论 {{ video?.stats?.commentCount ?? 0 }}</strong>
          <div class="comment-sort-tabs">
            <button :class="{ active: sort === 'HOT' }" :aria-pressed="sort === 'HOT'" @click="switchSort('HOT')">最热</button>
            <button :class="{ active: sort === 'LATEST' }" :aria-pressed="sort === 'LATEST'" @click="switchSort('LATEST')">最新</button>
          </div>
          <button aria-label="关闭评论" @click="close"><van-icon name="cross" /></button>
        </header>

        <div class="comment-list">
          <van-loading v-if="loading && !comments.length" class="comments-loading" size="24">加载评论中…</van-loading>
          <AnimatedList v-if="comments.length">
            <article v-for="comment in comments" :key="comment.id" class="comment-row">
              <AvatarImage :src="comment.user.avatarUrl" :alt="`${comment.user.nickname}头像`" />
              <div class="comment-copy">
                <div class="comment-name">
                  {{ comment.user.nickname }}
                  <em v-if="comment.mine">我</em>
                  <em v-if="comment.user.id === video?.author.id">作者</em>
                </div>
                <p>{{ comment.content }}</p>
                <time>{{ timeAgo(comment.createdAt) }}</time>
                <div class="comment-actions">
                  <button v-if="!comment.mine" @click="replyTo(comment)">回复</button>
                  <button v-if="comment.mine" @click="remove(comment)">删除</button>
                  <button v-if="!comment.mine" @click="report(comment)">举报</button>
                </div>
                <div v-if="comment.replies?.length" class="comment-replies">
                  <div v-for="reply in comment.replies" :key="reply.id" class="comment-reply">
                    <AvatarImage :src="reply.user.avatarUrl" alt="头像" />
                    <div class="comment-copy">
                      <div class="comment-name">{{ reply.user.nickname }} <em v-if="reply.mine">我</em></div>
                      <p>{{ reply.content }}</p>
                      <time>{{ timeAgo(reply.createdAt) }}</time>
                      <div v-if="!reply.mine" class="comment-actions">
                        <button @click="replyTo(reply)">回复</button>
                        <button @click="report(reply)">举报</button>
                      </div>
                    </div>
                    <button class="comment-like" :class="{ active: reply.liked }" aria-label="点赞回复" @click="like(reply)">
                      <van-icon :name="reply.liked ? 'like' : 'like-o'" />
                    </button>
                  </div>
                </div>
                <button v-if="comment.replyCount > (comment.replies?.length ?? 0)" class="load-replies" @click="loadReplies(comment)">查看 {{ comment.replyCount }} 条回复</button>
              </div>
              <button class="comment-like" :class="{ active: comment.liked }" aria-label="点赞评论" @click="like(comment)">
                <van-icon :name="comment.liked ? 'like' : 'like-o'" />
                <small>{{ comment.likeCount }}</small>
              </button>
            </article>
          </AnimatedList>
          <div v-else-if="!loading && !failed" class="empty-state">
            <van-icon name="chat-o" />
            <p>还没有评论，来分享你的想法吧</p>
          </div>
          <button v-if="failed" class="comments-retry" @click="load(sort)">评论加载失败，点击重试</button>
          <button v-else-if="cursor" class="comments-retry" :disabled="loading" @click="load(sort, true)">{{ loading ? '加载中…' : '加载更多评论' }}</button>
        </div>

        <footer class="comment-composer">
          <div class="composer-field">
            <input
              ref="input"
              v-model="draft"
              aria-label="评论内容"
              maxlength="1000"
              :disabled="sending"
              :placeholder="replyingTo ? `回复 @${replyingTo.user.nickname}...` : '留下你的精彩评论...'"
              @keydown.enter="!$event.isComposing && send()"
            />
            <button v-if="replyingTo" aria-label="取消回复" @click="replyingTo = null"><van-icon name="close" /></button>
          </div>
          <button class="send-button" aria-label="发送评论" :disabled="!draft.trim() || sending" @click="send">{{ sending ? '发送中' : '发送' }}</button>
        </footer>
        <div class="comment-safe-area" />
      </section>
    </div>
  </Transition>
  <ReportSheet v-model:open="reportOpen" target-type="COMMENT" :target-id="reportCommentId" />
</template>

<style scoped>
.comment-actions { display: flex; gap: 12px; margin-top: 6px; }
.comment-actions button { min-height:44px; color: var(--accent); font-size: 12px; }
.comment-replies { margin-top: 8px; border-radius: 8px; background: #f6f6f8; }
.load-replies { margin: 6px 0 0 48px; color: var(--indigo); font-size: 12px; }
.comments-layer { position:fixed; z-index:60; }
.comments-sheet { left:50%; transform:translateX(-50%); width:min(100%,760px); height:min(720px,85dvh); grid-template-rows:64px minmax(0,1fr) auto max(12px,env(safe-area-inset-bottom)); background:var(--paper); }
.comments-header { grid-template-columns:auto 1fr 44px; gap:12px; padding:0 16px; border-bottom:1px solid var(--line); }
.comments-header strong { font-size:18px; justify-self:start; }
.comments-header button { min-width:44px; min-height:44px; font-size:16px; }
.comment-sort-tabs { gap:12px; justify-self:end; }.comment-sort-tabs button.active { color:var(--accent); }
.comment-row { grid-template-columns:40px minmax(0,1fr) 44px; gap:12px; padding:16px; }
.comment-row > img { width:40px; height:40px; }.comment-name { height:auto; font-size:14px; font-weight:600; color:var(--text-strong); }
.comment-copy p { font-size:15px; line-height:1.6; overflow-wrap:anywhere; }.comment-copy time { font-size:12px; color:var(--text-muted); }
.comment-like { min-height:44px; }.comment-like small { font-size:12px; }.comment-like.active { color:var(--accent); }
.comment-replies { background:var(--soft); }.comment-reply { grid-template-columns:24px minmax(0,1fr) 44px; margin:0; padding:12px 8px; gap:8px; }
.load-replies { margin:0; min-height:44px; }
.comment-composer { display:flex; gap:10px; padding:12px 16px; border-top:1px solid var(--line); background:var(--paper); }
.composer-field { flex:1; min-width:0; min-height:44px; grid-template-columns:minmax(0,1fr) auto; border-radius:22px; background:var(--soft); }.composer-field input { min-width:0; width:100%; font-size:16px; }
.sheet-enter-from .comments-sheet, .sheet-leave-to .comments-sheet { transform:translate(-50%,100%); }
.send-button { flex-shrink:0; width:auto; min-width:64px; min-height:44px; border-radius:8px; color:white; background:var(--accent); font-size:14px; }
.comments-loading, .comments-retry { display:flex; justify-content:center; margin:24px auto; padding:12px; min-height:44px; color:var(--text-muted); }
</style>
