<script setup lang="ts">
import { nextTick, onActivated, onDeactivated, ref } from 'vue';
import { onBeforeRouteLeave, useRouter } from 'vue-router';
import ContentCollection from '../components/ContentCollection.vue';
const props = defineProps<{ kind: 'favorites' | 'likes' | 'history' }>();
const router = useRouter();
const scroll = ref<HTMLElement>();
const active = ref(true);
let position = 0;
onBeforeRouteLeave(() => { position = scroll.value?.scrollTop ?? 0; });
onDeactivated(() => { active.value = false; });
onActivated(async () => { active.value = true; await nextTick(); if (scroll.value) scroll.value.scrollTop = position; });
</script>
<template>
  <main class="page light-page">
    <header class="profile-nav"><button aria-label="返回" @click="router.back()"><van-icon name="arrow-left" /></button><strong>{{ { favorites: '我的收藏', likes: '我的点赞', history: '观看历史' }[props.kind] }}</strong><span /></header>
    <div ref="scroll" class="profile-scroll"><ContentCollection :kind="kind" :active="active" /></div>
  </main>
</template>
<style scoped>
.light-page { color: #20242e; background: #fff; }
.profile-scroll { top: 48px; }
@media (min-width: 768px) { .profile-scroll { left: 50%; transform: translateX(-50%); max-width: 900px; } }
</style>
