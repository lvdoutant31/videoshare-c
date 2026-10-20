<script setup lang="ts">
import { onBeforeUnmount, onDeactivated, ref, watch } from 'vue';
import { formatCount } from '../utils/format';

const props = withDefaults(defineProps<{
  active: boolean;
  count: number;
  icon: 'like' | 'star';
  label: string;
  disabled?: boolean;
}>(), { disabled: false });
const emit = defineEmits<{ click: [event: MouseEvent] }>();
const rootRef = ref<HTMLButtonElement>();
const iconRef = ref<HTMLElement>();
const countRef = ref<HTMLElement>();
let animations: Animation[] = [];
function cancelMotion() { animations.forEach(animation => animation.cancel()); animations = []; }
watch(() => [props.active, props.count] as const, ([active, count], [previousActive, previousCount]) => {
  cancelMotion();
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || document.hidden) return;
  if (active !== previousActive) {
    const animation = iconRef.value?.animate?.([
      { transform: 'scale(1)', color: previousActive ? (props.icon === 'like' ? '#ff4d6d' : '#f6c344') : '#8b8b93' },
      { transform: 'scale(0.3)', offset: 0.4, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
      { transform: 'scale(1)' },
    ], { duration: 560, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' });
    if (animation) animations.push(animation);
    const beat = rootRef.value?.animate?.([
      { transform: 'scale(1)' }, { transform: 'scale(0.97)', offset: 0.4 }, { transform: 'scale(1)' },
    ], { duration: 560, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' });
    if (beat) animations.push(beat);
  }
  if (count !== previousCount) {
    const animation = countRef.value?.animate?.([
      { transform: `translateY(${count > previousCount ? '100%' : '-100%'})`, opacity: 0 },
      { transform: 'translateY(0)', opacity: 1 },
    ], { duration: 350, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' });
    if (animation) animations.push(animation);
  }
}, { flush: 'post' });
onDeactivated(cancelMotion);
onBeforeUnmount(cancelMotion);
</script>

<template>
  <button ref="rootRef" type="button" class="pulse-heart" :aria-label="label" :aria-pressed="active" :disabled="disabled" @click.stop="emit('click', $event)">
    <span ref="iconRef" class="pulse-icon" :class="{ liked: active && icon === 'like', saved: active && icon === 'star' }" aria-hidden="true"><svg v-if="icon === 'like'" viewBox="0 0 24 24" class="heart-glyph" xmlns="http://www.w3.org/2000/svg"><path d="M12 21s-8.5-5.1-8.5-12A4.8 4.8 0 0 1 12 6a4.8 4.8 0 0 1 8.5 3c0 6.9-8.5 12-8.5 12Z" /></svg><van-icon v-else :name="active ? icon : `${icon}-o`" :class="{ saved: active }" /></span>
    <span class="pulse-count-window"><small ref="countRef" class="pulse-count">{{ formatCount(count) }}</small></span>
  </button>
</template>

<style scoped>
.pulse-heart.pulse-heart { display:inline-flex; align-items:center; justify-content:center; gap:10px; min-width:44px; min-height:44px; padding:8px 12px; border:0; border-radius:32px; background:#232326; color:#f5f5f5; cursor:pointer; touch-action:manipulation; -webkit-tap-highlight-color:transparent; }
.pulse-heart.pulse-heart.action-item { display:flex; flex-direction:column; gap:3px; padding:8px 4px; background:transparent; }
.pulse-icon.liked { color:#ff4d6d; }
.pulse-icon.saved { color:#f6c344; }
.heart-glyph { width:34px; height:34px; fill:none; stroke:currentColor; stroke-width:1.5; stroke-linecap:round; stroke-linejoin:round; }
.pulse-icon.liked .heart-glyph { fill:currentColor; }
.pulse-count-window { display:inline-flex; overflow:hidden; line-height:1.2; }
.pulse-icon { color:#8b8b93; display:inline-flex; align-items:center; justify-content:center; transform-origin:center; }
.pulse-count { color:#f5f5f5; display:inline-block; font-size:inherit; font-variant-numeric:tabular-nums; }
.pulse-heart:focus-visible { outline:2px solid currentColor; outline-offset:3px; border-radius:8px; }
.pulse-heart:disabled { opacity:.6; cursor:default; }
</style>
