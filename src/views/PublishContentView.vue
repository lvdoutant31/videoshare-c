<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router';
import { showConfirmDialog, showToast } from 'vant';
import { getContentOptions, getEditableContent, publishContent, updateMyContent, uploadContentImage, type ContentOptions } from '../api/content';
import { safeRichText, hasRichText } from '../utils/richText';
import PublishStepper from '../components/PublishStepper.vue';
import AnimatedContent from '../components/AnimatedContent.vue';
import RichTextEditor from '../components/RichTextEditor.vue';
import { useAuthStore } from '../stores/auth';
import LoadingState from '../components/LoadingState.vue';
import { EVENT_NAMES, track } from '../analytics';
import { ApiError } from '../api/http';

const router = useRouter();
const route = useRoute();
const props = defineProps<{ contentId?: string }>();
const editId = computed(() => props.contentId ?? (typeof route.query.edit === 'string' ? route.query.edit : null));
const isEditing = computed(() => props.contentId !== undefined || route.name === 'my-content-edit' || 'edit' in route.query);
const auth = useAuthStore();
const title = ref('');
const categoryIds = ref<string[]>([]);
const tagIds = ref<string[]>([]);
const video = ref<File>();
const contentType = ref<'video' | 'article' | null>(null);
const description = ref('');
const videoPicker = ref<HTMLInputElement>();
const options = ref<ContentOptions>({ categories: [], tags: [] });
const loading = ref(true);
const failed = ref(false);
const uploading = ref(false);
const submitting = ref(false);
const submitted = ref(false);
const currentVersion = ref(0);
const loadedEditId = ref<string | null>(null);
const uploadPercent = ref<number | null>(null);
const submitError = ref('');
const draftStatus = ref('');
const needsVideo = ref(false);
const initialForm = ref('');
const draftKey = computed(() => auth.user?.id ? `yingliu.publish.draft:${auth.user.id}` : null);
const formSnapshot = computed(() => JSON.stringify({ title: title.value, description: description.value,
  categoryIds: categoryIds.value, tagIds: tagIds.value, contentType: contentType.value, videoName: video.value?.name ?? '' }));
const dirty = computed(() => !loading.value && !failed.value && !submitted.value && formSnapshot.value !== initialForm.value);
let draftTimer: ReturnType<typeof setTimeout> | undefined;
let loadRequest = 0;
let publishStarted = false;
function trackPublishStart() {
  if (publishStarted || !contentType.value) return;
  publishStarted = true;
  track(EVENT_NAMES.PUBLISH_STARTED, { pageSource: 'publish', properties: { contentType: contentType.value, editing: isEditing.value } });
}

