<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, onDeactivated } from 'vue';
const root = ref<HTMLElement>(); let motion: Animation | undefined;
onMounted(() => { if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || document.hidden) return; motion = root.value?.animate?.([{ opacity:0,transform:'translateY(12px)' },{ opacity:1,transform:'translateY(0)' }],{ duration:240,easing:'ease-out' }); });
onDeactivated(() => motion?.finish()); onBeforeUnmount(() => motion?.cancel());
</script>
<template><div ref="root"><slot /></div></template>
