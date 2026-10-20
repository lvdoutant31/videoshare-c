<script setup lang="ts">
import { computed, nextTick, onActivated, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { getDiscover, searchAuthors } from '../api';
import type { AuthorSearchResult, DiscoverResponse, DiscoverSort, FeedItem } from '../api/types';
import AvatarImage from '../components/AvatarImage.vue';
import VideoThumbnail from '../components/VideoThumbnail.vue';
import SegmentControl from '../components/SegmentControl.vue';
import Masonry from '../components/Masonry.vue';
import CountUp from '../components/CountUp.vue';
import FadeContent from '../components/FadeContent.vue';
import { formatCount, formatDuration, timeAgo } from '../utils/format';
import { richTextImages } from '../utils/richText';
import { useAuthStore } from '../stores/auth';
import { EVENT_NAMES, track } from '../analytics';

const EMPTY_DATA: DiscoverResponse = {
  summary: { totalVideos: 0, totalWatchTimeMs: 0, effectivePlayCount: 0, averageWatchTimeMs: 0, todayNewCount: 0 },
  categories: [], durationStats: [], tags: [], ranking: [], videos: [], page: 1, hasMore: false,
};
const router = useRouter();
const route = useRoute();
const auth = useAuthStore();
const recentSearches = ref<string[]>([]);
const historyKey = computed(() => `yingliu.search.history:${auth.user?.id ?? 'guest'}`);
watch(historyKey, key => {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    recentSearches.value = Array.isArray(saved) ? [...new Set(saved.filter((item): item is string => typeof item === 'string' && !!item.trim() && item.length <= 60))].slice(0, 8) : [];
  } catch { recentSearches.value = []; }
}, { immediate: true });
function rememberSearch(keyword: string) {
  const word = keyword.trim().slice(0, 60);
  if (!word) return;
  recentSearches.value = [word, ...recentSearches.value.filter(item => item !== word)].slice(0, 8);
  try { localStorage.setItem(historyKey.value, JSON.stringify(recentSearches.value)); } catch { /* 本机存储不可用时仍可搜索。 */ }
}
function clearSearchHistory() {
  recentSearches.value = [];
  try { localStorage.removeItem(historyKey.value); } catch { /* 不影响查询。 */ }
}
function useRecentSearch(keyword: string) { draftQuery.value = keyword; return applySearch(); }
const contentType = ref<'ALL' | 'VIDEO' | 'ARTICLE'>('ALL');
const contentTypeOptions = [{ value: 'ALL', label: '全部' }, { value: 'VIDEO', label: '视频' }, { value: 'ARTICLE', label: '图文' }];
const data = ref<DiscoverResponse>(EMPTY_DATA);
const results = ref<FeedItem[]>([]);
const selectedSort = ref<DiscoverSort>('COMPREHENSIVE');
const resultPage = ref(1);
const hasMore = ref(false);
const loadingMore = ref(false);
const moreFailed = ref(false);
const sortOptions: { value: DiscoverSort; label: string }[] = [
  { value: 'COMPREHENSIVE', label: '综合' }, { value: 'LATEST', label: '最新' }, { value: 'HOT', label: '最热' },
];
const searchKindOptions = [{ value: 'content', label: '内容' }, { value: 'authors', label: '作者' }];
const masonry = ref(false);
const query = ref('');
const draftQuery = ref('');
const searchInput = ref<HTMLInputElement>();
const selectedCategory = ref('');
const selectedTag = ref('');
const searchKind = ref<'content' | 'authors'>('content');
const resultOpen = ref(false);
const summaryOpen = ref(false);
const loading = ref(true);
const refreshing = ref(false);
const failed = ref(false);
const baselineFailed = ref(false);
const updatedAt = ref('');
const scroll = ref<HTMLElement>();
const authors = ref<AuthorSearchResult[]>([]);
const authorCursor = ref<string | null>(null);
const authorsLoading = ref(false);
const authorsFailed = ref(false);
const authorsFinished = ref(false);
let generation = 0;
let authorGeneration = 0;
let savedScroll = 0;
let baselineLoaded = false;
let lastQueryKey: string | null = null;
const categoryIcons: Record<string, string> = {
  企业文化: 'friends-o', 精益改善: 'chart-trending-o', 设备操作: 'setting-o',
  安全培训: 'shield-o', 质量管理: 'notes-o', 成果展示: 'photo-o',
};
const totalWatchTimeLabel = computed(() => {
  const minutes = Math.round(data.value.summary.totalWatchTimeMs / 60_000);
  return minutes >= 60 ? `${Math.floor(minutes / 60)}小时${minutes % 60}分` : `${minutes}分钟`;
});
const maxDurationSessionCount = computed(() => Math.max(...data.value.durationStats.map(item => item.sessionCount), 1));
const categoryLabel = computed(() => data.value.categories.find(item => item.id === selectedCategory.value)?.name ?? selectedCategory.value);
const tagLabel = computed(() => data.value.tags.find(item => item.id === selectedTag.value)?.name ?? selectedTag.value);
const activeFilterCount = computed(() => Number(Boolean(query.value)) + Number(Boolean(selectedCategory.value)) + Number(Boolean(selectedTag.value)) + Number(contentType.value !== 'ALL'));
const resultTitle = computed(() => searchKind.value === 'authors' ? '作者结果' : query.value ? `搜索：${query.value}` : '筛选结果');
function value(key: string) { return typeof route.query[key] === 'string' ? String(route.query[key]) : ''; }
function searchProperties() { return { kind: searchKind.value, queryLength: query.value.length, contentType: contentType.value,
  hasCategory: !!selectedCategory.value, hasTag: !!selectedTag.value, sort: selectedSort.value }; }