function goBack() {
  if (window.history.state?.back) router.back();
  else router.push({ name: 'discover' });
}
function saveDraft() {
  clearTimeout(draftTimer);
  if (isEditing.value || loading.value || failed.value || submitted.value) return;
  if (!draftKey.value) { draftStatus.value = '暂时无法保存草稿，请勿关闭页面'; return; }
  try {
    if (title.value || hasRichText(description.value) || video.value || categoryIds.value.length || tagIds.value.length) {
      localStorage.setItem(draftKey.value, formSnapshot.value);
      draftStatus.value = '草稿已保存到本机';
    } else { localStorage.removeItem(draftKey.value); draftStatus.value = ''; }
  } catch { draftStatus.value = '草稿保存失败，请勿关闭页面'; }
}
function restoreDraft() {
  if (isEditing.value || !draftKey.value) return;
  try {
    const saved = localStorage.getItem(draftKey.value);
    if (!saved) return;
    const draft = JSON.parse(saved);
    if (!draft || typeof draft.title !== 'string' || draft.title.length > 120
      || typeof draft.description !== 'string' || draft.description.length > 100000
      || !['video', 'article'].includes(draft.contentType)
      || !Array.isArray(draft.categoryIds) || !draft.categoryIds.every((id: unknown) => typeof id === 'string')
      || !Array.isArray(draft.tagIds) || !draft.tagIds.every((id: unknown) => typeof id === 'string')) return;
    title.value = draft.title; description.value = safeRichText(draft.description); contentType.value = draft.contentType;
    categoryIds.value = options.value.categories.filter(item => draft.categoryIds.includes(item.id)).map(item => item.id).slice(0, 3);
    tagIds.value = options.value.tags.filter(item => draft.tagIds.includes(item.id)).map(item => item.id).slice(0, 10);
    needsVideo.value = draft.contentType === 'video';
    draftStatus.value = '已恢复本机草稿';
  } catch { draftStatus.value = '草稿读取失败，请勿关闭页面'; }
}
async function discardDraft() {
  try { await showConfirmDialog({ title: '清空草稿？', message: '当前标题、正文和已选文件将被清空。' }); }
  catch { return; }
  clearTimeout(draftTimer);
  try { if (draftKey.value) localStorage.removeItem(draftKey.value); }
  catch { showToast('草稿清除失败，请重试'); return; }
  await loadForm();
}
async function confirmLeave() {
  if (submitted.value || !dirty.value && !uploading.value && !submitting.value) return true;
  if (uploading.value || submitting.value) { showToast('正在上传或提交，请完成后再离开'); return false; }
  saveDraft();
  try {
    await showConfirmDialog({ title: '离开当前页面？', message: isEditing.value ? '尚未提交的修改会丢失。'
      : `${draftStatus.value || '草稿尚未保存'}。视频文件离开后需要重新选择。`, confirmButtonText: '离开', cancelButtonText: '继续编辑' });
    return true;
  } catch { return false; }
}
function beforeUnload(event: BeforeUnloadEvent) {
  if (!dirty.value && !uploading.value && !submitting.value) return;
  saveDraft(); event.preventDefault(); event.returnValue = '';
}
onBeforeRouteLeave(confirmLeave);
onBeforeRouteUpdate(confirmLeave);
onMounted(() => { window.addEventListener('beforeunload', beforeUnload); window.addEventListener('pagehide', saveDraft); });
onBeforeUnmount(() => {
  saveDraft(); clearTimeout(draftTimer);
  window.removeEventListener('beforeunload', beforeUnload); window.removeEventListener('pagehide', saveDraft);
});
watch(formSnapshot, () => {
  if (loading.value || failed.value || submitted.value || isEditing.value) return;
  draftStatus.value = '正在保存草稿…';
  clearTimeout(draftTimer); draftTimer = setTimeout(saveDraft, 500);
});
// 会话恢复可能晚于表单选项返回；账号就绪后再读取它的草稿。
watch(() => auth.user?.id, id => {
  if (id && !loading.value && !isEditing.value && !dirty.value) {
    restoreDraft(); trackPublishStart(); initialForm.value = formSnapshot.value;
  }
});

