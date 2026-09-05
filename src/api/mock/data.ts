/**
 * Mock 数据层：按 API 文档 §2 契约组织，与真实接口字段一致。
 * 视频使用公开可直连的 mp4 模拟 OSS 链接；联调时替换为真实接口。
 */
import type {
  AppUser,
  CommentItem,
  FeedItem,
  HistoryItem,
  ShareInboxItem,
  ShareRecipient,
  ShareOptions,
} from '../types';

const SAMPLE_VIDEOS = [
  'https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
  'https://storage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
  'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
  'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
  'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4',
  'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4',
  'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4',
  'https://storage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
  'https://storage.googleapis.com/gtv-videos-bucket/sample/SubaruOutbackOnStreetAndDirt.mp4',
  'https://storage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
];

const COVERS = [
  'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=420&q=84',
  'https://images.unsplash.com/photo-1515003197210-e0cd71810b5f?auto=format&fit=crop&w=420&q=84',
  'https://images.unsplash.com/photo-1551183053-bf91a1d81141?auto=format&fit=crop&w=420&q=84',
  'https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=420&q=84',
  'https://images.unsplash.com/photo-1569058242253-92a9c755a0ec?auto=format&fit=crop&w=420&q=84',
  'https://images.unsplash.com/photo-1525755662778-989d0524087e?auto=format&fit=crop&w=420&q=84',
  'https://images.unsplash.com/photo-1516211697506-8360dbcfe9a4?auto=format&fit=crop&w=420&q=84',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=420&q=84',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=420&q=84',
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=420&q=84',
];

const AVATARS = [
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=96&q=80',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=96&q=80',
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=96&q=80',
  'https://images.unsplash.com/photo-1531123897727-8f129e1688ce?auto=format&fit=crop&w=96&q=80',
  'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=96&q=80',
];

const TITLES = [
  '客户现场安全操作要点',
  '新员工入职培训第一课',
  '季度复盘会精华回顾',
  '安全生产月宣导片',
  '产品发布会精彩瞬间',
  '团队文化建设记录',
  '急救知识一分钟速学',
  '消防演练全程记录',
  '月度表彰大会片段',
  '办公室消防安全指南',
];

const DESCRIPTIONS = [
  '进入作业区域前必须完成安全检查，佩戴好防护装备，遵守现场操作规程。',
  '欢迎加入！这期视频带你快速了解公司制度、办公环境与常用系统。',
  '本季度关键指标复盘：目标达成情况、问题分析与下季度计划。',
  '安全无小事，人人都是第一责任人。让我们一起学习安全生产要点。',
  '最新产品发布会的完整记录，包含现场演示与嘉宾致辞。',
  '记录我们团队的日常：协作、分享与成长。',
  '遇到突发情况不要慌，跟着视频学习正确的应急处置方法。',
  '从警报响起到全员疏散完毕，全程 4 分 30 秒。',
  '致敬每一位努力付出的伙伴，荣誉属于团队。',
  '下班前检查电源、清理易燃物，消防安全牢记心间。',
];

export const mockUsers: AppUser[] = [
  { id: '10001', nickname: '安全培训组', avatarUrl: AVATARS[1], bio: '专注企业安全培训内容创作。', status: 'NORMAL', likeReceivedCount: 12600, followingCount: 32, followerCount: 25420, wecomBound: true },
  { id: '10002', nickname: '人事小助手', avatarUrl: AVATARS[0], bio: '人事政策解读与入职指引。', status: 'NORMAL', likeReceivedCount: 8420, followingCount: 18, followerCount: 15300, wecomBound: false },
  { id: '10003', nickname: '运营观察员', avatarUrl: AVATARS[2], bio: '记录运营实战与团队故事。', status: 'NORMAL', likeReceivedCount: 3210, followingCount: 45, followerCount: 8900, wecomBound: true },
  { id: '10004', nickname: '行政小管家', avatarUrl: AVATARS[3], bio: '行政服务与办公小贴士。', status: 'NORMAL', likeReceivedCount: 1580, followingCount: 12, followerCount: 4200, wecomBound: false },
  { id: '10005', nickname: '培训学院', avatarUrl: AVATARS[4], bio: '企业培训课程一站式学习平台。', status: 'NORMAL', likeReceivedCount: 21000, followingCount: 60, followerCount: 50000, wecomBound: true },
];

export const mockFeed: FeedItem[] = SAMPLE_VIDEOS.map((url, index) => {
  const author = mockUsers[index % mockUsers.length];
  return {
    id: String(90001 + index),
    title: TITLES[index % TITLES.length],
    description: DESCRIPTIONS[index % DESCRIPTIONS.length],
    durationMs: 120000,
    videoUrl: url,
    author: {
      id: author.id,
      nickname: author.nickname,
      avatarUrl: author.avatarUrl,
      following: index % 3 === 0,
    },
    cover: { id: String(50001 + index), contentType: 'image/jpeg', width: 420, height: 560, coverUrl: COVERS[index % COVERS.length] },
    tags: [{ id: '20', name: index % 2 === 0 ? '安全培训' : '企业文化' }],
    stats: { playCount: 128460 - index * 1200, likeCount: 1260 + index * 31, favoriteCount: 320 + index * 8, commentCount: 98 + index * 3 },
    publishedAt: new Date(Date.now() - index * 3600_000 * 5).toISOString(),
    viewerState: { liked: index % 4 === 1, favorited: index % 5 === 2 },
  };
});

