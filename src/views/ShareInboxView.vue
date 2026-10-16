<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { showToast } from 'vant';
import { getShareInbox } from '../api';
import { getCommentReplyNotifications, markCommentReplyNotificationRead, publishComment } from '../api/comments';
import type { CommentReplyNotification, ShareInboxItem } from '../api/types';
import { timeAgo } from '../utils/format';
import { EVENT_NAMES, track } from '../analytics';
import AvatarImage from '../components/AvatarImage.vue';
import VideoThumbnail from '../components/VideoThumbnail.vue';

const router = useRouter();
const inbox = ref<ShareInboxItem[]>([]);
const replies = ref<CommentReplyNotification[]>([]);
const drafts = ref<Record<string, string>>({});
const sending = ref<string | null>(null);
const loading = ref(true);

onMounted(async () => {
  try {
    const [shareItems, replyPage] = await Promise.all([getShareInbox(), getCommentReplyNotifications()]);
    inbox.value = shareItems;
    replies.value = replyPage.items;
    await Promise.allSettled(replyPage.items.filter((item) => !item.readAt)
      .map((item) => markCommentReplyNotificationRead(item.id)));
  } catch {
    showToast('消息加载失败');
  } finally {
    loading.value = false;
  }
});

function open(item: ShareInboxItem) {
  track(EVENT_NAMES.SHARE_CARD_OPENED, { videoId: item.video.id, objectId: item.id });
  router.push(item.video.videoUrl ? { name: 'feed', query: { video: item.video.id } }
    : { name: 'content-detail', params: { contentId: item.video.id } });
}

async function sendReply(item: CommentReplyNotification) {
  if (sending.value) return;
  const content = (drafts.value[item.id] ?? '').trim();
  if (!content) return showToast('请输入回复内容');
  sending.value = item.id;
  try {
    await publishComment(item.videoId, content, item.commentId);
    drafts.value[item.id] = '';
    showToast('回复成功');
  } catch (error) {
    showToast(error instanceof Error && error.message ? error.message : '回复失败，请稍后重试');
  } finally {
    sending.value = null;
  }
}
</script>

<template>
  <div class="page light-page">
    <header class="profile-nav">
      <button aria-label="返回" @click="router.back()"><van-icon name="arrow-left" /></button>
      <strong>消息</strong>
      <span aria-hidden="true" />
    </header>
    <div class="profile-scroll">
      <van-loading v-if="loading" class="spinner-wrap" size="28" />
      <template v-else>
        <section v-if="replies.length" class="message-section">
          <h2>评论回复</h2>
          <article v-for="item in replies" :key="item.id" class="reply-item">
            <AvatarImage class="reply-avatar" :src="item.actor.avatarUrl" alt="回复者头像" />
            <div class="reply-copy">
              <strong>{{ item.actor.nickname }} 回复了你</strong>
              <p>{{ item.content }}</p>
              <blockquote>你的评论：{{ item.sourceContent }}</blockquote>
              <small>{{ item.videoTitle }} · {{ timeAgo(item.createdAt) }}</small>
              <form class="inline-reply" @submit.prevent="sendReply(item)">
                <input v-model="drafts[item.id]" maxlength="1000" :aria-label="`回复 ${item.actor.nickname}`" :placeholder="`回复 ${item.actor.nickname}`" />
                <button type="submit" :disabled="sending !== null">{{ sending === item.id ? '发送中' : '回复' }}</button>
              </form>
            </div>
          </article>
        </section>

        <section v-if="inbox.length" class="message-section">
          <h2>收到的分享</h2>
          <article v-for="item in inbox" :key="item.id" class="inbox-item" @click="open(item)">
            <div class="thumb"><VideoThumbnail :cover-url="item.video.cover?.coverUrl" :video-url="item.video.videoUrl" /></div>
            <div class="copy">
              <strong>{{ item.video.title }}</strong>
              <p>{{ item.sender.nickname }} 分享给你</p>
              <small>{{ timeAgo(item.sentAt) }}<span v-if="item.status === 'INVALID'" class="tag invalid">已失效</span></small>
            </div>
          </article>
        </section>
      </template>
      <div v-if="!loading && !replies.length && !inbox.length" class="empty-state">
        <van-icon name="envelop-o" />
        <p>暂无消息</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.light-page { color: var(--text-strong); background: #fff; }
.profile-nav { top: 0; }
.profile-scroll { top: 48px; }
.message-section h2 { margin: 18px 16px 10px; color: #777980; font-size: 13px; }
.reply-item { display: flex; gap: 10px; padding: 14px 16px; border-bottom: 1px solid #f1f2f4; }
.reply-avatar { width: 40px; height: 40px; flex: 0 0 auto; border-radius: 50%; object-fit: cover; background: #eceef2; }
.reply-copy { min-width: 0; flex: 1; }
.reply-copy > strong { font-size: 14px; }
.reply-copy p { margin: 5px 0; font-size: 14px; }
.reply-copy blockquote { margin: 5px 0; padding: 7px 9px; color: #777980; background: #f6f7f9; border-radius: 6px; font-size: 12px; }
.reply-copy small { color: #9a9ba0; font-size: 11px; }
.inline-reply { display: flex; gap: 8px; margin-top: 9px; }
.inline-reply input { min-width: 0; flex: 1; height: 34px; padding: 0 10px; border: 1px solid #e2e3e6; border-radius: 17px; }
.inline-reply button { padding: 0 14px; border-radius: 17px; color: #fff; background: var(--indigo); }
.inline-reply button:disabled { opacity: .55; }
</style>
