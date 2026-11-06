// 手机同步：在局域网里开一个只读的 HTTP 服务，手机 App 按文件指纹只拉改过的文件。
// 另开一个 UDP 端口应答手机的广播，手机不用知道电脑的地址就能找到它。
// Electron 主进程和命令行（cli.mjs serve）共用这一份。
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createSocket, type Socket } from 'node:dgram';
import { createHash, randomInt } from 'node:crypto';
import { promises as fs, createReadStream } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { bookInfo, safeJoin, syncFileList } from './storage';
import type { SyncBook, SyncHello } from './types';

export const SYNC_PORT = 5210;
export const DISCOVERY_PORT = 5211;
export const DISCOVERY_MSG = 'XINGTU-DISCOVER';

export interface SyncServerOptions {
  port?: number;
  /** 配对码；每次请求时读取，换码后立即生效 */
  key: () => string;
  /** 书架上的书（目录） */
  books: () => string[];
  /** 手机网页版的静态文件目录（mobile/dist） */
  webDir?: string;
  /** 安卓安装包，存在时可以从 /xingtu.apk 下载 */
  apk?: string;
  /** 手机拉取过文件以后通知一声 */
  onPull?: (files: number, from: string) => void;
}

export interface SyncServer {
  port: number;
  stop(): Promise<void>;
}

export function newKey() {
  return String(randomInt(0, 1000000)).padStart(6, '0');
}

export function bookId(dir: string) {
  return createHash('sha1').update(path.resolve(dir).toLowerCase()).digest('hex').slice(0, 12);
}

/** 本机的局域网 IPv4 地址；虚拟网卡（WSL、Hyper-V、VMware、VPN）排在后面 */
export function lanAddresses(): string[] {
  const out: { ip: string; score: number }[] = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list ?? []) {
      if (a.family !== 'IPv4' || a.internal || a.address.startsWith('169.254.')) continue;
      let score = 0;
      if (/vEthernet|WSL|Hyper-V|VMware|VirtualBox|Loopback|Tailscale|ZeroTier|VPN|TAP|docker/i.test(name)) score += 10;
      if (a.address.startsWith('192.168.')) score -= 2;
      else if (a.address.startsWith('10.') || /^172\.(1[6-9]|2\d|3[01])\./.test(a.address)) score -= 1;
      out.push({ ip: a.address, score });
    }
  }
  return out.sort((a, b) => a.score - b.score).map((x) => x.ip);
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};

async function sha1(file: string) {
  return createHash('sha1').update(await fs.readFile(file)).digest('hex');
}

async function readBody(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

export async function startSyncServer(opts: SyncServerOptions): Promise<SyncServer> {
  const port = opts.port ?? SYNC_PORT;
  const name = os.hostname();
  const dirs = () => new Map(opts.books().map((d) => [bookId(d), d]));
  const authorized = (req: IncomingMessage, url: URL) => {
    const k = req.headers['x-xingtu-key'] ?? url.searchParams.get('k');
    return k === opts.key();
  };
  const from = (req: IncomingMessage) => (req.socket.remoteAddress ?? '').replace(/^::ffff:/, '');

  const server = createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'content-type, x-xingtu-key');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }
    const url = new URL(req.url ?? '/', 'http://x');
    try {
      if (url.pathname === '/api/hello') {
        const apk = !!(opts.apk && (await fs.stat(opts.apk).catch(() => null)));
        const hello: SyncHello = { app: 'xingtu', name, authorized: authorized(req, url), apk };
        return send(res, 200, hello);
      }
      if (url.pathname.startsWith('/api/')) {
        if (!authorized(req, url)) return send(res, 401, { error: '配对码不对' });
        if (url.pathname === '/api/books') {
          const books: SyncBook[] = [];
          for (const [id, dir] of dirs()) {
            const { path: _p, ...info } = await bookInfo(dir);
            if (!info.exists) continue;
            const files: Record<string, string> = {};
            for (const rel of await syncFileList(dir)) files[rel] = await sha1(safeJoin(dir, rel));
            books.push({ id, title: info.title, info, files });
          }
          return send(res, 200, books);
        }
        if (url.pathname === '/api/pull' && req.method === 'POST') {
          const { book, paths } = (await readBody(req)) as { book: string; paths: string[] };
          const dir = dirs().get(book);
          if (!dir) return send(res, 404, { error: '书架上没有这本书了' });
          const allowed = new Set(await syncFileList(dir));
          const out: Record<string, string | null> = {};
          for (const rel of paths) out[rel] = allowed.has(rel) ? await fs.readFile(safeJoin(dir, rel), 'utf8') : null;
          opts.onPull?.(paths.length, from(req));
          return send(res, 200, out);
        }
        return send(res, 404, { error: '没有这个接口' });
      }
      if (url.pathname === '/xingtu.apk' && opts.apk) {
        const st = await fs.stat(opts.apk).catch(() => null);
        if (!st) return send(res, 404, { error: '还没有打包安卓安装包' });
        res.setHeader('Content-Type', 'application/vnd.android.package-archive');
        res.setHeader('Content-Length', st.size);
        res.setHeader('Content-Disposition', `attachment; filename="xingtu.apk"; filename*=UTF-8''${encodeURIComponent('星图书房.apk')}`);
        createReadStream(opts.apk).pipe(res);
        return;
      }
      // 手机网页版：iPhone 或者还没装 App 的手机扫码就能用
      if (opts.webDir && req.method === 'GET') {
        const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
        let file = safeJoin(opts.webDir, rel);
        if (!(await fs.stat(file).catch(() => null))?.isFile()) file = path.join(opts.webDir, 'index.html');
        const data = await fs.readFile(file);
        res.setHeader('Content-Type', MIME[path.extname(file)] ?? 'application/octet-stream');
        res.end(data);
        return;
      }
      send(res, 404, { error: 'not found' });
    } catch (e: any) {
      send(res, 500, { error: String(e?.message ?? e) });
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '0.0.0.0', () => {
      server.off('error', reject);
      resolve();
    });
  });

  // 应答手机的广播：回一句自己的名字和端口
  let udp: Socket | null = createSocket({ type: 'udp4', reuseAddr: true });
  udp.on('message', (msg, rinfo) => {
    if (!msg.toString('utf8').startsWith(DISCOVERY_MSG)) return;
    const reply = Buffer.from(JSON.stringify({ app: 'xingtu', name, port }));
    udp?.send(reply, rinfo.port, rinfo.address);
  });
  udp.on('error', () => {
    udp?.close();
    udp = null;
  });
  udp.bind(DISCOVERY_PORT);

  return {
    port,
    stop: () =>
      new Promise<void>((resolve) => {
        try {
          udp?.close();
        } catch {}
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}
