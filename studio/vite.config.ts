import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import * as store from './shared/storage';

/**
 * 浏览器预览用的存储接口：把 shared/storage 暴露成 /__studio/* 的 HTTP 接口。
 * 只在 `vite` 开发服务器里生效，Electron 里走 IPC。
 */
function studioApi(): Plugin {
  const root = process.env.STUDIO_ROOT ?? path.resolve(import.meta.dirname, '..');
  return {
    name: 'studio-api',
    configureServer(server) {
      store.watchProject(root, (paths) => server.ws.send({ type: 'custom', event: 'studio:changed', data: paths }));
      server.middlewares.use('/__studio', async (req, res) => {
        try {
          const chunks: Buffer[] = [];
          for await (const c of req) chunks.push(c as Buffer);
          const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
          const op = (req.url ?? '').replace(/^\//, '').split('?')[0];
          let out: unknown = null;
          switch (op) {
            case 'getRoot': out = root; break;
            case 'open': out = await store.openProject(root); break;
            case 'save': await store.saveCollection(root, body.name, body.value); break;
            case 'readChapters': out = await store.readChapters(root); break;
            case 'readChapter': out = await store.readChapter(root, body.num); break;
            case 'writeChapter': await store.writeChapter(root, body.num, body.text); break;
            case 'readDoc': out = await store.readDoc(root, body.rel); break;
            case 'writeDoc': await store.writeDoc(root, body.rel, body.text); break;
            case 'listDocs': out = await store.listDocs(root); break;
            default: res.statusCode = 404;
          }
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify(out ?? null));
        } catch (e: any) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: String(e?.message ?? e) }));
        }
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), studioApi()],
  server: { host: '127.0.0.1', port: 5199, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 2000 },
});
