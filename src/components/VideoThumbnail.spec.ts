import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import VideoThumbnail from './VideoThumbnail.vue';

describe('VideoThumbnail', () => {
  it('uses the image cover without loading the video', () => {
    const wrapper = mount(VideoThumbnail, {
      props: { coverUrl: '/cover.jpg', videoUrl: '/video.mp4' },
      global: { stubs: { 'van-icon': true } },
    });
    expect(wrapper.find('img').attributes('src')).toBe('/cover.jpg');
    expect(wrapper.find('video').exists()).toBe(false);
  });

  it('does not load the video just to render a thumbnail', () => {
    const wrapper = mount(VideoThumbnail, {
      props: { videoUrl: '/video.mp4' },
      global: { stubs: { 'van-icon': true } },
    });
    expect(wrapper.find('video').exists()).toBe(false);
    expect(wrapper.find('img').exists()).toBe(false);
  });

  it('falls back to the image cover when the video URL is unavailable', () => {
    const wrapper = mount(VideoThumbnail, {
      props: { coverUrl: '/cover.jpg' },
      global: { stubs: { 'van-icon': true } },
    });
    expect(wrapper.find('img').attributes('src')).toBe('/cover.jpg');
    expect(wrapper.find('video').exists()).toBe(false);
  });
});
