<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';
import Counter from './vue-bits/Counter.vue';
import { formatCount } from '../utils/format';
defineProps<{ value: number }>();
const reduce = ref(true);
let media: MediaQueryList | undefined;
const sync = () => { reduce.value = media?.matches ?? true; };
onMounted(() => { media = window.matchMedia?.('(prefers-reduced-motion: reduce)'); sync(); media?.addEventListener?.('change', sync); });
onBeforeUnmount(() => media?.removeEventListener?.('change', sync));
</script>
<template><span style="font-size:inherit;color:inherit" :aria-label="formatCount(value)"><span v-if="reduce || value >= 10000">{{ formatCount(value) }}</span><Counter v-else aria-hidden="true" :value="Math.max(0,value)" :font-size="21" :gap="0" :horizontal-padding="0" :gradient-height="0" /></span></template>
