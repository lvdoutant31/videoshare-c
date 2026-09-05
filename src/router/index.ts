/**
 * 路由表与登录守卫。
 * - 需要登录的页面未登录时跳转 /login?redirect=<原路径>
 * - 登录页在已登录时回跳
 */
import { createRouter, createWebHistory } from 'vue-router';
import { isAuthenticated } from '../api/http';
import LoginView from '../views/LoginView.vue';
import FeedView from '../views/FeedView.vue';
import DiscoverView from '../views/DiscoverView.vue';
import ProfileView from '../views/ProfileView.vue';
import AuthorProfileView from '../views/AuthorProfileView.vue';
import UserListPage from '../views/UserListPage.vue';
import VideoListPage from '../views/VideoListPage.vue';
import ShareInboxView from '../views/ShareInboxView.vue';
import ShareLandingView from '../views/ShareLandingView.vue';
import ShareRecipientsView from '../views/ShareRecipientsView.vue';
import AccountSettingsView from '../views/AccountSettingsView.vue';

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/login', name: 'login', component: LoginView, meta: { public: true } },
    { path: '/', redirect: '/feed' },
    { path: '/feed', name: 'feed', component: FeedView, meta: { public: true, keepAlive: true } },
    { path: '/discover', name: 'discover', component: DiscoverView, meta: { public: true } },
    { path: '/author/:userId', name: 'author', component: AuthorProfileView, meta: { public: true } },
    { path: '/inbox', name: 'inbox', component: ShareInboxView, meta: { requiresAuth: true } },
    { path: '/share/recipients', name: 'share-recipients', component: ShareRecipientsView, meta: { requiresAuth: true } },
    { path: '/share/:shareCode', name: 'share-landing', component: ShareLandingView, meta: { public: true } },
    { path: '/me', name: 'me', component: ProfileView, meta: { requiresAuth: true } },
    { path: '/me/settings', name: 'me-settings', component: AccountSettingsView, meta: { requiresAuth: true } },
    { path: '/me/favorites', name: 'me-favorites', component: VideoListPage, meta: { requiresAuth: true }, props: { kind: 'favorites' } },
    { path: '/me/likes', name: 'me-likes', component: VideoListPage, meta: { requiresAuth: true }, props: { kind: 'likes' } },
    { path: '/me/history', name: 'me-history', component: VideoListPage, meta: { requiresAuth: true }, props: { kind: 'history' } },
    { path: '/me/following', name: 'me-following', component: UserListPage, meta: { requiresAuth: true }, props: { kind: 'following' } },
    { path: '/me/followers', name: 'me-followers', component: UserListPage, meta: { requiresAuth: true }, props: { kind: 'followers' } },
    { path: '/:pathMatch(.*)*', redirect: '/feed' },
  ],
});

/** 登录守卫：需要登录的页面未登录时跳登录页并记录回跳地址 */
router.beforeEach((to) => {
  if (to.meta.requiresAuth && !isAuthenticated()) {
    return { name: 'login', query: { redirect: to.fullPath } };
  }
  if (to.name === 'login' && isAuthenticated()) {
    return { path: typeof to.query.redirect === 'string' ? to.query.redirect : '/feed' };
  }
  return true;
});
