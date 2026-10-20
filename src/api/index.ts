/**
 * 登录与账号 API（§2.1）。
 * mock 模式保留企业微信授权夹具；真实模式走 /app/auth/*。
 */
import { request } from './http';
import type { PlaybackSource } from './types';

export function getVideoSources(videoId: string): Promise<PlaybackSource[]> {
  if (USE_MOCK) {
    const item = mockFeed.find(item => item.id === videoId);
    return Promise.resolve(item?.videoUrl ? [{ id: 'original', label: '原画', url: item.videoUrl, width: null, height: null }] : []);
  }
  return request(`/app/videos/${encodeURIComponent(videoId)}/sources`);
}
import { createUuid } from '../utils/uuid';
import { USE_MOCK, delay, paginate } from './mock';
import { mockFeed, mockHistory, mockReportReasons, mockShareInbox, mockUsers } from './mock/data';
import type { AgreementInfo, AgreementType, AppLoginResult, AppUser, Author, AuthorProfile, CursorPage, DiscoverResponse, FeedItem, HistoryItem, InternalShareResult, ReportReason, ShareInboxItem, ShareRecipient, TrendingItem, WecomAuthorizeResult } from './types';

function cursorQuery(cursor: string | null, limit: number, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams({ ...extra, limit: String(limit) });
  if (cursor?.trim()) params.set('cursor', cursor);
  return params.toString();
}

const mockLoginResult = (method: string): AppLoginResult => ({
  accessToken: `mock-${method}-token`,
  expiresIn: 604800,
  user: { ...mockUsers[0] },
});

/** 手机号与密码登录，沿用现有 App 会话。 */
export function passwordLogin(phone: string, password: string): Promise<AppLoginResult> {
  if (USE_MOCK) return delay(500).then(() => mockLoginResult('password'));
  return request('/app/auth/password/login', { method: 'POST', body: { phone, password } });
}

export function register(phone: string, password: string, name: string, agreementVersion: string): Promise<void> {
  if (USE_MOCK) return delay(300).then(() => undefined);
  return request('/app/auth/register', { method: 'POST', body: { phone, password, name, agreementVersion } });
}

/** 发送手机号验证码。 */
export function sendPhoneCode(phone: string): Promise<{ expiresIn: number }> {
  if (USE_MOCK) return delay(300).then(() => ({ expiresIn: 60 }));
  return request('/app/auth/phone/send-code', { method: 'POST', body: { phone } });
}

/** 手机号验证码登录；新手机号首次登录时由服务端自动注册。 */
export function phoneLogin(phone: string, code: string, agreementVersion: string): Promise<AppLoginResult> {
  if (USE_MOCK) return delay(500).then(() => mockLoginResult('phone'));
  return request('/app/auth/phone/login', { method: 'POST', body: { phone, code, agreementVersion } });
}

/** 当前用户资料 */
export function getMe(): Promise<AppUser> {
  if (USE_MOCK) {
    return delay(200).then(() => ({ ...mockUsers[0] }));
  }
  return request('/app/me');
}

/** 修改头像/昵称/简介 */
export function updateMe(patch: Partial<Pick<AppUser, 'nickname' | 'bio' | 'avatarUrl'>>): Promise<AppUser> {
  if (USE_MOCK) {
    return delay(250).then(() => ({ ...mockUsers[0], ...patch }));
  }
  return request('/app/me', { method: 'PATCH', body: patch });
}

/** 退出登录 */
export function logout(): Promise<void> {
  if (USE_MOCK) {
    return delay(150);
  }
  return request('/app/auth/logout', { method: 'POST' });
}

/** 推荐流与视频详情（§2.2），作者主页（§2.3） */
export function getRecommendFeed(cursor: string | null, limit = 5): Promise<CursorPage<FeedItem>> {
  if (USE_MOCK) {
    return delay(350).then(() => paginate(mockFeed, cursor, limit));
  }
  return request(`/app/feed/recommend?${cursorQuery(cursor, limit)}`);
}

/** 当前用户关注作者的视频流 */
export function getFollowingFeed(cursor: string | null, limit = 5): Promise<CursorPage<FeedItem>> {
  if (USE_MOCK) {
    return delay(350).then(() => paginate(mockFeed.filter((video) => video.author.following), cursor, limit));
  }
  return request(`/app/feed/following?${cursorQuery(cursor, limit)}`);
}

