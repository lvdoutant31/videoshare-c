import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import CommentPanel from './CommentPanel.vue';
import type { FeedItem } from '../api/types';
const mocks = vi.hoisted(() => ({ get: vi.fn(), publish: vi.fn(), loggedIn: vi.fn(), push: vi.fn() }));
vi.mock('../api', () => ({ getComments: mocks.get, publishComment: mocks.publish, getReplies: vi.fn(), deleteComment: vi.fn(), setCommentLike: vi.fn() }));
vi.mock('../api/http', () => ({ isAuthenticated: mocks.loggedIn }));
vi.mock('vue-router', () => ({ useRoute: () => ({ path: '/content/1', query: {} }), useRouter: () => ({ push: mocks.push, resolve: () => ({ fullPath: '/content/1?comments=1' }) }) }));
vi.mock('vant', () => ({ showToast: vi.fn(), showConfirmDialog: vi.fn() }));
const video = { id: '1', author: { id: 'a1' }, stats: { commentCount: 2 } } as FeedItem;
async function render() {
  const wrapper = mount(CommentPanel, { props: { open: false, video }, global: { stubs: { 'van-icon': true, 'van-loading': true, ReportSheet: true } } });
  await wrapper.setProps({ open: true }); await flushPromises(); return wrapper;
}
describe('shared content comments', () => {
  beforeEach(() => { vi.clearAllMocks(); sessionStorage.clear(); mocks.loggedIn.mockReturnValue(true); mocks.get.mockResolvedValue({ items: [], nextCursor: null }); mocks.publish.mockResolvedValue({ status: 'NORMAL' }); });
  it('shows an actionable load failure and recovers on retry', async () => {
    mocks.get.mockRejectedValueOnce(new Error('offline'));
    const wrapper = await render();
    expect(wrapper.text()).toContain('评论加载失败');
    expect(wrapper.text()).not.toContain('还没有评论');
    await wrapper.get('.comments-retry').trigger('click'); await flushPromises();
    expect(wrapper.text()).toContain('还没有评论'); wrapper.unmount();
  });
  it('preserves guest text and returns to the same article through login', async () => {
    mocks.loggedIn.mockReturnValue(false);
    const wrapper = await render();
    await wrapper.get('input').setValue('我的评论'); await wrapper.get('.send-button').trigger('click');
    expect(mocks.publish).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('comment-draft:1')).toBe('我的评论');
    expect(mocks.push).toHaveBeenCalledWith({ name: 'login', query: { redirect: '/content/1?comments=1' } }); wrapper.unmount();
  });
  it('prevents duplicate submissions and emits the approved count delta', async () => {
    let resolve!: (value: { status: string }) => void;
    mocks.publish.mockImplementation(() => new Promise(done => { resolve = done; }));
    const wrapper = await render();
    await wrapper.get('input').setValue('一次提交');
    await wrapper.get('.send-button').trigger('click'); await wrapper.get('.send-button').trigger('click');
    expect(mocks.publish).toHaveBeenCalledTimes(1);
    expect(wrapper.get('.send-button').attributes('disabled')).toBeDefined();
    resolve({ status: 'NORMAL' }); await flushPromises();
    expect(wrapper.emitted('changed')).toEqual([[1]]); wrapper.unmount();
  });
  it('does not count pending comments as published', async () => {
    mocks.publish.mockResolvedValue({ status: 'PENDING' });
    const wrapper = await render(); await wrapper.get('input').setValue('等待审核');
    await wrapper.get('.send-button').trigger('click'); await flushPromises();
    expect(wrapper.emitted('changed')).toEqual([[0]]); wrapper.unmount();
  });
  it('ignores a stale sort response and supports Escape', async () => {
    const wrapper = await render();
    let resolve!: (value: unknown) => void;
    mocks.get.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    await wrapper.findAll('.comment-sort-tabs button')[1].trigger('click');
    mocks.get.mockResolvedValue({ items: [], nextCursor: null });
    await wrapper.findAll('.comment-sort-tabs button')[0].trigger('click'); await flushPromises();
    resolve({ items: [{ id: 'stale', user: { nickname: '旧' }, content: '旧排序结果' }], nextCursor: null }); await flushPromises();
    expect(wrapper.text()).not.toContain('旧排序结果');
    await wrapper.get('[role=dialog]').trigger('keydown', { key: 'Escape' });
    expect(wrapper.emitted('update:open')).toEqual([[false]]); wrapper.unmount();
  });
});
