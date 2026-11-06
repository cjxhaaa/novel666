import { create } from 'zustand';
import { App } from '@capacitor/app';
import type { SyncBook } from '../../shared/types';
import { deleteBook, kvGet, kvSet, putFiles } from './db';
import { describeChanges, loadBook, type Change, type Loaded, type LocalBook } from './book';
import { discover, hello, HttpError, native, request } from './net';

export interface Server {
  /** ip:端口 */
  host: string;
  key: string;
  /** 电脑名 */
  name?: string;
}

export type Tab = 'chapters' | 'people' | 'foreshadow' | 'docs';

export type Route =
  | { v: 'home' }
  | { v: 'book'; id: string; tab: Tab }
  | { v: 'read'; id: string; num: number }
  | { v: 'doc'; id: string; path: string; heading?: string }
  | { v: 'person'; id: string; pid: string };

export type Sheet = null | 'pair' | 'host' | 'settings';

interface SyncState {
  phase: 'idle' | 'finding' | 'checking' | 'pulling' | 'done' | 'error';
  text: string;
  done?: number;
  total?: number;
}

interface State {
  ready: boolean;
  route: Route;
  books: LocalBook[];
  server?: Server;
  /** 找到了电脑但还没配对 */
  pending?: { host: string; name?: string };
  sync: SyncState;
  sheet: Sheet;
  book?: Loaded;
  theme: 'night' | 'paper';
  fontSize: number;
  init(): Promise<void>;
  go(r: Route, replace?: boolean): void;
  back(): void;
  setSheet(s: Sheet): void;
  syncNow(): Promise<void>;
  pair(key: string): Promise<void>;
  setHost(host: string): Promise<void>;
  ensureBook(id: string): Promise<void>;
  setTheme(t: 'night' | 'paper'): void;
  setFontSize(n: number): void;
  forget(): Promise<void>;
}

const pref = (k: string, d: string) => {
  try {
    return localStorage.getItem(`xt:${k}`) ?? d;
  } catch {
    return d;
  }
};
const setPref = (k: string, v: string) => {
  try {
    localStorage.setItem(`xt:${k}`, v);
  } catch {}
};

const BATCH = 40;

/** 返回上一页时要恢复的滚动位置 */
export const scrollMemo: { y: number | null } = { y: null };

export const useApp = create<State>((set, get) => ({
  ready: false,
  route: { v: 'home' },
  books: [],
  sync: { phase: 'idle', text: '' },
  sheet: null,
  theme: pref('theme', 'night') as 'night' | 'paper',
  fontSize: Number(pref('font', '19')),

  async init() {
    const books = (await kvGet<LocalBook[]>('books')) ?? [];
    let server = await kvGet<Server>('server');
    // 网页版：扫码打开的地址里带着配对码 #k=123456
    const k = !native && location.hash.match(/k=(\d{6})/)?.[1];
    if (k) {
      server = { host: location.host, key: k };
      await kvSet('server', server);
      history.replaceState(null, '', location.pathname);
    }
    history.replaceState({ r: { v: 'home' } }, '');
    window.addEventListener('popstate', (e) => {
      scrollMemo.y = e.state?.y ?? 0;
      set({ route: e.state?.r ?? { v: 'home' }, sheet: null });
    });
    // 安卓返回键：先关弹层，再退回上一页，到首页再退出
    if (native)
      App.addListener('backButton', () => {
        if (get().sheet) set({ sheet: null });
        else if (get().route.v !== 'home') get().back();
        else App.minimizeApp();
      });
    set({ ready: true, books, server });
    if (k && !books.length) get().syncNow();
  },

  go(r, replace) {
    scrollMemo.y = null;
    if (replace) history.replaceState({ r }, '');
    else {
      history.replaceState({ ...history.state, y: window.scrollY }, '');
      history.pushState({ r }, '');
    }
    set({ route: r });
    if ('id' in r) get().ensureBook(r.id);
  },

  back() {
    if (history.state?.r?.v && history.state.r.v !== 'home') history.back();
    else set({ route: { v: 'home' } });
  },

  setSheet(sheet) {
    set({ sheet });
  },

  async ensureBook(id) {
    if (get().book?.id === id) return;
    const meta = get().books.find((b) => b.id === id);
    if (!meta) return;
    set({ book: await loadBook(meta) });
  },

  async syncNow() {
    const busy = ['finding', 'checking', 'pulling'];
    if (busy.includes(get().sync.phase)) return;
    const saved = get().server;
    set({ sync: { phase: 'finding', text: '正在找电脑…' }, sheet: null });
    try {
      // 先试上次的地址，不通再广播找（电脑的 IP 可能变了）
      const tried = new Set<string>();
      let found: { host: string; name: string; authorized: boolean } | null = null;
      const attempt = async (host: string) => {
        if (tried.has(host)) return null;
        tried.add(host);
        try {
          const h = await hello(host, saved?.key);
          return { host, name: h.name, authorized: h.authorized };
        } catch {
          return null;
        }
      };
      if (saved) found = await attempt(saved.host);
      if (!found) {
        const list = await discover();
        list.sort((a, b) => Number(b.name === saved?.name) - Number(a.name === saved?.name));
        for (const c of list) if ((found = await attempt(c.host))) break;
      }
      if (!found) {
        set({ sync: { phase: 'error', text: '没找到电脑。确认电脑上的星图书房开着，手机和电脑连的是同一个 Wi-Fi。' } });
        return;
      }
      if (!found.authorized) {
        set({ pending: { host: found.host, name: found.name }, sheet: 'pair', sync: { phase: 'idle', text: '' } });
        return;
      }
      const server: Server = { host: found.host, key: saved!.key, name: found.name };
      await kvSet('server', server);
      set({ server });
      await pull(server, set, get);
    } catch (e: any) {
      if (e instanceof HttpError && e.status === 401) {
        set({ pending: { host: saved!.host, name: saved?.name }, sheet: 'pair', sync: { phase: 'idle', text: '' } });
        return;
      }
      set({ sync: { phase: 'error', text: `同步失败：${e?.message ?? e}` } });
    }
  },

  async pair(key) {
    const p = get().pending ?? (get().server && { host: get().server!.host, name: get().server!.name });
    if (!p) return;
    const server: Server = { host: p.host, key, name: p.name };
    await kvSet('server', server);
    set({ server, pending: undefined, sheet: null });
    await get().syncNow();
  },

  async setHost(raw) {
    const host = raw.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    const withPort = /:\d+$/.test(host) ? host : `${host}:5210`;
    const server: Server = { host: withPort, key: get().server?.key ?? '' };
    await kvSet('server', server);
    set({ server, sheet: null });
    await get().syncNow();
  },

  setTheme(theme) {
    setPref('theme', theme);
    set({ theme });
  },

  setFontSize(n) {
    const v = Math.max(14, Math.min(28, n));
    setPref('font', String(v));
    set({ fontSize: v });
  },

  async forget() {
    for (const b of get().books) await deleteBook(b.id);
    await kvSet('books', []);
    await kvSet('server', null);
    set({ books: [], server: undefined, book: undefined, sync: { phase: 'idle', text: '' }, sheet: null });
  },
}));

