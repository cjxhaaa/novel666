import { useCallback, useEffect, useState } from 'react';
import { scrollMemo, useApp } from './store';
import { FONTS, THEMES } from './prefs';
import { native, setSystemBars } from './net';
import { Home } from './views/Home';
import { BookPage } from './views/BookPage';
import { Reader } from './views/Reader';
import { DocPage } from './views/Docs';
import { PersonPage } from './views/People';
import { Splash } from './views/Splash';
import { HostSheet, PairSheet, SettingsSheet } from './views/Sheets';

export default function App() {
  const ready = useApp((s) => s.ready);
  const route = useApp((s) => s.route);
  const sheet = useApp((s) => s.sheet);
  const theme = useApp((s) => s.theme);
  const book = useApp((s) => s.book);
  const font = useApp((s) => s.read.font);
  // 开屏：show 时只有开屏，开始淡出（leaving）时才把书架摆出来，免得抢开屏动画的首帧
  const [splash, setSplash] = useState<'show' | 'leaving' | 'gone'>('show');
  const leaveSplash = useCallback(() => setSplash('leaving'), []);
  const endSplash = useCallback(() => setSplash('gone'), []);
  const ensureBook = useApp((s) => s.ensureBook);

  useEffect(() => {
    useApp.getState().init();
  }, []);
  useEffect(() => {
    const t = THEMES.find((x) => x.id === theme)!;
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', t.bg);
    // 开屏时系统栏和开屏一样是夜色
    const on = splash !== 'gone';
    if (native) setSystemBars(on || t.dark, on ? '#060913' : t.bg);
  }, [theme, splash]);
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

  // 开屏放在固定的位置，数据载入前后都是同一个，动画不会重来
  return (
    <div className="app">
      {!ready || splash === 'show' ? null : route.v === 'home' ? (
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
      {splash !== 'gone' && <Splash onLeave={leaveSplash} onDone={endSplash} />}
    </div>
  );
}
