import { useEffect, useState } from 'react';
import { BrandMark } from '../../../src/components/Icon';
import { fmtWan } from '../../../src/lib/analysis';
import { describeChanges } from '../book';
import { hello, native } from '../net';
import { useApp } from '../store';
import { ago, Empty, Icon } from '../ui';

export function Home() {
  const books = useApp((s) => s.books);
  const go = useApp((s) => s.go);
  const setSheet = useApp((s) => s.setSheet);
  return (
    <div className="page home">
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
      {books.length === 0 ? (
        <Empty title="书架还是空的">在电脑上打开星图书房，手机和电脑连同一个 Wi-Fi，点上面的“同步”，书架上的书就都过来了。</Empty>
      ) : (
        <div className="shelf">
          {books.map((b) => (
            <button key={b.id} className="book-card" onClick={() => go({ v: 'book', id: b.id, tab: 'chapters' })}>
              <div className="spine" />
              <div className="book-main">
                <div className="book-title">{b.title}</div>
                {b.info.logline && <div className="book-logline">{b.info.logline}</div>}
                <div className="book-stats">
                  <span>
                    已写 <b>{b.info.done}</b> 章
                  </span>
                  <span>
                    <b>{fmtWan(b.info.words)}</b> 字
                  </span>
                  {b.info.currentVolume && <span>{b.info.currentVolume.split(/[：:]/)[0]}</span>}
                </div>
                {b.changedAt && b.changes.length > 0 && (
                  <div className="book-changes">
                    <span className="when">{ago(b.changedAt)}</span>
                    {describeChanges(b.changes)}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
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
