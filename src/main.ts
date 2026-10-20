import { createApp } from 'vue';
import { createPinia } from 'pinia';
import Vant from 'vant';
import 'vant/lib/index.css';
import App from './App.vue';
import { router } from './router';
import { setAuthRequiredHandler } from './api/http';
import { useAuthStore } from './stores/auth';
import { EVENT_NAMES, track } from './analytics';
import './styles/vue-bits.css';
import './styles/index.css';
import './styles/community.css';

const app = createApp(App);
const pinia = createPinia();
app.use(pinia);
app.use(router);

// 会话失效全局拦截：清 token 后跳登录并保留回跳地址
setAuthRequiredHandler(() => {
  const redirect = router.currentRoute.value.fullPath;
  if (router.currentRoute.value.name !== 'login') {
    router.replace({ name: 'login', query: { redirect } });
  }
});

// 启动时恢复登录态
const auth = useAuthStore(pinia);
auth.restore();

// 应用打开埋点
track(EVENT_NAMES.APP_OPEN, { pageSource: String(router.currentRoute.value.name ?? '') });

app.use(Vant);
app.mount('#app');
