import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { createPinia } from 'pinia';

const { getAuthorProfile } = vi.hoisted(() => ({
  getAuthorProfile: vi.fn().mockResolvedValue({
    id: '10001',
    nickname: '三环智造',
    avatarUrl: null,
    bio: '折弯机研发与制造',
    following: false,
    followingCount: 32,
    followerCount: 25_420,
    likeReceivedCount: 12_600,
    worksCount: 37,
  }),
}));

vi.mock('../api', () => ({
  getAuthorProfile,
  getAuthorVideos: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
  setFollow: vi.fn(),
}));
vi.mock('../api/http', () => ({ isAuthenticated: vi.fn(() => false) }));
vi.mock('../analytics', () => ({ EVENT_NAMES: { PROFILE_VIEWED: 'profile_viewed' }, track: vi.fn() }));
vi.mock('vant', () => ({ showToast: vi.fn() }));
vi.mock('vue-router', () => ({
  onBeforeRouteLeave: vi.fn(),
  useRoute: () => ({ params: { userId: '10001' }, fullPath: '/author/10001' }),
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
}));

import AuthorProfileView from './AuthorProfileView.vue';

describe('AuthorProfileView', () => {
  it('shows followed state returned by the author profile API when opening the page', async () => {
    getAuthorProfile.mockResolvedValueOnce({
      id: '10001', nickname: '三环智造', avatarUrl: null, bio: '', following: true,
      followingCount: 0, followerCount: 1, likeReceivedCount: 6,
    });
    const wrapper = mount(AuthorProfileView, {
      global: { plugins: [createPinia()], stubs: { 'van-icon': true, 'van-loading': true, ReportSheet: true, ContentCollection: true } },
    });
    await flushPromises();

    expect(wrapper.get('.profile-actions button').text()).toBe('已关注');
    expect(wrapper.get('.profile-actions button').classes()).toContain('followed');
    wrapper.unmount();
  });

  it('renders the backend flat count fields without accessing a missing stats object', async () => {
    const wrapper = mount(AuthorProfileView, {
      global: {
        plugins: [createPinia()],
        stubs: {
          'van-icon': true,
          'van-loading': true,
          ReportSheet: true,
          ContentCollection: true,
        },
      },
    });

    await flushPromises();

    expect(wrapper.text()).toContain('三环智造');
    expect(wrapper.text()).toContain('32 关注');
    expect(wrapper.text()).toContain('2.5w 粉丝');
    expect(wrapper.text()).toContain('1.3w 获赞');
    expect(wrapper.text()).toContain('作品 37');
    expect(wrapper.text()).not.toContain('私密');
    wrapper.unmount();
  });
});
