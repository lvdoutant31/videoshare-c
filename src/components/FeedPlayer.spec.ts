import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FeedItem } from '../api/types';

vi.mock('../analytics', () => ({
  EVENT_NAMES: {
    PLAY_START: 'video_play_start',
    PLAY_PAUSE: 'video_play_pause',
    PLAY_PROGRESS: 'video_play_progress',
    PLAY_COMPLETE: 'video_play_complete',
    PLAY_FAILED: 'video_play_failed',
  },
  track: vi.fn(),
}));

import FeedPlayer from './FeedPlayer.vue';

const item: FeedItem = {
  id: 'video-1',
  title: '测试视频',
  description: '播放器交互回归',
  durationMs: 100_000,
  videoUrl: '/video.mp4',
  author: { id: 'author-1', nickname: '测试作者', avatarUrl: null, following: false },
  cover: null,
  tags: [],
  stats: { playCount: 0, likeCount: 0, favoriteCount: 0, commentCount: 0 },
  publishedAt: '2026-09-16T00:00:00Z',
  viewerState: { liked: false, favorited: false },
};

function mountPlayer() {
  return mount(FeedPlayer, {
    props: { item, active: false, preload: false },
    global: {
      stubs: {
        'van-icon': true,
        'van-loading': true,
      },
    },
  });
}

async function tapSurface(wrapper: ReturnType<typeof mountPlayer>, x = 120, y = 240) {
  const surface = wrapper.get('.player-hit-area');
  await surface.trigger('pointerdown', {
    pointerId: 1,
    pointerType: 'touch',
    isPrimary: true,
    clientX: x,
    clientY: y,
  });
  await surface.trigger('pointerup', {
    pointerId: 1,
    pointerType: 'touch',
    isPrimary: true,
    clientX: x,
    clientY: y,
  });
  await surface.trigger('click');
  vi.advanceTimersByTime(340);
  await flushPromises();
}

describe('FeedPlayer controls', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('toggles play and pause from a stationary tap on the video surface', async () => {
    const wrapper = mountPlayer();

    await tapSurface(wrapper);
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledOnce();

    await tapSurface(wrapper);
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalledOnce();
    expect(wrapper.get('[aria-label="播放视频"]')).toBeTruthy();
  });

  it('keeps long press, moved pointers, and double tap separate from single-tap playback', async () => {
    const wrapper = mountPlayer();
    const surface = wrapper.get('.player-hit-area');
    const video = wrapper.get('video').element as HTMLVideoElement;
    Object.defineProperty(video, 'paused', { configurable: true, get: () => false });

    await surface.trigger('pointerdown', { pointerId: 3, isPrimary: true, clientX: 100, clientY: 100 });
    vi.advanceTimersByTime(600);
    await surface.trigger('pointerup', { pointerId: 3, isPrimary: true, clientX: 100, clientY: 100 });
    await surface.trigger('click');
    vi.advanceTimersByTime(340);
    expect(HTMLMediaElement.prototype.pause).not.toHaveBeenCalled();
    expect(video.playbackRate).toBe(1);

    await surface.trigger('pointerdown', { pointerId: 4, isPrimary: true, clientX: 100, clientY: 100 });
    await surface.trigger('pointermove', { pointerId: 4, isPrimary: true, clientX: 100, clientY: 180 });
    await surface.trigger('pointerup', { pointerId: 4, isPrimary: true, clientX: 100, clientY: 180 });
    await surface.trigger('click');
    vi.advanceTimersByTime(340);
    expect(HTMLMediaElement.prototype.pause).not.toHaveBeenCalled();

    vi.advanceTimersByTime(600);
    await surface.trigger('click');
    vi.advanceTimersByTime(280);
    await surface.trigger('click');
    vi.advanceTimersByTime(340);
    expect(wrapper.emitted('like-double-tap')).toHaveLength(1);
    expect(HTMLMediaElement.prototype.pause).not.toHaveBeenCalled();
  });

  it('shows replay at the end and restarts from the beginning', async () => {
    const wrapper = mountPlayer();
    const video = wrapper.get('video').element as HTMLVideoElement;
    Object.defineProperty(video, 'duration', { configurable: true, value: 100 });
    video.currentTime = 100;

    await wrapper.get('video').trigger('ended');
    expect(wrapper.get('[aria-label="重新播放"]')).toBeTruthy();

    await tapSurface(wrapper);
    expect(video.currentTime).toBe(0);
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledOnce();
  });

  it('seeks with a captured pointer and resumes from the sought position after ending', async () => {
    const wrapper = mountPlayer();
    const video = wrapper.get('video').element as HTMLVideoElement;
    const progress = wrapper.get('.flow-progress');
    Object.defineProperty(video, 'duration', { configurable: true, value: 100 });
    video.currentTime = 100;
    await wrapper.get('video').trigger('ended');
    vi.spyOn(progress.element, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, left: 0, right: 200, top: 0, bottom: 14, width: 200, height: 14,
      toJSON: () => ({}),
    });

    await progress.trigger('pointerdown', { pointerId: 2, clientX: 50 });
    await progress.trigger('pointermove', { pointerId: 2, clientX: 150 });
    await progress.trigger('pointerup', { pointerId: 2, clientX: 150 });

    expect(video.currentTime).toBe(75);
    expect(progress.classes()).not.toContain('seeking');

    await tapSurface(wrapper);
    expect(video.currentTime).toBe(75);
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledOnce();
  });
});
