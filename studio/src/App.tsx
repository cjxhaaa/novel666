import { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useStore, type View } from './store';
import { api } from './api';
import { BrandMark, Icon } from './components/Icon';
import { StarField } from './components/StarField';
import { CommandPalette } from './components/CommandPalette';
import { ContextPackModal } from './components/ContextPack';
import { useIssues } from './lib/derived';
import { Dashboard } from './views/Dashboard';
import { PlotGrid } from './views/PlotGrid';
import { Chapters } from './views/Chapters';
import { Characters } from './views/Characters';
import { Locations } from './views/Locations';
import { Timeline } from './views/Timeline';
import { Foreshadows } from './views/Foreshadows';
import { Codex } from './views/Codex';
import { Guard } from './views/Guard';
import { Bookshelf } from './views/Bookshelf';
import { NAV } from './nav';


function useTheme() {
  const [theme, setTheme] = useState<string>(() => {
    try {
      return localStorage.getItem('theme') ?? 'night';
    } catch {
      return 'night';
    }
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('theme', theme);
    } catch {}
  }, [theme]);
  return [theme, setTheme] as const;
}

function CursorControl() {
  const cursor = useStore((s) => s.cursor);
  const setCursor = useStore((s) => s.setCursor);
  const max = useStore((s) => Math.max(1, ...s.data.chapters.map((c) => c.num)));
  const ch = useStore((s) => s.data.chapters.find((c) => c.num === s.cursor));
  const [v, setV] = useState(String(cursor));
  useEffect(() => setV(String(cursor)), [cursor]);
  const commit = (n: number) => setCursor(Math.min(max, Math.max(1, n)));
  return (
    <div className="cursor-ctl no-drag" title="当前章：人物状态、关系、伏笔都按“写到这一章时”来计算">
      <button className="btn ghost sm icon" onClick={() => commit(cursor - 1)}>
        <Icon name="left" size={15} />
      </button>
      <span className="label faint">写到第</span>
      <input value={v} onChange={(e) => setV(e.target.value)} onBlur={() => commit(parseInt(v) || cursor)} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
      <span className="label faint">章</span>
      <span className="label ellipsis" style={{ maxWidth: 150 }}>
        {ch?.title}
      </span>
      <button className="btn ghost sm icon" onClick={() => commit(cursor + 1)}>
        <Icon name="right" size={15} />
      </button>
    </div>
  );
}

function SaveState() {
  const pending = useStore((s) => s.pending);
  const dirtyTexts = useStore((s) => Object.keys(s.dirtyTexts).length);
  const busy = pending + dirtyTexts > 0;
  return (
    <span className="save-dot no-drag" title={busy ? '正在写入 story/ 与章节文件' : '所有改动都已写入磁盘'}>
      <span className="dot" style={{ ['--c' as any]: busy ? 'var(--warn)' : 'var(--jade)' }} />
      {busy ? '保存中' : '已保存'}
    </span>
  );
}

