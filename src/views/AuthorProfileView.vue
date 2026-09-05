<script setup lang="ts">
/**
 * 作者主页（M07）：资料、关注状态、统计、公开视频网格。
 */
import { onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { showToast } from 'vant';
import { getAuthorProfile, getAuthorVideos, setFollow } from '../api';
import { isAuthenticated } from '../api/http';
import type { FeedItem } from '../api/types';
import { formatCount } from '../utils/format';
import { EVENT_NAMES, track } from '../analytics';
import ReportSheet from '../components/ReportSheet.vue';

const route = useRoute();
const router = useRouter();

const userId = ref(String(route.params.userId ?? ''));
const profile = ref<Awaited<ReturnType<typeof getAuthorProfile>> | null>(null);
const videos = ref<FeedItem[]>([]);
const cursor = ref<string | null>(null);
const loading = ref(false);
const finished = ref(false);
const tab = ref<'works' | 'private' | 'likes'>('works');
const reportOpen = ref(false);

async function loadProfile() {
  try {
    profile.value = await getAuthorProfile(userId.value);
    track(EVENT_NAMES.PROFILE_VIEWED, { objectId: userId.value, pageSource: 'recommend_feed' });
  } catch {
    showToast('用户不存在或已被处置');
  }
}

async function loadVideos() {
  if (loading.value || finished.value) return;
  loading.value = true;
  try {
    const page = await getAuthorVideos(userId.value, cursor.value, 9);
    videos.value.push(...page.items);
    cursor.value = page.nextCursor;
    finished.value = page.nextCursor == null;
  } catch {
    showToast('作品加载失败');
  } finally {
    loading.value = false;
  }
}

async function toggleFollow() {
  if (!isAuthenticated()) {
    router.push({ name: 'login', query: { redirect: route.fullPath } });
    return;
  }
  if (!profile.value) return;
  const target = !profile.value.following;
  const before = profile.value.following;
  profile.value = { ...profile.value, following: target };
  try {
    await setFollow(userId.value, target);
  } catch {
    profile.value = { ...profile.value!, following: before };
    showToast('操作失败，已恢复');
  }
}

function openVideo(videoId: string) {
  router.push({ name: 'feed', query: { video: videoId } });
}

function reportUser() {
  if (!isAuthenticated()) {
    router.push({ name: 'login', query: { redirect: route.fullPath } });
    return;
  }
  reportOpen.value = true;
}

watch(() => route.params.userId, (value) => {
  if (typeof value === 'string' && value !== userId.value) {
    userId.value = value;
    videos.value = [];
    cursor.value = null;
    finished.value = false;
    loadProfile();
    loadVideos();
  }
});

onMounted(() => {
  loadProfile();
  loadVideos();
});
</script>

<template>
  <div class="page light-page">
    <header class="profile-nav">
      <button aria-label="返回" @click="router.back()"><van-icon name="arrow-left" /></button>
      <strong>{{ profile?.nickname ?? '' }}</strong>
      <button aria-label="更多" @click="reportUser"><van-icon name="ellipsis" /></button>
    </header>
    <div class="profile-scroll" @scroll.passive="() => {}">
      <template v-if="profile">
        <section class="profile-bio">
          <div class="profile-main-row">
            <div class="profile-avatar"><img :src="profile.avatarUrl ?? ''" alt="头像" /></div>
            <div class="profile-actions">
              <button :class="{ primary: !profile.following, followed: profile.following }" @click="toggleFollow">
                {{ profile.following ? '已关注' : '关注' }}
              </button>
              <button>私信</button>
            </div>
          </div>
          <h1>{{ profile.nickname }}</h1>
          <small>映流号: {{ profile.id }}</small>
          <div class="profile-stats">
            <b>{{ formatCount(profile.stats.followingCount) }} <span>关注</span></b>
            <b>{{ formatCount(profile.stats.followerCount) }} <span>粉丝</span></b>
            <b>{{ formatCount(profile.stats.likeReceivedCount) }} <span>获赞</span></b>
          </div>
          <p>{{ profile.bio || '这个人很懒，什么都没有写' }}</p>
        </section>

        <nav class="profile-tabs">
          <button :class="{ active: tab === 'works' }" @click="tab = 'works'">作品 {{ videos.length }}</button>
          <button :class="{ active: tab === 'private' }" @click="tab = 'private'">私密</button>
          <button :class="{ active: tab === 'likes' }" @click="tab = 'likes'">喜欢</button>
        </nav>

        <div v-if="tab === 'works'" class="works-grid">
          <article v-for="video in videos" :key="video.id" @click="openVideo(video.id)">
            <img :src="video.cover?.coverUrl ?? ''" alt="作品缩略图" />
            <span><van-icon name="play-circle-o" /> {{ formatCount(video.stats.playCount) }}</span>
          </article>
        </div>
        <div v-else class="empty-state">
          <van-icon :name="tab === 'private' ? 'closed-eye' : 'like-o'" />
          <p>{{ tab === 'private' ? '暂无私密作品' : '喜欢的作品将在这里展示' }}</p>
        </div>

        <div class="load-more" v-if="loading">加载中...</div>
        <div class="load-more" v-else-if="finished && videos.length > 0">没有更多了</div>
      </template>
      <div v-else class="empty-state"><van-loading size="28" /></div>
    </div>
    <ReportSheet v-model:open="reportOpen" target-type="USER" :target-id="userId" />
  </div>
</template>

<style scoped>
.light-page { color: var(--text-strong); background: #fff; }
</style>
