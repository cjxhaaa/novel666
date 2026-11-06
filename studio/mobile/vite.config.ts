// 手机端（安卓 App / 网页版）的构建配置。和桌面端共用 shared/ 和 src/lib 里的纯函数。
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: import.meta.dirname,
  base: './',
  plugins: [react()],
  server: { host: '0.0.0.0', port: 5299, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 2000 },
});
