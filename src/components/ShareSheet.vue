<script setup lang="ts">
/**
 * 分享面板：微信 / 企微 / 站内用户 / 复制链接（§2.5）+ 举报入口。
 * - 复制链接：可用
 * - 站内用户：跳转接收人选择页
 * - 微信/企微：普通浏览器降级提示（对应环境接入官方分享能力）
 */
import { ref, watch } from 'vue';
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
const selected = ref<string | null>(null);

const channels = [
  { channel: 'WECHAT', label: '微信', icon: 'wechat', color: '#07c160' },
  { channel: 'WECOM', label: '企业微信', icon: 'friends-o', color: '#2a9d8f' },
  { channel: 'INTERNAL', label: '站内用户', icon: 'user-o', color: '#5b6cff' },
  { channel: 'COPY_LINK', label: '复制链接', icon: 'link-o', color: '#8c8d92' },
] as const;

watch(
  () => props.open,
  (open) => {
    if (open) {
      selected.value = null;
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
  selected.value = channel.channel;
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
  // 微信/企微：普通浏览器降级提示（基线三后续接入官方分享能力）
  showToast(`${channel.label}分享将在对应环境开放`);
  close();
}

async function copyLink() {
  const url = `${location.origin}${import.meta.env.BASE_URL}share/mock-${props.video?.id ?? 'x'}`;
  try {
    await navigator.clipboard.writeText(url);
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
    title="分享视频"
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
    <div class="share-tip">分享内容包含视频封面与标题，不暴露原始媒体地址</div>
    <button class="share-report" @click="report"><van-icon name="warning-o" /> 举报视频</button>
  </van-action-sheet>
</template>

<style scoped>
.share-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; padding: 18px 16px 6px; }
.share-cell { display: grid; justify-items: center; gap: 7px; }
.share-icon { width: 50px; height: 50px; display: grid; place-items: center; border-radius: 50%; color: #fff; font-size: 24px; }
.share-cell small { color: #45464b; font-size: 12px; }
.share-tip { padding: 10px 16px 6px; color: #9a9ba0; font-size: 11px; text-align: center; }
.share-report { width: 100%; height: 48px; border-top: 1px solid #f0f0f2; color: #b4543d; font-size: 14px; }
</style>
