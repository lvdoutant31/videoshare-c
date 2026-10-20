<script setup lang="ts">
import { ref, watch, onBeforeUnmount, onDeactivated } from 'vue';
const props=defineProps<{ value:number }>(); const shown=ref(props.value); let frame=0; let played=false;
function finish(){cancelAnimationFrame(frame);shown.value=props.value;}
watch(()=>props.value,(to,from)=>{ cancelAnimationFrame(frame); if(played || !to || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || document.hidden){shown.value=to;return;} played=true;const start=performance.now();const tick=(now:number)=>{const t=Math.min(1,(now-start)/450);shown.value=Math.round(from+(to-from)*(1-(1-t)**3));if(t<1)frame=requestAnimationFrame(tick);};frame=requestAnimationFrame(tick); });
onBeforeUnmount(()=>cancelAnimationFrame(frame));onDeactivated(finish);
</script>
<template><span :aria-label="value.toLocaleString('zh-CN')"><span aria-hidden="true">{{ shown.toLocaleString('zh-CN') }}</span></span></template>
