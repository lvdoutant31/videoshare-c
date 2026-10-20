# C 端账号入口 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 以湖北三环锻压设备有限公司的深色金属品牌视觉，交付可切换的登录、注册、忘记密码 C 端账号入口。

**Architecture:** 保留现有 `/login` 路由、Pinia 鉴权状态和企业微信 OAuth 回调，在单一 Vue 视图内用显式状态机切换三种账号流程。API 层扩展手机号验证码、密码登录、注册和重置密码契约，mock 模式提供完整可体验行为，真实模式请求对应 `/app/auth/*` 接口。

**Tech Stack:** Vue 3、TypeScript、Pinia、Vue Router、Vant、Vite、Playwright

## Global Constraints

- 保留安全的登录后内部地址回跳与企业微信 OAuth state 校验。
- 不覆盖 `src/styles/index.css` 中与登录页无关的现有未提交改动。
- 桌面端采用左右分栏，移动端保持单列表单可用。
- 所有表单需有标签、键盘焦点、错误提示、加载态与减少动态效果支持。

---

### Task 1: 账号 API 与鉴权状态

**Files:**
- Modify: `src/api/types.ts`
- Modify: `src/api/index.ts`
- Modify: `src/stores/auth.ts`

**Interfaces:**
- Produces: `sendPhoneCode(phone, scene)`、`passwordLogin(phone, password)`、`phoneLogin(phone, code, agreementVersion)`、`registerPhone(...)`、`resetPassword(...)`、`auth.loginWithPhone(...)`、`auth.loginWithPassword(...)`。

- [ ] 增加账号接口请求与结果类型。
- [ ] 为 mock 模式提供确定性成功行为并复用现有模拟用户。
- [ ] 将登录结果写入现有 `tokenStore` 和 `auth.user`。
- [ ] 运行 `npm run typecheck` 验证类型契约。

### Task 2: 登录、注册与找回密码界面

**Files:**
- Modify: `src/views/LoginView.vue`
- Modify: `src/styles/index.css`
- Create: `src/assets/auth-metalforming-bg.png`

**Interfaces:**
- Consumes: Task 1 的账号 API 与 Pinia 方法。
- Produces: `/login` 下完整账号入口及三种表单状态。

- [ ] 实现登录方式、注册、忘记密码的状态切换与字段校验。
- [ ] 实现验证码倒计时、密码显隐、协议确认和提交反馈。
- [ ] 保留企业微信登录及 OAuth 回调逻辑。
- [ ] 按石墨黑、锻压钢材、香槟金视觉实现桌面/移动响应式样式。
- [ ] 运行构建与浏览器交互验证。

### Task 3: 回归验证

**Files:**
- Test: `e2e/auth.spec.ts`

**Interfaces:**
- Consumes: `/login` 页面可访问的控件与 mock 行为。
- Produces: 登录、注册、忘记密码核心切换路径的回归保护。

- [ ] 覆盖三种页面状态和登录方式切换。
- [ ] 覆盖注册、重置密码成功后返回登录的行为。
- [ ] 运行 `npm run build` 与定向 Playwright 测试。