async function loadBaseline() {
  baselineFailed.value = false;
  try {
    data.value = await getDiscover({ keyword: '', limit: 24 });
    baselineLoaded = true;
  } catch { baselineFailed.value = true; }
}
async function loadDiscover(append = false) {
  if (append && (!hasMore.value || loadingMore.value || refreshing.value)) return;
  const version = ++generation;
  if (append) { loadingMore.value = true; moreFailed.value = false; }
  else { refreshing.value = true; failed.value = false; moreFailed.value = false; }
  try {
    const response = await getDiscover({ keyword: query.value, categoryId: selectedCategory.value || undefined,
      tagId: selectedTag.value || undefined, limit: 20, page: append ? resultPage.value + 1 : 1, sort: selectedSort.value,
      ...(contentType.value !== 'ALL' ? { contentType: contentType.value } : {}) });
    if (version !== generation) return;
    if (!resultOpen.value) { data.value = response; baselineLoaded = true; baselineFailed.value = false; }
    else {
      const existingIds = new Set(results.value.map(item => item.id));
      // shortcut: 热度实时更新可能移动分页边界；需要严格一致的翻页时再引入结果快照。
      results.value = append ? [...results.value, ...response.videos.filter(item => !existingIds.has(item.id))] : response.videos;
      resultPage.value = response.page; hasMore.value = response.hasMore;
      track(EVENT_NAMES.SEARCH_RESULTS, { pageSource: 'discover', properties: { ...searchProperties(), page: response.page, count: response.videos.length } });
      if (!append && !response.videos.length) track(EVENT_NAMES.SEARCH_EMPTY, { pageSource: 'discover', properties: searchProperties() });
    }
    updatedAt.value = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  } catch { if (version === generation) {
    if (append) moreFailed.value = true; else failed.value = true;
    if (resultOpen.value) track(EVENT_NAMES.SEARCH_FAILED, { pageSource: 'discover', properties: { ...searchProperties(), page: append ? resultPage.value + 1 : 1 } });
  } }
  finally { if (version === generation) { loading.value = false; refreshing.value = false; loadingMore.value = false; } }
}
async function loadAuthors(reset = false) {
  if (!reset && (authorsLoading.value || authorsFinished.value)) return;
  if (reset) { authorGeneration++; authors.value = []; authorCursor.value = null; authorsFinished.value = false; }
  const version = authorGeneration;
  authorsLoading.value = true; authorsFailed.value = false;
  try {
    const page = await searchAuthors(query.value, authorCursor.value);
    if (version !== authorGeneration) return;
    authors.value.push(...page.items); authorCursor.value = page.nextCursor; authorsFinished.value = page.nextCursor == null;
    if (query.value) {
      track(EVENT_NAMES.SEARCH_RESULTS, { pageSource: 'discover', properties: { ...searchProperties(), count: page.items.length } });
      if (reset && !page.items.length) track(EVENT_NAMES.SEARCH_EMPTY, { pageSource: 'discover', properties: searchProperties() });
    }
  } catch { if (version === authorGeneration) { authorsFailed.value = true; track(EVENT_NAMES.SEARCH_FAILED, { pageSource: 'discover', properties: searchProperties() }); } }
  finally { if (version === authorGeneration) authorsLoading.value = false; }
}
function navigate(keyword = query.value, category = selectedCategory.value, tag = selectedTag.value, kind = searchKind.value, searching = true, sort = selectedSort.value, mediaType = contentType.value) {
  const next = { ...route.query };
  for (const key of ['q', 'category', 'tag', 'kind', 'search', 'sort', 'contentType']) delete next[key];
  if (keyword.trim()) next.q = keyword.trim();
  if (category) next.category = category;
  if (tag) next.tag = tag;
  if (kind === 'authors') next.kind = 'authors';
  if (searching) next.search = '1';
  if (sort !== 'COMPREHENSIVE') next.sort = sort;
  if (kind === 'content' && mediaType !== 'ALL') next.contentType = mediaType;
  return router.push({ name: 'discover', query: next });
}
function applySearch() {
  rememberSearch(draftQuery.value);
  track(EVENT_NAMES.SEARCH_SUBMITTED, { pageSource: 'discover', properties: { ...searchProperties(), queryLength: draftQuery.value.trim().length } });
  if (draftQuery.value.trim() === query.value && resultOpen.value) return refresh();
  return navigate(draftQuery.value);
}
function applyCategory(id: string) { return navigate(query.value, selectedCategory.value === id ? '' : id, selectedTag.value, 'content'); }
function applyTag(id: string) { return navigate(query.value, selectedCategory.value, selectedTag.value === id ? '' : id, 'content'); }
function selectSearchKind(kind: 'content' | 'authors') {
  rememberSearch(draftQuery.value);
  if (draftQuery.value.trim()) track(EVENT_NAMES.SEARCH_SUBMITTED, { pageSource: 'discover', properties: { ...searchProperties(), kind, queryLength: draftQuery.value.trim().length } });
  return navigate(draftQuery.value, '', '', kind);
}
function resetFilters() { draftQuery.value = ''; summaryOpen.value = false; return navigate('', '', '', 'content', false, 'COMPREHENSIVE', 'ALL'); }
function clearKeyword() {
  draftQuery.value = '';
  if (resultOpen.value) void navigate('', selectedCategory.value, selectedTag.value);
  searchInput.value?.focus({ preventScroll: true });
}
function clearContentFilters() { return navigate(query.value, '', '', 'content', true, selectedSort.value, 'ALL'); }
function applyContentType(type: typeof contentType.value) { return navigate(query.value, selectedCategory.value, selectedTag.value, 'content', true, selectedSort.value, type); }
function editKeyword() {
  if (scroll.value) scroll.value.scrollTop = 0;
  searchInput.value?.focus({ preventScroll: true });
  searchInput.value?.select();
}
function applySort(sort: DiscoverSort) { return navigate(query.value, selectedCategory.value, selectedTag.value, 'content', true, sort); }
async function refresh() {
  if (searchKind.value === 'authors') await loadAuthors(true);
  else await loadDiscover();
}
function openVideo(video: FeedItem) {
  saveScroll();
  if (resultOpen.value) track(EVENT_NAMES.SEARCH_RESULT_CLICKED, { objectId: video.id, pageSource: 'discover', properties: { ...searchProperties(), targetType: video.videoUrl ? 'VIDEO' : 'ARTICLE' } });
  router.push(video.videoUrl ? { name: 'feed', query: { video: video.id } } : { name: 'content-detail', params: { contentId: video.id } });
}
function openAuthor(id: string) {
  saveScroll();
  track(EVENT_NAMES.SEARCH_RESULT_CLICKED, { objectId: id, pageSource: 'discover', properties: { ...searchProperties(), targetType: 'AUTHOR' } });
  router.push({ name: 'author', params: { userId: id } });
}
function saveScroll() {
  if (route.name === 'discover' && scroll.value) savedScroll = scroll.value.scrollTop;
}
function primaryCategory(video: FeedItem) { return video.categories?.[0]?.name ?? '未分类'; }
function coverUrl(video: FeedItem) { return video.cover?.coverUrl ?? richTextImages(video.description)[0] ?? null; }
function mediaLabel(video: FeedItem) { return video.videoUrl ? video.durationMs == null ? '视频' : formatDuration(video.durationMs) : '图文'; }
// URL is the source of truth: reload and browser back restore the same search.
watch(() => route.name === 'discover' ? JSON.stringify(route.query) : null, async (key, previous) => {
  if (key === null) return;
  if (key === lastQueryKey) return;
  lastQueryKey = key;
  query.value = value('q'); draftQuery.value = query.value;
  selectedCategory.value = value('category'); selectedTag.value = value('tag');
  searchKind.value = value('kind') === 'authors' ? 'authors' : 'content';
  contentType.value = searchKind.value === 'content' && value('contentType') === 'VIDEO' ? 'VIDEO' : searchKind.value === 'content' && value('contentType') === 'ARTICLE' ? 'ARTICLE' : 'ALL';
  selectedSort.value = value('sort') === 'LATEST' ? 'LATEST' : value('sort') === 'HOT' ? 'HOT' : 'COMPREHENSIVE';
  resultOpen.value = Boolean(value('search') || query.value || selectedCategory.value || selectedTag.value || searchKind.value === 'authors' || contentType.value !== 'ALL');
  generation++; authorGeneration++;
  refreshing.value = false; authorsLoading.value = false; failed.value = false;
  resultPage.value = 1; hasMore.value = false; loadingMore.value = false; moreFailed.value = false;
  results.value = []; authors.value = [];
  if (previous != null) { savedScroll = 0; if (scroll.value) scroll.value.scrollTop = 0; }
  if (!baselineLoaded && resultOpen.value) await loadBaseline();
  if (lastQueryKey !== key) return;
  if (searchKind.value === 'authors') { loading.value = false; await loadAuthors(true); }
  else await loadDiscover();
}, { immediate: true });
onActivated(async () => { await nextTick(); if (scroll.value) scroll.value.scrollTop = savedScroll; });
onBeforeUnmount(() => { generation++; authorGeneration++; });
</script>