async function loadForm() {
  publishStarted = false;
  clearTimeout(draftTimer);
  const request = ++loadRequest;
  const targetId = editId.value;
  const editing = isEditing.value;
  loading.value = true; failed.value = false; submitted.value = false;
  loadedEditId.value = null; currentVersion.value = 0;
  title.value = ''; description.value = ''; categoryIds.value = []; tagIds.value = [];
  video.value = undefined; contentType.value = null;
  draftStatus.value = ''; needsVideo.value = false; submitError.value = ''; uploadPercent.value = null;
  try {
    if (editing && (!targetId || !/^[1-9]\d*$/.test(targetId))) throw new Error('编辑内容标识无效，请从我的内容重新进入');
    const [availableOptions, item] = await Promise.all([
      getContentOptions(), editing ? getEditableContent(targetId!) : Promise.resolve(null),
    ]);
    if (request !== loadRequest) return;
    options.value = availableOptions;
    if (item) {
      if (item.id !== targetId) throw new Error('内容标识不一致，请刷新后重试');
      loadedEditId.value = item.id;
      title.value = item.title; description.value = item.description ?? '';
      contentType.value = item.originalMedia ? 'video' : 'article';
      categoryIds.value = item.categories.map(category => category.id);
      tagIds.value = item.tags.map(tag => tag.id);
      currentVersion.value = item.currentVersion;
    }
    else restoreDraft();
    trackPublishStart();
    initialForm.value = formSnapshot.value;
  } catch (error) {
    if (request !== loadRequest) return;
    failed.value = true;
    showToast(error instanceof Error ? error.message : '内容加载失败');
  } finally { if (request === loadRequest) loading.value = false; }
}
function chooseVideo(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  if (file.size > 500 * 1024 * 1024 || !/\.(mp4|webm|mov)$/i.test(file.name)
      || !['video/mp4', 'video/webm', 'video/quicktime'].includes(file.type)) {
    input.value = ''; showToast('请选择 500 MB 以内的 MP4、WebM 或 MOV 视频'); return;
  }
  video.value = file;
  needsVideo.value = false;
  input.value = '';
}
function chooseContentType(type: 'video' | 'article') {
  if (isEditing.value) return;
  contentType.value = type;
  trackPublishStart();
  if (type === 'article') {
    needsVideo.value = false;
    video.value = undefined;
    if (videoPicker.value) videoPicker.value.value = '';
  }
}
async function submit() {
  if (submitted.value || submitting.value || uploading.value || loading.value || failed.value) return;
  const targetId = loadedEditId.value;
  if ((isEditing.value || targetId) && (!targetId || targetId !== editId.value || currentVersion.value < 1)) {
    return showToast('请等待原内容加载完成，或从我的内容重新进入编辑');
  }
  const body = safeRichText(description.value);
  if (!contentType.value) return showToast('请选择发布类型');
  if (!title.value.trim()) return showToast('请输入标题');
  if (contentType.value === 'video' && !targetId && !video.value) return showToast('请选择视频文件');
  if (contentType.value === 'article' && !hasRichText(body)) return showToast('请填写图文正文');
  if (body.length > 100000) return showToast('正文不能超过 100000 个字符');
  if (categoryIds.value.length < 1 || categoryIds.value.length > 3) return showToast('请选择 1–3 个分类');
  if (tagIds.value.length > 10) return showToast('标签不能超过 10 个');
  submitting.value = true;
  submitError.value = '';
  uploadPercent.value = contentType.value === 'video' && !targetId ? 0 : null;
  let submittedId = targetId;
  try {
    if (targetId) {
      await updateMyContent(targetId, { title: title.value.trim(), description: body, categoryIds: categoryIds.value, tagIds: tagIds.value, currentVersion: currentVersion.value });
    } else {
      const created = await publishContent({ title: title.value.trim(), description: body, categoryIds: categoryIds.value, tagIds: tagIds.value, file: contentType.value === 'video' ? video.value : undefined },
        contentType.value === 'video' ? percent => { uploadPercent.value = percent; } : undefined);
      submittedId = created.id;
    }
    submitted.value = true;
    track(EVENT_NAMES.PUBLISH_SUBMITTED, { objectId: submittedId ?? undefined, pageSource: 'publish', properties: { contentType: contentType.value, editing: isEditing.value } });
    clearTimeout(draftTimer);
    if (!targetId && draftKey.value) {
      try { localStorage.removeItem(draftKey.value); } catch { /* 已提交成功，不影响结果页。 */ }
    }
  } catch (error) {
    track(EVENT_NAMES.PUBLISH_FAILED, { pageSource: 'publish', properties: { contentType: contentType.value, editing: isEditing.value, errorCode: error instanceof ApiError ? error.code : 'REQUEST_FAILED' } });
    submitError.value = error instanceof Error ? error.message : '提交失败，请重试';
    saveDraft(); showToast(submitError.value);
  }
  finally { submitting.value = false; }
}
watch(() => [route.name, props.contentId, route.query.edit], loadForm, { immediate: true });
</script>

