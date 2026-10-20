import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import FeedView from './FeedView.vue';
import { pendingInteractions } from '../utils/pendingInteractions';

const mocks = vi.hoisted(() => ({ feed: vi.fn(), play: vi.fn(), pause: vi.fn(), playing: false, like: vi.fn(), favorite: vi.fn(), follow: vi.fn() }));
vi.mock('../api', () => ({ getRecommendFeed: mocks.feed, getFollowingFeed: mocks.feed, getVideoDetail: vi.fn(),
  addHistory: vi.fn(), setFavorite: mocks.favorite, setFollow: mocks.follow, setLike: mocks.like }));
vi.mock('../api/http', () => ({ isAuthenticated: () => true }));
vi.mock('../stores/auth', () => ({ useAuthStore: () => ({ user: { id: 'viewer' } }) }));
vi.mock('../analytics', () => ({ EVENT_NAMES: {}, track: vi.fn() }));
vi.mock('../utils/feedOrder', () => ({ shuffleFeedPage: (items: unknown) => items }));
vi.mock('vue-router', () => ({ useRouter: () => ({ currentRoute: { value: { query: {}, fullPath: '/feed' } }, push: vi.fn() }) }));

const item = { id: '1', videoUrl: '/video.mp4', author: { id: 'author' }, viewerState: {}, stats: {} };
const Player = defineComponent({ name: 'FeedPlayer', props: ['item', 'likePending', 'favoritePending', 'followPending'], setup(_props, { expose }) {
  expose({ isPlaying: () => mocks.playing, pause: () => { mocks.pause(); mocks.playing = false; },
    play: () => { mocks.play(); mocks.playing = true; } });
  return () => null;
} });
const render = () => mount(FeedView, { global: { stubs: { FeedPlayer: Player, CommentPanel: true, ShareSheet: true,
  ReportSheet: true, 'van-popup': true, 'van-icon': true, 'van-loading': true } } });

describe('overlay playback state', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.playing = false; mocks.feed.mockResolvedValue({ items: [item], nextCursor: null }); });

  it.each([false, true])('restores the original playing=%s state after closing comments', async playing => {
    const wrapper = render(); await flushPromises(); mocks.playing = playing;
    wrapper.findComponent(Player).vm.$emit('open-comments', item); await flushPromises();
    expect(mocks.pause).toHaveBeenCalledOnce();
    wrapper.findComponent({ name: 'CommentPanel' }).vm.$emit('update:open', false); await flushPromises();
    expect(mocks.play).toHaveBeenCalledTimes(playing ? 1 : 0);
    wrapper.unmount();
  });

  it('does not resume between overlapping comments and content panels', async () => {
    const wrapper = render(); await flushPromises(); mocks.playing = true;
    wrapper.findComponent(Player).vm.$emit('open-comments', item); await flushPromises();
    wrapper.findComponent(Player).vm.$emit('open-content', item); await flushPromises();
    wrapper.findComponent({ name: 'CommentPanel' }).vm.$emit('update:open', false); await flushPromises();
    expect(mocks.play).not.toHaveBeenCalled();
    wrapper.findComponent({ name: 'van-popup' }).vm.$emit('update:show', false); await flushPromises();
    expect(mocks.play).toHaveBeenCalledOnce();
    wrapper.unmount();
  });
});

describe('concurrent interactions', () => {
  beforeEach(() => { vi.clearAllMocks(); pendingInteractions.clear(); });

  it('locks repeated likes, uses server counts and keeps an independent successful favorite when like fails', async () => {
    const target = { ...item, author: { ...item.author }, viewerState: { liked: false, favorited: false }, stats: { likeCount: 3, favoriteCount: 2 } };
    mocks.feed.mockResolvedValue({ items: [target], nextCursor: null });
    let rejectLike!: (error: Error) => void;
    mocks.like.mockReturnValue(new Promise((_resolve, reject) => { rejectLike = reject; }));
    mocks.favorite.mockResolvedValue({ active: true, count: 9 });
    const wrapper = render(); await flushPromises();
    const player = wrapper.findComponent(Player);
    const current = player.props('item');
    player.vm.$emit('like', current); player.vm.$emit('like', current);
    player.vm.$emit('favorite', current); await flushPromises();
    expect(mocks.like).toHaveBeenCalledTimes(1);
    expect(player.props('likePending')).toBe(true);
    expect(current.viewerState.favorited).toBe(true);
    expect(current.stats.favoriteCount).toBe(9);
    rejectLike(new Error('offline')); await flushPromises();
    expect(current.viewerState).toEqual({ liked: false, favorited: true });
    expect(current.stats).toMatchObject({ likeCount: 3, favoriteCount: 9 });
    expect(player.props('likePending')).toBe(false);
    mocks.like.mockResolvedValue({ active: true, count: 2 });
    player.vm.$emit('like', current); await flushPromises();
    expect(current.stats.likeCount).toBe(2);
    player.vm.$emit('like-double-tap', current); await flushPromises();
    expect(mocks.like).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });

  it('shares pending follows across authors and applies the server state to all items by that author', async () => {
    mocks.feed.mockResolvedValue({ items: [structuredClone(item), { ...structuredClone(item), id: '2' }], nextCursor: null });
    let finish!: (value: { active: boolean; count: number }) => void;
    mocks.follow.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const wrapper = render(); await flushPromises();
    const players = wrapper.findAllComponents(Player);
    players[0].vm.$emit('follow-author', 'author', true);
    players[1].vm.$emit('follow-author', 'author', false); await flushPromises();
    expect(mocks.follow).toHaveBeenCalledTimes(1);
    expect(players.every(player => player.props('followPending'))).toBe(true);
    finish({ active: true, count: 1 }); await flushPromises();
    expect(players.every(player => player.props('item').author.following)).toBe(true);
    expect(pendingInteractions.size).toBe(0);
    wrapper.unmount();
  });
});
