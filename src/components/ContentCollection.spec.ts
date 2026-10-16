import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const api = vi.hoisted(() => ({ getAuthorVideos: vi.fn(), getAuthorLikedVideos: vi.fn(), getFavoriteVideos: vi.fn(), getLikedVideos: vi.fn(), getHistory: vi.fn(), clearHistory: vi.fn() }));
const content = vi.hoisted(() => ({ getMyContentPage: vi.fn() }));
const push = vi.hoisted(() => vi.fn());
vi.mock('../api', () => api);
vi.mock('../api/content', () => content);
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }));
vi.mock('vant', () => ({ showToast: vi.fn(), showConfirmDialog: vi.fn() }));
import ContentCollection from './ContentCollection.vue';
enableAutoUnmount(afterEach);
const video = (id: string) => ({ id, title: `内容 ${id}`, description: '<p>图文正文</p>', videoUrl: null, cover: null, stats: { playCount: 3 } });
const mountList = (props: Record<string, unknown>) => mount(ContentCollection, { props: props as any,
  global: { stubs: { 'van-list': { props: ['error', 'loading'], template: '<div :data-error="error" :data-loading="loading"><slot /></div>' }, 'van-icon': true, VideoThumbnail: true } } });
describe('ContentCollection', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  it('shows own works real likes on the left and plays on the right for video and article cards', async () => {
    content.getMyContentPage.mockResolvedValue({ items: [
      { id: '91', title: '视频作品', auditStatus: 'APPROVED', publishStatus: 'PUBLISHED', videoUrl: '/video.mp4', likeCount: 27, playCount: 12345 },
      { id: '92', title: '图文作品', auditStatus: 'APPROVED', publishStatus: 'OFF_SHELF', videoUrl: null, likeCount: 0, playCount: 0 }
    ], total: 2, nextCursor: null });
    const wrapper = mountList({ kind: 'works' }); await flushPromises();
    const cards = wrapper.findAll('.collection-item');
    expect(cards[0].get('.collection-likes').attributes('aria-label')).toBe('点赞 27 次');
    expect(cards[0].get('.collection-plays').attributes('aria-label')).toBe('播放 12345 次');
    expect(cards[1].get('.collection-likes').text()).toBe('0');
    expect(cards[1].get('.collection-plays').text()).toBe('0');
    expect(cards[1].get('.collection-type').text()).toBe('图文');
    expect(cards[1].get('.collection-status').text()).toBe('已下架');
    await cards[0].trigger('click');
    expect(push).toHaveBeenCalledWith({ name: 'my-content-detail', params: { contentId: '91' } });
  });
  it('does not invent zero counts when an older backend omits own works statistics', async () => {
    content.getMyContentPage.mockResolvedValue({ items: [{ id: '91', title: '作品', auditStatus: 'APPROVED', publishStatus: 'PUBLISHED', videoUrl: null }], total: 1, nextCursor: null });
    const wrapper = mountList({ kind: 'works' }); await flushPromises();
    expect(wrapper.get('.collection-likes').text()).toBe('—');
    expect(wrapper.get('.collection-plays').text()).toBe('—');
  });
  it('loads the next cursor page, appends items, and preserves long identifiers', async () => {
    api.getAuthorVideos.mockResolvedValueOnce({ items: [video('2100000000000000001')], nextCursor: '2100000000000000001' })
      .mockResolvedValueOnce({ items: [video('2100000000000000000')], nextCursor: null });
    const wrapper = mountList({ kind: 'author-works', userId: 'author-9' });
    await flushPromises();
    await wrapper.get('.collection-more').trigger('click');
    await flushPromises();
    expect(api.getAuthorVideos).toHaveBeenLastCalledWith('author-9', '2100000000000000001', 18);
    expect(wrapper.findAll('.collection-item')).toHaveLength(2);
    await wrapper.findAll('.collection-item')[1].trigger('click');
    expect(push).toHaveBeenCalledWith({ name: 'content-detail', params: { contentId: '2100000000000000000' } });
  });
  it('queries the target author likes rather than the current user likes', async () => {
    api.getAuthorLikedVideos.mockResolvedValue({ items: [video('88')], nextCursor: null });
    const wrapper = mountList({ kind: 'author-likes', userId: 'author-9' });
    await flushPromises();
    expect(api.getAuthorLikedVideos).toHaveBeenCalledWith('author-9', null);
    expect(api.getLikedVideos).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('内容 88');
  });
  it('loads tabs lazily and retains cached data while refreshing newly added items', async () => {
    api.getFavoriteVideos.mockResolvedValue({ items: [video('11')], nextCursor: null });
    const wrapper = mountList({ kind: 'favorites', active: false });
    expect(api.getFavoriteVideos).not.toHaveBeenCalled();
    await wrapper.setProps({ active: true }); await flushPromises();
    let finishRefresh!: (page: unknown) => void;
    api.getFavoriteVideos.mockReturnValueOnce(new Promise(resolve => { finishRefresh = resolve; }));
    await wrapper.setProps({ active: false }); await wrapper.setProps({ active: true });
    expect(api.getFavoriteVideos).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toContain('内容 11');
    finishRefresh({ items: [video('12'), video('11')], nextCursor: null }); await flushPromises();
    expect(wrapper.findAll('.collection-item')).toHaveLength(2);
  });
  it('discards an old request when the status changes and displays the filtered total', async () => {
    let finishOld!: (page: unknown) => void;
    content.getMyContentPage.mockReturnValueOnce(new Promise(resolve => { finishOld = resolve; }))
      .mockResolvedValueOnce({ items: [], nextCursor: null, total: 127 });
    const wrapper = mountList({ kind: 'works', status: 'PUBLISHED' });
    await wrapper.setProps({ status: 'ALL' }); await flushPromises();
    finishOld({ items: [video('old')], nextCursor: null, total: 1 }); await flushPromises();
    expect(wrapper.emitted('total')).toEqual([[127]]);
    expect(wrapper.findAll('.collection-item')).toHaveLength(0);
    expect(content.getMyContentPage).toHaveBeenLastCalledWith('ALL', null);
  });
  it('can continue after an empty intermediate page of unavailable history entries', async () => {
    api.getHistory.mockResolvedValueOnce({ items: [], nextCursor: '99' })
      .mockResolvedValueOnce({ items: [{ videoId: '88', video: video('88'), lastViewedAt: '2026-10-12T08:00:00Z' }], nextCursor: null });
    const wrapper = mountList({ kind: 'history' }); await flushPromises();
    await wrapper.get('.collection-more').trigger('click'); await flushPromises();
    expect(api.getHistory).toHaveBeenLastCalledWith('99');
    expect(wrapper.findAll('.collection-item')).toHaveLength(1);
    expect(wrapper.find('.collection-item small').exists()).toBe(true);
  });
  it('clears the previous failure when a cached tab refresh succeeds', async () => {
    api.getLikedVideos.mockRejectedValueOnce(new Error('temporary failure')).mockResolvedValueOnce({ items: [video('11')], nextCursor: null });
    const wrapper = mountList({ kind: 'likes' }); await flushPromises();
    expect(wrapper.get('[data-error]').attributes('data-error')).toBe('true');
    await wrapper.setProps({ active: false }); await wrapper.setProps({ active: true }); await flushPromises();
    expect(wrapper.get('[data-error]').attributes('data-error')).toBe('false');
    expect(wrapper.get('[data-loading]').attributes('data-loading')).toBe('false');
    expect(wrapper.findAll('.collection-item')).toHaveLength(1);
  });
});
