<script setup lang="ts">
/**
 * 个人中心（M08）：资料、统计、收藏/点赞/历史/关注/账号设置。
 */
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { showConfirmDialog, showToast } from 'vant';
import { useAuthStore } from '../stores/auth';
import { formatCount } from '../utils/format';

const router = useRouter();
const auth = useAuthStore();

const user = computed(() => auth.user);

async function logout() {
  try {
    await showConfirmDialog({ title: '退出登录', message: '确定退出当前账号吗？' });
  } catch {
    return;
  }
  await auth.logout();
  showToast('已退出登录');
  router.replace({ name: 'login' });
}

function goto(path: string) {
  router.push(path);
}
</script>

<template>
  <div class="me-screen page">
    <div class="me-scroll">
      <header class="me-header">
        <div class="profile-avatar"><img :src="user?.avatarUrl ?? ''" alt="我的头像" /></div>
        <div class="copy">
          <h1>{{ user?.nickname ?? '未登录' }}</h1>
          <small>映流号: {{ user?.id ?? '-' }}</small>
          <p v-if="user?.bio" class="bio">{{ user.bio }}</p>
          <p v-else class="bio">这个人很懒，什么都没有写</p>
        </div>
        <button aria-label="设置" @click="goto('/me/settings')"><van-icon name="setting-o" /></button>
      </header>

      <div class="stats-row" v-if="user">
        <button @click="goto('/me/following')"><b>{{ formatCount(user.followingCount) }}</b><span>关注</span></button>
        <button @click="goto('/me/followers')"><b>{{ formatCount(user.followerCount) }}</b><span>粉丝</span></button>
        <button><b>{{ formatCount(user.likeReceivedCount) }}</b><span>获赞</span></button>
      </div>

      <nav class="menu-list">
        <button class="menu-cell" @click="goto('/me/favorites')"><van-icon name="star-o" /><span>我的收藏</span><van-icon name="arrow" /></button>
        <button class="menu-cell" @click="goto('/me/likes')"><van-icon name="like-o" /><span>我的点赞</span><van-icon name="arrow" /></button>
        <button class="menu-cell" @click="goto('/me/history')"><van-icon name="clock-o" /><span>观看历史</span><van-icon name="arrow" /></button>
        <button class="menu-cell" @click="goto('/inbox')"><van-icon name="envelop-o" /><span>分享收件箱</span><small>3</small><van-icon name="arrow" /></button>
        <button class="menu-cell" @click="goto('/me/settings')"><van-icon name="shield-o" /><span>账号与安全</span><small v-if="user?.wecomBound">已绑定企微</small><van-icon name="arrow" /></button>
        <button class="menu-cell" @click="goto('/me/settings')"><van-icon name="description-o" /><span>用户协议与隐私政策</span><van-icon name="arrow" /></button>
      </nav>

      <div style="padding: 20px 16px 30px">
        <button class="logout-btn" @click="logout">退出登录</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.me-screen .copy { min-width: 0; }
.me-screen .copy .bio { margin: 6px 0 0; color: #3e4045; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.logout-btn { width: 100%; height: 44px; border-radius: 22px; color: #d43c3c; background: #fdecec; font-size: 14px; }
</style>
