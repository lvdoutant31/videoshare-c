<script setup lang="ts">
/**
 * 举报面板：选择举报原因（后台配置）并提交。
 * 支持举报视频/评论/用户；提交成功记录埋点。
 */
import { ref, watch } from 'vue';
import { showToast } from 'vant';
import { getReportReasons, reportComment, reportUser, reportVideo } from '../api';
import { EVENT_NAMES, track } from '../analytics';
import type { ReportReason } from '../api/types';

const props = defineProps<{
  open: boolean;
  targetType: 'VIDEO' | 'COMMENT' | 'USER';
  targetId: string;
  extra?: string;
}>();
const emit = defineEmits<{ (e: 'update:open', value: boolean): void }>();

const reasons = ref<ReportReason[]>([]);
const selected = ref<string | null>(null);
const description = ref('');
const submitting = ref(false);

watch(
  () => props.open,
  (open) => {
    if (open) {
      selected.value = null;
      description.value = '';
      reasons.value = [];
      getReportReasons(props.targetType)
        .then((list) => {
          reasons.value = list;
        })
        .catch(() => showToast('举报原因加载失败'));
    }
  },
);

function close() {
  emit('update:open', false);
}

async function submit() {
  if (!selected.value || submitting.value) return;
  submitting.value = true;
  try {
    if (props.targetType === 'VIDEO') await reportVideo(props.targetId, selected.value, description.value);
    else if (props.targetType === 'COMMENT') await reportComment(props.targetId, selected.value, description.value);
    else await reportUser(props.targetId, selected.value, description.value);
    track(EVENT_NAMES.REPORT_SUBMITTED, { objectId: props.targetId, properties: { targetType: props.targetType, reasonCode: selected.value } });
    showToast('举报已提交，我们会尽快处理');
    close();
  } catch {
    showToast('提交失败，请稍后重试');
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <van-action-sheet :show="open" title="举报" @update:show="emit('update:open', $event)" @cancel="close">
    <div class="report-body">
      <p class="report-tip">请选择举报原因（可补充说明）</p>
      <div class="report-reasons">
        <button
          v-for="reason in reasons"
          :key="reason.code"
          class="reason-chip"
          :class="{ on: selected === reason.code }"
          @click="selected = reason.code"
        >{{ reason.name }}</button>
      </div>
      <textarea
        v-model="description"
        class="report-desc"
        rows="3"
        maxlength="200"
        placeholder="补充说明（选填）"
      />
      <button class="report-submit" :disabled="!selected || submitting" @click="submit">
        {{ submitting ? '提交中...' : '提交举报' }}
      </button>
    </div>
  </van-action-sheet>
</template>

<style scoped>
.report-body { padding: 8px 16px 20px; }
.report-tip { margin: 0 0 12px; color: #9a9ba0; font-size: 12px; }
.report-reasons { display: flex; flex-wrap: wrap; gap: 10px; }
.reason-chip { padding: 8px 14px; border: 1px solid #e2e3e6; border-radius: 18px; color: #45464b; font-size: 13px; background: #fff; }
.reason-chip.on { border-color: var(--indigo); color: var(--indigo); background: #eef0ff; }
.report-desc { width: 100%; margin-top: 14px; padding: 10px 12px; border: 1px solid #e2e3e6; border-radius: 8px; outline: 0; resize: none; font-size: 13px; }
.report-submit { width: 100%; height: 44px; margin-top: 14px; border-radius: 22px; color: #fff; background: var(--coral); font-size: 14px; font-weight: 600; }
.report-submit:disabled { opacity: .5; }
</style>
