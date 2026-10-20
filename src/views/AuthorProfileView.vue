<script setup lang="ts">
import AnimatedCount from '../components/AnimatedCount.vue';
/**
 * 作者主页（M07）：资料、关注状态、统计、公开视频网格。
 */
import { computed, nextTick, onActivated, onDeactivated, onMounted, ref } from 'vue';
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router';
import { showToast } from 'vant';
import { getAuthorProfile, setFollow } from '../api';
import { isAuthenticated } from '../api/http';
import { formatCount } from '../utils/format';
import { EVENT_NAMES, track } from '../analytics';
import AvatarImage from '../components/AvatarImage.vue';
import ReportSheet from '../components/ReportSheet.vue';
import ContentCollection from '../components/ContentCollection.vue';
import { useAuthStore } from '../stores/auth';
import { pendingInteractions } from '../utils/pendingInteractions';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const userId = ref(String(route.params.userId ?? ''));
const profile = ref<Awaited<ReturnType<typeof getAuthorProfile>> | null>(null);
const tab = ref<'works' | 'likes'>('works');
const scroll = ref<HTMLElement>();
const active = ref(true);
const positions = { works: 0, likes: 0 };
async function selectTab(key: typeof tab.value) {
  positions[tab.value] = scroll.value?.scrollTop ?? 0;
  tab.value = key;
  await nextTick();
  if (scroll.value) scroll.value.scrollTop = positions[key];
}
onBeforeRouteLeave(() => { positions[tab.value] = scroll.value?.scrollTop ?? 0; });
onDeactivated(() => { active.value = false; });
onActivated(async () => { active.value = true; if (profile.value) void loadProfile(); await nextTick(); if (scroll.value) scroll.value.scrollTop = positions[tab.value]; });
const reportOpen = ref(false);
const isOwnProfile = computed(() => isAuthenticated() && auth.user?.id === profile.value?.id);

async function loadProfile() {
  try {
    profile.value = await getAuthorProfile(userId.value);
    track(EVENT_NAMES.PROFILE_VIEWED, { objectId: userId.value, pageSource: 'recommend_feed' });
  } catch {
    showToast('用户不存在或已被处置');
  }
}

async function toggleFollow() {
  if (isOwnProfile.value) return;
  if (!isAuthenticated()) {
    router.push({ name: 'login', query: { redirect: route.fullPath } });
    return;
  }
  if (!profile.value) return;
  const key = `follow:${userId.value}`;
  if (pendingInteractions.has(key)) return;
  pendingInteractions.add(key);
  const target = !profile.value.following;
  const before = profile.value.following;
  profile.value = { ...profile.value, following: target };
  try {
    const result = await setFollow(userId.value, target);
    profile.value = { ...profile.value, following: result.active, followerCount: result.count };
  } catch {
    profile.value = { ...profile.value!, following: before };
    showToast('操作失败，已恢复');
  } finally { pendingInteractions.delete(key); }
}

function reportUser() {
  if (!isAuthenticated()) {
    router.push({ name: 'login', query: { redirect: route.fullPath } });
    return;
  }
  reportOpen.value = true;
}

onMounted(loadProfile);
</script>

<template>
  <div class="page light-page">
    <header class="profile-nav">
      <button aria-label="返回" @click="router.back()"><van-icon name="arrow-left" /></button>
      <strong>{{ profile?.nickname ?? '' }}</strong>
      <button aria-label="更多" @click="reportUser"><van-icon name="ellipsis" /></button>
    </header>
    <div ref="scroll" class="profile-scroll">
      <template v-if="profile">
        <section class="profile-bio">
          <div class="profile-main-row">
            <div class="profile-avatar"><AvatarImage :src="profile.avatarUrl" alt="头像" /></div>
            <div class="profile-actions">
              <button v-if="!isOwnProfile" :disabled="pendingInteractions.has(`follow:${userId}`)" :class="{ primary: !profile.following, followed: profile.following }" @click="toggleFollow">
                {{ pendingInteractions.has(`follow:${userId}`) ? '处理中…' : profile.following ? '已关注' : '关注' }}
              </button>
              <button v-if="isOwnProfile" @click="router.push({ name: 'my-content' })">管理作品</button>
            </div>
          </div>
          <h1>{{ profile.nickname }}</h1>
          <small>videoshare号: {{ profile.id }}</small>
          <div class="profile-stats">
            <b><AnimatedCount :value="profile.followingCount" /> <span>关注</span></b>
            <b><AnimatedCount :value="profile.followerCount" /> <span>粉丝</span></b>
            <b><AnimatedCount :value="profile.likeReceivedCount" /> <span>获赞</span></b>
          </div>
          <p>{{ profile.bio || '这个人很懒，什么都没有写' }}</p>
        </section>

        <nav class="profile-tabs" role="tablist" aria-label="作者内容">
          <button role="tab" :aria-selected="tab === 'works'" :class="{ active: tab === 'works' }" @click="selectTab('works')">作品 {{ profile.worksCount }}</button>
          <button role="tab" :aria-selected="tab === 'likes'" :class="{ active: tab === 'likes' }" @click="selectTab('likes')">喜欢</button>
        </nav>
        <div v-show="tab === 'works'" role="tabpanel"><ContentCollection kind="author-works" :user-id="userId" :active="active && tab === 'works'" /></div>
        <div v-show="tab === 'likes'" role="tabpanel"><ContentCollection kind="author-likes" :user-id="userId" :active="active && tab === 'likes'" /></div>
      </template>
      <div v-else class="empty-state"><van-loading size="28" /></div>
    </div>
    <ReportSheet v-model:open="reportOpen" target-type="USER" :target-id="userId" />
  </div>
</template>

<style scoped>
.light-page { color: var(--text-strong); background: #fff; }
.profile-tabs { grid-template-columns: repeat(2, 1fr); }
.profile-tabs button.active { color: #4268f6; }
.profile-tabs button.active::after { background: #4268f6; }
@media (min-width: 768px) { .profile-scroll { left: 50%; transform: translateX(-50%); max-width: 900px; } }
</style>
