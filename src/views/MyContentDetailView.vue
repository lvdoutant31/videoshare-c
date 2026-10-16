<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { showConfirmDialog, showToast } from 'vant';
import { getEditableContent, offShelfMyContent, type MyContentItem } from '../api/content';
import ContentArticle from '../components/ContentArticle.vue';

const route = useRoute();
const router = useRouter();
const item = ref<Awaited<ReturnType<typeof getEditableContent>>>();
const loading = ref(true);
const failed = ref(false);
const busy = ref(false);

async function load() {
  loading.value = true; failed.value = false;
  try { item.value = await getEditableContent(String(route.params.contentId)); }
  catch { failed.value = true; }
  finally { loading.value = false; }
}
async function edit() {
  if (!item.value) return;
  await router.push({ name: 'my-content-edit', params: { contentId: item.value.id } });
}
async function offShelf() {
  if (!item.value) return;
  try { await showConfirmDialog({ title: '撤下内容', message: '撤下后内容将不再公开展示。' }); }
  catch { return; }
  busy.value = true;
  try { await offShelfMyContent(item.value.id); await load(); showToast('已撤下'); }
  catch (e) { showToast(e instanceof Error ? e.message : '撤下失败'); }
  finally { busy.value = false; }
}
function status(value: MyContentItem) {
  if (value.publishStatus === 'OFF_SHELF') return '已下架';
  if (value.publishStatus === 'PUBLISHED') return '已发布';
  if (value.auditStatus === 'PENDING_REVIEW' || value.auditStatus === 'CLAIMED') return '审核中';
  if (value.auditStatus === 'REJECTED' || value.auditStatus === 'REVISION_REQUIRED') return '需修改';
  return '未发布';
}
watch(() => route.params.contentId, load, { immediate: true });
</script>

<template>
  <main class="content-detail">
    <header><button type="button" @click="router.back()">返回</button><span>内容详情</span></header>
    <section v-if="loading" class="message">正在加载…</section>
    <section v-else-if="failed" class="message"><p>暂时无法读取这条内容，请确认已登录后重试。</p><button @click="load">重试</button></section>
    <ContentArticle v-else-if="item" :title="item.title" :author-nickname="item.authorNickname" :description="item.description">
      <template #before><div class="status">{{ status(item) }}</div></template>
      <template #media><video v-if="item.videoUrl ?? item.originalMedia?.url" :src="item.videoUrl ?? item.originalMedia?.url" :poster="item.coverMedia?.url" controls playsinline /></template>
      <div class="metadata"><span>分类：{{ item.categories.map(value => value.name).join('、') || '未设置' }}</span><span>标签：{{ item.tags.map(value => value.name).join('、') || '未设置' }}</span></div>
      <div class="actions">
        <button v-if="item.publishStatus !== 'DELETED' && item.auditStatus !== 'CLAIMED'" :disabled="busy" @click="edit">编辑并重新提交审核</button>
        <button v-if="item.publishStatus === 'PUBLISHED'" :disabled="busy" @click="offShelf">撤下</button>
      </div>
    </ContentArticle>
  </main>
</template>

<style scoped>
.content-detail { height:100dvh; padding:20px; overflow-y:auto; background:#fff; color:#1e293b; }
header { max-width:760px; margin:0 auto 24px; display:flex; align-items:center; gap:20px; }
button { padding:8px 12px; border-radius:6px; background:#f1f5f9; color:#334155; }
.status,.metadata,.message { color:#64748b; font-size:13px; } .status { display:inline-block; margin-bottom:12px; padding:5px 9px; border-radius:20px; background:#eef3ff; color:#2857c7; }
.metadata { display:grid; gap:6px; margin:18px 0; }.actions { display:flex; flex-wrap:wrap; gap:8px; }.message { max-width:760px; margin:40px auto; text-align:center; }
</style>
