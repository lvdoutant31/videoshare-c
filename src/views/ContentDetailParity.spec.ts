import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import ContentDetailView from './ContentDetailView.vue';
import MyContentDetailView from './MyContentDetailView.vue';

const mocks = vi.hoisted(() => ({ published: vi.fn(), owned: vi.fn(), push: vi.fn(), comments: vi.fn() }));
vi.mock('../api', () => ({ getContentDetail: mocks.published, getComments: mocks.comments }));
vi.mock('../api/content', () => ({ getEditableContent: mocks.owned, offShelfMyContent: vi.fn() }));
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { contentId: '2108384690509983745' } }),
  useRouter: () => ({ back: vi.fn(), push: mocks.push }) }));
vi.mock('../analytics', () => ({ EVENT_NAMES: {}, track: vi.fn() }));
vi.mock('vant', () => ({ showToast: vi.fn(), showConfirmDialog: vi.fn() }));

const id = '2108384690509983745';
const description = '<h2>正文小标题</h2><p>完整正文<strong>加粗文本</strong></p><ul><li>列表内容</li></ul><table><tr><td>表格内容</td></tr></table><img src="/media/image.jpg"><p>正文末尾</p>';
const item = { id, title: '内容标题', authorNickname: '作者', description, videoUrl: null,
  originalMedia: null, coverMedia: { url: '/media/image.jpg' }, categories: [], tags: [],
  auditStatus: 'APPROVED', publishStatus: 'PUBLISHED', currentVersion: 1 };
const render = async () => {
  const published = mount(ContentDetailView, { global: { stubs: { 'van-loading': { template: '<span />' }, 'van-icon': { template: '<span />' }, 'van-action-sheet': { template: '<span />' }, ReportSheet: { template: '<span />' } } } });
  const owned = mount(MyContentDetailView);
  await flushPromises();
  return { published, owned };
};

describe('public and owned content presentation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.comments.mockResolvedValue({ items: [], nextCursor: null });
    mocks.owned.mockResolvedValue(item);
    mocks.published.mockResolvedValue({ ...item, author: { nickname: item.authorNickname }, cover: { coverUrl: item.coverMedia.url } });
  });

  it('opens comments from the persistent article toolbar without requiring video media', async () => {
    const { published, owned } = await render();
    await published.get('[aria-label="查看评论"]').trigger('click'); await flushPromises();
    expect(published.get('[role="dialog"]').attributes('aria-label')).toBe('内容评论');
    expect(mocks.comments).toHaveBeenCalledWith(id, 'HOT', null, 50);
    published.unmount(); owned.unmount();
  });

  it('renders the same full article, author and images without a duplicate cover', async () => {
    const { published, owned } = await render();
    expect(mocks.published).toHaveBeenCalledTimes(1);
    expect(mocks.published).toHaveBeenCalledWith(id);
    expect(owned.get('.rich-content').html()).toBe(published.get('.rich-content').html());
    expect(owned.get('.content-article h1').text()).toBe(published.get('.content-article h1').text());
    expect(owned.get('.author').text()).toContain(published.get('.article-author strong').text());
    expect(owned.findAll('.content-article img')).toHaveLength(1);
    expect(owned.text()).toContain('正文末尾');
    await owned.get('.actions button').trigger('click');
    expect(mocks.push).toHaveBeenCalledWith({ name: 'my-content-edit', params: { contentId: id } });
    published.unmount(); owned.unmount();
  });

  it('uses the public playback URL for video preview while preserving management actions', async () => {
    mocks.owned.mockResolvedValue({ ...item, videoUrl: '/media/ready.mp4', originalMedia: { url: '/media/original.mov' } });
    mocks.published.mockResolvedValue({ ...item, videoUrl: '/media/ready.mp4', author: { nickname: item.authorNickname }, cover: { coverUrl: item.coverMedia.url } });
    const { published, owned } = await render();
    expect(owned.get('video').attributes('src')).toBe(published.get('video').attributes('src'));
    expect(owned.get('video').attributes('poster')).toBe(published.get('video').attributes('poster'));
    expect(owned.text()).toContain('撤下');
    expect(owned.text()).not.toContain('删除');
    published.unmount(); owned.unmount();
  });
});
