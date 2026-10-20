<script setup lang="ts">
import AnimatedCount from '../components/AnimatedCount.vue';
import { computed, nextTick, onActivated, onDeactivated, ref } from 'vue';
import { onBeforeRouteLeave, useRouter } from 'vue-router';
import { showToast } from 'vant';
import { useAuthStore } from '../stores/auth';
import { formatCount } from '../utils/format';
import AvatarImage from '../components/AvatarImage.vue';
import ContentCollection from '../components/ContentCollection.vue';

const router = useRouter();
const auth = useAuthStore();
const user = computed(() => auth.user);
const tab = ref<'works' | 'favorites' | 'likes' | 'history'>('works');
const tabs = [{ key: 'works', label: '作品' }, { key: 'favorites', label: '收藏' }, { key: 'likes', label: '喜欢' }, { key: 'history', label: '历史' }] as const;
const worksTotal = ref<number>();
const scroll = ref<HTMLElement>();
const tabbar = ref<HTMLElement>();
const active = ref(true);
const positions = { works: 0, favorites: 0, likes: 0, history: 0 };
async function selectTab(key: typeof tab.value) {
  positions[tab.value] = scroll.value?.scrollTop ?? 0;
  tab.value = key;
  await nextTick();
  if (scroll.value) scroll.value.scrollTop = positions[key];
}
async function moveTab(event: KeyboardEvent) {
  const index = tabs.findIndex(item => item.key === tab.value);
  const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length
    : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length
    : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null;
  if (next === null) return;
  event.preventDefault();
  await selectTab(tabs[next].key);
  tabbar.value?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus({ preventScroll: true });
}
onBeforeRouteLeave(() => { positions[tab.value] = scroll.value?.scrollTop ?? 0; });
onDeactivated(() => { active.value = false; });
onActivated(async () => {
  active.value = true;
  auth.refreshProfile().catch(() => showToast('个人数据刷新失败'));
  await nextTick();
  if (scroll.value) scroll.value.scrollTop = positions[tab.value];
});
</script>

<template>
  <main class="page me-screen collection-profile">
    <div ref="scroll" class="me-scroll">
      <div class="profile-content">
        <header class="me-titlebar"><h1>我的</h1><button aria-label="设置" @click="router.push({ name: 'me-settings' })"><van-icon name="setting-o" aria-hidden="true" /><span>设置</span></button></header>
        <section class="me-identity">
          <AvatarImage :src="user?.avatarUrl" alt="我的头像" />
          <div><h2>{{ user?.nickname ?? '加载中…' }}</h2><small>videoshare号: {{ user?.id ?? '-' }}</small><p>{{ user?.bio || '还没有填写个人简介' }}</p></div>
        </section>
        <div class="me-metrics" aria-label="个人统计">
          <div><b><AnimatedCount :value="user?.followingCount ?? 0" /></b><span>关注</span></div>
          <div><b><AnimatedCount :value="user?.followerCount ?? 0" /></b><span>粉丝</span></div>
          <div><b><AnimatedCount :value="user?.likeReceivedCount ?? 0" /></b><span>获赞</span></div>
        </div>
        <nav ref="tabbar" class="collection-tabs" role="tablist" aria-label="我的内容" @keydown="moveTab">
          <button v-for="item in tabs" :id="`me-tab-${item.key}`" :key="item.key" role="tab" :aria-selected="tab === item.key" :aria-controls="`me-${item.key}`"
            :aria-label="item.key === 'works' && worksTotal !== undefined ? `${item.label} ${worksTotal}` : item.label" :tabindex="tab === item.key ? 0 : -1"
            :class="{ active: tab === item.key }" @click="selectTab(item.key)"><span>{{ item.label }}</span><span v-if="item.key === 'works' && worksTotal !== undefined" class="tab-count" aria-hidden="true">{{ formatCount(worksTotal) }}</span></button>
        </nav>
        <div v-for="item in tabs" :id="`me-${item.key}`" :key="item.key" v-show="tab === item.key" role="tabpanel" :aria-labelledby="`me-tab-${item.key}`" tabindex="0">
          <ContentCollection :kind="item.key" :user-id="user?.id" :status="item.key === 'works' ? 'ALL' : 'PUBLISHED'"
            :active="active && tab === item.key && !!user" @total="worksTotal = $event" />
        </div>
      </div>
    </div>
  </main>
</template>

