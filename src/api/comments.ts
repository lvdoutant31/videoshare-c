/**
 * 评论与回复 API（§2.4）。
 */
import { request } from './http';
import { createUuid } from '../utils/uuid';
import { USE_MOCK, delay, paginate } from './mock';
import { mockCommentsFor } from './mock/data';
import type { CommentItem, CommentReplyNotification, CommentSort, CursorPage, PublishCommentResult } from './types';

/** 一级评论列表（sort=HOT|LATEST，游标分页） */
export function getComments(videoId: string, sort: CommentSort = 'HOT', cursor: string | null = null, limit = 20): Promise<CursorPage<CommentItem>> {
  if (USE_MOCK) {
    return delay(300).then(() => {
      const all = mockCommentsFor(videoId);
      const sorted = sort === 'LATEST' ? [...all].reverse() : all;
      return paginate(sorted, cursor, limit);
    });
  }
  const params = new URLSearchParams({ sort, limit: String(limit) });
  if (cursor?.trim()) params.set('cursor', cursor);
  return request(`/app/videos/${videoId}/comments?${params.toString()}`);
}

/** 二级回复（时间正序） */
export function getReplies(commentId: string): Promise<CommentItem[]> {
  if (USE_MOCK) {
    return delay(250).then(() => {
      const first = mockCommentsFor(commentId)[0];
      return first?.replies ?? [];
    });
  }
  return request(`/app/comments/${commentId}/replies`);
}

/** 发布一级评论或回复；可能返回待审 */
export function publishComment(videoId: string, content: string, replyToCommentId: string | null): Promise<PublishCommentResult> {
  if (USE_MOCK) {
    return delay(350).then(() => ({
      id: `${videoId}-new-${Date.now()}`,
      status: content.includes('敏感') ? 'PENDING' : 'NORMAL',
      ...(content.includes('敏感') ? { message: '评论正在审核' } : {}),
    }));
  }
  return request(`/app/videos/${videoId}/comments`, { method: 'POST', body: { content, replyToCommentId } });
}

export function getCommentReplyNotifications(cursor: string | null = null, limit = 20): Promise<CursorPage<CommentReplyNotification>> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor?.trim()) params.set('cursor', cursor);
  return request(`/app/comment-notifications?${params.toString()}`);
}

export function markCommentReplyNotificationRead(notificationId: string): Promise<void> {
  return request(`/app/comment-notifications/${notificationId}/read`, { method: 'PUT' });
}

/** 点赞评论（目标状态） */
export function setCommentLike(commentId: string, active: boolean): Promise<{ active: boolean; count: number }> {
  if (USE_MOCK) {
    return delay(150).then(() => ({ active, count: 84 + (active ? 1 : -1) }));
  }
  return request(`/app/comments/${commentId}/like`, { method: 'PUT', body: { active }, idempotencyKey: createUuid() });
}

/** 删除本人评论 */
export function deleteComment(commentId: string): Promise<void> {
  if (USE_MOCK) {
    return delay(200);
  }
  return request(`/app/comments/${commentId}`, { method: 'DELETE' });
}

/** 举报评论 */
export function reportComment(commentId: string, reasonCode: string, description = ''): Promise<void> {
  if (USE_MOCK) {
    return delay(200);
  }
  return request(`/app/comments/${commentId}/report`, { method: 'POST', body: { reasonCode, description } });
}

/** 举报视频（§2.2） */
export function reportVideo(videoId: string, reasonCode: string, description = ''): Promise<void> {
  if (USE_MOCK) {
    return delay(200);
  }
  return request(`/app/videos/${videoId}/report`, { method: 'POST', body: { reasonCode, description } });
}
