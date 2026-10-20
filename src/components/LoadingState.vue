<script setup lang="ts">
withDefaults(defineProps<{ label?: string; detail?: string; dark?: boolean; compact?: boolean }>(), {
  label: '正在加载内容', detail: '', dark: false, compact: false,
});
</script>

<template>
  <div class="loading-state" :class="{ dark, compact }" role="status" aria-live="polite" aria-busy="true">
    <svg class="loading-art" viewBox="0 0 144 112" fill="none" aria-hidden="true">
      <rect class="back-card left-card" x="17" y="36" width="38" height="48" rx="9" transform="rotate(-14 36 60)" />
      <rect class="back-card right-card" x="89" y="28" width="38" height="48" rx="9" transform="rotate(14 108 52)" />
      <circle class="ring-track" cx="72" cy="56" r="38" />
      <circle class="ring-spin" cx="72" cy="56" r="38" stroke-dasharray="54 185" stroke-linecap="round" />
      <rect class="center-card" x="48" y="32" width="48" height="48" rx="15" />
      <path class="play-mark" d="M67 46L81 55a1.2 1.2 0 0 1 0 2L67 66a1.2 1.2 0 0 1-2-1V47a1.2 1.2 0 0 1 2-1Z" />
      <circle class="spark" cx="27" cy="22" r="3" /><circle class="spark small-spark" cx="119" cy="91" r="2" />
    </svg>
    <p class="loading-label">{{ label }}<span class="loading-dots" aria-hidden="true"><i /><i /><i /></span></p>
    <p v-if="detail" class="loading-detail">{{ detail }}</p>
  </div>
</template>

<style scoped>
.loading-state { --loading-accent:var(--accent,#2563eb); --loading-soft:#edf3ff; --loading-line:#dce8fc; --loading-ink:var(--text-strong,#1e293b); --loading-muted:var(--text-muted,#64748b); display:flex; flex-direction:column; align-items:center; padding:24px 16px; text-align:center; }
.loading-art { display:block; width:144px; height:112px; flex-shrink:0; }
.back-card { fill:var(--loading-soft); stroke:var(--loading-line); stroke-width:1.5; }
.ring-track { stroke:var(--loading-line); stroke-width:2; }.ring-spin { stroke:var(--loading-accent); stroke-width:2.5; transform-origin:72px 56px; animation:loading-turn 1.8s linear infinite; }
.center-card { fill:var(--loading-accent); }.play-mark { fill:white; }.spark { fill:var(--loading-accent); opacity:.4; }.small-spark { opacity:.25; }
.loading-label { display:flex; align-items:center; justify-content:center; gap:6px; margin:8px 0 0; color:var(--loading-ink); font-size:15px; font-weight:600; line-height:1.6; }
.loading-detail { max-width:280px; margin:6px 0 0; color:var(--loading-muted); font-size:13px; line-height:1.7; }
.loading-dots { display:inline-flex; gap:3px; }.loading-dots i { width:3px; height:3px; border-radius:50%; background:currentColor; animation:loading-dot 1.2s ease-in-out infinite; }.loading-dots i:nth-child(2) { animation-delay:.15s; }.loading-dots i:nth-child(3) { animation-delay:.3s; }
.dark { --loading-accent:#93b8ff; --loading-soft:#ffffff0d; --loading-line:#ffffff29; --loading-ink:#fff; --loading-muted:#cbd5e1; }.dark .center-card { fill:#2563eb; }
.compact { padding:8px; }.compact .loading-art { width:96px; height:74px; }.compact .loading-label { margin:0; font-size:14px; }
@keyframes loading-turn { to { transform:rotate(360deg); } }@keyframes loading-dot { 0%,80%,100% { opacity:.3; }40% { opacity:1; } }
@media(prefers-reduced-motion:reduce) { .ring-spin,.loading-dots i { animation:none; } }
</style>
