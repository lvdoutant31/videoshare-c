<script setup lang="ts">defineProps<{ active: boolean }>();</script>
<template><div :class="{ 'masonry-grid':active }"><slot /></div></template>
<style scoped>
.masonry-grid { columns:2; column-gap:12px; }.masonry-grid :deep(.video-result) { display:block; break-inside:avoid; margin:0 0 16px; padding:0 0 12px; border:1px solid var(--line); border-radius:12px; overflow:hidden; }.masonry-grid :deep(.result-cover) { width:100%; height:auto; aspect-ratio:auto; display:block; }.masonry-grid :deep(.result-cover img) { display:block; width:100%; height:auto; max-height:360px; object-fit:contain; }.masonry-grid :deep(.result-copy) { display:block; padding:12px; }.masonry-grid :deep(.result-open) { display:none; } @media(min-width:960px) { .masonry-grid {columns:3;} }
</style>
