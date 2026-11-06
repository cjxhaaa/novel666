import { useEffect, useMemo, useRef, useState } from 'react';
import { marked } from 'marked';
import { countChars } from '../../../src/lib/analysis';
import { useApp } from '../store';
import { Icon, Sheet, TopBar } from '../ui';
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
  const read = useApp((s) => s.read);
  const [panel, setPanel] = useState(false);
  const ch = book.data.chapters.find((c) => c.num === num);
  const text = book.texts[num];
  const html = useMemo(() => (text != null ? (marked.parse(text, { async: false }) as string) : ''), [text]);

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

  // 回到上次读到的位置；之后边读边记
  const restored = useRef(false);
  useEffect(() => {
    restored.current = false;
    const p = readPos(book.id);
    requestAnimationFrame(() => {
      window.scrollTo(0, p?.num === num ? p.y : 0);
      restored.current = true;
    });
    if (p?.num !== num) savePos(book.id, { num, y: 0 });
    let t: number | undefined;
    const h = () => {
      if (!restored.current) return;
      clearTimeout(t);
      t = window.setTimeout(() => savePos(book.id, { num, y: Math.round(window.scrollY) }), 300);
    };
    window.addEventListener('scroll', h, { passive: true });
    return () => {
      window.removeEventListener('scroll', h);
      clearTimeout(t);
    };
  }, [book.id, num]);

  return (
    <div className="page reader">
      <TopBar
        title={`第 ${num} 章`}
        sub={ch?.title}
        right={
          <button className={`icon-btn aa ${panel ? 'on' : ''}`} onClick={() => setPanel(!panel)} aria-label="阅读设置">
            Aa
          </button>
        }
      />
      {panel && (
        <Sheet title="阅读设置" onClose={() => setPanel(false)} light>
          <ReadSettings />
        </Sheet>
      )}
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
    </div>
  );
}