type Set = (p: Partial<State>) => void;

async function pull(server: Server, set: Set, get: () => State) {
  set({ sync: { phase: 'checking', text: '正在比对…' } });
  const remote = await request<SyncBook[]>(server.host, '/api/books', { key: server.key, timeout: 20000 });
  const local = get().books;
  const plans = remote.map((rb) => {
    const lb = local.find((b) => b.id === rb.id);
    const want = Object.keys(rb.files).filter((p) => lb?.files[p] !== rb.files[p]);
    const gone = lb ? Object.keys(lb.files).filter((p) => !(p in rb.files)) : [];
    return { rb, lb, want, gone };
  });
  const total = plans.reduce((s, p) => s + p.want.length, 0);
  let got = 0;
  const now = Date.now();
  const next: LocalBook[] = [];
  const summary: string[] = [];
  for (const { rb, lb, want, gone } of plans) {
    const files = { ...rb.files };
    for (let i = 0; i < want.length; i += BATCH) {
      set({ sync: { phase: 'pulling', text: `正在同步《${rb.title}》`, done: got, total } });
      const batch = want.slice(i, i + BATCH);
      const res = await request<Record<string, string | null>>(server.host, '/api/pull', { key: server.key, body: { book: rb.id, paths: batch } });
      for (const p of batch) if (res[p] == null) delete files[p];
      await putFiles(rb.id, res);
      got += batch.length;
    }
    if (gone.length) await putFiles(rb.id, Object.fromEntries(gone.map((p) => [p, null])));
    // 第一次同步一本书时什么都是新的，不算“改动”
    const changes: Change[] = !lb ? [] : [
      ...want.filter((p) => p in files).map((p): Change => ({ path: p, kind: lb?.files[p] ? 'mod' : 'new' })),
      ...gone.map((p): Change => ({ path: p, kind: 'del' })),
    ];
    if (!lb) summary.push(`《${rb.title}》`);
    else if (changes.length) summary.push(`《${rb.title}》${describeChanges(changes)}`);
    next.push({
      id: rb.id,
      title: rb.title,
      info: rb.info,
      files,
      syncedAt: now,
      changes: changes.length ? changes : lb?.changes ?? [],
      changedAt: changes.length ? now : lb?.changedAt,
    });
  }
  // 电脑书架上拿掉的书，手机上也删掉
  for (const b of local) if (!remote.some((r) => r.id === b.id)) await deleteBook(b.id);
  await kvSet('books', next);
  const cur = get().book;
  set({
    books: next,
    book: undefined,
    sync: { phase: 'done', text: summary.length ? `已同步：${summary.join('；')}` : '已经是最新的', done: total, total },
  });
  if (cur && next.some((b) => b.id === cur.id)) await get().ensureBook(cur.id);
}
