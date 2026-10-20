import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createPinia } from 'pinia';
import { useAuthStore } from '../stores/auth';
import type { DiscoverResponse, FeedItem } from '../api/types';
const { getDiscover, searchAuthors, track } = vi.hoisted(() => ({ getDiscover: vi.fn(), searchAuthors: vi.fn(), track: vi.fn() }));
vi.mock('../api', () => ({ getDiscover, searchAuthors }));
vi.mock('../analytics', () => ({ EVENT_NAMES: { SEARCH_SUBMITTED: 'search_submitted', SEARCH_RESULTS: 'search_results_loaded', SEARCH_EMPTY: 'search_empty', SEARCH_FAILED: 'search_failed', SEARCH_RESULT_CLICKED: 'search_result_clicked' }, track }));
import DiscoverView from './DiscoverView.vue';
function video(id: string, title: string, categoryId: string, categoryName: string, tagId: string, tagName: string): FeedItem {
  return {
    id, title, description: null, durationMs: 240000, videoUrl: null,
    author: { id: '1', nickname: '作者', avatarUrl: null, following: false }, cover: null,
    categories: [{ id: categoryId, name: categoryName }], tags: [{ id: tagId, name: tagName }],
    stats: { playCount: 980, likeCount: 20, favoriteCount: 6, commentCount: 3, watchTimeMs: 45000 },
    publishedAt: new Date().toISOString(), viewerState: { liked: false, favorited: false },
  };
}

function response(videos: FeedItem[]): DiscoverResponse {
  return {
    summary: { totalVideos: videos.length, totalWatchTimeMs: videos.length * 45000, effectivePlayCount: videos.length * 2, averageWatchTimeMs: 22500, todayNewCount: videos.length },
    categories: [{ id: '10', name: '安全培训', videoCount: 1 }, { id: '20', name: '设备维护', videoCount: 1 }],
    durationStats: [{ code: 'FROM_10_TO_30_SECONDS', label: '10–30秒', sessionCount: videos.length }],
    tags: [{ id: '100', name: '入门' }, { id: '200', name: '点检' }],
    ranking: videos,
    videos,
    page: 1, hasMore: false,
  };
}


