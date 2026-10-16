<script setup lang="ts">
import { computed, ref } from 'vue';
import Carousel from './Carousel.vue';
import { richTextImages, safeRichText } from '../utils/richText';

const props = defineProps<{ title: string; authorNickname?: string; description?: string | null }>();
const preview = ref<number | null>(null);
const images = computed(() => richTextImages(props.description));
function previewImage(event: MouseEvent) { const image = event.target; if(image instanceof HTMLImageElement && images.value.length) { const index = images.value.indexOf(image.getAttribute('src') ?? ''); if(index >= 0) preview.value = index; } }
const html = computed(() => safeRichText(props.description));
</script>

<template>
  <article class="content-article">
    <slot name="before" />
    <h1>{{ title }}</h1>
    <slot name="author"><p v-if="authorNickname" class="author">@{{ authorNickname }}</p></slot>
    <slot name="media" />
    <div class="rich-content" @click="previewImage" v-html="html" />
    <button v-if="images.length" class="view-images" type="button" @click="($event.currentTarget as HTMLButtonElement).focus(); preview = 0">查看图片（{{ images.length }}）</button>
    <Carousel v-if="preview !== null" :images="images" :start="preview" :label="title" @close="preview = null" />
    <slot />
  </article>
</template>

<style scoped>
.content-article { max-width:760px; margin:0 auto; }
h1 { margin:0 0 12px; font-size:24px; line-height:1.4; overflow-wrap:anywhere; }
.view-images { min-height:44px; color:var(--accent); padding:8px 12px; }
.author { color:#64748b; }
.content-article :deep(video) { display:block; width:100%; max-height:65vh; margin:16px 0; background:#111; object-fit:contain; }
.rich-content { line-height:1.8; white-space:pre-wrap; overflow-wrap:anywhere; overflow-x:auto; }
.rich-content :deep(img) { display:block; max-width:100%; height:auto; margin:16px auto; }
.rich-content :deep(table) { border-collapse:collapse; max-width:100%; }
.rich-content :deep(td),.rich-content :deep(th) { border:1px solid #ddd; padding:6px; }
.rich-content :deep(ul) { list-style:disc; padding-left:1.5em; }
.rich-content :deep(ol) { list-style:decimal; padding-left:1.5em; }
</style>