function Welcome() {
  const pickRoot = useStore((s) => s.pickRoot);
  return (
    <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}>
      <div className="panel" style={{ padding: 40, width: 520, textAlign: 'center' }}>
        <BrandMark size={56} />
        <h1 style={{ fontSize: 34, margin: '14px 0 6px' }}>星图书房</h1>
        <p className="muted">选择一个小说仓库目录。软件会把结构化的设定存进其中的 story/ 目录，正文仍是 chapters/ 下的 markdown。</p>
        <button className="btn primary" style={{ marginTop: 16 }} onClick={pickRoot}>
          <Icon name="folder" /> 选择小说目录
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const s = useStore(
    useShallow((st) => ({
      status: st.status,
      error: st.error,
      root: st.root,
      title: st.data.project.title,
      view: st.view,
      paletteOpen: st.paletteOpen,
      contextFor: st.contextFor,
      toasts: st.toasts,
      canUndo: st.undoStack.length > 0,
      load: st.load,
      loadShelf: st.loadShelf,
      backToShelf: st.backToShelf,
      pickRoot: st.pickRoot,
      go: st.go,
      undo: st.undo,
      setPalette: st.setPalette,
    })),
  );
  const [theme, setTheme] = useTheme();
  const issues = useIssues();
  const warnCount = issues.filter((i) => i.severity !== 'info').length;

  useEffect(() => {
    s.loadShelf();
    return api.onExternalChange((paths) => useStore.getState().onExternalChange(paths));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const st = useStore.getState();
      const editing = e.target instanceof Element && e.target.closest('input, textarea, .cm-editor');
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        st.setPalette(!st.paletteOpen);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !editing) {
        e.preventDefault();
        st.undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        Object.keys(st.dirtyTexts).forEach((k) => st.saveText(+k));
        st.toast('已保存', 'ok');
      } else if ((e.ctrlKey || e.metaKey) && /^[1-9]$/.test(e.key)) {
        e.preventDefault();
        st.go(NAV[+e.key - 1].id);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const views: Record<View, React.ReactNode> = {
    dashboard: <Dashboard />,
    plot: <PlotGrid />,
    chapters: <Chapters />,
    characters: <Characters />,
    locations: <Locations />,
    timeline: <Timeline />,
    foreshadow: <Foreshadows />,
    codex: <Codex />,
    guard: <Guard />,
  };

  return (
    <div className={`app ${s.status === 'shelf' ? 'on-shelf' : ''}`}>
      <StarField />
      <header className="titlebar">
        <div className={`brand ${s.status === 'ready' ? 'no-drag clickable' : ''}`} onClick={() => s.status === 'ready' && s.backToShelf()} title={s.status === 'ready' ? '回书架' : undefined}>
          <BrandMark />
          <span>星图书房</span>
          {s.status === 'ready' && (
            <>
              <span className="sep">／</span>
              <span className="book">{s.title}</span>
            </>
          )}
        </div>
        <span className="grow" />
        {s.status === 'ready' && (
          <>
            <CursorControl />
            <div className="search-trigger no-drag" onClick={() => s.setPalette(true)}>
              <Icon name="search" size={15} />
              <span className="grow">搜索人物、地点、章节、设定…</span>
              <span className="kbd">Ctrl</span>
              <span className="kbd">K</span>
            </div>
            <SaveState />
          </>
        )}
        <button className="btn ghost sm icon no-drag" title="切换主题（夜空 / 宣纸）" onClick={() => setTheme(theme === 'night' ? 'paper' : 'night')}>
          <Icon name={theme === 'night' ? 'sun' : 'moon'} size={16} />
        </button>
        {s.status === 'ready' && (
          <button className="btn ghost sm no-drag" title={`回书架（当前：${s.root ?? '无'}）`} onClick={s.backToShelf}>
            <Icon name="codex" size={16} /> 书架
          </button>
        )}
      </header>

      <nav className="rail">
        {NAV.map((n, i) => (
          <button key={n.id} className={`rail-btn ${s.view === n.id ? 'active' : ''}`} onClick={() => s.go(n.id)} title={`${n.label}（Ctrl+${i + 1}）`} disabled={s.status !== 'ready'}>
            <Icon name={n.icon} size={21} />
            {n.label}
            {n.id === 'guard' && warnCount > 0 && <span className="badge">{warnCount > 99 ? '99+' : warnCount}</span>}
          </button>
        ))}
        <span className="rail-spacer" />
        <button className="rail-btn" onClick={s.undo} title="撤销（Ctrl+Z）" disabled={!s.canUndo}>
          <Icon name="undo" size={19} />
          撤销
        </button>
      </nav>

      <main className="main">
        {s.status === 'loading' && <div className="empty">正在展开星图…</div>}
        {s.status === 'noroot' && <Welcome />}
        {s.status === 'shelf' && <Bookshelf />}
        {s.status === 'error' && (
          <div className="empty">
            <div className="big">载入失败</div>
            <div className="selectable">{s.error}</div>
            <button className="btn" onClick={s.loadShelf}>
              回书架
            </button>
          </div>
        )}
        {s.status === 'ready' && <div key={s.view} style={{ height: '100%' }}>{views[s.view]}</div>}
      </main>

      {s.paletteOpen && <CommandPalette />}
      {s.contextFor != null && <ContextPackModal />}
      <div className="toasts">
        {s.toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            <Icon name={t.kind === 'error' ? 'warn' : t.kind === 'ok' ? 'check' : 'info'} size={16} />
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}