function commentTexts(index: number): { name: string; text: string; time: string; likes: number; mine?: boolean }[] {
  return [
    { name: '夜班巡检员', text: '讲得很清楚，收藏了明天培训用！', time: '2小时前', likes: 126 },
    { name: '安全主管', text: '补充一点：进场前记得核对作业票有效期。', time: '1小时前', likes: 84, mine: index % 2 === 0 },
    { name: '新员工小王', text: '刚入职就看到这么实用的内容，点赞！', time: '40分钟前', likes: 31 },
    { name: '行政部', text: '已转发给部门全员，感谢分享！', time: '15分钟前', likes: 12 },
  ];
}

export function mockCommentsFor(videoId: string, offset = 0): CommentItem[] {
  return commentTexts(Number(videoId) % 3).map((c, i) => ({
    id: `${videoId}-c${offset + i}`,
    videoId,
    user: { id: String(11000 + i), nickname: c.name, avatarUrl: AVATARS[i % AVATARS.length], following: false },
    rootCommentId: null,
    replyToCommentId: null,
    content: c.text,
    status: 'NORMAL',
    likeCount: c.likes,
    replyCount: i === 0 ? 2 : 0,
    liked: false,
    mine: c.mine === true,
    createdAt: new Date(Date.now() - (i + 1) * 600_000).toISOString(),
    replies: i === 0
      ? [
          { id: `${videoId}-r0`, videoId, user: { id: '11005', nickname: '培训学院', avatarUrl: AVATARS[4], following: false }, rootCommentId: `${videoId}-c${offset}`, replyToCommentId: `${videoId}-c${offset}`, content: '感谢支持，欢迎持续关注！', status: 'NORMAL', likeCount: 8, replyCount: 0, liked: false, mine: false, createdAt: new Date(Date.now() - 300_000).toISOString() },
          { id: `${videoId}-r1`, videoId, user: { id: '11006', nickname: '夜班巡检员', avatarUrl: AVATARS[0], following: false }, rootCommentId: `${videoId}-c${offset}`, replyToCommentId: `${videoId}-c${offset}`, content: '一定认真学完！', status: 'NORMAL', likeCount: 2, replyCount: 0, liked: false, mine: false, createdAt: new Date(Date.now() - 120_000).toISOString() },
        ]
      : undefined,
  }));
}

export const mockHistory: HistoryItem[] = mockFeed.slice(0, 6).map((video, i) => ({
  videoId: video.id,
  lastViewedAt: new Date(Date.now() - i * 3600_000).toISOString(),
  progressMs: 12000 + i * 5000,
  video,
}));

export const mockShareOptions: ShareOptions = {
  channels: [
    { channel: 'WECHAT', available: true, label: '微信' },
    { channel: 'WECOM', available: true, label: '企业微信' },
    { channel: 'INTERNAL', available: true, label: '站内用户' },
    { channel: 'COPY_LINK', available: true, label: '复制链接' },
  ],
  landingUrl: '/share/videos/abc123',
};

export const mockRecipients: ShareRecipient[] = [
  { id: '10002', nickname: '人事小助手', avatarUrl: AVATARS[0] },
  { id: '10003', nickname: '运营观察员', avatarUrl: AVATARS[2] },
  { id: '10004', nickname: '行政小管家', avatarUrl: AVATARS[3] },
  { id: '10005', nickname: '培训学院', avatarUrl: AVATARS[4] },
];

export const mockShareInbox: ShareInboxItem[] = [
  { id: '80001', sender: { id: '10003', nickname: '运营观察员', avatarUrl: AVATARS[2], following: false }, video: mockFeed[0], status: 'DELIVERED', sentAt: new Date(Date.now() - 3600_000).toISOString(), openedAt: null },
  { id: '80002', sender: { id: '10002', nickname: '人事小助手', avatarUrl: AVATARS[0], following: false }, video: mockFeed[2], status: 'DELIVERED', sentAt: new Date(Date.now() - 8 * 3600_000).toISOString(), openedAt: new Date(Date.now() - 7 * 3600_000).toISOString() },
  { id: '80003', sender: { id: '10004', nickname: '行政小管家', avatarUrl: AVATARS[3], following: false }, video: mockFeed[1], status: 'INVALID', sentAt: new Date(Date.now() - 26 * 3600_000).toISOString(), openedAt: null },
];

/** 举报原因（后台配置 mock） */
export const mockReportReasons: { code: string; name: string; targetTypes: ('VIDEO' | 'COMMENT' | 'USER')[] }[] = [
  { code: 'SPAM', name: '垃圾广告/营销', targetTypes: ['VIDEO', 'COMMENT', 'USER'] },
  { code: 'PORNOGRAPHY', name: '色情低俗', targetTypes: ['VIDEO', 'COMMENT', 'USER'] },
  { code: 'VIOLENCE', name: '暴力血腥', targetTypes: ['VIDEO', 'COMMENT', 'USER'] },
  { code: 'INFRINGEMENT', name: '侵犯权益', targetTypes: ['VIDEO', 'COMMENT', 'USER'] },
  { code: 'RUMOR', name: '不实信息', targetTypes: ['VIDEO', 'COMMENT', 'USER'] },
  { code: 'OTHER', name: '其他', targetTypes: ['VIDEO', 'COMMENT', 'USER'] },
];
