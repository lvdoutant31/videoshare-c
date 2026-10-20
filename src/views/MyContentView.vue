<script setup lang="ts">
import { nextTick, onActivated, onDeactivated, ref } from 'vue';
import { onBeforeRouteLeave, useRouter } from 'vue-router';
import ContentCollection from '../components/ContentCollection.vue';
import type { ContentStatus } from '../api/content';
const router = useRouter();
const scroll = ref<HTMLElement>();
const active = ref(true);
const status = ref<ContentStatus>('ALL');
const filters: { value: ContentStatus; label: string }[] = [{ value: 'ALL', label: '全部' }, { value: 'PUBLISHED', label: '已发布' }, { value: 'REVIEW', label: '审核中' }, { value: 'REVISION', label: '需修改' }, { value: 'OFF_SHELF', label: '已下架' }];
let position = 0;
onBeforeRouteLeave(() => { position = scroll.value?.scrollTop ?? 0; });
onDeactivated(() => { active.value = false; });
onActivated(async () => { active.value = true; await nextTick(); if (scroll.value) scroll.value.scrollTop = position; });
</script>
<template>
  <main class="page light-page">
    <header class="profile-nav"><button aria-label="返回" @click="router.back()"><van-icon name="arrow-left" /></button><strong>我的内容</strong><button aria-label="新增作品" @click="router.push({ name: 'publish' })"><van-icon name="plus" /></button></header>
    <div ref="scroll" class="profile-scroll">
      <nav class="content-status-filters" aria-label="内容状态"><button v-for="filter in filters" :key="filter.value" :aria-pressed="status === filter.value" @click="status = filter.value">{{ filter.label }}</button></nav>
      <ContentCollection class="managed-content" kind="works" :status="status" :active="active" />
    </div>
  </main>
</template>
<style scoped>
.light-page { color: #20242e; background: #fff; }
.profile-scroll { top: 48px; }
.content-status-filters { display:flex; flex-wrap:wrap; gap:8px; padding:16px; }
.content-status-filters button { min-height:44px; padding:8px 14px; color:var(--text-muted); background:var(--soft); border-radius:8px; font-size:14px; }
.content-status-filters [aria-pressed="true"] { color:white; background:var(--accent); }
.managed-content :deep(.collection-grid) { grid-template-columns:1fr; gap:0; }
.managed-content :deep(.collection-item) { display:grid; grid-template-columns:120px minmax(0,1fr); gap:16px; align-items:center; padding:16px 0; border-bottom:1px solid var(--line); }
.managed-content :deep(.collection-item strong) { min-height:0; margin:0; }
.managed-content :deep(.collection-cover) { aspect-ratio:4/3; }
@media (min-width: 768px) { .profile-scroll { left: 50%; transform: translateX(-50%); max-width: 900px; } }
</style>
