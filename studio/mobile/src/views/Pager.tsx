import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import type { ReadPrefs } from '../prefs';
import { proseStyle } from './ReadSettings';

/**
 * 一页一页翻的正文：把整章用 CSS 分栏排成一条横带，一栏就是一页，翻页就是把横带挪一页宽。
 * slide 跟手平移；cover 上面一页被拉走，露出底下一页；none 直接换页。
 */
export function Pager({
  html,
  read,
  start,
  menuOpen,
  onMenu,
  onEdge,
  onPage,
}: {
  html: string;
  read: ReadPrefs;
  /** 打开时停在这一章的哪里：0–1，1 是最后一页 */
  start: number;
  menuOpen: boolean;
  onMenu(open: boolean): void;
  /** 翻过了头：-1 上一章，1 下一章 */
  onEdge(dir: -1 | 1): void;
  onPage(page: number, total: number): void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  const [total, setTotal] = useState(1);
  const [page, setPage] = useState(0);
  // 手指拖动的距离；anim 为真时用过渡动画走完
  const [dx, setDx] = useState(0);
  const [anim, setAnim] = useState(false);
  // 覆盖模式：正在被拉走或拉回来的那一页，dir 1 往后翻、-1 往前翻
  const [cov, setCov] = useState<{ dir: -1 | 1 } | null>(null);
  const frac = useRef(start);
  const mode = read.turn;

  // 量页数：宽度、字号、排版一变就重排，停在原来读到的比例上
  const measure = useCallback(() => {
    const b = box.current;
    const s = strip.current;
    if (!b || !s) return;
    const W = b.clientWidth;
    const n = Math.max(1, Math.ceil((s.scrollWidth - 1) / W));
    setW(W);
    setTotal(n);
    setPage(Math.min(n - 1, Math.max(0, Math.round(frac.current * (n - 1)))));
  }, []);
  useLayoutEffect(measure, [measure, html, read.size, read.line, read.para, read.letter, read.margin, read.font, read.bold, read.indent]);
  useEffect(() => {
    const ro = new ResizeObserver(measure);
    if (box.current) ro.observe(box.current);
    document.fonts?.ready.then(measure);
    return () => ro.disconnect();
  }, [measure]);
  useEffect(() => {
    frac.current = total > 1 ? page / (total - 1) : 0;
    onPage(page, total);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, total]);

  const DUR = 260;
  const busy = useRef(false);
  const turn = (dir: -1 | 1) => {
    if (busy.current) return;
    const to = page + dir;
    if (to < 0 || to >= total) {
      setDx(0);
      return onEdge(dir);
    }
    if (mode === 'none') {
      setDx(0);
      return setPage(to);
    }
    busy.current = true;
    if (mode === 'cover') {
      // 往后翻：上面这页拉到左边去；往前翻：前一页从左边盖回来。
      // 点着翻的时候两层是这一刻才摆出来的，先摆好起点，下一帧再动
      const fresh = !cov;
      if (fresh) {
        setCov({ dir });
        setDx(dir === 1 ? 0 : -w);
      }
      const go = () => {
        setAnim(true);
        setDx(dir === 1 ? -w : 0);
      };
      if (fresh) requestAnimationFrame(() => requestAnimationFrame(go));
      else go();
    } else {
      setAnim(true);
      setDx(-dir * w);
    }
    window.setTimeout(() => {
      setAnim(false);
      setCov(null);
      setDx(0);
      setPage(to);
      busy.current = false;
    }, DUR + 40);
  };
  const cancel = () => {
    if (!dx) return setCov(null);
    busy.current = true;
    setAnim(true);
    setDx(mode === 'cover' && cov?.dir === -1 ? -w : 0);
    window.setTimeout(() => {
      setAnim(false);
      setCov(null);
      setDx(0);
      busy.current = false;
    }, DUR + 40);
  };

  // 手势：横着划翻页，点左右两边翻页，点中间呼出菜单
  const touch = useRef<{ x: number; y: number; t: number; horiz: boolean | null; moved: boolean } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    if (busy.current) return;
    const p = e.touches[0];
    touch.current = { x: p.clientX, y: p.clientY, t: Date.now(), horiz: null, moved: false };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const t = touch.current;
    if (!t || menuOpen) return;
    const p = e.touches[0];
    const mx = p.clientX - t.x;
    const my = p.clientY - t.y;
    if (t.horiz == null && Math.abs(mx) + Math.abs(my) > 8) t.horiz = Math.abs(mx) > Math.abs(my);
    if (!t.horiz) return;
    t.moved = true;
    if (mode === 'none') return;
    const dir: -1 | 1 = mx < 0 ? 1 : -1;
    // 首页往前、末页往后拖不动，松手翻到相邻的章
    const edge = (dir === 1 && page >= total - 1) || (dir === -1 && page <= 0);
    if (mode === 'cover') {
      if (edge) return setDx(mx / 4);
      setCov({ dir });
      setDx(dir === 1 ? Math.min(0, mx) : Math.max(-w, -w + mx));
    } else setDx(edge ? mx / 4 : mx);
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const t = touch.current;
    touch.current = null;
    if (!t || !t.moved) return;
    e.preventDefault();
    const mx = (e.changedTouches[0]?.clientX ?? t.x) - t.x;
    const fast = Date.now() - t.t < 250 && Math.abs(mx) > 20;
    if (Math.abs(mx) > w * 0.18 || fast) turn(mx < 0 ? 1 : -1);
    else cancel();
  };
  const onClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, a')) return;
    if (menuOpen) return onMenu(false);
    const x = e.clientX / window.innerWidth;
    if (x < 0.3) turn(-1);
    else if (x > 0.7) turn(1);
    else onMenu(true);
  };

  // 电脑上调试：方向键翻页
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') turn(1);
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') turn(-1);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  const cols = (p: number, shift = 0): CSSProperties => ({
    ...proseStyle(read),
    columnWidth: Math.max(1, w - 2 * read.margin),
    columnGap: 2 * read.margin,
    columnFill: 'auto',
    transform: `translateX(${-p * w + shift}px)`,
    transition: anim ? `transform ${DUR}ms ease-out` : 'none',
  });
  const body = <div dangerouslySetInnerHTML={{ __html: html }} />;

  return (
    <div className={`pager ${mode}`} ref={box} onClick={onClick} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      {mode === 'cover' && cov ? (
        <>
          {/* 底下那一页不动；上面那一页跟着手走，带一道阴影 */}
          <div className="pager-layer">
            <div className="prose pager-strip" style={{ ...cols(cov.dir === 1 ? page + 1 : page), transition: 'none' }}>
              {body}
            </div>
          </div>
          <div className="pager-layer top" style={{ transform: `translateX(${dx}px)`, transition: anim ? `transform ${DUR}ms ease-out` : 'none' }}>
            <div className="prose pager-strip" ref={strip} style={{ ...cols(cov.dir === 1 ? page : page - 1), transition: 'none' }}>
              {body}
            </div>
          </div>
        </>
      ) : (
        <div className="pager-layer">
          <div className="prose pager-strip" ref={strip} style={cols(page, mode === 'cover' ? 0 : dx)}>
            {body}
          </div>
        </div>
      )}
    </div>
  );
}
