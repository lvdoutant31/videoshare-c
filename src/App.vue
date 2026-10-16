<script setup lang="ts">
/**
 * 应用外壳：路由出口 + 底部导航（首页/发现/发布/消息/我的）。
 * 所有一级页面使用统一的浅色底部导航。
 */
import SwipeToast from './components/SwipeToast.vue';
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from './stores/auth';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const pageKey = computed(() => route.name === 'feed' ? route.fullPath : route.name === 'author' ? `author:${route.params.userId}`
  : ['me', 'me-favorites', 'me-likes', 'me-history', 'my-content'].includes(String(route.name)) ? `${String(route.name)}:${auth.user?.id ?? 'guest'}` : route.name);

const showTabbar = computed(() => ['feed', 'discover', 'me', 'inbox'].includes(String(route.name)));

function go(name: string) {
  router.push({ name });
}

function createVideo() {
  router.push({ name: 'publish' });
}
</script>

<template>
  <div class="app-root" :class="{ 'desktop-primary-shell': showTabbar, 'community-shell': showTabbar }">
    <SwipeToast />
    <RouterView v-slot="{ Component }">
      <KeepAlive :include="['FeedView', 'ProfileView', 'AuthorProfileView', 'DiscoverView', 'VideoListPage', 'MyContentView']" :max="8">
        <component :is="Component" :key="pageKey" />
      </KeepAlive>
    </RouterView>

    <div v-if="showTabbar" class="app-bottom desktop-primary-nav">
      <div class="nav-brand">内容社区</div>
      <nav class="bottom-nav community-nav" aria-label="主导航">
        <button :class="{ active: route.name === 'discover' }" :aria-current="route.name === 'discover' ? 'page' : undefined" @click="go('discover')"><van-icon name="wap-home-o" aria-hidden="true" /><span class="nav-label">首页</span></button>
        <button :class="{ active: route.name === 'feed' }" :aria-current="route.name === 'feed' ? 'page' : undefined" @click="go('feed')"><van-icon name="video-o" aria-hidden="true" /><span class="nav-label">视频</span></button>
        <button class="create-button" aria-label="发布作品" @click="createVideo"><span>＋</span><small class="create-label">发布</small></button>
        <button :class="{ active: route.name === 'inbox' }" :aria-current="route.name === 'inbox' ? 'page' : undefined" @click="go('inbox')"><van-icon name="comment-o" aria-hidden="true" /><span class="nav-label">消息</span></button>
        <button :class="{ active: route.name === 'me' }" :aria-current="route.name === 'me' ? 'page' : undefined" @click="go('me')"><van-icon name="user-o" aria-hidden="true" /><span class="nav-label">我</span></button>
      </nav>
      <div class="home-indicator"><span /></div>
    </div>
  </div>
</template>

<style scoped>
.nav-brand { display: none; }
.community-shell .bottom-nav.community-nav { height: 64px; backdrop-filter: none; }
.community-shell .community-nav > button { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5px; min-height: 48px; height: 100%; opacity: 1; color: #64748b; font-size: 12px; }
.community-shell .community-nav > button > .van-icon { font-size: 22px; }
.community-shell .community-nav > button.active { color: #2563eb; font-weight: 600; }
.community-shell .community-nav .create-button { gap: 4px; }
.community-shell .create-button::before { display: none; }
.community-shell .create-button > span { width: 36px; height: 30px; border: 0; border-radius: 8px; color: #fff; background: #2563eb; font-size: 24px; }
.community-shell .create-label { font-size: 12px; font-weight: 400; line-height: 1.2; }
.community-shell .home-indicator { height: calc(16px + env(safe-area-inset-bottom)); }
.community-shell .home-indicator span { display: none; }
.community-shell .bottom-nav button:focus-visible { outline: 2px solid #2563eb; outline-offset: -4px; border-radius: 8px; }
@media (min-width: 960px) {
  .community-shell.desktop-primary-shell > .page, .community-shell.desktop-primary-shell > .feed-screen { left: 184px; }
  .community-shell .app-bottom.desktop-primary-nav { width: 184px; padding: 32px 16px; }
  .community-shell .nav-brand { display: block; margin: 0 12px 32px; color: #07111f; font-size: 18px; line-height: 1.5; font-weight: 700; }
  .community-shell .desktop-primary-nav .bottom-nav { display: flex; flex-direction: column; gap: 8px; height: auto; padding: 0; }
  .community-shell .desktop-primary-nav .bottom-nav > button { flex-direction: row; justify-content: flex-start; gap: 14px; width: 100%; height: 52px; min-height: 52px; padding: 0 16px; border-radius: 8px; font-size: 14px; }
  .community-shell .desktop-primary-nav .bottom-nav > button.active::before { display: none; }
  .community-shell .desktop-primary-nav .bottom-nav .create-button { order: 1; justify-content: center; gap: 8px; margin-top: 24px; color: #fff; background: #2563eb; }
  .community-shell .create-button > span { width: auto; height: auto; padding: 0; border-radius: 0; background: transparent; }
  .community-shell .create-label { font-size: 14px; }
  .community-shell .create-label::after { content: '作品'; }
}
</style>
