<script setup lang="ts">
/**
 * 关注/粉丝列表页（§2.3 me/following、me/followers）。
 */
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { showToast } from 'vant';
import { getFollowers, getFollowing, setFollow } from '../api';
import type { Author } from '../api/types';

const props = defineProps<{ kind: 'following' | 'followers' }>();
const router = useRouter();

const users = ref<Author[]>([]);
const loading = ref(false);
const loadFailed = ref(false);
const title = computed(() => (props.kind === 'following' ? '我的关注' : '我的粉丝'));
let loadRequestId = 0;

async function loadUsers() {
  const requestId = ++loadRequestId;
  const kind = props.kind;
  loading.value = true;
  loadFailed.value = false;
  try {
    const result = kind === 'following' ? await getFollowing() : await getFollowers();
    if (requestId === loadRequestId) users.value = result;
  } catch {
    if (requestId !== loadRequestId) return;
    users.value = [];
    loadFailed.value = true;
    showToast('加载失败，请稍后重试');
  } finally {
    if (requestId === loadRequestId) loading.value = false;
  }
}

watch(() => props.kind, loadUsers, { immediate: true });

async function toggleFollow(user: Author) {
  const target = !user.following;
  const before = user.following;
  user.following = target;
  try {
    await setFollow(user.id, target);
  } catch {
    user.following = before;
    showToast('操作失败');
  }
}

function openAuthor(id: string) {
  router.push({ name: 'author', params: { userId: id } });
}

function switchKind(kind: 'following' | 'followers') {
  if (kind === props.kind) return;
  router.replace({ name: kind === 'following' ? 'me-following' : 'me-followers' });
}
</script>

<template>
  <div class="page light-page">
    <header class="profile-nav">
      <button aria-label="返回" @click="router.back()"><van-icon name="arrow-left" /></button>
      <strong>{{ title }}</strong>
      <button aria-label="更多"><van-icon name="ellipsis" /></button>
    </header>
    <div class="profile-scroll">
      <nav class="user-list-tabs" aria-label="关注关系">
        <button
          :class="{ active: kind === 'following' }"
          :aria-pressed="kind === 'following'"
          @click="switchKind('following')"
        >关注</button>
        <button
          :class="{ active: kind === 'followers' }"
          :aria-pressed="kind === 'followers'"
          @click="switchKind('followers')"
        >粉丝</button>
      </nav>
      <div v-if="users.length">
        <article v-for="user in users" :key="user.id" class="user-list-item" @click="openAuthor(user.id)">
          <img :src="user.avatarUrl ?? ''" alt="头像" />
          <div class="copy"><strong>{{ user.nickname }}</strong><small>映流号: {{ user.id }}</small></div>
          <button
            :class="{ primary: !user.following, followed: user.following }"
            @click.stop="toggleFollow(user)"
          >{{ user.following ? '已关注' : '+ 关注' }}</button>
        </article>
      </div>
      <div v-else class="empty-state">
        <van-loading v-if="loading" size="28" />
        <template v-else>
          <van-icon name="friends-o" />
          <p>{{ loadFailed ? '加载失败，稍后再试' : kind === 'following' ? '还没有关注的人' : '还没有粉丝' }}</p>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.light-page { color: var(--text-strong); background: #fff; }
.profile-nav { top: 0; }
.profile-scroll { top: 48px; }
.user-list-tabs { position: sticky; z-index: 4; top: 0; height: 44px; display: grid; grid-template-columns: 1fr 1fr; border-bottom: 1px solid var(--line); background: #fff; }
.user-list-tabs button { position: relative; color: var(--text-muted); font-size: 14px; }
.user-list-tabs button.active { color: var(--text-strong); font-weight: 600; }
.user-list-tabs button.active::after { content: ""; position: absolute; left: 50%; bottom: 0; width: 24px; height: 2px; transform: translateX(-50%); background: var(--indigo); }
</style>