/** 发现页热搜：复用真实推荐流，按真实播放和互动数据计算热度。 */
export async function getTrendingVideos(limit = 5): Promise<TrendingItem[]> {
  const page = await getRecommendFeed(null, Math.max(limit, 20));
  return page.items
    .map((video) => ({
      videoId: video.id,
      title: video.title,
      coverUrl: video.cover?.coverUrl ?? null,
      videoUrl: video.videoUrl,
      heat: video.stats.playCount + video.stats.likeCount * 10 + video.stats.favoriteCount * 6 + video.stats.commentCount * 4,
      playCount: video.stats.playCount,
      durationMs: video.durationMs,
      category: video.tags[0]?.name ?? '未分类',
      tags: video.tags,
      publishedAt: video.publishedAt,
    }))
    .sort((left, right) => right.heat - left.heat)
    .slice(0, limit);
}

/** 发现页：由后端统一返回真实统计口径、排行和组合筛选结果。 */
export function getDiscover(params: { keyword?: string; categoryId?: string; tagId?: string; limit?: number; page?: number; sort?: import('./types').DiscoverSort; contentType?: 'ALL' | 'VIDEO' | 'ARTICLE' } = {}): Promise<DiscoverResponse> {
  const query = new URLSearchParams({ limit: String(params.limit ?? 24) });
  if (params.keyword?.trim()) query.set('keyword', params.keyword.trim());
  if (params.categoryId) query.set('categoryId', params.categoryId);
  if (params.tagId) query.set('tagId', params.tagId);
  if (params.page) query.set('page', String(params.page));
  if (params.sort) query.set('sort', params.sort);
  if (params.contentType && params.contentType !== 'ALL') query.set('contentType', params.contentType);
  return request(`/app/discover?${query.toString()}`);
}

export function getVideoDetail(videoId: string): Promise<FeedItem> {
  if (USE_MOCK) {
    return delay(250).then(() => {
      const video = mockFeed.find((v) => v.id === videoId);
      if (!video) throw new Error('VIDEO_NOT_FOUND');
      return video;
    });
  }
  return request(`/app/videos/${videoId}`);
}

export function getContentDetail(contentId: string): Promise<FeedItem> {
  if (USE_MOCK) return getVideoDetail(contentId);
  return request(`/app/content/${contentId}`);
}

export function getAuthorProfile(userId: string): Promise<AuthorProfile> {
  if (USE_MOCK) {
    return delay(250).then(() => {
      const user = mockUsers.find((u) => u.id === userId);
      if (!user) throw new Error('RESOURCE_NOT_FOUND');
      return {
        id: user.id,
        nickname: user.nickname,
        avatarUrl: user.avatarUrl,
        following: false,
        bio: user.bio,
        likeReceivedCount: user.likeReceivedCount,
        followingCount: user.followingCount,
        followerCount: user.followerCount,
        worksCount: mockFeed.filter(item => item.author.id === userId).length,
      };
    });
  }
  return request<Omit<AuthorProfile, 'following'> & { following?: boolean }>(`/app/users/${userId}`)
    .then((profile) => ({ ...profile, following: profile.following ?? false }));
}

export function getAuthorVideos(userId: string, cursor: string | null, limit = 9): Promise<CursorPage<FeedItem>> {
  if (USE_MOCK) {
    return delay(300).then(() => paginate(mockFeed.filter((v) => v.author.id === userId), cursor, limit));
  }
  return request(`/app/users/${userId}/videos?${cursorQuery(cursor, limit)}`);
}

export function searchAuthors(keyword: string, cursor: string | null = null, limit = 20): Promise<CursorPage<import('./types').AuthorSearchResult>> {
  if (USE_MOCK) {
    const query = keyword.trim().toLowerCase();
    return delay(200).then(() => paginate(mockUsers.filter(user => query && (user.nickname.toLowerCase().includes(query) || user.id.includes(query)))
      .map(user => ({ id: user.id, nickname: user.nickname, avatarUrl: user.avatarUrl, following: false,
        worksCount: mockFeed.filter(item => item.author.id === user.id).length })), cursor, limit));
  }
  return request(`/app/users?${cursorQuery(cursor, limit, { keyword: keyword.trim() })}`);
}

export function getAuthorLikedVideos(userId: string, cursor: string | null, limit = 20): Promise<CursorPage<FeedItem>> {
  if (USE_MOCK) return delay(200).then(() => ({ items: [], nextCursor: null }));
  return request(`/app/users/${encodeURIComponent(userId)}/likes?${cursorQuery(cursor, limit)}`);
}

/** 当前用户收藏的视频 */
export function getFavoriteVideos(cursor: string | null = null, limit = 20): Promise<CursorPage<FeedItem>> {
  if (USE_MOCK) {
    return delay(250).then(() => paginate(mockFeed.filter((video) => video.viewerState.favorited), cursor, limit));
  }
  return request(`/app/me/favorites?${cursorQuery(cursor, limit)}`);
}

