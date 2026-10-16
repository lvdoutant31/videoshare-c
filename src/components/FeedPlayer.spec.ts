import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
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
import { track } from '../analytics';
import * as api from '../api';

const item: FeedItem = {
  id: 'video-1',
  title: '测试视频',
  description: '播放器交互回归',
  durationMs: 100_000,
  videoUrl: '/video.mp4',
  author: { id: 'author-1', nickname: '测试作者', avatarUrl: null, following: false },
  cover: null,
  tags: [],
  stats: { playCount: 0, likeCount: 0, favoriteCount: 0, commentCount: 0, watchTimeMs: 0 },
  publishedAt: '2026-09-16T00:00:00Z',
  viewerState: { liked: false, favorited: false },
};

function mountPlayer(props: Partial<{ active: boolean; preload: 'auto' | 'metadata' | 'none'; loadSource: boolean }> = {}) {
  return mount(FeedPlayer, {
    props: { item, active: false, preload: 'none', loadSource: true, ...props },
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
    setActivePinia(createPinia());
    vi.useFakeTimers();
    vi.clearAllMocks();
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

  it('uses the requested preload mode and detaches distant media sources', async () => {
    const current = mountPlayer({ active: true, preload: 'auto', loadSource: true });
    expect(current.get('video').attributes('preload')).toBe('auto');
    expect(current.get('video').attributes('src')).toBe('/video.mp4');
    expect(current.get('video').attributes('autoplay')).toBeUndefined();
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
    expect(current.get('video').attributes('poster')).toBeUndefined();

    const next = mountPlayer({ preload: 'metadata', loadSource: true });
    expect(next.get('video').attributes('preload')).toBe('metadata');
    expect(next.get('video').attributes('src')).toBe('/video.mp4');

    const previous = mountPlayer({ preload: 'none', loadSource: true });
    expect(previous.get('video').attributes('preload')).toBe('none');
    expect(previous.get('video').attributes('src')).toBe('/video.mp4');

    const distant = mountPlayer({ preload: 'none', loadSource: false });
    expect(distant.get('video').attributes('src')).toBeUndefined();
  });

  it('uses the original audio by default without rendering a sound control', async () => {
    const wrapper = mountPlayer();
    const video = wrapper.get('video').element as HTMLVideoElement;

    expect(video.muted).toBe(false);
    expect(wrapper.find('[aria-label="开启声音"]').exists()).toBe(false);
    expect(wrapper.find('[aria-label="关闭声音"]').exists()).toBe(false);
  });

  it('reports five-second wall-clock watch heartbeats with a playback session', async () => {
    const wrapper = mountPlayer();
    const video = wrapper.get('video').element as HTMLVideoElement;
    Object.defineProperty(video, 'duration', { configurable: true, value: 100 });
    Object.defineProperty(video, 'playbackRate', { configurable: true, writable: true, value: 2 });
    video.currentTime = 10;

    await wrapper.get('video').trigger('playing');
    vi.advanceTimersByTime(5_000);

    expect(track).toHaveBeenCalledWith('video_play_progress', expect.objectContaining({
      videoId: 'video-1',
      playSessionId: expect.any(String),
      properties: expect.objectContaining({
        watchedDeltaMs: 5_000,
        positionMs: 10_000,
        playbackRate: 2,
      }),
    }));
  });

  it('falls back to muted playback when audible autoplay is blocked', async () => {
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(new Error('autoplay blocked'));
    const wrapper = mountPlayer({ active: true });
    await flushPromises();

    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2);
    expect((wrapper.get('video').element as HTMLVideoElement).muted).toBe(true);
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
    expect(video.currentTime).toBe(100);
    expect(wrapper.get('.seek-preview').text()).toContain('01:15');
    await progress.trigger('pointerup', { pointerId: 2, clientX: 150 });

    expect(video.currentTime).toBe(75);
    expect(progress.classes()).not.toContain('seeking');

    await tapSurface(wrapper);
    expect(video.currentTime).toBe(75);
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledOnce();
  });

  it('cancels a drag without seeking and keeps a paused video paused', async () => {
    const wrapper = mountPlayer(); const video = wrapper.get('video').element as HTMLVideoElement;
    Object.defineProperty(video, 'duration', { configurable: true, value: 100 }); video.currentTime = 20;
    const bar = wrapper.get('.flow-progress');
    vi.spyOn(bar.element, 'getBoundingClientRect').mockReturnValue({ left:0, width:200 } as DOMRect);
    await bar.trigger('pointerdown', { pointerId:4, clientX:40 });
    await bar.trigger('pointermove', { pointerId:4, clientX:180 });
    await wrapper.get('video').trigger('timeupdate');
    expect(wrapper.get('.seek-preview').text()).toContain('01:30');
    await bar.trigger('pointercancel', { pointerId:4 });
    expect(video.currentTime).toBe(20); expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    expect(bar.classes()).not.toContain('seeking'); wrapper.unmount();
  });

  it('supports keyboard seeking without leaking arrow keys to feed navigation', async () => {
    const wrapper = mountPlayer(); const video = wrapper.get('video').element as HTMLVideoElement;
    Object.defineProperty(video, 'duration', { configurable: true, value: 100 }); video.currentTime = 20;
    await wrapper.get('.flow-progress').trigger('keydown', { key:'ArrowRight' });
    expect(video.currentTime).toBe(25);
    await wrapper.get('.flow-progress').trigger('keydown', { key:'Home' });
    expect(video.currentTime).toBe(0); wrapper.unmount();
  });

  it('switches actual sources while retaining position, speed and mute state', async () => {
    vi.spyOn(api, 'getVideoSources').mockResolvedValue([
      { id:'optimized',label:'流畅版',url:'/video.mp4',width:1280,height:720 },
      { id:'original',label:'原画',url:'/original.mp4',width:1920,height:1080 },
    ]);
    const wrapper = mountPlayer({ active:true }); await flushPromises();
    const video = wrapper.get('video').element as HTMLVideoElement;
    Object.defineProperty(video, 'duration', { configurable:true,value:100 });
    video.currentTime=42; video.playbackRate=1.5; video.muted=true;
    vi.spyOn(video,'load').mockImplementation(() => {
      video.dispatchEvent(new Event('loadedmetadata')); video.dispatchEvent(new Event('canplay'));
    });
    await wrapper.get('.quality-trigger').trigger('click'); await flushPromises();
    await wrapper.findAll('.quality-options button')[1]!.trigger('click'); await flushPromises();
    expect(video.getAttribute('src')).toBe('/original.mp4'); expect(video.currentTime).toBe(42);
    expect(video.playbackRate).toBe(1.5); expect(video.muted).toBe(true);
    expect(wrapper.get('.quality-trigger').text()).toBe('原画'); wrapper.unmount();
  });
});
