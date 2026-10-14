// 开发模式：起 Vite 开发服务器，再用 Electron 打开它
import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import electron from 'electron';

await import('./build-electron.mjs');
const server = await createServer({ configFile: 'vite.config.ts' });
await server.listen();
const url = server.resolvedUrls.local[0];
console.log(`[dev] renderer ${url}`);

const child = spawn(electron, ['.'], {
  stdio: 'inherit',
  env: { ...process.env, VITE_DEV_SERVER_URL: url },
});
child.on('exit', async (code) => {
  await server.close();
  process.exit(code ?? 0);
});
