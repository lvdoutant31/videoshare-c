/**
 * 路由表与登录守卫。
 * - 需要登录的页面未登录时跳转 /login?redirect=<原路径>
 * - 登录页在已登录时回跳
 */
import { createRouter, createWebHistory } from 'vue-router';
import { isAuthenticated } from '../api/http';
export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/login', name: 'login', component: () => import('../views/LoginView.vue'), meta: { public: true } },
    { path: '/', redirect: '/discover' },
    { path: '/publish', name: 'publish', component: () => import('../views/PublishContentView.vue'), meta: { requiresAuth: true },
      beforeEnter: to => typeof to.query.edit === 'string' && /^[1-9]\d*$/.test(to.query.edit)
        ? { name: 'my-content-edit', params: { contentId: to.query.edit } } : true },
    { path: '/content/:contentId', name: 'content-detail', component: () => import('../views/ContentDetailView.vue'), meta: { public: true } },
    { path: '/feed', name: 'feed', component: () => import('../views/FeedView.vue'), meta: { public: true, keepAlive: true } },
    { path: '/discover', name: 'discover', component: () => import('../views/DiscoverView.vue'), meta: { public: true } },
    { path: '/author/:userId', name: 'author', component: () => import('../views/AuthorProfileView.vue'), meta: { public: true } },
    { path: '/inbox', name: 'inbox', component: () => import('../views/ShareInboxView.vue'), meta: { requiresAuth: true } },
    { path: '/share/recipients', name: 'share-recipients', component: () => import('../views/ShareRecipientsView.vue'), meta: { requiresAuth: true } },
    { path: '/share/:shareCode', name: 'share-landing', component: () => import('../views/ShareLandingView.vue'), meta: { public: true } },
    { path: '/me', name: 'me', component: () => import('../views/ProfileView.vue'), meta: { requiresAuth: true } },
    { path: '/me/content', name: 'my-content', component: () => import('../views/MyContentView.vue'), meta: { requiresAuth: true } },
    { path: '/me/content/:contentId/edit', name: 'my-content-edit', component: () => import('../views/PublishContentView.vue'), props: true, meta: { requiresAuth: true } },
    { path: '/me/content/:contentId', name: 'my-content-detail', component: () => import('../views/MyContentDetailView.vue'), meta: { requiresAuth: true } },
    { path: '/me/settings', name: 'me-settings', component: () => import('../views/AccountSettingsView.vue'), meta: { requiresAuth: true } },
    { path: '/me/favorites', name: 'me-favorites', component: () => import('../views/VideoListPage.vue'), meta: { requiresAuth: true }, props: { kind: 'favorites' } },
    { path: '/me/likes', name: 'me-likes', component: () => import('../views/VideoListPage.vue'), meta: { requiresAuth: true }, props: { kind: 'likes' } },
    { path: '/me/history', name: 'me-history', component: () => import('../views/VideoListPage.vue'), meta: { requiresAuth: true }, props: { kind: 'history' } },
    { path: '/me/following', name: 'me-following', component: () => import('../views/UserListPage.vue'), meta: { requiresAuth: true }, props: { kind: 'following' } },
    { path: '/me/followers', name: 'me-followers', component: () => import('../views/UserListPage.vue'), meta: { requiresAuth: true }, props: { kind: 'followers' } },
    { path: '/:pathMatch(.*)*', redirect: '/discover' },
  ],
});

/** 登录守卫：需要登录的页面未登录时跳登录页并记录回跳地址 */
router.beforeEach((to) => {
  if (to.meta.requiresAuth && !isAuthenticated()) {
    return { name: 'login', query: { redirect: to.fullPath } };
  }
  if (to.name === 'login' && isAuthenticated()) {
    return { path: typeof to.query.redirect === 'string' ? to.query.redirect : '/discover' };
  }
  return true;
});