/** 当前用户点赞的视频 */
export function getLikedVideos(cursor: string | null = null, limit = 20): Promise<CursorPage<FeedItem>> {
  if (USE_MOCK) {
    return delay(250).then(() => paginate(mockFeed.filter((video) => video.viewerState.liked), cursor, limit));
  }
  return request(`/app/me/likes?${cursorQuery(cursor, limit)}`);
}

/** 当前用户的关注列表 */
export function getFollowing(): Promise<Author[]> {
  if (USE_MOCK) {
    return delay(200).then(() => mockUsers.slice(0, 3).map((user) => ({
      id: user.id,
      nickname: user.nickname,
      avatarUrl: user.avatarUrl,
      following: true,
    })));
  }
  return request('/app/me/following');
}

/** 当前用户的粉丝列表 */
export function getFollowers(): Promise<Author[]> {
  if (USE_MOCK) {
    return delay(200).then(() => mockUsers.slice(0, 3).map((user) => ({
      id: user.id,
      nickname: user.nickname,
      avatarUrl: user.avatarUrl,
      following: false,
    })));
  }
  return request('/app/me/followers');
}

/** 互动（§2.3）：点赞/收藏/关注，目标状态幂等 */
export function setLike(videoId: string, active: boolean): Promise<{ active: boolean; count: number }> {
  if (USE_MOCK) {
    return delay(180).then(() => {
      const video = mockFeed.find((v) => v.id === videoId);
      // FeedView has already applied the target state optimistically to shared mock data.
      return { active, count: video?.stats.likeCount ?? 0 };
    });
  }
  return request(`/app/videos/${videoId}/like`, { method: 'PUT', body: { active }, idempotencyKey: createUuid() });
}

export function setFavorite(videoId: string, active: boolean): Promise<{ active: boolean; count: number }> {
  if (USE_MOCK) {
    return delay(180).then(() => {
      const video = mockFeed.find((v) => v.id === videoId);
      return { active, count: video ? Math.max(0, video.stats.favoriteCount + (active ? 1 : -1)) : 0 };
    });
  }
  return request(`/app/videos/${videoId}/favorite`, { method: 'PUT', body: { active }, idempotencyKey: createUuid() });
}

export function setFollow(userId: string, active: boolean): Promise<{ active: boolean; count: number }> {
  if (USE_MOCK) {
    return delay(180).then(() => ({ active, count: 25420 + (active ? 1 : -1) }));
  }
  return request(`/app/users/${userId}/follow`, { method: 'PUT', body: { active }, idempotencyKey: createUuid() });
}

// ---------- 评论与举报（§2.4） ----------
export * from './comments';

// ---------- §2.5 历史 / 分享 / 举报 / 企微 ----------
/** 可变 mock 状态（观看历史、收件箱） */
let historyState: HistoryItem[] = [...mockHistory];
let inboxState: ShareInboxItem[] = [...mockShareInbox];

/** 观看历史：追加/更新（有效播放 ≥2 秒时调用） */
export function addHistory(videoId: string, progressMs: number): Promise<void> {
  if (USE_MOCK) {
    const video = mockFeed.find((v) => v.id === videoId);
    if (!video) return Promise.resolve();
    historyState = [
      { videoId, lastViewedAt: new Date().toISOString(), progressMs, video },
      ...historyState.filter((h) => h.videoId !== videoId),
    ].slice(0, 100);
    return Promise.resolve();
  }
  return request(`/app/me/history`, { method: 'POST', body: { videoId, progressMs } });
}

/** 观看历史列表（游标分页） */
export function getHistory(cursor: string | null = null, limit = 20): Promise<{ items: HistoryItem[]; nextCursor: string | null }> {
  if (USE_MOCK) {
    return delay(250).then(() => paginate(historyState, cursor, limit));
  }
  return request(`/app/me/history?${cursorQuery(cursor, limit)}`);
}

/** 清空观看历史 */
export function clearHistory(): Promise<void> {
  if (USE_MOCK) {
    historyState = [];
    return delay(150);
  }
  return request('/app/me/history', { method: 'DELETE' });
}

/** 站内转发接收人搜索（§2.5 share-recipients） */
export function searchRecipients(q: string): Promise<ShareRecipient[]> {
  if (USE_MOCK) {
    return delay(200).then(() =>
      mockUsers
        .filter((u) => !q || u.nickname.includes(q) || u.id.includes(q))
        .map((u) => ({ id: u.id, nickname: u.nickname, avatarUrl: u.avatarUrl })),
    );
  }
  return request(`/app/share-recipients?q=${encodeURIComponent(q)}`);
}

/** 最近转发对象 */
export function getRecentRecipients(): Promise<ShareRecipient[]> {
  if (USE_MOCK) {
    return delay(200).then(() => mockUsers.slice(1, 4).map((u) => ({ id: u.id, nickname: u.nickname, avatarUrl: u.avatarUrl })));
  }
  return request('/app/share-recipients/recent');
}

