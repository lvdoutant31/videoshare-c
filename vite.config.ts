import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';

/**
 * proxy 目标从环境读取（优先级：系统环境 > .env 的 VITE_PROXY_TARGET > 默认 8080）。
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const proxyTarget = env.VITE_PROXY_TARGET ?? 'http://localhost:8080';
  const mediaProxyTarget = env.VITE_MEDIA_PROXY_TARGET ?? proxyTarget;
  return {
    base: '/videoshare/h5/',
    plugins: [vue(), tailwindcss()],
    server: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': proxyTarget,
        '/media': mediaProxyTarget,
      },
    },
    test: { environment: 'jsdom', globals: true, exclude: ['e2e/**', 'node_modules/**', 'dist/**'] }
  };
});
