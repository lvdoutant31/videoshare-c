/**
 * 埋点模块（PRD Analytics Events + API §8 /analytics/events/batch）。
 * 事件采集后批量上报；mock 模式下打印到 console.debug（联调切真实接口后走 batch 上报）。
 */
import { createUuid } from '../utils/uuid';

export const EVENT_NAMES = {
  APP_OPEN: 'app_open',
  LOGIN_METHOD_SELECTED: 'login_method_selected',
  VIDEO_EXPOSE: 'video_expose',
  PLAY_START: 'video_play_start',
  PLAY_PAUSE: 'video_play_pause',
  PLAY_PROGRESS: 'video_play_progress',
  PLAY_COMPLETE: 'video_play_complete',
  PLAY_FAILED: 'video_play_failed',
  FEED_SWIPE: 'feed_swipe',
  LIKE_TOGGLED: 'like_toggled',
  FAVORITE_TOGGLED: 'favorite_toggled',
  FOLLOW_TOGGLED: 'follow_toggled',
  COMMENT_PANEL_OPEN: 'comment_panel_open',
  COMMENT_PUBLISHED: 'comment_published',
  SHARE_CLICKED: 'share_clicked',
  SHARE_CHANNEL_SELECTED: 'share_channel_selected',
  INTERNAL_SHARE_SENT: 'internal_share_sent',
  SHARE_CARD_OPENED: 'share_card_opened',
  REPORT_SUBMITTED: 'report_submitted',
  PROFILE_VIEWED: 'profile_viewed',
  SEARCH_SUBMITTED: 'search_submitted',
  SEARCH_RESULTS: 'search_results_loaded',
  SEARCH_EMPTY: 'search_empty',
  SEARCH_FAILED: 'search_failed',
  SEARCH_RESULT_CLICKED: 'search_result_clicked',
  PUBLISH_STARTED: 'publish_started',
  PUBLISH_SUBMITTED: 'publish_submitted',
  PUBLISH_FAILED: 'publish_failed',
} as const;
export type EventName = (typeof EVENT_NAMES)[keyof typeof EVENT_NAMES];

export interface AnalyticsEvent {
  eventId: string;
  playSessionId?: string;
  eventName: EventName;
  occurredAt: string;
  anonymousSessionId: string;
  videoId?: string;
  objectId?: string;
  pageSource?: string;
  networkType?: string;
  clientVersion?: string;
  properties?: Record<string, unknown>;
}

const SESSION_KEY = 'yingliu.anonymous.session';
const CLIENT_VERSION = '0.1.0';
const BATCH_LIMIT = 50;
const FLUSH_INTERVAL_MS = 10_000;
const ANALYTICS_ENABLED = import.meta.env.VITE_ANALYTICS_ENABLED !== 'false';

let sessionId = localStorage.getItem(SESSION_KEY) ?? '';
if (!sessionId) {
  sessionId = createUuid();
  localStorage.setItem(SESSION_KEY, sessionId);
}

const queue: AnalyticsEvent[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;
let flushing = false;

function networkType(): string | undefined {
  const nav = navigator as Navigator & { connection?: { effectiveType?: string } };
  const type = nav.connection?.effectiveType;
  return type ? type.toUpperCase() : undefined;
}

/** 采集一条事件（内存队列，节流后批量上报） */
export function track(eventName: EventName, opts: { playSessionId?: string; videoId?: string; objectId?: string; pageSource?: string; properties?: Record<string, unknown> } = {}): void {
  const event: AnalyticsEvent = {
    eventId: createUuid(),
    eventName,
    occurredAt: new Date().toISOString(),
    anonymousSessionId: sessionId,
    clientVersion: CLIENT_VERSION,
    networkType: networkType(),
    ...opts,
  };
  if (!ANALYTICS_ENABLED) {
    if (import.meta.env.DEV) console.debug('[analytics disabled]', event.eventName);
    return;
  }
  queue.push(event);
  if (queue.length >= BATCH_LIMIT) flush();
  startFlushTimer();
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.debug('[analytics]', event.eventName, event.videoId ?? '', event.properties ?? '');
  }
}

/** 立即批量上报（POST /analytics/events/batch，mock 模式仅清空队列） */
export async function flush(): Promise<void> {
  if (!ANALYTICS_ENABLED || flushing || queue.length === 0) return;
  flushing = true;
  const events = queue.splice(0, BATCH_LIMIT);
  try {
    const response = await fetch(`${import.meta.env.VITE_API_BASE_URL ?? ''}/api/v1/analytics/events/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events }),
      keepalive: true,
    });
    if (!response.ok) {
      queue.unshift(...events);
    }
  } catch {
    queue.unshift(...events);
  } finally {
    flushing = false;
  }
}

function startFlushTimer() {
  if (flushTimer) return;
  flushTimer = setInterval(() => {
    flush();
    if (queue.length === 0 && flushTimer) {
      clearInterval(flushTimer);
      flushTimer = null;
    }
  }, FLUSH_INTERVAL_MS);
}

/** 页面离开时兜底上报 */
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    if (queue.length > 0) flush();
  });
}
