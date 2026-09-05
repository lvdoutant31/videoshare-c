# 映流 C 端（yingliu-c）功能开发清单

> 对齐日期：本会话。依据：`shdy-tictok/docs/PRD-短视频管理与播放系统.md`（V1.1）、`docs/API接口设计-短视频管理与播放系统.md`（V1.0）、`docs/原型.md`（M01-M08）、`docs/数据库设计-短视频管理与播放系统.md`。
> 已拍板决策：① 按 API 文档联调优先级基线一→二→三推进；② 前端保留独立目录 D:\PrivateSoftware\gitClaude\yingliu-c 开发；③ 前后端同步开发，前端先用 mock 适配层按同一契约开发，后端实现后替换。

## 1. 现状盘点

### 前端 yingliu-c（Vue 3.5 + Vant 4 + Vite 6）
- main.ts 未启用 vue-router；无 Pinia、无 API client 封装。
- 仅 `HealthView.vue` 真实页面（/api/v1/app/health）+ `App.vue` 静态抖音风格 mock 原型（假数据，未接接口）。
- 独立目录、无 .git；`packages/shared` 未被引用（本地复制了 getHealth）。

### 后端 shdy-tictok（App 域）
- Admin 侧完整（登录/企微扫码/账号/视频上传审核上下架/分类标签/dashboard/评论管理/举报处理/用户治理/操作日志）。
- **媒体存储：阿里云 OSS**（`media.storage-type=oss` 默认激活，`yingliu-media` 的 `MediaStorage` 抽象 + `OssStorageService`；`media.oss.*` 配置 endpoint/access-key/bucket/url-prefix，url-prefix 可指向 CDN 域名）。上传原视频到 OSS，服务端返回**长期有效的公开访问链接**（`urlPrefix + "/" + key`），前端 video 直接播放。
- **无转码多清晰度**：主分支无 ffmpeg/转码 worker（仅 `retryTranscode` 接口壳子 + video_transcode 表预留），当前为单清晰度原视频直连。
- App 侧仅有 2 个无鉴权读接口：
  - `GET /api/v1/app/feed/recommend`（viewerState 硬编码 false）
  - `GET /api/v1/app/videos/{videoId}`（videoUrl = OSS 公开链接）
- App 域 Sa-Token 未配置；登录/互动/评论/分享/举报/历史/埋点接口均未实现。

> ⚠️ 与 PRD 的差异：PRD 假设本地媒体存储 + 短期播放凭证 + Nginx X-Accel，**当前实现走 OSS 公开链接**，C 端按 OSS 直连方案开发，不实现凭证换取逻辑。

## 2. 功能模块清单（C 端 = 前端 + 后端 App 域配合）

| # | 模块 | 原型 | 前端工作 | 后端接口（API 文档章节 / 现状） |
|---|---|---|---|---|
| 1 | 工程基线 | — | 启用 vue-router、API client（响应体 code/message/data/traceId、稳定错误码映射）、token 存取、登录守卫、env 配置、mock 适配层 | 无（纯前端） |
| 2 | 登录与账号 | M01 | 手机号验证码登录/注册页、企微快捷登录（企微环境判断+降级手机号）、协议同意记录、退出登录、个人资料编辑（头像/昵称/简介）、企微绑定查看/解绑、账号注销申请 | §2.1 `/app/auth/*`、`/app/me/*` —— 全部未实现 |
| 3 | 推荐流 + 播放器 | M02 | 全屏竖屏 video 播放、上下滑切换（单实例播放）、自动播放/暂停、点击暂停/继续、长按倍速、进度条+流光进度线、静音记忆、游标分页、预加载 1-2 条、弱网/失败重试、已看降权配合。**播放源直接用服务端返回的 OSS 链接（videoUrl）**，OSS 支持 HTTP Range，进度条/seek 天然可用，无需凭证换取。**下架后旧链接返回 403**：播放失败重试后仍失败时提示"内容已下架/不可播放"并可继续滑动 | `feed/recommend` ✅、`videos/{id}` ✅（videoUrl 即 OSS 链接，长期有效；下架后对象转私有读） |
| 4 | 点赞/收藏/关注 | M02 | 乐观更新+失败回滚、计数展示、未登录唤起登录并返回原视频 | §2.3 like/favorite/follow（目标状态幂等 PUT）—— 未实现 |
| 5 | 评论面板 | M03 | 底部抽屉、打开暂停/关闭恢复、热度/最新排序、两级评论（一级+回复）、发表/回复/点赞/删除本人评论/举报评论、待审提示、禁言 403 提示 | §2.4 全部 —— 未实现 |
| 6 | 转发分享 | M04/M05/M06 | 分享面板（微信/企微/站内/复制链接）、渠道降级（普通浏览器→系统分享/复制链接）、站内接收人搜索/最近/多选≤20、逐项发送结果、分享收件箱列表+详情（含失效状态） | §2.5 share-options/internal/recipients/inbox/share-events —— 未实现 |
| 7 | 作者主页 | M07 | 资料、关注状态、统计数字、公开视频网格、游标分页、被封禁/注销作者访问限制 | `GET /app/users/{id}`、`/app/users/{id}/videos` —— 未实现 |
| 8 | 个人中心 | M08 | 本人资料/获赞/关注/粉丝、收藏列表、点赞列表、观看历史（可清空）、关注列表、账号设置（企微绑定/协议/注销） | §2.3 列表接口、§2.5 history —— 未实现 |
| 9 | 举报与安全提示 | — | 举报视频/评论/用户（原因来自后台配置）、禁言/封禁/下架/限流清晰提示 | report 三个接口 —— 未实现 |
| 10 | 埋点上报 | — | PRD 事件字典采集（曝光/播放/互动/分享/举报等），批量上报、播放进度节流 | `POST /analytics/events/batch` —— 未实现 |
| 11 | 分享落地页 | — | 落地页 H5：可播放视频 + 打开应用/继续浏览入口，不暴露内部媒体路径 | `GET/POST /share/videos/{shareCode}*` —— 未实现 |