<template>
  <main class="publish-page">
    <header><button type="button" :disabled="uploading || submitting" @click="goBack">返回</button><h1>{{ isEditing ? '编辑内容' : '发布内容' }}</h1></header>
    <PublishStepper v-if="!loading && !failed" :step="submitted ? 2 : contentType ? 1 : 0" />
    <section v-if="loading" class="submission-result"><LoadingState label="正在准备发布页面" detail="正在加载内容和分类，请稍候" /></section>
    <section v-else-if="failed" class="submission-result"><p>内容加载失败</p><button type="button" @click="loadForm">重新加载</button></section>
    <AnimatedContent v-else-if="submitted" class="submission-result" role="status">
      <van-icon name="passed" /><h2>{{ isEditing ? '修改已提交审核' : '已提交审核' }}</h2><p>审核通过并发布后，内容将公开展示。</p><button @click="router.replace({ name: 'my-content' })">返回我的内容</button>
    </AnimatedContent>
    <section v-else-if="!contentType" class="type-choice" aria-label="选择发布类型">
      <button type="button" class="type-card" @click="chooseContentType('video')">
        <span class="type-icon"><van-icon name="video-o" /></span><strong>发布视频</strong><small>上传视频，可添加富文本正文</small>
      </button>
      <button type="button" class="type-card" @click="chooseContentType('article')">
        <span class="type-icon"><van-icon name="photo-o" /></span><strong>发布图文</strong><small>编辑图文或纯文字，支持图片轮播</small>
      </button>
    </section>
    <form v-else @submit.prevent="submit">
      <div class="form-type"><button v-if="!isEditing" type="button" :disabled="uploading || submitting" @click="contentType = null">‹ 更换发布类型</button><button v-else type="button" @click="router.replace({ name: 'my-content' })">‹ 返回我的内容</button><span>{{ isEditing ? '编辑内容' : (contentType === 'video' ? '视频内容' : '图文内容') }}</span></div>
      <p class="author">作者：{{ auth.user?.nickname ?? '当前登录用户' }}</p>
      <div v-if="!isEditing" class="draft-notice"><p role="status">{{ draftStatus || '文字草稿将自动保存到本机，仅当前账号可恢复' }}<span v-if="needsVideo">，请重新选择视频文件。</span></p><button type="button" :disabled="submitting || uploading" @click="discardDraft">清空草稿</button></div>
      <fieldset class="content-fields" :disabled="submitting">
      <label class="field"><span>标题</span><input v-model="title" maxlength="120" required placeholder="给内容起一个标题" /></label>
      <div class="field"><span>{{ contentType === 'video' ? '正文（选填）' : '图文正文' }}</span>
        <RichTextEditor v-model="description" compact :upload-image="uploadContentImage" :disabled="submitting" @busy="uploading = $event" @error="showToast($event)" />
        <small>{{ contentType === 'video' ? '正文可选，可插入图片。' : '支持纯文字或多图，图片按正文顺序轮播，第一张作为封面。' }} 每张图片最多 10 MB。</small>
      </div>
      <div v-if="contentType === 'video' && !isEditing" class="field"><span>视频文件</span><input ref="videoPicker" type="file" accept=".mp4,.webm,.mov" hidden @change="chooseVideo" /><button type="button" :disabled="submitting" @click="videoPicker?.click()">{{ video ? '替换视频' : '添加视频' }}</button><p v-if="video">{{ video.name }} <button type="button" @click="video = undefined">移除</button></p><small>视频最多 500 MB；正文可选。</small></div>
      <fieldset><legend>分类（选择 1–3 个）</legend><label v-for="item in options.categories" :key="item.id"><input v-model="categoryIds" type="checkbox" :value="item.id" :disabled="categoryIds.length >= 3 && !categoryIds.includes(item.id)" />{{ item.name }}</label></fieldset>
      <fieldset><legend>标签（最多 10 个）</legend><label v-for="item in options.tags" :key="item.id"><input v-model="tagIds" type="checkbox" :value="item.id" :disabled="tagIds.length >= 10 && !tagIds.includes(item.id)" />{{ item.name }}</label></fieldset>
      </fieldset>
      <p v-if="submitError && !submitting" class="submit-error" role="alert">{{ submitError }}。内容已保留，可再次提交。</p>
      <footer class="publish-actions">
        <div v-if="submitting && uploadPercent !== null" class="upload-status"><LoadingState compact :label="uploadPercent < 100 ? '正在上传视频' : '上传完成，正在处理'" :detail="uploadPercent < 100 ? `已上传 ${uploadPercent}%，请保持页面打开` : '服务器正在处理，请稍候'" /><progress :value="uploadPercent" max="100" aria-label="视频上传进度" /></div>
        <p v-else>审核通过后公开展示</p><button class="submit-button" type="submit" :disabled="submitting || uploading || loading || failed">{{ submitting ? '正在提交…' : (isEditing ? '保存并重新提交审核' : '提交审核') }}</button>
      </footer>
    </form>
  </main>
</template>

