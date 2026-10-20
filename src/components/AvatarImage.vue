<script setup lang="ts">
import { ref, watch } from 'vue';

const props = defineProps<{ src?: string | null; alt: string }>();
const defaultAvatarUrl = `${import.meta.env.BASE_URL}default-avatar-512.png`;
const resolvedSrc = ref(props.src?.trim() || defaultAvatarUrl);

watch(() => props.src, (value) => {
  resolvedSrc.value = value?.trim() || defaultAvatarUrl;
});

function useDefaultAvatar() {
  if (resolvedSrc.value !== defaultAvatarUrl) resolvedSrc.value = defaultAvatarUrl;
}
</script>

<template>
  <img :src="resolvedSrc" :alt="alt" @error="useDefaultAvatar" />
</template>
