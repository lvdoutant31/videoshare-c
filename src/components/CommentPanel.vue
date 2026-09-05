<script setup lang="ts">
/**
 * 评论面板（底部抽屉）：热度/最新排序、两级评论、发表/回复、点赞/删除/举报评论。
 * 打开时由父组件暂停视频，关闭后恢复。
 */
import { computed, ref, watch } from 'vue';
import { showConfirmDialog, showToast } from 'vant';
import { deleteComment, getComments, getReplies, publishComment, reportComment, setCommentLike } from '../api';
import type { CommentItem, CommentSort, FeedItem } from '../api/types';
import { timeAgo } from '../utils/format';

const props = defineProps<{ open: boolean; video: FeedItem | null }>();
const emit = defineEmits<{ (e: 'update:open', value: boolean): void }>();

const comments = ref<CommentItem[]>([]);
const sort = ref<CommentSort>('HOT');
const loading = ref(false);
const draft = ref('');
const replyingTo = ref<CommentItem | null>(null);

const videoId = computed(() => props.video?.id ?? '');

async function load(sortValue: CommentSort = sort.value) {
  if (!videoId.value) return;
  loading.value = true;
  try {
    const page = await getComments(videoId.value, sortValue, null, 50);
    comments.value = page.items;
  } catch {
    showToast('评论加载失败');
  } finally {
    loading.value = false;
  }
}

async function loadReplies(comment: CommentItem) {
  if (comment.replies || comment.replyCount === 0) return;
  try {
    comment.replies = await getReplies(comment.id);
  } catch {
    /* 忽略 */
  }
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      sort.value = 'HOT';
      replyingTo.value = null;
      draft.value = '';
      load('HOT');
    }
  },
);

watch(sort, (value) => load(value));

function switchSort(value: CommentSort) {
  sort.value = value;
}

function close() {
  emit('update:open', false);
}

async function send() {
  const content = draft.value.trim();
  if (!content || !videoId.value) return;
  try {
    const result = await publishComment(videoId.value, content, replyingTo.value?.id ?? null);
    draft.value = '';
    replyingTo.value = null;
    if (result.status === 'PENDING') {
      showToast('评论正在审核');
    } else {
      showToast('评论成功');
    }
    load();
  } catch (error) {
    const message = error instanceof Error ? error.message : '发布失败';
    showToast(message);
  }
}

async function like(comment: CommentItem) {
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
    showToast('已删除');
  } catch {
    showToast('删除失败');
  }
}

async function report(comment: CommentItem) {
  try {
    await showConfirmDialog({ title: '举报评论', message: '确定举报这条评论吗？' });
  } catch {
    return;
  }
  try {
    await reportComment(comment.id, 'SPAM');
    showToast('已提交举报');
  } catch {
    showToast('举报失败');
  }
}

function replyTo(comment: CommentItem) {
  replyingTo.value = comment;
}
</script>

<template>
  <Transition name="sheet">
    <div v-if="open" class="comments-layer" role="dialog" aria-modal="true" aria-label="视频评论">
      <button class="comments-scrim" aria-label="关闭评论" @click="close" />
      <section class="comments-sheet">
        <header class="comments-header">
          <span />
          <div class="comment-sort-tabs">
            <button :class="{ active: sort === 'HOT' }" @click="switchSort('HOT')">热度</button>
            <button :class="{ active: sort === 'LATEST' }" @click="switchSort('LATEST')">最新</button>
          </div>
          <button aria-label="关闭评论" @click="close"><van-icon name="cross" /></button>
        </header>

        <div class="comment-list">
          <van-loading v-if="loading" class="spinner-wrap" size="24" />
          <template v-else-if="comments.length">
            <article v-for="comment in comments" :key="comment.id" class="comment-row">
              <img :src="comment.user.avatarUrl ?? ''" :alt="`${comment.user.nickname}头像`" />
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
                    <img :src="reply.user.avatarUrl ?? ''" alt="头像" />
                    <div class="comment-copy">
                      <div class="comment-name">{{ reply.user.nickname }} <em v-if="reply.mine">我</em></div>
                      <p>{{ reply.content }}</p>
                      <time>{{ timeAgo(reply.createdAt) }}</time>
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
          </template>
          <div v-else class="empty-state">
            <van-icon name="chat-o" />
            <p>暂无评论，快来抢沙发</p>
          </div>
        </div>

        <footer class="comment-composer">
          <div class="composer-field">
            <input
              v-model="draft"
              :placeholder="replyingTo ? `回复 @${replyingTo.user.nickname}...` : '留下你的精彩评论...'"
              @keyup.enter="send"
            />
            <button v-if="replyingTo" aria-label="取消回复" @click="replyingTo = null"><van-icon name="close" /></button>
          </div>
          <button class="send-button" aria-label="发送评论" :disabled="!draft.trim()" @click="send"><van-icon name="play-circle-o" /></button>
        </footer>
        <div class="home-indicator light"><span /></div>
      </section>
    </div>
  </Transition>
</template>

<style scoped>
.comment-actions { display: flex; gap: 12px; margin-top: 6px; }
.comment-actions button { color: #9a9ba0; font-size: 11px; }
.comment-replies { margin-top: 8px; border-radius: 8px; background: #f6f6f8; }
.load-replies { margin: 6px 0 0 48px; color: var(--indigo); font-size: 12px; }
</style>