<template>
  <div class="page discover-page">
    <div ref="scroll" class="discover-scroll" @scroll="saveScroll">
      <div class="discover-container">
        <header class="discover-titlebar">
          <h1>首页</h1>
          <form class="inline-search" role="search" @submit.prevent="applySearch">
            <div class="search-field"><van-icon name="search" aria-hidden="true" /><input ref="searchInput" v-model="draftQuery" type="search" maxlength="60" :aria-label="searchKind === 'authors' ? '作者关键词' : '内容关键词'" :placeholder="searchKind === 'authors' ? '搜索作者昵称 / videoshare号' : '搜索内容 / 作者'" /><button v-if="draftQuery || query" type="button" class="clear-keyword" aria-label="清空关键词" @click="clearKeyword"><van-icon name="cross" aria-hidden="true" /></button></div>
            <button type="submit">查询</button>
          </form>
        </header>
        <SegmentControl class="search-kind" label="搜索类型" :options="searchKindOptions" :value="searchKind" @change="selectSearchKind($event as 'content' | 'authors')" />
        <section v-if="recentSearches.length" class="recent-searches" aria-label="最近搜索"><div class="recent-heading"><h2>最近搜索</h2><button type="button" @click="clearSearchHistory">清空记录</button></div><div class="recent-words"><button v-for="word in recentSearches" :key="word" type="button" @click="useRecentSearch(word)">{{ word }}</button></div></section>
        <div v-if="loading" class="discover-skeleton" role="status" :aria-label="resultOpen ? '正在加载搜索结果' : '正在加载首页'">
          <span class="visually-hidden">正在加载内容…</span>
          <div class="skeleton-chips" aria-hidden="true"><span v-for="index in 6" :key="index" class="skeleton-block" /></div>
          <div :class="resultOpen ? 'skeleton-results' : 'skeleton-cards'" aria-hidden="true">
            <div v-for="index in 5" :key="index" class="skeleton-item"><span class="skeleton-cover skeleton-block" /><div class="skeleton-copy"><span class="skeleton-line skeleton-block" /><span class="skeleton-line short skeleton-block" /></div></div>
          </div>
        </div>
        <div v-else class="dashboard-grid" :class="{ 'has-results': resultOpen }">
          <section v-if="searchKind === 'content'" class="discover-section filter-section" aria-label="内容筛选">
            <header class="section-heading filter-heading"><h2>内容分类</h2><small>{{ data.categories.length }} 个分类</small></header>
            <div class="category-grid"><button v-for="category in data.categories" :key="category.id" :class="{ active: selectedCategory === category.id }" :aria-pressed="selectedCategory === category.id" @click="applyCategory(category.id)"><van-icon :name="categoryIcons[category.name] ?? 'apps-o'" aria-hidden="true" /><span><strong>{{ category.name }}</strong><small>{{ category.videoCount }} 条内容</small></span></button></div>
            <h3 class="visually-hidden">热门标签</h3>
            <div class="tag-index"><button v-for="tag in data.tags" :key="tag.id" :class="{ active: selectedTag === tag.id }" :aria-pressed="selectedTag === tag.id" @click="applyTag(tag.id)"># {{ tag.name }}</button></div>
            <p v-if="baselineFailed" class="filter-warning">分类加载失败 <button @click="loadBaseline">重试</button></p>
          </section>
          <section v-if="resultOpen" class="inline-results" aria-labelledby="discover-result-title" :aria-busy="refreshing || authorsLoading">
            <div v-if="activeFilterCount" class="active-filters">
              <button v-if="query" @click="navigate('', selectedCategory, selectedTag)">关键词：{{ query }} <span aria-hidden="true">×</span></button>
              <button v-if="selectedCategory" @click="navigate(query, '', selectedTag)">分类：{{ categoryLabel }} <span aria-hidden="true">×</span></button>
              <button v-if="selectedTag" @click="navigate(query, selectedCategory, '')"># {{ tagLabel }} <span aria-hidden="true">×</span></button>
              <button v-if="contentType !== 'ALL'" @click="applyContentType('ALL')">{{ contentType === 'VIDEO' ? '视频' : '图文' }} <span aria-hidden="true">×</span></button>
              <button v-if="selectedCategory || selectedTag || contentType !== 'ALL'" class="clear-filters" @click="clearContentFilters">清除筛选</button>
            </div>
            <header class="section-heading result-heading"><h2 id="discover-result-title">{{ resultTitle }}</h2><div class="result-actions"><button class="return-home" @click="resetFilters"><van-icon name="arrow-left" aria-hidden="true" /> 返回首页</button><button class="refresh-results" :disabled="refreshing || authorsLoading" @click="refresh"><van-icon name="replay" aria-hidden="true" /> 刷新</button></div></header>
            <SegmentControl v-if="searchKind === 'content'" class="result-sort" label="结果排序" :options="sortOptions" :value="selectedSort" @change="applySort($event as DiscoverSort)" />
            <SegmentControl v-if="searchKind === 'content'" class="media-type" label="内容类型" :options="contentTypeOptions" :value="contentType" @change="applyContentType($event as typeof contentType)" />
            <p class="result-status" role="status">{{ refreshing || authorsLoading ? '正在查询…' : searchKind === 'content' ? `已显示 ${results.length} 条内容` : `已显示 ${authors.length} 位作者` }}<span v-if="updatedAt && searchKind === 'content' && !failed"> · 更新于 {{ updatedAt }}</span></p>
            <div v-if="failed" class="query-error" role="alert">查询失败，请重试。<button @click="refresh">重试查询</button></div>
        <div v-if="searchKind === 'content' ? refreshing && !results.length : authorsLoading && !authors.length" class="skeleton-results result-skeleton" role="status" aria-label="正在加载搜索结果">
          <div v-for="index in 4" :key="index" class="skeleton-item" aria-hidden="true"><span class="skeleton-cover skeleton-block" /><div class="skeleton-copy"><span class="skeleton-line skeleton-block" /><span class="skeleton-line short skeleton-block" /></div></div>
        </div>
        <FadeContent v-else-if="searchKind === 'authors'" class="author-results">
          <button v-for="author in authors" :key="author.id" class="author-result" @click="openAuthor(author.id)">
            <AvatarImage :src="author.avatarUrl" :alt="author.nickname" /><span><strong>{{ author.nickname }}</strong><small>videoshare号: {{ author.id }}</small><small>{{ author.worksCount }} 件作品<template v-if="author.following"> · 已关注</template></small></span><van-icon name="arrow" />
          </button>
          <p v-if="authorsLoading" role="status">查询中…</p>
          <button v-else-if="authorsFailed" class="author-more" @click="loadAuthors()">加载失败，点击重试</button>
          <p v-else-if="!query">请输入作者昵称或 videoshare 号</p>
          <div v-else-if="!authors.length" class="filter-empty"><p>没有找到匹配的作者</p><p class="empty-hint">试试更短的昵称，或输入完整的 videoshare 号。</p><button @click="editKeyword">修改关键词</button></div>
          <button v-else-if="!authorsFinished" class="author-more" @click="loadAuthors()">加载更多作者</button>
        </FadeContent>
        <Masonry v-else-if="results.length" class="video-results" :class="{ refreshing }" :active="masonry">
          <div class="layout-tools"><button class="squish-switch" type="button" role="switch" :aria-checked="masonry" @click="masonry = !masonry"><span aria-hidden="true" />瀑布流视图</button></div>
          <button v-for="video in results" :key="video.id" class="video-result" @click="openVideo(video)">
            <span class="result-cover"><VideoThumbnail :cover-url="coverUrl(video)" :video-url="video.videoUrl" :alt="video.title" /><i>{{ mediaLabel(video) }}</i></span>
            <span class="result-copy"><strong>{{ video.title }}</strong><small>{{ video.author.nickname }} · {{ primaryCategory(video) }}</small><span class="result-tags"><em v-for="tag in video.tags.slice(0, 3)" :key="tag.id">{{ tag.name }}</em></span></span>
            <span class="result-meta"><b><van-icon name="play-circle-o" aria-hidden="true" /> {{ formatCount(video.stats.playCount) }} 次播放</b><small>{{ timeAgo(video.publishedAt) }}</small><van-icon name="arrow" aria-hidden="true" /></span>
          </button>
        </Masonry>
        <div v-else-if="!refreshing && !failed" class="filter-empty"><van-icon name="filter-o" aria-hidden="true" /><p>没有符合条件的内容</p><p class="empty-hint">试试更短的关键词，或清除分类和标签后再搜索。</p><div class="empty-actions"><button @click="editKeyword">修改关键词</button><button v-if="selectedCategory || selectedTag" @click="clearContentFilters">清除筛选条件</button></div></div>

            <div v-if="searchKind === 'content' && results.length && !failed" class="result-pagination">
              <button v-if="hasMore" :disabled="loadingMore || refreshing" @click="loadDiscover(true)">
                {{ loadingMore ? '正在加载…' : moreFailed ? '加载失败，点击重试' : '加载更多' }}
              </button>
              <p v-else-if="!refreshing">已显示全部结果</p>
            </div>

          </section>
          <div v-if="!resultOpen && failed" class="discover-state" role="alert"><strong>首页暂时无法加载</strong><p>请稍后重试，或检查网络连接</p><button @click="refresh">重新加载</button></div>
          <section v-if="!resultOpen" class="discover-section ranking-section" aria-labelledby="ranking-title">
            <header class="section-heading"><h2 id="ranking-title">热门排行</h2><small>近期热度 · 新内容推荐</small></header>
            <FadeContent v-if="data.ranking.length"><ol class="ranking-grid">
              <li v-for="(video, index) in data.ranking" :key="video.id" :class="{ featured: index === 0 }">
                <button class="ranking-entry" type="button" :aria-label="`第 ${index + 1} 名：${video.title}`" @click="openVideo(video)">
                  <span class="ranking-cover">
                    <VideoThumbnail :cover-url="coverUrl(video)" :video-url="video.videoUrl" :alt="video.title" />
                    <b class="rank-number" aria-hidden="true">{{ index + 1 }}</b>
                    <i class="media-duration">{{ mediaLabel(video) }}</i>
                  </span>
                  <span class="ranking-copy">
                    <strong :title="video.title">{{ video.title }}</strong>
                    <small class="ranking-author">{{ video.author.nickname }}</small>
                    <span class="ranking-meta"><small>{{ primaryCategory(video) }}</small><em>{{ formatCount(video.stats.playCount) }} 次播放</em></span>
                  </span>
                </button>
              </li>
            </ol></FadeContent>
            <p v-else class="inline-empty">暂无排行数据</p>
          </section>

          <section v-if="!resultOpen" class="content-summary" aria-labelledby="summary-title">
            <header>
              <div><h2 id="summary-title">内容概览</h2><p class="summary-glance"><CountUp :value="data.summary.totalVideos" /> 条内容 · 今日新增 {{ data.summary.todayNewCount }}</p></div>
              <button class="summary-toggle" type="button" :aria-label="summaryOpen ? '收起内容概览' : '展开内容概览'" :aria-expanded="summaryOpen" aria-controls="summary-body" @click="summaryOpen = !summaryOpen"><van-icon name="arrow-down" aria-hidden="true" /></button>
            </header>
            <div id="summary-body" class="summary-body" :class="{ open: summaryOpen }">
              <dl class="summary-metrics">
                <div><dt>内容总数</dt><dd><CountUp :value="data.summary.totalVideos" /></dd></div>
                <div><dt>累计观看</dt><dd>{{ totalWatchTimeLabel }}</dd></div>
                <div><dt>有效播放</dt><dd>{{ formatCount(data.summary.effectivePlayCount) }}</dd></div>
                <div><dt>平均观看</dt><dd>{{ formatDuration(data.summary.averageWatchTimeMs) }}</dd></div>
                <div><dt>今日新增</dt><dd>{{ data.summary.todayNewCount }}</dd></div>
              </dl>
              <details class="duration-details">
                <summary>观看时长分布<van-icon name="arrow-down" aria-hidden="true" /></summary>
                <ul v-if="data.durationStats.length" class="duration-distribution">
                  <li v-for="item in data.durationStats" :key="item.code">
                    <span>{{ item.label }}</span><i aria-hidden="true"><b :style="{ width: `${(item.sessionCount / maxDurationSessionCount) * 100}%` }" /></i><strong>{{ item.sessionCount.toLocaleString('zh-CN') }}</strong>
                  </li>
                </ul>
                <p v-else class="inline-empty">暂无观看时长数据</p>
              </details>
            </div>
          </section>

        </div>
      </div>
    </div>
  </div>
