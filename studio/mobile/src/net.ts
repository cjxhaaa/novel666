// 和电脑说话：App 里走原生 HTTP（不受 WebView 的跨域、明文限制），网页版走 fetch。
import { Capacitor, CapacitorHttp, registerPlugin } from '@capacitor/core';
import type { SyncHello } from '../../shared/types';

export const native = Capacitor.isNativePlatform();

/** 安卓端自己写的插件：往局域网广播一声，收集应答的电脑 */
const Discovery = registerPlugin<{ discover(o: { timeout: number }): Promise<{ found: { ip: string; port: number; name: string }[] }> }>('Discovery');

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function request<T>(host: string, path: string, opts: { key?: string; body?: unknown; timeout?: number } = {}): Promise<T> {
  const url = `http://${host}${path}`;
  const headers: Record<string, string> = { 'x-xingtu-key': opts.key ?? '' };
  if (opts.body) headers['content-type'] = 'application/json';
  const timeout = opts.timeout ?? 8000;
  if (native) {
    const r = await CapacitorHttp.request({
      url,
      method: opts.body ? 'POST' : 'GET',
      headers,
      data: opts.body,
      connectTimeout: timeout,
      readTimeout: Math.max(timeout, 60000),
      responseType: 'json',
    });
    if (r.status >= 400) throw new HttpError(r.status, r.data?.error ?? `请求失败（${r.status}）`);
    return r.data as T;
  }
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), opts.body ? Math.max(timeout, 60000) : timeout);
  try {
    const r = await fetch(url, { method: opts.body ? 'POST' : 'GET', headers, body: opts.body ? JSON.stringify(opts.body) : undefined, signal: ctl.signal });
    const json = await r.json();
    if (!r.ok) throw new HttpError(r.status, json?.error ?? `请求失败（${r.status}）`);
    return json as T;
  } finally {
    clearTimeout(t);
  }
}

export async function hello(host: string, key?: string) {
  const h = await request<SyncHello>(host, '/api/hello', { key, timeout: 2500 });
  if (h?.app !== 'xingtu') throw new Error('不是星图书房');
  return h;
}

/** 找局域网里开着星图书房的电脑 */
export async function discover(): Promise<{ host: string; name?: string }[]> {
  if (native) {
    try {
      const { found } = await Discovery.discover({ timeout: 1500 });
      return found.map((f) => ({ host: `${f.ip}:${f.port}`, name: f.name }));
    } catch {
      return [];
    }
  }
  // 网页版本身就是电脑发过来的
  return /^https?:$/.test(location.protocol) ? [{ host: location.host }] : [];
}

/** 安卓端自己写的插件：系统栏的底色和图标深浅跟着 App 的底色走 */
const BarColor = registerPlugin<{ set(o: { color: string; dark: boolean }): Promise<void>; fullscreen(o: { on: boolean }): Promise<void> }>('BarColor');

export function setSystemBars(dark: boolean, color: string) {
  BarColor.set({ color, dark }).catch(() => {});
}

/** 全屏阅读：藏起状态栏和导航条，从边上划一下会临时露出来 */
export function setFullscreen(on: boolean) {
  BarColor.fullscreen({ on }).catch(() => {});
}
