import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';

/**
 * proxy 目标从环境读取（优先级：系统环境 > .env 的 VITE_PROXY_TARGET > 默认 8080）。
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const proxyTarget = env.VITE_PROXY_TARGET ?? 'http://localhost:8080';
  return {
    base: '/videoshare/h5/',
    plugins: [vue()],
    server: {
      proxy: {
        '/api': proxyTarget,
        '/media': proxyTarget,
      },
    },
    test: { environment: 'jsdom', globals: true, exclude: ['e2e/**', 'node_modules/**', 'dist/**'] }
  };
});
