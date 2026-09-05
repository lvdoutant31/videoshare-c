/**
 * 映流 C 端共享契约类型。
 * 依据：docs/API接口设计-短视频管理与播放系统.md §1 通用契约 与 §2 手机端 App API。
 * 字段以当前后端 AppVideoDtos 实际序列化结果为准，差异点见注释。
 */

/** 统一响应体 */
export interface ApiResponse<T> {
  code: string;
  message: string;
  data: T;
  traceId: string;
}

/** 稳定业务错误码（§1.2） */
export const ErrorCode = {
  OK: 'OK',
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  ACCOUNT_MUTED: 'ACCOUNT_MUTED',
  ACCOUNT_SUSPENDED: 'ACCOUNT_SUSPENDED',
  VIDEO_NOT_FOUND: 'VIDEO_NOT_FOUND',
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  STATE_CONFLICT: 'STATE_CONFLICT',
  BINDING_CONFLICT: 'BINDING_CONFLICT',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  SENSITIVE_CONTENT: 'SENSITIVE_CONTENT',
  RATE_LIMITED: 'RATE_LIMITED',
} as const;
export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

/** 游标分页（信息流） */
export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

/** 作者信息（§2.2） */
export interface Author {
  id: string;
  nickname: string;
  avatarUrl: string | null;
  /** API 文档契约为 isFollowing；当前后端字段为 following */
  following: boolean;
}

/** 封面资源 */
export interface Cover {
  id: string;
  contentType: string;
  width: number | null;
  height: number | null;
  coverUrl: string | null;
}

export interface Tag {
  id: string;
  name: string;
}

/** 互动统计 */
export interface VideoStats {
  playCount: number;
  likeCount: number;
  favoriteCount: number;
  commentCount: number;
}

/** 当前用户对视频的互动状态 */
export interface ViewerState {
  liked: boolean;
  favorited: boolean;
}

/** 推荐流 / 详情单项（§2.2） */
export interface FeedItem {
  id: string;
  title: string;
  description: string | null;
  durationMs: number | null;
  /** OSS 公开链接或 CDN 链接，直接喂给 <video> */
  videoUrl: string | null;
  author: Author;
  cover: Cover | null;
  tags: Tag[];
  stats: VideoStats;
  publishedAt: string;
  viewerState: ViewerState;
}

// ---------- §2.1 登录与账号 ----------

export interface AppUser {
  id: string;
  nickname: string;
  avatarUrl: string | null;
  bio: string | null;
  status: 'NORMAL' | 'MUTED' | 'SUSPENDED' | 'BANNED' | 'CANCELLED';
  likeReceivedCount: number;
  followingCount: number;
  followerCount: number;
  wecomBound: boolean;
}

export interface PhoneLoginResult {
  accessToken: string;
  expiresIn: number;
  user: AppUser;
}

// ---------- §2.3 互动 ----------

/** 目标状态写接口的权威响应 */
export interface TargetStateResult {
  active: boolean;
  count: number;
}

// ---------- §2.4 评论 ----------

export type CommentSort = 'HOT' | 'LATEST';

export interface CommentItem {
  id: string;
  videoId: string;
  user: Author;
  /** 一级评论为 null；回复指向被回复评论 */
  rootCommentId: string | null;
  replyToCommentId: string | null;
  content: string;
  status: 'NORMAL' | 'PENDING';
  likeCount: number;
  replyCount: number;
  liked: boolean;
  mine: boolean;
  createdAt: string;
  /** 仅回复项返回 */
  replies?: CommentItem[];
}

export interface PublishCommentResult {
  id: string;
  status: 'NORMAL' | 'PENDING';
  message?: string;
}

// ---------- §2.5 历史 / 分享 / 举报 ----------

export interface HistoryItem {
  videoId: string;
  lastViewedAt: string;
  progressMs: number;
  video: FeedItem;
}

export interface ShareOptions {
  channels: { channel: 'WECHAT' | 'WECOM' | 'INTERNAL' | 'COPY_LINK' | 'SYSTEM'; available: boolean; label: string }[];
  landingUrl: string | null;
}

export interface ShareRecipient {
  id: string;
  nickname: string;
  avatarUrl: string | null;
}

export interface ShareInboxItem {
  id: string;
  sender: Author;
  video: FeedItem;
  status: 'DELIVERED' | 'INVALID' | 'REVOKED';
  sentAt: string;
  openedAt: string | null;
}

export interface InternalShareResult {
  batchId: string;
  results: { recipientId: string; success: boolean; inboxId?: string; code?: string }[];
}

/** 举报原因（后台配置，mock 内置） */
export interface ReportReason {
  code: string;
  name: string;
  targetTypes: ('VIDEO' | 'COMMENT' | 'USER')[];
}

/** 企微授权（§2.1）：跳转地址与一次性 state */
export interface WecomAuthorizeResult {
  authorizeUrl: string;
  state: string;
}

/** 协议同意状态（§2.1 /app/me/agreements） */
export type AgreementType = 'USER_AGREEMENT' | 'PRIVACY_POLICY';
export interface AgreementInfo {
  type: AgreementType;
  version: string;
  agreedAt: string | null;
  /** 当前生效版本；agreedVersion 落后于 currentVersion 时需重新同意 */
  currentVersion: string;
}