</template>
<style scoped>
.layout-tools { column-span:all; display:flex; justify-content:flex-end; margin:8px 0; }
.squish-switch { display:flex; align-items:center; gap:8px; min-height:44px; font-size:12px; color:var(--text-muted); }
.squish-switch span { width:36px; height:22px; padding:3px; border-radius:12px; background:var(--line); }
.squish-switch span::before { content:''; display:block; width:16px; height:16px; border-radius:50%; background:var(--paper); transition:transform 220ms cubic-bezier(.34,1.56,.64,1); }
.squish-switch[aria-checked=true] span {background:var(--accent);}.squish-switch[aria-checked=true] span::before {transform:translateX(14px);}
@media(prefers-reduced-motion:reduce) { .squish-switch span::before {transition:none;} }

.discover-page {
  --ink: #07111f; --navy: #0e1b2b; --accent: #2563eb; --paper: #fff;
  --soft: #f3f6fa; --muted: #64748b; --line: #d9e1ea;
  color: var(--ink); background: var(--paper); font-variant-numeric: tabular-nums;
}
.discover-scroll { position: absolute; inset: 0 0 calc(80px + env(safe-area-inset-bottom)); overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; }
.discover-container { max-width: 720px; margin: 0 auto; padding: max(24px, env(safe-area-inset-top)) 16px 24px; }
.discover-titlebar { display: grid; gap: 16px; margin-bottom: 20px; }
.discover-titlebar h1 { margin: 0; font-size: 26px; line-height: 1.25; font-weight: 700; letter-spacing: -.025em; }
.visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }
.dashboard-grid { display: grid; gap: 24px; }
.section-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
.section-heading h2 { margin: 0; font-size: 20px; line-height: 1.4; font-weight: 700; letter-spacing: -.02em; }
.section-heading small { color: var(--muted); font-size: 12px; }
.filter-heading { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
.category-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.category-grid button { display: flex; align-items: center; gap: 7px; min-height: 44px; min-width: 0; padding: 8px; border: 1px solid transparent; border-radius: 8px; background: var(--soft); text-align: left; }
.category-grid button > .van-icon { flex-shrink: 0; color: var(--muted); font-size: 18px; }
.category-grid button strong { display: block; font-size: 13px; line-height: 1.4; font-weight: 600; overflow-wrap: anywhere; }
.category-grid button small { display: none; margin-top: 4px; color: var(--muted); font-size: 12px; }
.category-grid button.active { border-color: #bdd4ff; color: var(--accent); background: #edf4ff; }
.category-grid button.active > .van-icon { color: var(--accent); }
.tag-index { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.tag-index button { min-height: 44px; padding: 0 12px; border: 1px solid var(--line); border-radius: 22px; color: var(--muted); background: var(--paper); font-size: 13px; }
.tag-index button.active { border-color: var(--accent); color: var(--accent); background: #edf4ff; }
.ranking-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; padding: 0; margin: 0; list-style: none; }
.ranking-grid li { min-width: 0; }
.ranking-grid .featured { grid-column: 1 / -1; }
.ranking-entry { display: block; width: 100%; min-width: 0; text-align: left; }
.ranking-cover { position: relative; display: block; aspect-ratio: 16 / 10; margin-bottom: 10px; overflow: hidden; border-radius: 8px; background: var(--soft); }
.rank-number { position: absolute; left: 0; top: 0; display: grid; place-items: center; min-width: 24px; height: 26px; padding: 0 5px; border-radius: 0 0 6px 0; background: #52657e; color: var(--paper); font-size: 14px; }
.media-duration { position: absolute; right: 6px; bottom: 6px; padding: 3px 5px; border-radius: 4px; color: var(--paper); background: #07111fcc; font-style: normal; font-size: 12px; }
.ranking-copy { display: block; min-width: 0; }
.ranking-copy > strong { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; font-size: 16px; line-height: 1.5; font-weight: 600; overflow-wrap: anywhere; }
.ranking-author { display: block; margin-top: 6px; color: var(--muted); font-size: 12px; line-height: 1.5; overflow-wrap: anywhere; }
.ranking-meta { display: flex; flex-wrap: wrap; gap: 4px 10px; margin-top: 6px; color: var(--muted); line-height: 1.5; }
.ranking-meta small, .ranking-meta em { font-size: 12px; font-style: normal; }
.ranking-grid .featured .ranking-entry { display: block; }
.featured .ranking-cover { aspect-ratio: 16 / 9; margin-bottom: 10px; }
.featured .ranking-cover :deep(img) { object-position: center 55%; }
.featured .rank-number { min-width: 32px; height: 34px; background: var(--accent); font-size: 18px; }
.content-summary { padding: 12px 14px; border: 1px solid var(--line); border-radius: 10px; background: var(--paper); }
.content-summary > header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.content-summary h2 { margin: 0; font-size: 16px; line-height: 1.5; font-weight: 600; }
.summary-glance { margin: 4px 0 0; color: var(--muted); font-size: 12px; line-height: 1.5; }
.summary-toggle { display: grid; place-items: center; flex-shrink: 0; width: 44px; height: 44px; border-radius: 8px; color: var(--muted); }
.summary-toggle[aria-expanded="true"] > .van-icon { transform: rotate(180deg); }
.summary-body { display: none; }
.summary-body.open { display: block; }
.summary-metrics { display: grid; gap: 16px; padding: 20px 0; margin: 0; }
.summary-metrics > div { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.summary-metrics dt { color: var(--muted); font-size: 14px; }
.summary-metrics dd { margin: 0; font-size: 16px; font-weight: 600; }
.duration-details { border-top: 1px solid var(--line); }
.duration-details summary { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 48px; padding-top: 8px; font-size: 14px; cursor: pointer; list-style: none; }
.duration-details summary::-webkit-details-marker { display: none; }
.duration-details summary > .van-icon { color: var(--muted); }
.duration-details[open] summary > .van-icon { transform: rotate(180deg); }
.duration-distribution { display: grid; gap: 14px; margin: 16px 0 8px; padding: 0; list-style: none; }
.duration-distribution li { display: grid; grid-template-columns: 70px minmax(0, 1fr) 32px; gap: 8px; align-items: center; font-size: 12px; color: var(--muted); }
.duration-distribution i { height: 6px; overflow: hidden; border-radius: 3px; background: var(--soft); }
.duration-distribution i b { display: block; height: 100%; border-radius: 3px; background: var(--accent); }
.duration-distribution strong { color: var(--ink); font-weight: 600; text-align: right; }
.inline-empty { margin: 16px 0; padding: 20px 0; color: var(--muted); font-size: 14px; text-align: center; }
.discover-state { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; min-height: 360px; color: var(--muted); font-size: 14px; text-align: center; }
.skeleton-block { display: block; border-radius: 8px; background: linear-gradient(100deg, var(--soft), #e6ecf3, var(--soft)); }
.skeleton-chips { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-bottom: 24px; }
.skeleton-chips > span { height: 44px; }
.skeleton-cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.skeleton-cards > .skeleton-item:first-child { grid-column: 1 / -1; }
.skeleton-cover { aspect-ratio: 16 / 10; }
.skeleton-copy { display: grid; align-content: center; gap: 12px; padding: 10px 0; min-width: 0; }
.skeleton-line { height: 18px; }
.skeleton-line.short { width: 60%; }
.skeleton-results .skeleton-item { display: grid; grid-template-columns: 104px minmax(0, 1fr); gap: 12px; padding: 16px 0; border-bottom: 1px solid var(--line); }
.discover-state > .van-icon { color: var(--accent); font-size: 28px; }
.discover-state strong { color: var(--ink); font-size: 16px; }
.discover-state p { margin: 0; }
.discover-state button, .filter-empty button, .author-more { min-height: 44px; padding: 0 16px; border: 1px solid var(--line); border-radius: 8px; color: var(--accent); background: var(--paper); font-size: 14px; }
.video-result { display: grid; grid-template-columns: 104px minmax(0, 1fr); gap: 12px; width: 100%; padding: 16px 0; border-bottom: 1px solid var(--line); text-align: left; }
.result-cover { position: relative; display: block; aspect-ratio: 16 / 10; overflow: hidden; border-radius: 8px; background: var(--soft); }
.result-cover > i { position: absolute; right: 4px; bottom: 4px; padding: 2px 4px; border-radius: 3px; color: var(--paper); background: #07111fcc; font-size: 12px; font-style: normal; }
.result-copy { min-width: 0; }
.result-copy > strong { display: block; font-size: 16px; line-height: 1.5; font-weight: 600; overflow-wrap: anywhere; }
.result-copy > small { display: block; margin-top: 6px; color: var(--muted); font-size: 12px; line-height: 1.5; overflow-wrap: anywhere; }
.result-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.result-meta { grid-column: 2; display: flex; flex-wrap: wrap; gap: 8px 12px; color: var(--muted); font-size: 12px; }
.result-meta b { font-weight: 400; }
.result-meta small { font-size: inherit; }
.result-meta > .van-icon { display: none; }
.video-results.refreshing { opacity: .6; }
.author-result { display: grid; grid-template-columns: 44px minmax(0, 1fr) 20px; gap: 12px; align-items: center; width: 100%; min-height: 80px; padding: 14px 0; border-bottom: 1px solid var(--line); text-align: left; }
.author-result > img { width: 44px; height: 44px; border-radius: 50%; }
.author-result > span { min-width: 0; }
.author-result strong { display: block; overflow-wrap: anywhere; font-size: 16px; }
.author-result small { display: block; margin-top: 4px; overflow-wrap: anywhere; color: var(--muted); font-size: 12px; }
.author-result > .van-icon { color: var(--muted); }
.author-results > p, .filter-empty { color: var(--muted); font-size: 14px; text-align: center; }
.author-more { display: block; margin: 16px auto; }
.filter-empty { padding: 32px 0; }
.filter-empty > .van-icon { font-size: 28px; }
.empty-hint { margin: 8px 0 20px; line-height: 1.7; }
.empty-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 12px; }
.discover-page button, .duration-details summary { transition: background-color .16s ease, border-color .16s ease; }
.discover-page button:focus-visible, .duration-details summary:focus-visible, .discover-page input:focus-visible, .discover-page select:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
.result-dialog:focus { outline: none; }
@media (hover: hover) {
  .category-grid button:hover, .tag-index button:hover, .header-search:hover, .summary-toggle:hover { background: #edf4ff; border-color: #bdd4ff; }
  .ranking-entry:hover .ranking-copy > strong, .video-result:hover .result-copy > strong { color: var(--accent); }
}
@media (min-width: 600px) and (max-width: 959px) {
  .category-grid { grid-template-columns: repeat(6, minmax(0, 1fr)); }
  .category-grid button { justify-content: center; }
  .ranking-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .ranking-grid .featured { grid-column: 1 / -1; }
}
@media (min-width: 960px) {
  .discover-page { background: var(--soft); }
  .discover-scroll { bottom: 0; }
  .discover-container { max-width: 1120px; padding: 32px 32px 48px; }
  .discover-titlebar { grid-template-columns: 1fr minmax(280px, 480px); align-items: center; margin-bottom: 28px; }
  .discover-titlebar h1 { font-size: 28px; }
  .dashboard-grid { grid-template-columns: minmax(0, 1fr) 264px; grid-template-rows: auto 1fr; grid-template-areas: 'ranking filters' 'ranking summary'; gap: 20px 24px; align-items: start; }
  .filter-section { grid-area: filters; padding: 20px; border: 1px solid var(--line); border-radius: 12px; background: var(--paper); }
  .filter-heading { position: static; width: auto; height: auto; overflow: visible; clip-path: none; }
  .filter-heading small { display: none; }
  .category-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .category-grid button { min-height: 70px; padding: 10px; }
  .category-grid button strong { font-size: 14px; }
  .category-grid button small { display: block; }
  .tag-index { margin-top: 16px; }
  .ranking-section { grid-area: ranking; padding: 20px; border: 1px solid var(--line); border-radius: 12px; background: var(--paper); }
  .ranking-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px 16px; }
  .ranking-grid .featured { grid-column: 1 / -1; }
  .ranking-entry { display: block; }
  .ranking-cover { aspect-ratio: 16 / 9; margin-bottom: 10px; }
  .featured .ranking-cover { aspect-ratio: 2.4 / 1; }
  .featured .ranking-copy > strong { font-size: 18px; }
  .content-summary { grid-area: summary; padding: 20px; }
  .content-summary h2 { font-size: 20px; font-weight: 700; }
  .summary-metrics { gap: 20px; }
  .summary-metrics dt { font-size: 13px; }



  .video-result { grid-template-columns: 144px minmax(0, 1fr) 120px; align-items: center; gap: 16px; }
  .skeleton-results .skeleton-item { grid-template-columns: 144px minmax(0, 1fr); gap: 16px; }
  .result-meta { grid-column: auto; display: grid; justify-items: end; }
}
@media (max-width: 359px) {
  .category-grid button { gap: 5px; padding: 6px; }
  .category-grid button > .van-icon { font-size: 16px; }
  .category-grid button strong { font-size: 12px; }
}
@media (prefers-reduced-motion: reduce) { .discover-page button, .duration-details summary { transition: none; } }

.inline-search { display:flex; gap:8px; min-width:0; }
.inline-search .search-field { flex:1; min-width:0; display:flex; align-items:center; gap:10px; padding:0 12px; background:var(--soft); border:1px solid var(--line); border-radius:8px; }
.inline-search .search-field > .van-icon { flex-shrink:0; color:var(--muted); font-size:20px; }
.inline-search input { flex:1; width:100%; min-width:0; height:46px; border:0; background:transparent; color:var(--ink); font-size:16px; }
.inline-search input::-webkit-search-cancel-button { -webkit-appearance:none; }
.inline-search button { min-width:64px; padding:0 14px; border-radius:8px; color:white; background:var(--accent); font-size:14px; }
.inline-search .clear-keyword { flex-shrink:0; min-width:44px; height:44px; padding:0; margin-right:-8px; background:transparent; color:var(--muted); }
.search-kind { margin:0 0 20px; }
.inline-results { min-width:0; }
.active-filters { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:16px; }
.active-filters button { min-height:44px; padding:8px 12px; border-radius:22px; color:var(--accent); background:#edf4ff; font-size:13px; overflow-wrap:anywhere; }
.active-filters .clear-filters { color:var(--muted); background:var(--paper); border:1px solid var(--line); }
.refresh-results { min-height:44px; color:var(--accent); font-size:14px; padding:0 12px; border-radius:8px; background:var(--soft); }
.result-heading { flex-wrap:wrap; align-items:center; }
.result-heading h2 { flex:1; min-width:0; overflow-wrap:anywhere; }
.result-actions { display:flex; flex-wrap:wrap; gap:8px; }
.return-home { min-height:44px; padding:0 12px; border:1px solid var(--line); border-radius:8px; color:var(--muted); background:var(--paper); font-size:14px; }
.result-sort { margin-bottom:16px; }
.result-pagination { padding:20px 0; text-align:center; }
.result-pagination button { min-height:44px; padding:0 24px; border:1px solid var(--line); border-radius:8px; color:var(--accent); background:var(--paper); }
.result-pagination p { color:var(--muted); font-size:13px; }
.result-status { margin:-8px 0 8px; color:var(--muted); font-size:12px; line-height:1.6; }
.query-error, .filter-warning { padding:12px; color:#9f1239; background:#fff1f2; border-radius:8px; font-size:14px; }
.query-error button, .filter-warning button { min-height:44px; margin-left:12px; text-decoration:underline; }
.result-tags { display:flex; flex-wrap:wrap; gap:6px; }
.result-tags em { color:var(--muted); background:var(--soft); padding:4px 8px; border-radius:4px; font-size:12px; font-style:normal; }
@media(min-width:960px) { .has-results { grid-template-areas:'filters results'; grid-template-columns:264px minmax(0,1fr); grid-template-rows:auto; } .inline-results { grid-area:results; } }

.media-type { margin:-4px 0 16px; }
.recent-searches { margin:0 0 20px; min-width:0; }
.recent-heading { display:flex; justify-content:space-between; align-items:center; gap:12px; }
.recent-heading h2 { margin:0; color:var(--text-muted); font-size:13px; font-weight:500; }
.recent-heading button { min-height:44px; padding:0 8px; color:var(--text-muted); font-size:13px; }
.recent-words { display:flex; flex-wrap:wrap; gap:8px; }
.recent-words button { min-height:44px; max-width:100%; padding:8px 12px; border:1px solid var(--line); border-radius:8px; color:var(--ink); background:var(--soft); font-size:14px; overflow-wrap:anywhere; text-align:left; }
</style>
