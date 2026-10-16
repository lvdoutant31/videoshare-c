<script setup lang="ts">
import { computed } from 'vue';
import { resolveCoverUrl } from '../utils/media';

const props = withDefaults(defineProps<{
  coverUrl?: string | null;
  /** Kept for API compatibility; thumbnails must not load the full media file. */
  videoUrl?: string | null;
  alt?: string;
}>(), { alt: '视频预览图' });

const cover = computed(() => resolveCoverUrl(props.coverUrl)
  ?? (!props.videoUrl ? `${import.meta.env.BASE_URL}default-content-cover.svg` : undefined));
</script>

<template>
  <span class="video-thumbnail">
    <img v-if="cover" :src="cover" :alt="alt" />
    <van-icon v-else name="video-o" aria-hidden="true" />
  </span>
</template>

<style scoped>
.video-thumbnail { display: block; width: 100%; height: 100%; overflow: hidden; background: #171717; }
.video-thumbnail img { display: block; width: 100%; height: 100%; object-fit: cover; }
.video-thumbnail > .van-icon { width: 100%; height: 100%; display: grid; place-items: center; color: #858585; font-size: 28px; }
</style>
