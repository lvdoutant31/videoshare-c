<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, onDeactivated } from 'vue';
const root = ref<HTMLElement>(); let motions: Animation[] = [];
onMounted(() => { if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || document.hidden) return; motions = Array.from(root.value?.children ?? []).slice(0,6).flatMap(el => { const motion = el.animate?.([{opacity:.4,transform:'translateY(6px)'},{opacity:1,transform:'translateY(0)'}],{duration:180,delay:Array.from(root.value!.children).indexOf(el)*25,easing:'ease-out'}); return motion ? [motion] : []; }); });
onDeactivated(() => motions.forEach(m => m.finish())); onBeforeUnmount(() => motions.forEach(m => m.cancel()));
</script>
<template><div ref="root"><slot /></div></template>
