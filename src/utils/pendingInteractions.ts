import { reactive } from 'vue';

// 跨缓存页面共享，避免同一对象在视频页和作者页同时发起写请求。
export const pendingInteractions = reactive(new Set<string>());
