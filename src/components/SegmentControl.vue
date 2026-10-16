<script setup lang="ts">
import RubberSegment from './vue-bits/RubberSegment.vue';

const props = defineProps<{
  options: readonly { value: string; label: string }[];
  value: string;
  label: string;
}>();
const emit = defineEmits<{ change: [value: string] }>();
</script>

<template>
  <div class="segment-control-host">
    <RubberSegment class-name="segment-control" :items="[...options]" :value="value" :aria-label="label" size="lg"
      track-color="var(--soft)" thumb-color="var(--paper)" text-color="var(--text-muted)" active-text-color="var(--accent)"
      @change="emit('change', $event)" />
  </div>
</template>

<style scoped>
.segment-control-host { max-width:100%; overflow-x:auto; }
.segment-control-host :deep(button) { min-height:44px; }
</style>
