<script setup lang="ts">
import { onBeforeUnmount, onDeactivated, onMounted, ref } from 'vue';

const root = ref<HTMLElement>();
let animation: Animation | undefined;
onMounted(() => {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || document.hidden) return;
  animation = root.value?.animate?.([{ opacity: 0.55 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' });
});
// KeepAlive returns should show the restored content immediately.
onDeactivated(() => animation?.finish());
onBeforeUnmount(() => animation?.cancel());
</script>

<template><div ref="root"><slot /></div></template>
