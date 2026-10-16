import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import AvatarImage from './AvatarImage.vue';

describe('AvatarImage', () => {
  it('uses the default avatar when no avatar URL is available', () => {
    const wrapper = mount(AvatarImage, { props: { src: null, alt: '用户头像' } });
    expect(wrapper.attributes('src')).toBe('/videoshare/h5/default-avatar-512.png');
  });

  it('falls back when the supplied avatar cannot be loaded', async () => {
    const wrapper = mount(AvatarImage, { props: { src: 'https://invalid.example/avatar.png', alt: '用户头像' } });
    await wrapper.trigger('error');
    expect(wrapper.attributes('src')).toBe('/videoshare/h5/default-avatar-512.png');
  });
});
