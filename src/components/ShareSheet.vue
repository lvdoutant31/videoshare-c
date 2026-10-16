<script setup lang="ts">
/**
 * 分享面板：站内用户 / 复制正文链接 + 举报入口。
 * - 复制链接：可用
 * - 站内用户：跳转接收人选择页
 */
import { watch } from 'vue';
import { useRouter } from 'vue-router';
import { showToast } from 'vant';
import type { FeedItem } from '../api/types';
import { EVENT_NAMES, track } from '../analytics';

const props = defineProps<{ open: boolean; video: FeedItem | null }>();
const emit = defineEmits<{
  (e: 'update:open', value: boolean): void;
  (e: 'report-video', item: FeedItem): void;
}>();

const router = useRouter();

const channels = [
  { channel: 'INTERNAL', label: '站内用户', icon: 'user-o', color: '#5b6cff' },
  { channel: 'COPY_LINK', label: '复制链接', icon: 'link-o', color: '#8c8d92' },
] as const;

watch(
  () => props.open,
  (open) => {
    if (open) {
      if (props.video) {
        track(EVENT_NAMES.SHARE_CLICKED, { videoId: props.video.id, pageSource: 'recommend_feed' });
      }
    }
  },
);

function close() {
  emit('update:open', false);
}

function pick(channel: (typeof channels)[number]) {
  if (!props.video) return;
  track(EVENT_NAMES.SHARE_CHANNEL_SELECTED, { videoId: props.video.id, properties: { channel: channel.channel } });
  if (channel.channel === 'COPY_LINK') {
    copyLink();
    return;
  }
  if (channel.channel === 'INTERNAL') {
    close();
    router.push({ name: 'share-recipients', query: { video: props.video.id } });
    return;
  }
}

async function copyLink() {
  if (!props.video) return;
  const url = new URL(router.resolve({ name: 'content-detail', params: { contentId: props.video.id } }).href, location.origin).toString();
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
    } else {
      const input = document.createElement('textarea');
      input.value = url;
      input.setAttribute('readonly', '');
      input.style.position = 'fixed';
      input.style.opacity = '0';
      document.body.append(input);
      input.select();
      const copied = document.execCommand('copy');
      input.remove();
      if (!copied) throw new Error('Clipboard unavailable');
    }
    showToast('链接已复制');
  } catch {
    showToast('复制失败，请手动复制');
  }
  close();
}

function report() {
  if (!props.video) return;
  close();
  emit('report-video', props.video);
}
</script>

<template>
  <van-action-sheet
    :show="open"
    title="分享内容"
    @update:show="emit('update:open', $event)"
    @cancel="close"
  >
    <div class="share-grid">
      <button v-for="channel in channels" :key="channel.channel" class="share-cell" @click="pick(channel)">
        <span class="share-icon" :style="{ background: channel.color }">
          <van-icon :name="channel.icon" />
        </span>
        <small>{{ channel.label }}</small>
      </button>
    </div>
    <div class="share-tip">复制链接后可直接查看完整正文</div>
    <button class="share-report" @click="report"><van-icon name="warning-o" /> 举报视频</button>
  </van-action-sheet>
</template>

<style scoped>
.share-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; padding: 18px 16px 6px; }
.share-cell { display: grid; justify-items: center; gap: 7px; }
.share-icon { width: 50px; height: 50px; display: grid; place-items: center; border-radius: 50%; color: #fff; font-size: 24px; }
.share-cell small { color: #45464b; font-size: 12px; }
.share-tip { padding: 10px 16px 6px; color: #9a9ba0; font-size: 11px; text-align: center; }
.share-report { width: 100%; height: 48px; border-top: 1px solid #f0f0f2; color: #b4543d; font-size: 14px; }
</style>
