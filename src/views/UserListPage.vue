<script setup lang="ts">
/**
 * 关注/粉丝列表页（§2.3 me/following、me/followers）。
 */
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { showToast } from 'vant';
import { setFollow } from '../api';
import { mockUsers } from '../api/mock/data';
import type { Author } from '../api/types';

const props = defineProps<{ kind: 'following' | 'followers' }>();
const router = useRouter();

const users = ref<Author[]>([]);
const title = computed(() => (props.kind === 'following' ? '我的关注' : '我的粉丝'));

onMounted(async () => {
  // mock：关注列表 = 前 3 个用户；真实模式接 GET /app/me/following|followers
  await new Promise((resolve) => setTimeout(resolve, 200));
  users.value = mockUsers.slice(0, 3).map((u) => ({
    id: u.id,
    nickname: u.nickname,
    avatarUrl: u.avatarUrl,
    following: props.kind === 'following',
  }));
});

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
</script>

<template>
  <div class="page light-page">
    <header class="profile-nav">
      <button aria-label="返回" @click="router.back()"><van-icon name="arrow-left" /></button>
      <strong>{{ title }}</strong>
      <button aria-label="更多"><van-icon name="ellipsis" /></button>
    </header>
    <div class="profile-scroll">
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
      <div v-else class="empty-state"><van-loading size="28" /></div>
    </div>
  </div>
</template>

<style scoped>
.light-page { color: var(--text-strong); background: #fff; }
.profile-nav { top: 0; }
.profile-scroll { top: 48px; }
</style>