## 3. 开发顺序（对齐 API 文档 §10 联调优先级）

> 进度标记：✅ 已完成（mock 模式）｜🔶 部分完成｜⬜ 未开始

### 基线一（先完成，核心闭环）— ✅ 已完成
手机号登录 → 推荐流播放与滑动切换 → 点赞/收藏/关注 → 评论（面板/发表/回复/点赞/删除/举报）。建立 App 域 OpenAPI 契约与前端 mock 适配层。
- 工程基线：路由/守卫、HTTP client（token/错误码/幂等键/全局登录拦截）、mock 适配层（VITE_USE_MOCK 切换）、Pinia 登录态
- 页面：登录页（手机号验证码 mock: 123456）、推荐流（FeedView + FeedPlayer）、评论面板、分享面板（复制链接可用）、作者主页、个人中心、发现（占位）、收藏/点赞/历史/关注列表、收件箱、落地页（占位）
- 单元测试 29 个通过（format/http/mock 分页/auth store）

### 基线二（随即完成）— ✅ 已完成
播放体验增强：长按倍速、流光进度条（可拖动 seek）、静音记忆、预加载 1-2 条、页面隐藏自动暂停、播放失败自动重试 + 手动重试（覆盖 OSS 下架 403）✅；**Playwright 移动端 E2E 已建并通过 6/6**（推荐流渲染/手机号登录回跳/未登录点赞引导登录/上下滑切换/点赞乐观更新/评论面板开关）。

### 之后（基线三）— ✅ 功能完成（剩余项为外部环境依赖）
- ✅ 埋点上报：`src/analytics` 事件采集（曝光/播放起停/进度节流/完成/失败/互动/分享/举报/主页访问），批量上报接口 + pagehide 兜底
- ✅ 观看历史：有效播放 ≥2 秒自动写入、历史列表/清空（mock 状态）
- ✅ 站内转发：接收人选择页（搜索/最近/多选 ≤20/逐项结果）、分享面板站内入口、收件箱列表+打开事件
- ✅ 举报：视频（分享面板入口）/用户（作者主页入口）/评论，原因来自后台配置 mock，提交埋点
- ✅ 企微登录：mock 流程（授权地址→回调→换会话）；真实模式已留 authorize-url 跳转 + callback 处理
- ✅ 账号设置页（/me/settings）：资料编辑、企微绑定查看/解绑、协议版本同意、注销申请
- ✅ 分享落地页：按 shareCode 解析视频 + 失效态 + 打开埋点
- ⬜（外部环境依赖，非前端工程阻塞）微信/企微真实分享能力需在对应客户端容器接入官方 JS-SDK；普通浏览器降级已就位。联调真实后端时按 `VITE_USE_MOCK=false` 切换。

## 4. 前端工程约束

- 保留独立目录继续开发；需要时手动同步 `packages/shared` 的类型与 ApiResponse 契约，或本地维护等价定义。
- 接口契约以 `docs/API接口设计-短视频管理与播放系统.md` 为准：统一响应体、游标分页（data.items/data.nextCursor）、ID 字符串化、ISO 8601 UTC 时间、`Idempotency-Key` 头、稳定错误码映射（AUTH_REQUIRED/TOKEN_EXPIRED/ACCOUNT_MUTED/RATE_LIMITED 等）。
- mock 适配层：定义 `src/api` 下接口函数 + `src/mock` 数据，与后端契约一一对应，联调时一键切换真实实现。

## 5. 后端 App 域配合清单（供后端排期）

1. App 域 Sa-Token 会话与鉴权配置（独立于 admin 域 token-name）。
2. §2.1 登录与账号：手机号验证码发送/登录注册、企微 authorize-url/callback、logout、me 查询/修改、手机绑定、企微解绑、注销申请、协议同意。
3. §2.2 播放：当前已是 OSS 公开链接直连，**无需 play-token 短期凭证**。**下架合规（已拍板）**：视频下架/删除时，后端调用阿里云 OSS API 将**该视频对象 ACL 设为私有读**（`SetObjectAcl(key, ACL.Private)`），使旧链接直接 403 失效；如 url-prefix 走 CDN，需同步刷新/失效该对象 URL 以消除缓存窗口。⚠️ 不要整个 bucket 切私有——会让全部视频公开链接失效，正常播放被迫改签名 URL。
4. §2.3 互动：like/favorite/follow 目标状态幂等 PUT；me/favorites、me/likes、me/following、me/followers；users/{id} 主页与作品列表。
5. §2.4 评论全套（列表/回复/发布/点赞/删除/举报）。
6. §2.5 历史（列表/清空）、分享（share-options/internal/recipients/recent/inbox/share-events）、举报视频/用户。
7. 埋点 `POST /analytics/events/batch`（白名单事件、敏感字段过滤）。
8. 分享落地页 `/share/videos/{shareCode}` 数据与打开事件。
9. （可选，非 V1 阻塞）转码多清晰度：当前单清晰度直连可用；如需 720P/480P 自适应，再引入转码 worker 与清晰度切换。
