<script setup lang="ts">
defineProps<{ step: number }>();
const steps = ['选择类型', '填写内容', '提交审核'];
</script>
<template><ol class="publish-stepper" aria-label="发布进度"><li v-for="(label,i) in steps" :key="label" :class="{ current: i === step, done: i < step }" :aria-current="i === step ? 'step' : undefined"><span>{{ i < step ? '✓' : i + 1 }}</span>{{ label }}</li></ol></template>
<style scoped>
.publish-stepper { display:flex; gap:12px; max-width:760px; margin:12px auto 24px; padding:0; list-style:none; }
li { flex:1; display:flex; align-items:center; gap:8px; color:var(--text-muted); font-size:12px; } li + li::before { content:''; flex:1; height:2px; background:var(--line); }
li span { display:grid; place-items:center; width:28px; height:28px; flex-shrink:0; border-radius:50%; background:var(--soft); transition:transform 220ms cubic-bezier(.34,1.56,.64,1); }
.current,.done { color:var(--accent); }.current span,.done span { background:var(--accent); color:white; }.current span { transform:scale(1.08); }
@media(prefers-reduced-motion:reduce) { li span { transition:none; transform:none; } }
</style>