<style scoped>
.publish-page { height:100dvh; padding:0 16px max(24px,env(safe-area-inset-bottom)); color:var(--text-strong); background:var(--paper); overflow-y:auto; }
header { display:flex; align-items:center; gap:20px; max-width:760px; margin:0 auto 20px; } h1 { margin:0; font-size:22px; }
form,.submission-result { max-width:760px; margin:auto; padding:20px; background:#fff; border-radius:14px; }
.type-choice { display:grid; grid-template-columns:1fr; gap:14px; max-width:760px; margin:40px auto; padding:20px; background:#fff; border-radius:14px; }
.type-card { display:grid; grid-template-columns:42px 1fr; gap:4px 12px; align-items:center; min-height:100px; padding:18px; text-align:left; border:1px solid #dbe2ee; border-radius:10px; }
.type-card:hover { border-color:#2857c7; background:#f7f9ff; }.type-icon { grid-row:span 2; display:grid; place-items:center; width:42px; height:42px; border-radius:12px; color:#2857c7; background:#eef3ff; font-size:22px; }
.type-card strong { font-size:16px; }.type-card small { color:#64748b; }
.form-type { display:flex; align-items:center; justify-content:space-between; color:#64748b; font-weight:600; }.form-type button { padding:0; border:0; color:#2857c7; }
.field { display:grid; gap:10px; margin:20px 0; } .field > span,legend { font-weight:600; } .author,small { color:#64748b; font-size:13px; }
input[type=text],input:not([type]) { padding:12px; border:1px solid #cbd5e1; border-radius:6px; color:#1e293b; background:#fff; }
button { padding:8px 12px; border:1px solid #cbd5e1; border-radius:6px; background:#fff; color:#334155; }
button:disabled { opacity:.5; }
fieldset { margin:20px 0; padding:14px; border:1px solid #e2e8f0; border-radius:8px; } fieldset label { display:inline-flex; align-items:center; gap:6px; margin:8px 14px 8px 0; }
.submit-button,.submission-result button { width:100%; padding:13px; background:#2857c7; color:#fff; border:0; } .submission-result { text-align:center; padding:40px 24px; } .submission-result .van-icon { font-size:44px; color:#16a34a; }
header { position:sticky; top:0; z-index:12; min-height:60px; padding:8px 0; margin-bottom:8px; background:var(--paper); border-bottom:1px solid var(--line); }
header h1 { font-size:20px; } header > button { min-height:44px; border:0; color:var(--text-muted); }
form { padding:8px 0 0; border-radius:0; }
.type-choice { padding:0; }.type-card { min-height:120px; border-color:var(--line); }.type-icon { color:var(--accent); background:var(--soft); }
.field { margin:24px 0; }.field input { min-width:0; min-height:48px; font-size:16px; background:var(--soft); border-color:var(--line); border-radius:8px; }
.field small { font-size:12px; line-height:1.6; }
.form-type { min-height:48px; padding:0 12px; border-radius:8px; background:var(--soft); font-size:14px; }.form-type button { min-height:44px; background:transparent; color:var(--accent); }
fieldset { display:flex; flex-wrap:wrap; gap:8px; padding:12px 0; border:0; }
fieldset legend { margin-bottom:4px; font-size:14px; }
fieldset label { margin:0; min-height:44px; padding:8px 12px; background:var(--soft); border:1px solid transparent; border-radius:8px; font-size:14px; }
fieldset label:has(input:checked) { color:var(--accent); border-color:var(--accent); background:#edf4ff; }
fieldset input { accent-color:var(--accent); width:16px; height:16px; }
.publish-actions { position:sticky; bottom:calc(-1 * max(24px,env(safe-area-inset-bottom))); padding:12px 0 max(16px,env(safe-area-inset-bottom)); background:var(--paper); border-top:1px solid var(--line); z-index:8; }
.publish-actions p { margin:0 0 10px; text-align:center; color:var(--text-muted); font-size:12px; }
.publish-actions .submit-button, .submission-result button { min-height:48px; border-radius:8px; background:var(--accent); font-size:16px; }
.draft-notice { display:flex; align-items:center; gap:12px; color:var(--text-muted); font-size:13px; line-height:1.6; }
.draft-notice p { flex:1; }.draft-notice button { flex-shrink:0; min-height:44px; }
fieldset.content-fields { display:block; min-width:0; margin:0; padding:0; }
.upload-status { padding:12px; border-radius:8px; background:var(--soft); font-size:14px; }.upload-status progress { width:100%; accent-color:var(--accent); }
.submit-error { color:#9f1239; font-size:14px; line-height:1.6; }
</style>
