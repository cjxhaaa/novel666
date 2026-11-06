import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BrandMark } from '../../../src/components/Icon';
import { StarField } from '../../../src/components/StarField';
import { fmtWan } from '../../../src/lib/analysis';
import { describeChanges, type LocalBook } from '../book';
import { hello, native } from '../net';
import { THEMES } from '../prefs';
import { useApp } from '../store';
import { ago, Icon } from '../ui';

/** 封面颜色：和桌面端一样按书名取一种，同一本书在电脑和手机上颜色相同 */
const COVERS = [
  ['#1f3a5f', '#16294a'], // 靛青
  ['#6b2a22', '#4e1c16'], // 朱褐
  ['#2d4a3e', '#1f352c'], // 苍绿
  ['#4a3a6b', '#33284d'], // 紫棠
  ['#5c4a2a', '#43361e'], // 赭石
  ['#2b2f3a', '#1c1f27'], // 墨
];
function coverOf(title: string) {
  let h = 0;
  for (const ch of title) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return COVERS[h % COVERS.length];
}

const BOOK_W = 124;
const GAP = 30;

/** 一层放几本：按屏幕宽度算 */
function usePerRow() {
  const ref = useRef<HTMLDivElement>(null);
  const [n, setN] = useState(2);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setN(Math.max(2, Math.floor((el.clientWidth - 24 + GAP) / (BOOK_W + GAP)))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, n] as const;
}

function seenAt(id: string) {
  try {
    return Number(localStorage.getItem(`xt:seen:${id}`) ?? 0);
  } catch {
    return 0;
  }
}

function lastBook() {
  try {
    return localStorage.getItem('xt:last-book');
  } catch {
    return null;
  }
}

function Book({ b, current }: { b: LocalBook; current: boolean }) {
  const go = useApp((s) => s.go);
  const [c1, c2] = coverOf(b.title);
  const i = b.info;
  const pct = i.planned ? Math.min(100, Math.round((i.done / i.planned) * 100)) : 0;
  const fresh = !!b.changedAt && b.changes.length > 0 && b.changedAt > seenAt(b.id);
  return (
    <div className="shelf-item" style={{ width: BOOK_W }}>
      <button
        className={`book-cover ${current ? 'current' : ''}`}
        style={{ ['--c1' as string]: c1, ['--c2' as string]: c2 }}
        onClick={() => go({ v: 'book', id: b.id, tab: 'chapters' })}
        aria-label={`打开《${b.title}》`}
      >
        <div className="book-binding">
          {[0, 1, 2, 3].map((k) => (
            <span key={k} />
          ))}
        </div>
        <div className="book-slip">
          <span>{b.title}</span>
        </div>
        {current && <span className="book-ribbon">在读</span>}
        {fresh && <span className="book-fresh">新</span>}
      </button>
      <div className="book-caption">
        <div className="book-name">{b.title}</div>
        <div className="book-meta nums">
          {i.done} / {i.planned || '—'} 章 · {fmtWan(i.words)} 字
        </div>
        <div className="book-progress">
          <i style={{ width: `${pct}%` }} />
        </div>
        <div className="book-meta faint">
          {i.currentVolume ? `${i.currentVolume.replace(/[：:].*$/, '')} · ` : ''}
          {ago(i.updatedAt)}
        </div>
        {fresh && <div className="book-news">{describeChanges(b.changes)}</div>}
      </div>
    </div>
  );
}

export function Home() {
  const books = useApp((s) => s.books);
  const setSheet = useApp((s) => s.setSheet);
  const theme = useApp((s) => s.theme);
  const dark = THEMES.find((t) => t.id === theme)?.dark;
  const [ref, perRow] = usePerRow();
  const last = lastBook();
  const rows: LocalBook[][] = [];
  for (let k = 0; k < books.length; k += perRow) rows.push(books.slice(k, k + perRow));
  // 至少摆两层，空书架也像个书架
  while (rows.length < 2) rows.push([]);
  const words = books.reduce((a, b) => a + b.info.words, 0);
  return (
    <div className="page home">
      {dark && <StarField />}
      <header className="home-head">
        <BrandMark size={26} />
        <span className="brand">星图书房</span>
        <span className="grow" />
        <button className="icon-btn" onClick={() => setSheet('settings')} aria-label="设置">
          <Icon name="gear" size={21} />
        </button>
      </header>
      <SyncCard />
      <ApkBanner />
      <div className="shelf-head">
        <h1>书架</h1>
        <div className="sub">{books.length ? `${books.length} 本 · 共 ${fmtWan(words)} 字` : '还是空的'}</div>
      </div>
      <div className="shelf" ref={ref}>
        {rows.map((row, k) => (
          <div className="shelf-row" key={k} style={{ gap: GAP }}>
            {row.map((b) => (
              <Book key={b.id} b={b} current={b.id === last} />
            ))}
            {k === 0 && books.length === 0 && (
              <div className="shelf-empty">在电脑上打开星图书房，手机和电脑连同一个 Wi-Fi，点上面的“同步”，书架上的书就都过来了。</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function SyncCard() {
  const sync = useApp((s) => s.sync);
  const server = useApp((s) => s.server);
  const books = useApp((s) => s.books);
  const syncNow = useApp((s) => s.syncNow);
  const setSheet = useApp((s) => s.setSheet);
  const busy = ['finding', 'checking', 'pulling'].includes(sync.phase);
  const last = books.reduce((m, b) => Math.max(m, b.syncedAt), 0);
  const pct = sync.total ? Math.round(((sync.done ?? 0) / sync.total) * 100) : 0;
  return (
    <section className={`sync-card ${sync.phase}`}>
      <div className="sync-row">
        <div className="sync-info">
          <div className="sync-device">
            <Icon name="wifi" size={16} />
            {server?.name ?? (server ? server.host : '还没连过电脑')}
          </div>
          <div className="sync-sub">{last ? `上次同步 ${ago(last)}` : '同一个 Wi-Fi 下点一下就能同步'}</div>
        </div>
        <button className="sync-btn" disabled={busy} onClick={syncNow}>
          <span className={busy ? 'spin' : ''}>
            <Icon name="refresh" size={20} stroke={2} />
          </span>
          {busy ? '同步中' : '同步'}
        </button>
      </div>
      {busy && sync.phase === 'pulling' && (
        <div className="progress">
          <div style={{ width: `${pct}%` }} />
        </div>
      )}
      {sync.text && <div className="sync-msg">{sync.text}</div>}
      {sync.phase === 'error' && (
        <div className="sync-actions">
          <button className="btn" onClick={syncNow}>
            再试一次
          </button>
          <button className="btn ghost" onClick={() => setSheet('host')}>
            手动输入电脑地址
          </button>
        </div>
      )}
    </section>
  );
}

/** 网页版：电脑上打包好了安卓安装包时，提示下载 */
function ApkBanner() {
  const [apk, setApk] = useState(false);
  useEffect(() => {
    if (native || !/^https?:$/.test(location.protocol)) return;
    hello(location.host)
      .then((h) => setApk(h.apk && /android/i.test(navigator.userAgent)))
      .catch(() => {});
  }, []);
  if (!apk) return null;
  return (
    <a className="apk-banner" href="/xingtu.apk" download="星图书房.apk">
      <Icon name="phone" size={20} />
      <div className="grow">
        <div>安装安卓 App</div>
        <div className="muted">装好以后离线也能看，以后打开 App 点“同步”即可</div>
      </div>
      <Icon name="right" size={18} />
    </a>
  );
}
