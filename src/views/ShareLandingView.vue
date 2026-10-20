<script setup lang="ts">
/**
 * 分享落地页（§7 /share/videos/{shareCode}）：可播放视频 + 打开应用入口。
 * mock 模式：shareCode 形如 mock-{videoId}；真实模式按 shareCode 拉取数据接口。
 * 不暴露内部媒体地址。
 */
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { showToast } from 'vant';
import { mockFeed } from '../api/mock/data';
import { EVENT_NAMES, track } from '../analytics';
import { resolveCoverUrl } from '../utils/media';

const route = useRoute();
const router = useRouter();

const shareCode = computed(() => String(route.params.shareCode ?? ''));

// mock：从 shareCode 解析 videoId；真实模式替换为 GET /share/videos/{shareCode}
const video = computed(() => {
  const videoId = shareCode.value.replace(/^mock-/, '');
  return mockFeed.find((v) => v.id === videoId) ?? mockFeed[0];
});

const notFound = computed(() => shareCode.value.startsWith('mock-') && !mockFeed.some((v) => v.id === shareCode.value.replace(/^mock-/, '')));

track(EVENT_NAMES.SHARE_CARD_OPENED, { videoId: video.value.id, objectId: shareCode.value, pageSource: 'share_landing' });

function openApp() {
  router.push({ name: 'feed', query: { video: video.value.id } });
  showToast('已进入应用');
}
</script>

<template>
  <div class="landing-screen">
    <template v-if="!notFound">
      <div class="landing-video">
        <video :src="video.videoUrl ?? ''" :poster="resolveCoverUrl(video.cover?.coverUrl)" controls playsinline webkit-playsinline />
      </div>
      <div class="landing-info">
        <h1>{{ video.title }}</h1>
        <p>{{ video.description }}</p>
        <button class="landing-open" @click="openApp">打开 videoshare 继续观看</button>
      </div>
    </template>
    <div v-else class="landing-missing">
      <van-icon name="warning-o" />
      <p>分享内容不存在或已失效</p>
      <button class="landing-open" @click="router.replace({ name: 'feed' })">去首页看看</button>
    </div>
  </div>
</template>

<style scoped>
.landing-missing { flex: 1; display: grid; place-items: center; align-content: center; gap: 14px; color: #9aa3b5; font-size: 40px; padding: 0 40px; }
.landing-missing p { margin: 0; font-size: 14px; }
.landing-missing .landing-open { width: 100%; }
</style>
