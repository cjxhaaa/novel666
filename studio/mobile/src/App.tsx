import { useEffect } from 'react';
import { scrollMemo, useApp } from './store';
import { FONTS, THEMES } from './prefs';
import { native, setSystemBars } from './net';
import { Home } from './views/Home';
import { BookPage } from './views/BookPage';
import { Reader } from './views/Reader';
import { DocPage } from './views/Docs';
import { PersonPage } from './views/People';
import { HostSheet, PairSheet, SettingsSheet } from './views/Sheets';

export default function App() {
  const ready = useApp((s) => s.ready);
  const route = useApp((s) => s.route);
  const sheet = useApp((s) => s.sheet);
  const theme = useApp((s) => s.theme);
  const book = useApp((s) => s.book);
  const font = useApp((s) => s.read.font);
  const ensureBook = useApp((s) => s.ensureBook);

  useEffect(() => {
    useApp.getState().init();
  }, []);
  useEffect(() => {
    const t = THEMES.find((x) => x.id === theme)!;
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', t.bg);
    if (native) setSystemBars(t.dark, t.bg);
  }, [theme]);
  // 设定集、大纲这些文档也用选中的字体
  useEffect(() => {
    document.documentElement.style.setProperty('--font-read', FONTS.find((f) => f.id === font)!.family);
  }, [font]);
  useEffect(() => {
    if ('id' in route) ensureBook(route.id);
  }, [route, ensureBook]);
  const loading = 'id' in route && book?.id !== route.id;
  // 换页回到顶部，返回时回到原来的位置；阅读页自己记位置
  useEffect(() => {
    if (loading || route.v === 'read') return;
    const y = scrollMemo.y ?? 0;
    requestAnimationFrame(() => window.scrollTo(0, y));
  }, [route, loading]);

  if (!ready) return null;
  return (
    <div className="app">
      {route.v === 'home' ? (
        <Home />
      ) : loading ? (
        <div className="empty">正在翻开…</div>
      ) : route.v === 'book' ? (
        <BookPage tab={route.tab} />
      ) : route.v === 'read' ? (
        <Reader num={route.num} />
      ) : route.v === 'doc' ? (
        <DocPage path={route.path} heading={route.heading} />
      ) : (
        <PersonPage pid={route.pid} />
      )}
      {sheet === 'pair' && <PairSheet />}
      {sheet === 'host' && <HostSheet />}
      {sheet === 'settings' && <SettingsSheet />}
    </div>
  );
}
