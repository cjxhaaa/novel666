import { useEffect, useMemo, useRef, useState } from 'react';
import { marked } from 'marked';
import { countChars } from '../../../src/lib/analysis';
import { useApp } from '../store';
import { Icon, Sheet } from '../ui';
import { THEMES } from '../prefs';
import { native, setFullscreen } from '../net';
import { proseStyle, ReadSettings } from './ReadSettings';

interface Pos {
  num: number;
  y: number;
}

/** 每本书读到哪一章、滚到哪里，只存在这台手机上 */
export function readPos(book: string): Pos | null {
  try {
    return JSON.parse(localStorage.getItem(`xt:pos:${book}`) ?? 'null');
  } catch {
    return null;
  }
}

function savePos(book: string, p: Pos) {
  try {
    localStorage.setItem(`xt:pos:${book}`, JSON.stringify(p));
  } catch {}
}

export function Reader({ num }: { num: number }) {
  const book = useApp((s) => s.book)!;
  const go = useApp((s) => s.go);
  const back = useApp((s) => s.back);
  const read = useApp((s) => s.read);
  const setRead = useApp((s) => s.setRead);
  const theme = useApp((s) => s.theme);
  const toggleDayNight = useApp((s) => s.toggleDayNight);
  const [menu, setMenu] = useState(false);
  const [panel, setPanel] = useState(false);
  const [pct, setPct] = useState(0);
  const ch = book.data.chapters.find((c) => c.num === num);
  const text = book.texts[num];
  const html = useMemo(() => (text != null ? (marked.parse(text, { async: false }) as string) : ''), [text]);
  const dark = THEMES.find((t) => t.id === theme)?.dark;

  const nums = useMemo(() => {
    const s = new Set<number>([...Object.keys(book.texts).map(Number), ...book.data.chapters.map((c) => c.num)]);
    return [...s].sort((a, b) => a - b);
  }, [book]);
  const idx = nums.indexOf(num);
  const prev = idx > 0 ? nums[idx - 1] : null;
  const next = idx >= 0 && idx < nums.length - 1 ? nums[idx + 1] : null;
  const jump = (n: number) => {
    savePos(book.id, { num: n, y: 0 });
    go({ v: 'read', id: book.id, num: n }, true);
    window.scrollTo(0, 0);
  };

  // 回到上次读到的位置；之后边读边记，顺便算读到本章的百分之几
  const restored = useRef(false);
  useEffect(() => {
    restored.current = false;
    const p = readPos(book.id);
    const calc = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setPct(max > 0 ? Math.min(100, Math.round((window.scrollY / max) * 100)) : 100);
    };
    requestAnimationFrame(() => {
      window.scrollTo(0, p?.num === num ? p.y : 0);
      restored.current = true;
      calc();
    });
    if (p?.num !== num) savePos(book.id, { num, y: 0 });
    let t: number | undefined;
    const h = () => {
      calc();
      if (!restored.current) return;
      setMenu(false);
      clearTimeout(t);
      t = window.setTimeout(() => savePos(book.id, { num, y: Math.round(window.scrollY) }), 300);
    };
    window.addEventListener('scroll', h, { passive: true });
    return () => {
      window.removeEventListener('scroll', h);
      clearTimeout(t);
    };
  }, [book.id, num]);

  // 全屏：读的时候藏起状态栏和导航条，呼出菜单或设置时再露出来
  const immersive = read.fullscreen && !menu && !panel;
  useEffect(() => {
    if (native) setFullscreen(immersive);
  }, [immersive]);
  useEffect(
    () => () => {
      if (native) setFullscreen(false);
    },
    [],
  );

  // 点屏幕中间呼出菜单；菜单开着时点哪儿都收起
  const onTap = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, a, .read-menu, .sheet')) return;
    if (menu) return setMenu(false);
    const y = e.clientY / window.innerHeight;
    if (y > 0.25 && y < 0.75) setMenu(true);
  };

  return (
    <div className={`page reader ${read.fullscreen ? 'full' : ''}`} onClick={onTap}>
      <div className="read-head">
        <span className="ellipsis">{ch?.title ?? `第 ${num} 章`}</span>
      </div>
      <article className="prose" style={proseStyle(read)}>
        {text != null ? (
          <>
            <div dangerouslySetInnerHTML={{ __html: html }} />
            <div className="prose-end">— 本章 {countChars(text)} 字 —</div>
          </>
        ) : (
          <div className="unwritten">
            <h2>{ch?.title ?? `第 ${num} 章`}</h2>
            <p className="muted">这一章还没写。</p>
            {ch?.plan && (
              <>
                <h4>计划</h4>
                <p>{ch.plan}</p>
              </>
            )}
          </div>
        )}
      </article>
      <nav className="read-nav">
        <button className="btn" disabled={prev == null} onClick={() => prev != null && jump(prev)}>
          <Icon name="left" size={18} /> 上一章
        </button>
        <span className="muted nums">
          {idx + 1} / {nums.length}
        </span>
        <button className="btn" disabled={next == null} onClick={() => next != null && jump(next)}>
          下一章 <Icon name="right" size={18} />
        </button>
      </nav>
      <div className="read-foot nums">
        <span>第 {num} 章</span>
        <span>{pct}%</span>
      </div>

      <div className={`read-menu top ${menu ? 'on' : ''}`}>
        <button className="icon-btn" onClick={back} aria-label="返回">
          <Icon name="left" size={22} />
        </button>
        <div className="topbar-title">
          <div className="t">第 {num} 章</div>
          <div className="s">{ch?.title}</div>
        </div>
      </div>
      <div className={`read-menu bottom ${menu ? 'on' : ''}`}>
        <div className="rm-chapters">
          <button className="btn ghost" disabled={prev == null} onClick={() => prev != null && jump(prev)}>
            <Icon name="left" size={16} /> 上一章
          </button>
          <span className="muted nums">
            {idx + 1} / {nums.length} · {pct}%
          </span>
          <button className="btn ghost" disabled={next == null} onClick={() => next != null && jump(next)}>
            下一章 <Icon name="right" size={16} />
          </button>
        </div>
        <div className="rm-tools">
          <button onClick={() => go({ v: 'book', id: book.id, tab: 'chapters' })}>
            <Icon name="list" size={22} />
            目录
          </button>
          <button onClick={toggleDayNight}>
            <Icon name={dark ? 'sun' : 'moon'} size={22} />
            {dark ? '日间' : '夜间'}
          </button>
          <button onClick={() => setRead({ fullscreen: !read.fullscreen })}>
            <Icon name="grid" size={22} />
            {read.fullscreen ? '退出全屏' : '全屏'}
          </button>
          <button
            onClick={() => {
              setMenu(false);
              setPanel(true);
            }}
          >
            <span className="aa-icon">Aa</span>
            设置
          </button>
        </div>
      </div>

      {panel && (
        <Sheet title="阅读设置" onClose={() => setPanel(false)} light>
          <ReadSettings />
        </Sheet>
      )}
    </div>
  );
}
