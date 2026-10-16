import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, nextTick } from 'vue';
import SegmentControl from './SegmentControl.vue';
import FadeContent from './FadeContent.vue';
import PulseHeart from './PulseHeart.vue';

const originalAnimate = Element.prototype.animate;
afterEach(() => { Element.prototype.animate = originalAnimate; vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function mockMotion(reduced = false) {
  vi.stubGlobal('matchMedia', () => ({ matches: reduced }));
  const animations: { cancel: ReturnType<typeof vi.fn>; finish: ReturnType<typeof vi.fn> }[] = [];
  const animate = vi.fn((_keyframes: Keyframe[] | PropertyIndexedKeyframes | null, _options?: number | KeyframeAnimationOptions) => {
    const animation = { cancel: vi.fn(), finish: vi.fn() };
    animations.push(animation);
    return animation as unknown as Animation;
  });
  Element.prototype.animate = animate;
  return { animate, animations };
}

describe('content micro interactions', () => {
  it('keeps selection controlled and ignores clicking the current option', async () => {
    const wrapper = mount(SegmentControl, { props: {
      options: [{ value: 'A', label: '综合' }, { value: 'B', label: '最新' }, { value: 'C', label: '最热' }], value: 'A', label: '结果排序',
    } });
    await wrapper.findAll('button')[0]!.trigger('click');
    expect(wrapper.emitted('change')).toBeUndefined();
    await wrapper.findAll('button')[1]!.trigger('click');
    expect(wrapper.emitted('change')).toEqual([['B']]);
    expect(wrapper.findAll('button')[0]!.attributes('aria-pressed')).toBe('true');
    await wrapper.setProps({ value: 'C' });
    expect(wrapper.get('.segment-indicator').attributes('style')).toContain('clip-path');
    expect(wrapper.findAll('button')[2]!.attributes('aria-pressed')).toBe('true');
    wrapper.unmount();
  });

  it('finishes entry motion when leaving KeepAlive and does not replay on return', async () => {
    const motion = mockMotion();
    const Host = defineComponent({ components: { FadeContent }, props: { visible: Boolean }, template: '<KeepAlive><FadeContent v-if="visible">内容</FadeContent></KeepAlive>' });
    const wrapper = mount(Host, { props: { visible: true } });
    expect(motion.animate).toHaveBeenCalledTimes(1);
    await wrapper.setProps({ visible: false });
    expect(motion.animations[0]!.finish).toHaveBeenCalledOnce();
    await wrapper.setProps({ visible: true });
    expect(motion.animate).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toBe('内容');
    wrapper.unmount();
  });

  it('follows confirmed state, cancels previous motion on rollback and blocks disabled clicks', async () => {
    const motion = mockMotion();
    const wrapper = mount(PulseHeart, { props: { active: false, count: 9, icon: 'like', label: '点赞' }, global: { stubs: { 'van-icon': true } } });
    await wrapper.trigger('click');
    expect(wrapper.emitted('click')).toHaveLength(1);
    expect(wrapper.attributes('aria-pressed')).toBe('false');
    expect(wrapper.text()).toBe('9');
    expect(motion.animate).not.toHaveBeenCalled();
    await wrapper.setProps({ active: true, count: 10 });
    expect(wrapper.text()).toBe('10');
    expect(motion.animate).toHaveBeenCalledTimes(3);
    expect(motion.animate.mock.calls[0]![0]).toContainEqual(expect.objectContaining({ transform: 'scale(0.3)', offset: 0.4 }));
    const previous = [...motion.animations];
    await wrapper.setProps({ active: false, count: 9, disabled: true });
    previous.forEach(animation => expect(animation.cancel).toHaveBeenCalledOnce());
    expect(wrapper.text()).toBe('9');
    await wrapper.trigger('click');
    expect(wrapper.emitted('click')).toHaveLength(1);
    wrapper.unmount();
  });

  it('shows final content and counts immediately with reduced motion', async () => {
    const motion = mockMotion(true);
    const fade = mount(FadeContent, { slots: { default: '内容' } });
    const pulse = mount(PulseHeart, { props: { active: false, count: 9, icon: 'star', label: '收藏' }, global: { stubs: { 'van-icon': true } } });
    await pulse.setProps({ active: true, count: 10 }); await nextTick();
    expect(fade.text()).toBe('内容'); expect(pulse.text()).toBe('10');
    expect(motion.animate).not.toHaveBeenCalled();
    fade.unmount(); pulse.unmount();
  });
});