/** 站内转发：向最多 20 个用户发送视频卡片，返回逐项结果 */
export function sendInternalShare(videoId: string, recipientIds: string[]): Promise<InternalShareResult> {
  if (USE_MOCK) {
    return delay(500).then(() => {
      const results = recipientIds.map((recipientId) => {
        const recipient = mockUsers.find((u) => u.id === recipientId);
        const success = !!recipient && recipient.status === 'NORMAL';
        const inboxId = success ? `inbox-${Date.now()}-${recipientId}` : undefined;
        if (success) {
          const video = mockFeed.find((v) => v.id === videoId);
          if (video) {
            inboxState = [
              { id: inboxId!, sender: { id: '10001', nickname: '我', avatarUrl: null, following: false }, video, status: 'DELIVERED', sentAt: new Date().toISOString(), openedAt: null },
              ...inboxState,
            ];
          }
        }
        return { recipientId, success, inboxId, ...(success ? {} : { code: 'RECIPIENT_SUSPENDED' }) };
      });
      return { batchId: `batch-${Date.now()}`, results };
    });
  }
  return request(`/app/videos/${videoId}/shares/internal`, { method: 'POST', body: { recipientIds }, idempotencyKey: createUuid() });
}

/** 分享收件箱列表 */
export function getShareInbox(): Promise<ShareInboxItem[]> {
  if (USE_MOCK) {
    return delay(250).then(() => [...inboxState]);
  }
  return request('/app/share-inbox');
}

/** 收件箱卡片详情；打开前实时校验视频可见性 */
export function getShareInboxDetail(inboxId: string): Promise<ShareInboxItem> {
  if (USE_MOCK) {
    return delay(200).then(() => {
      const item = inboxState.find((i) => i.id === inboxId);
      if (!item) throw new Error('RESOURCE_NOT_FOUND');
      return item;
    });
  }
  return request(`/app/share-inbox/${inboxId}`);
}

/** 举报原因（后台配置） */
export function getReportReasons(targetType: 'VIDEO' | 'COMMENT' | 'USER'): Promise<ReportReason[]> {
  if (USE_MOCK) {
    return delay(150).then(() => mockReportReasons.filter((r) => r.targetTypes.includes(targetType)));
  }
  return request(`/app/report-reasons?targetType=${targetType}`);
}

/** 举报用户（§2.5） */
export function reportUser(userId: string, reasonCode: string, description = ''): Promise<void> {
  if (USE_MOCK) {
    return delay(200);
  }
  return request(`/app/users/${userId}/report`, { method: 'POST', body: { reasonCode, description } });
}

/** 企微授权地址（§2.1）：真实模式跳转，mock 模式返回模拟地址 */
export function getWecomAuthorizeUrl(): Promise<WecomAuthorizeResult> {
  if (USE_MOCK) {
    return delay(200).then(() => ({
      authorizeUrl: `${location.origin}${import.meta.env.BASE_URL}login?wecom=mock`,
      state: `mock-state-${Date.now()}`,
    }));
  }
  return request('/app/auth/wecom/authorize-url');
}

/** 企微回调登录：用 OAuth code + state 换取本平台会话 */
export async function wecomLogin(code: string, state: string): Promise<AppLoginResult> {
  if (USE_MOCK) {
    await delay(400);
    const user = mockUsers[0];
    return { accessToken: 'mock-wecom-token', expiresIn: 604800, user: { ...user } };
  }
  return request('/app/auth/wecom/callback', { method: 'POST', body: { code, state } });
}

// ---------- §2.1 账号设置：注销 / 协议 ----------

/** 发起账号注销申请 */
export function requestCancellation(reason = ''): Promise<void> {
  if (USE_MOCK) {
    return delay(300);
  }
  return request('/app/me/cancellation', { method: 'POST', body: { reason } });
}

/** 已同意协议版本 */
export function getAgreements(): Promise<AgreementInfo[]> {
  if (USE_MOCK) {
    return delay(200).then(() => [
      { type: 'USER_AGREEMENT', version: '2026-08', agreedAt: new Date().toISOString(), currentVersion: '2026-08' },
      { type: 'PRIVACY_POLICY', version: '2026-08', agreedAt: new Date().toISOString(), currentVersion: '2026-08' },
    ]);
  }
  return request('/app/me/agreements');
}

/** 同意新版本协议 */
export function acceptAgreement(type: AgreementType): Promise<void> {
  if (USE_MOCK) {
    return delay(200);
  }
  return request(`/app/me/agreements/${type}`, { method: 'PUT' });
}