async function render(path = '/discover', attached = false) {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/discover', name: 'discover', component: DiscoverView },
    { path: '/content/:contentId', name: 'content-detail', component: { template: '<div />' } },
    { path: '/feed', name: 'feed', component: { template: '<div />' } },
    { path: '/author/:userId', name: 'author', component: { template: '<div />' } },
  ] });
  await router.push(path); await router.isReady();
  const wrapper = mount(DiscoverView, { attachTo: attached ? document.body : undefined, global: { plugins: [router, createPinia()], stubs: { 'van-icon': true, 'van-loading': true } } });
  await flushPromises();
  return { wrapper, router };
}
const sample = () => video('9', '安全操作指南', '10', '安全培训', '100', '入门');
describe('DiscoverView persisted inline search', () => {
  beforeEach(() => {
    localStorage.clear(); track.mockClear();
    getDiscover.mockReset().mockResolvedValue(response([sample()]));
    searchAuthors.mockReset().mockResolvedValue({ items: [], nextCursor: null });
  });
  it('renders backend ranking and expands summary without another request', async () => {
    const { wrapper } = await render();
    expect(wrapper.text()).toContain('热门排行');
    expect(wrapper.findAll('.ranking-entry')).toHaveLength(1);
    await wrapper.get('.summary-toggle').trigger('click');
    expect(wrapper.get('.summary-toggle').attributes('aria-expanded')).toBe('true');
    expect(getDiscover).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });
  it('opens article details and video feed through their existing routes', async () => {
    const { wrapper, router } = await render();
    await wrapper.get('.ranking-entry').trigger('click'); await flushPromises();
    expect(router.currentRoute.value.name).toBe('content-detail');
    expect(router.currentRoute.value.params.contentId).toBe('9');
    wrapper.unmount();
    getDiscover.mockResolvedValue(response([{ ...sample(), videoUrl: '/test.mp4' }]));
    const next = await render();
    await next.wrapper.get('.ranking-entry').trigger('click'); await flushPromises();
    expect(next.router.currentRoute.value.query.video).toBe('9');
    next.wrapper.unmount();
  });
  it('keeps category/tag selections in the URL and shows inline results', async () => {
    const { wrapper, router } = await render();
    await wrapper.get('.category-grid button').trigger('click'); await flushPromises();
    await wrapper.get('.tag-index button').trigger('click'); await flushPromises();
    await wrapper.get('input').setValue('安全'); await wrapper.get('form').trigger('submit'); await flushPromises();
    expect(router.currentRoute.value.query).toMatchObject({ q: '安全', category: '10', tag: '100' });
    expect(getDiscover).toHaveBeenLastCalledWith({ keyword: '安全', categoryId: '10', tagId: '100', limit: 20, page: 1, sort: 'COMPREHENSIVE' });
    expect(wrapper.find('.inline-results').exists()).toBe(true);
    expect(wrapper.find('[role=dialog]').exists()).toBe(false);
    expect(wrapper.findAll('.category-grid button')).toHaveLength(2);
    await wrapper.get('.active-filters button').trigger('click'); await flushPromises();
    expect(router.currentRoute.value.query.q).toBeUndefined();
    expect(router.currentRoute.value.query.category).toBe('10');
    await wrapper.get('.clear-filters').trigger('click'); await flushPromises();
    expect(router.currentRoute.value.query.category).toBeUndefined();
    expect(router.currentRoute.value.query.tag).toBeUndefined();
    expect(wrapper.find('.inline-results').exists()).toBe(true);
    await wrapper.get('.return-home').trigger('click'); await flushPromises();
    expect(router.currentRoute.value.query).toEqual({});
    expect(wrapper.find('.ranking-entry').exists()).toBe(true);
    wrapper.unmount();
  });
  it('clears the keyword without resetting filters or sorting and returns home explicitly', async () => {
    const { wrapper, router } = await render('/discover?q=安全&category=10&tag=100&sort=LATEST');
    await wrapper.get('.clear-keyword').trigger('click'); await flushPromises();
    expect(router.currentRoute.value.query).toMatchObject({ category: '10', tag: '100', sort: 'LATEST' });
    expect(router.currentRoute.value.query.q).toBeUndefined();
    expect((wrapper.get('input').element as HTMLInputElement).value).toBe('');
    expect(wrapper.find('.ranking-section').exists()).toBe(false);
    await wrapper.get('.return-home').trigger('click'); await flushPromises();
    expect(router.currentRoute.value.query).toEqual({});
    expect(wrapper.find('.ranking-section').exists()).toBe(true);
    expect(wrapper.find('.inline-results').exists()).toBe(false);
    wrapper.unmount();
  });
  it('renders author information and distinguishes articles, video duration and unknown duration', async () => {
    getDiscover.mockResolvedValue(response([sample(), { ...sample(), id: '10', videoUrl: '/test.mp4', durationMs: 65000 },
      { ...sample(), id: '11', videoUrl: '/test.mp4', durationMs: null }]));
    const { wrapper } = await render('/discover?q=安全');
    const items = wrapper.findAll('.video-result');
    expect(items[0].get('.result-copy > small').text()).toBe('作者 · 安全培训');
    expect(items.map(item => item.get('.result-cover > i').text())).toEqual(['图文', '01:05', '视频']);
    expect(wrapper.get('#discover-result-title').text()).toBe('搜索：安全');
    wrapper.unmount();
  });
  it('shows skeletons while loading and focuses the keyword editor from empty results', async () => {
    let resolveHome!: (value: DiscoverResponse) => void;
    getDiscover.mockImplementationOnce(() => new Promise(resolve => { resolveHome = resolve; }));
    const { wrapper, router } = await render('/discover', true);
    expect(wrapper.get('.discover-skeleton').attributes('role')).toBe('status');
    resolveHome(response([sample()])); await flushPromises();
    expect(wrapper.find('.discover-skeleton').exists()).toBe(false);

    let resolveSearch!: (value: DiscoverResponse) => void;
    getDiscover.mockImplementationOnce(() => new Promise(resolve => { resolveSearch = resolve; }));
    await wrapper.get('input').setValue('不存在'); await wrapper.get('form').trigger('submit'); await flushPromises();
    expect(wrapper.find('.result-skeleton').exists()).toBe(true);
    expect(wrapper.find('.filter-empty').exists()).toBe(false);
    resolveSearch(response([])); await flushPromises();
    expect(wrapper.find('.result-skeleton').exists()).toBe(false);
    expect(wrapper.get('.empty-hint').text()).toContain('更短的关键词');
    await wrapper.get('.empty-actions button').trigger('click');
    expect(document.activeElement).toBe(wrapper.get('input').element);
    expect((wrapper.get('input').element as HTMLInputElement).selectionStart).toBe(0);
    expect((wrapper.get('input').element as HTMLInputElement).selectionEnd).toBe(3);
    expect(router.currentRoute.value.query.q).toBe('不存在');
    wrapper.unmount();
  });
  it('restores a shared/reloaded query and refreshes without clearing filters', async () => {
    const { wrapper, router } = await render('/discover?q=安全&category=10&tag=100');
    expect((wrapper.get('input').element as HTMLInputElement).value).toBe('安全');
    expect(wrapper.get('.category-grid button').attributes('aria-pressed')).toBe('true');
    await wrapper.get('.refresh-results').trigger('click'); await flushPromises();
    expect(router.currentRoute.value.query).toMatchObject({ q: '安全', category: '10', tag: '100' });
    expect(getDiscover).toHaveBeenLastCalledWith({ keyword: '安全', categoryId: '10', tagId: '100', limit: 20, page: 1, sort: 'COMPREHENSIVE' });
    wrapper.unmount();
  });
  it('ignores stale responses when filters change quickly', async () => {
    const { wrapper } = await render();
    let resolveOld!: (value: DiscoverResponse) => void;
    getDiscover.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
    await wrapper.findAll('.category-grid button')[0].trigger('click'); await flushPromises();
    getDiscover.mockResolvedValue(response([{ ...sample(), title: '最新结果' }]));
    await wrapper.findAll('.category-grid button')[1].trigger('click'); await flushPromises();
    resolveOld(response([{ ...sample(), title: '过期结果' }])); await flushPromises();
    expect(wrapper.get('.video-results').text()).toContain('最新结果');
    expect(wrapper.get('.video-results').text()).not.toContain('过期结果');
    wrapper.unmount();
  });
  it('appends pages and resets pagination when switching sort without clearing filters', async () => {
    getDiscover.mockResolvedValue({ ...response([sample()]), hasMore: true });
    const { wrapper, router } = await render('/discover?q=安全&category=10&sort=LATEST');
    expect(wrapper.get('.result-sort .active').text()).toBe('最新');
    getDiscover.mockResolvedValue({ ...response([{ ...sample(), id: '10', title: '第二页' }]), page: 2 });
    await wrapper.get('.result-pagination button').trigger('click'); await flushPromises();
    expect(getDiscover).toHaveBeenLastCalledWith({ keyword: '安全', categoryId: '10', tagId: undefined, limit: 20, page: 2, sort: 'LATEST' });
    expect(wrapper.findAll('.video-result')).toHaveLength(2);
    expect(wrapper.text()).toContain('已显示全部结果');
    getDiscover.mockResolvedValue(response([{ ...sample(), title: '热度结果' }]));
    await wrapper.findAll('.result-sort button')[2].trigger('click'); await flushPromises();
    expect(router.currentRoute.value.query).toMatchObject({ q: '安全', category: '10', sort: 'HOT' });
    expect(getDiscover).toHaveBeenLastCalledWith({ keyword: '安全', categoryId: '10', tagId: undefined, limit: 20, page: 1, sort: 'HOT' });
    expect(wrapper.findAll('.video-result')).toHaveLength(1);
    expect(wrapper.text()).not.toContain('第二页');
    wrapper.unmount();
  });
  it('retains loaded results and retries the same page after a load-more failure', async () => {
    getDiscover.mockResolvedValue({ ...response([sample()]), hasMore: true });
    const { wrapper } = await render('/discover?q=安全');
    getDiscover.mockRejectedValueOnce(new Error('offline'));
    await wrapper.get('.result-pagination button').trigger('click'); await flushPromises();
    expect(wrapper.findAll('.video-result')).toHaveLength(1);
    expect(wrapper.get('.result-pagination button').text()).toContain('重试');
    getDiscover.mockResolvedValue({ ...response([{ ...sample(), id: '10' }]), page: 2 });
    await wrapper.get('.result-pagination button').trigger('click'); await flushPromises();
    expect(getDiscover.mock.lastCall?.[0].page).toBe(2);
    expect(wrapper.findAll('.video-result')).toHaveLength(2);
    wrapper.unmount();
  });
  it('keeps failed search criteria visible and supports retry', async () => {
    const { wrapper, router } = await render();
    getDiscover.mockRejectedValueOnce(new Error('offline'));
    await wrapper.get('input').setValue('安全'); await wrapper.get('form').trigger('submit'); await flushPromises();
    expect(wrapper.get('[role=alert]').text()).toContain('查询失败');
    expect(router.currentRoute.value.query.q).toBe('安全');
    await wrapper.get('.query-error button').trigger('click'); await flushPromises();
    expect(wrapper.find('.query-error').exists()).toBe(false);
    expect(wrapper.text()).toContain('安全操作指南'); wrapper.unmount();
  });
  it('searches authors and opens their profile', async () => {
    searchAuthors.mockResolvedValue({ items: [{ id: '22', nickname: '陈工', avatarUrl: null, worksCount: 5 }], nextCursor: null });
    const { wrapper, router } = await render();
    await wrapper.get('input').setValue('陈工');
    await wrapper.findAll('.search-kind button')[1].trigger('click'); await flushPromises();
    expect(searchAuthors).toHaveBeenCalledWith('陈工', null);
    expect(wrapper.find('.filter-section').exists()).toBe(false);
    await wrapper.get('.author-result').trigger('click'); await flushPromises();
    expect(router.currentRoute.value.params.userId).toBe('22'); wrapper.unmount();
  });
  it('shows empty state and restores criteria on browser back', async () => {
    const { wrapper, router } = await render();
    getDiscover.mockResolvedValue(response([]));
    await wrapper.get('input').setValue('不存在'); await wrapper.get('form').trigger('submit'); await flushPromises();
    expect(wrapper.text()).toContain('没有符合条件的内容');
    await wrapper.get('input').setValue('第二次'); await wrapper.get('form').trigger('submit'); await flushPromises();
    router.back(); await new Promise(resolve => setTimeout(resolve, 0)); await flushPromises();
    expect((wrapper.get('input').element as HTMLInputElement).value).toBe('不存在'); wrapper.unmount();
  });
  it('deduplicates recent searches, reuses them and clears the saved history', async () => {
    const { wrapper } = await render();
    for (const word of ['安全', '设备', '安全']) {
      await wrapper.get('input').setValue(word); await wrapper.get('form').trigger('submit'); await flushPromises();
    }
    expect(wrapper.findAll('.recent-words button').map(button => button.text())).toEqual(['安全', '设备']);
    expect(JSON.parse(localStorage.getItem('yingliu.search.history:guest')!)).toEqual(['安全', '设备']);
    await wrapper.findAll('.recent-words button')[1].trigger('click'); await flushPromises();
    expect((wrapper.get('input').element as HTMLInputElement).value).toBe('设备');
    await wrapper.get('.recent-heading button').trigger('click');
    expect(wrapper.find('.recent-searches').exists()).toBe(false);
    expect(localStorage.getItem('yingliu.search.history:guest')).toBeNull();
    wrapper.unmount();
  });
  it('passes media type to the server, preserves it across sort and clears it with other filters', async () => {
    const { wrapper, router } = await render('/discover?q=安全&category=10&contentType=VIDEO');
    expect(wrapper.get('.media-type .active').text()).toBe('视频');
    expect(getDiscover.mock.lastCall?.[0]).toMatchObject({ contentType: 'VIDEO', page: 1, categoryId: '10' });
    await wrapper.findAll('.result-sort button')[2].trigger('click'); await flushPromises();
    expect(router.currentRoute.value.query).toMatchObject({ contentType: 'VIDEO', sort: 'HOT' });
    await wrapper.findAll('.media-type button')[2].trigger('click'); await flushPromises();
    expect(getDiscover.mock.lastCall?.[0]).toMatchObject({ contentType: 'ARTICLE', page: 1, sort: 'HOT' });
    await wrapper.get('.clear-filters').trigger('click'); await flushPromises();
    expect(router.currentRoute.value.query.contentType).toBeUndefined();
    expect(router.currentRoute.value.query.q).toBe('安全');
    wrapper.unmount();
  });
  it('records empty results and clicks without sending raw search text', async () => {
    const { wrapper } = await render();
    getDiscover.mockResolvedValueOnce(response([]));
    await wrapper.get('input').setValue('私人搜索词'); await wrapper.get('form').trigger('submit'); await flushPromises();
    expect(track).toHaveBeenCalledWith('search_empty', expect.objectContaining({ properties: expect.objectContaining({ queryLength: 5 }) }));
    getDiscover.mockResolvedValueOnce(response([sample()]));
    await wrapper.get('.refresh-results').trigger('click'); await flushPromises();
    await wrapper.get('.video-result').trigger('click'); await flushPromises();
    expect(track).toHaveBeenCalledWith('search_result_clicked', expect.objectContaining({ objectId: '9' }));
    expect(JSON.stringify(track.mock.calls)).not.toContain('私人搜索词');
    wrapper.unmount();
  });
  it('switches recent history with the signed-in account without exposing another account history', async () => {
    localStorage.setItem('yingliu.search.history:guest', JSON.stringify(['游客记录']));
    localStorage.setItem('yingliu.search.history:7', JSON.stringify(['我的记录']));
    localStorage.setItem('yingliu.search.history:8', JSON.stringify(['另一账号记录']));
    const { wrapper } = await render();
    expect(wrapper.get('.recent-words').text()).toContain('游客记录');
    useAuthStore().$patch({ user: { id: '7' } }); await flushPromises();
    expect(wrapper.get('.recent-words').text()).toBe('我的记录');
    expect(wrapper.text()).not.toContain('另一账号记录');
    useAuthStore().$patch({ user: null }); await flushPromises();
    expect(wrapper.get('.recent-words').text()).toBe('游客记录');
    wrapper.unmount();
  });
});