<style scoped>
.collection-profile {
  --profile-text: #202b3d; --profile-muted: #59677d; --profile-accent: #3155c7;
  --profile-soft: #f5f7fb; --profile-accent-soft: #edf2ff; --profile-line: #e7ecf4;
  color: var(--profile-text); background: #fff;
}
.me-scroll { scroll-padding-bottom: 20px; }
.profile-content { max-width: 900px; margin: 0 auto; }
.me-titlebar { min-height: 60px; padding: 8px 16px; display: flex; align-items: center; justify-content: space-between; }
.me-titlebar h1 { margin: 0; font-size: 20px; font-weight: 700; }
.me-titlebar button { display: flex; align-items: center; justify-content: center; gap: 6px; min-width: 76px; min-height: 44px; padding: 0 10px; background: var(--profile-soft); border-radius: 12px; font-size: 13px; }
.me-titlebar button .van-icon { font-size: 20px; }
.me-titlebar button:focus-visible,.collection-tabs button:focus-visible,[role="tabpanel"]:focus-visible { outline: 2px solid var(--profile-accent); outline-offset: -2px; }
.me-identity { display: flex; align-items: center; gap: 14px; padding: 10px 16px 16px; }
.me-identity > img { width: 72px; height: 72px; border-radius: 50%; flex-shrink: 0; object-fit: cover; border: 3px solid var(--profile-soft); }
.me-identity > div { min-width: 0; }
.me-identity h2 { margin: 0 0 4px; font-size: 23px; font-weight: 700; line-height: 1.35; overflow-wrap: anywhere; }
.me-identity small { color: var(--profile-muted); font-size: 12px; line-height: 1.5; overflow-wrap: anywhere; }
.me-identity p { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; margin: 6px 0 0; color: var(--profile-muted); font-size: 13px; line-height: 1.5; }
.me-metrics { display: flex; margin: 0 16px 18px; padding: 12px 0; background: var(--profile-soft); border: 1px solid var(--profile-line); border-radius: 14px; }
.me-metrics > div { min-width: 0; flex: 1; text-align: center; }
.me-metrics > div + div { border-left: 1px solid var(--profile-line); }
.me-metrics b { display: block; font-size: 21px; line-height: 28px; font-variant-numeric: tabular-nums; }
.me-metrics > div > span { color: var(--profile-muted); font-size: 12px; }
.collection-tabs { position: sticky; top: 0; z-index: 4; display: grid; grid-template-columns: repeat(4, 1fr); min-height: 52px; border-block: 1px solid var(--profile-line); background: #fff; }
.collection-tabs button { position: relative; display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 5px; min-height: 52px; padding: 8px 2px 12px; color: var(--profile-muted); font-size: 14px; transition: color 140ms ease, background-color 140ms ease; }
.collection-tabs button.active { color: var(--profile-accent); font-weight: 700; }
.collection-tabs button.active::after { content: ''; position: absolute; left: calc(50% - 14px); bottom: 4px; width: 28px; height: 3px; border-radius: 3px; background: var(--profile-accent); }
.tab-count { padding: 1px 5px; background: var(--profile-soft); border-radius: 5px; font-size: 11px; font-weight: 600; line-height: 17px; font-variant-numeric: tabular-nums; }
.active .tab-count { background: var(--profile-accent-soft); }
.collection-profile :deep(.collection-item) { scroll-margin-block: 64px 20px; }
.collection-profile :deep(.collection-item strong) { color: var(--profile-text); font-size: 13px; line-height: 20px; min-height: 40px; text-wrap: balance; }
.collection-profile :deep(.collection-stats) { padding-inline: 6px; font-size: 12px; background: linear-gradient(transparent, #101827b3 45%, #101827e6); }
.collection-profile :deep(.collection-type) { font-size: 11px; background: #172035bf; }
.collection-profile :deep(.collection-status) { font-size: 11px; }
.collection-profile :deep(.collection-item small),.collection-profile :deep(.collection-empty) { color: var(--profile-muted); font-size: 12px; }
.collection-profile :deep(.collection-more),.collection-profile :deep(.collection-tools button) { min-height: 44px; padding: 8px 18px; color: var(--profile-accent); border-radius: 10px; font-size: 14px; }
.collection-profile :deep(.collection-item:focus-visible),.collection-profile :deep(.collection-more:focus-visible),.collection-profile :deep(.collection-tools button:focus-visible) { outline: 2px solid var(--profile-accent); outline-offset: 2px; }
.me-titlebar button:active,.collection-tabs button:active { background: var(--profile-accent-soft); }
.collection-profile :deep(.collection-item:active .collection-cover) { filter: brightness(.92); }
@media (hover: hover) { .me-titlebar button:hover,.collection-tabs button:hover { background: var(--profile-soft); } }
@media (min-width: 768px) { .profile-content { padding: 16px 24px; } .me-titlebar { padding-inline: 16px; } .me-metrics { margin-block: 4px 24px; } }
@media (prefers-reduced-motion: reduce) { .collection-tabs button { transition: none; } }
</style>
