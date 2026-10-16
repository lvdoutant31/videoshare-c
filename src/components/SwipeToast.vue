<script setup lang="ts">
import { onMounted, onBeforeUnmount } from 'vue';
import { closeToast } from 'vant';
let grip: { id:number; y:number; x:number; el:HTMLElement } | null = null;
function down(e:PointerEvent) { if(e.button!==0)return; const el=(e.target as Element)?.closest<HTMLElement>('.van-toast'); if(el)grip={id:e.pointerId,y:e.clientY,x:e.clientX,el}; }
function up(e:PointerEvent) { if(grip?.id!==e.pointerId)return; if(e.clientY-grip.y>40 && Math.abs(e.clientX-grip.x)<Math.abs(e.clientY-grip.y))closeToast();grip=null; }
function cancel(){grip=null;}
onMounted(()=>{document.addEventListener('pointerdown',down);document.addEventListener('pointerup',up);document.addEventListener('pointercancel',cancel);});
onBeforeUnmount(()=>{document.removeEventListener('pointerdown',down);document.removeEventListener('pointerup',up);document.removeEventListener('pointercancel',cancel);});
</script>
<template><span hidden aria-hidden="true" /></template>
<style>
.van-toast { top:auto; bottom:calc(104px + env(safe-area-inset-bottom)); transform:translateX(-50%); border-radius:12px; touch-action:pan-x; }
@media(prefers-reduced-motion:reduce) { .van-toast {transition:none;} }
</style>
