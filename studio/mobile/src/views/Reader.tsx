import { useEffect, useMemo, useRef, useState } from 'react';
import { marked } from 'marked';
import { countChars } from '../../../src/lib/analysis';
import { useApp } from '../store';
import { Icon, Sheet } from '../ui';
import { THEMES } from '../prefs';
import { native, setFullscreen } from '../net';
import { proseStyle, ReadSettings } from './ReadSettings';
import { Pager } from './Pager';

interface Pos {
  num: number;
  /** 滚动模式下滚到的像素 */
  y: number;
  /** 读到本章的几分之几（0–1），两种翻页方式之间切换时按它接上 */
  f?: number;
  /** 最后一次是在哪种方式下记的 */
  src?: 'scroll' | 'page';
}

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

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
  const [pageInfo, setPageInfo] = useState<[number, number]>([0, 1]);
  const paged = read.turn !== 'scroll';
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
  const jump = (n: number, f = 0) => {
    savePos(book.id, { num: n, y: 0, f, src: paged ? 'page' : 'scroll' });
    go({ v: 'read', id: book.id, num: n }, true);
    window.scrollTo(0, 0);
  };

  // 回到上次读到的位置；之后边读边记，顺便算读到本章的百分之几
  const restored = useRef(false);
  useEffect(() => {
    if (paged) return;
    restored.current = false;
    const p = readPos(book.id);
    const calc = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setPct(max > 0 ? Math.min(100, Math.round((window.scrollY / max) * 100)) : 100);
    };
    requestAnimationFrame(() => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      window.scrollTo(0, p?.num !== num ? 0 : p.src === 'page' && p.f != null ? p.f * max : p.y);
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
      t = window.setTimeout(() => {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        savePos(book.id, { num, y: Math.round(window.scrollY), f: max > 0 ? window.scrollY / max : 0, src: 'scroll' });
      }, 300);
    };
    window.addEventListener('scroll', h, { passive: true });
    return () => {
      window.removeEventListener('scroll', h);
      clearTimeout(t);
    };
  }, [book.id, num, paged]);

  // 翻页模式：从上回读到的比例接着翻，翻过本章头尾就到相邻的章
  const start = useMemo(() => {
    const p = readPos(book.id);
    if (p?.num !== num) return 0;
    if (p.f != null) return p.f;
    return 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id, num, paged]);
  const pageHtml = useMemo(() => {
    if (text != null) return html + `<div class="prose-end">— 本章 ${countChars(text)} 字 —</div>`;
    const title = esc(ch?.title ?? `第 ${num} 章`);
    const plan = ch?.plan ? `<h4>计划</h4><p>${esc(ch.plan)}</p>` : '';
    return `<div class="unwritten"><h2>${title}</h2><p class="muted">这一章还没写。</p>${plan}</div>`;
  }, [html, text, ch, num]);
  const onPage = (p: number, n: number) => {
    setPageInfo([p, n]);
    setPct(Math.round(((p + 1) / n) * 100));
    savePos(book.id, { num, y: 0, f: n > 1 ? p / (n - 1) : 0, src: 'page' });
  };
  const onEdge = (dir: -1 | 1) => {
    if (dir === 1 && next != null) jump(next, 0);
    else if (dir === -1 && prev != null) jump(prev, 1);
  };

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
    if (paged) return;
    if ((e.target as HTMLElement).closest('button, a, .read-menu, .sheet')) return;
    if (menu) return setMenu(false);
    const y = e.clientY / window.innerHeight;
    if (y > 0.25 && y < 0.75) setMenu(true);
  };

  return (
    <div className={`page reader ${read.fullscreen ? 'full' : ''} ${paged ? 'paged' : ''}`} onClick={onTap}>
      <div className="read-head">
        <span className="ellipsis">{ch?.title ?? `第 ${num} 章`}</span>
      </div>
      {paged ? (
        <Pager key={num} html={pageHtml} read={read} start={start} menuOpen={menu} onMenu={setMenu} onEdge={onEdge} onPage={onPage} />
      ) : (
        <>
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
        </>
      )}
      <div className="read-foot nums">
        <span>
          第 {num} 章{paged ? ` · ${pageInfo[0] + 1} / ${pageInfo[1]} 页` : ''}
        </span>
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
