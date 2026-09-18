<script setup lang="ts">
/**
 * 应用外壳：路由出口 + 底部导航（首页/发现/发布/消息/我的）。
 * 所有一级页面使用统一的浅色底部导航。
 */
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { showToast } from 'vant';

const route = useRoute();
const router = useRouter();

const showTabbar = computed(() => ['feed', 'discover', 'me', 'inbox'].includes(String(route.name)));

function go(name: string) {
  router.push({ name });
}

function createVideo() {
  showToast('发布功能将在 V1.1 开放');
}
</script>

<template>
  <div class="app-root">
    <RouterView v-slot="{ Component }">
      <KeepAlive :include="['feed']">
        <component :is="Component" />
      </KeepAlive>
    </RouterView>

    <div v-if="showTabbar" class="app-bottom">
      <nav class="bottom-nav" aria-label="主导航">
        <button :class="{ active: route.name === 'feed' }" @click="go('feed')">首页</button>
        <button :class="{ active: route.name === 'discover' }" @click="go('discover')">发现</button>
        <button class="create-button" aria-label="发布作品" @click="createVideo"><span>＋</span></button>
        <button :class="{ active: route.name === 'inbox' }" @click="go('inbox')">消息</button>
        <button :class="{ active: route.name === 'me' }" @click="go('me')">我</button>
      </nav>
      <div class="home-indicator"><span /></div>
    </div>
  </div>
</template>
