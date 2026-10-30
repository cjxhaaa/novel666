import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { BookInfo } from '../../shared/types';
import { useStore } from '../store';
import { api } from '../api';
import { fmtWan } from '../lib/analysis';
import { Icon } from '../components/Icon';
import { Modal } from '../components/ui';

/** 封面颜色：按书名取一种，同一本书每次都一样 */
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

function ago(ms?: number) {
  if (!ms) return '';
  const d = (Date.now() - ms) / 1000;
  if (d < 60) return '刚刚';
  if (d < 3600) return `${Math.floor(d / 60)} 分钟前`;
  if (d < 86400) return `${Math.floor(d / 3600)} 小时前`;
  if (d < 86400 * 30) return `${Math.floor(d / 86400)} 天前`;
  const t = new Date(ms);
  return `${t.getFullYear()} 年 ${t.getMonth() + 1} 月 ${t.getDate()} 日`;
}

const BOOK_W = 164;
const GAP = 44;

/** 书架一层放几本：按宽度算 */
function usePerRow() {
  const ref = useRef<HTMLDivElement>(null);
  const [n, setN] = useState(5);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setN(Math.max(1, Math.floor((el.clientWidth - 48 + GAP) / (BOOK_W + GAP)))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, n] as const;
}

function Book({ b, current }: { b: BookInfo; current: boolean }) {
  const openBook = useStore((s) => s.openBook);
  const removeBook = useStore((s) => s.removeBook);
  const [c1, c2] = coverOf(b.title);
  const pct = b.planned ? Math.min(100, Math.round((b.done / b.planned) * 100)) : 0;
  const remove = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`把《${b.title}》从书架上拿下来？\n只是不在书架上显示，目录和文件都不会删。`)) removeBook(b.path);
  };
  return (
    <div className={`shelf-item ${b.exists ? '' : 'missing'}`} style={{ width: BOOK_W }}>
      <div
        className={`book-cover ${current ? 'current' : ''}`}
        style={{ ['--c1' as any]: c1, ['--c2' as any]: c2 }}
        onClick={() => b.exists && openBook(b.path)}
        title={b.exists ? `打开《${b.title}》\n${b.path}` : `目录找不到了：${b.path}`}
      >
        <div className="book-binding">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} />
          ))}
        </div>
        <div className="book-slip">
          <span>{b.title}</span>
        </div>
        {current && <span className="book-ribbon">上回写到这</span>}
        <button className="book-remove" title="从书架上拿下来（不删文件）" onClick={remove}>
          <Icon name="close" size={13} />
        </button>
      </div>
      <div className="book-caption">
        <div className="book-title">{b.title}</div>
        {b.exists ? (
          <>
            <div className="book-meta nums">
              {b.done} / {b.planned || '—'} 章 · {fmtWan(b.words)} 字
            </div>
            <div className="book-progress">
              <i style={{ width: `${pct}%` }} />
            </div>
            <div className="book-meta faint">
              {b.currentVolume ? `${b.currentVolume.replace(/：.*$/, '')}　` : ''}
              {ago(b.updatedAt)}
            </div>
          </>
        ) : (
          <div className="book-meta" style={{ color: 'var(--danger)' }}>
            目录找不到了
          </div>
        )}
      </div>
    </div>
  );
}

function NewBook({ onClick }: { onClick: () => void }) {
  return (
    <div className="shelf-item" style={{ width: BOOK_W }}>
      <div className="book-cover blank" onClick={onClick} title="新建一本">
        <Icon name="plus" size={28} stroke={1.4} />
        <span>新建一本</span>
      </div>
      <div className="book-caption">
        <div className="book-meta faint">空白的设定集、大纲和进度，开好就能写</div>
      </div>
    </div>
  );
}

function CreateDialog({ onClose }: { onClose: () => void }) {
  const createBook = useStore((s) => s.createBook);
  const [title, setTitle] = useState('');
  const ok = title.trim().length > 0;
  const submit = async () => {
    if (!ok) return;
    onClose();
    await createBook(title.trim());
  };
  return (
    <Modal
      title="新建一本"
      icon="plus"
      width={460}
      onClose={onClose}
      foot={
        <>
          <span className="grow" />
          <button className="btn ghost" onClick={onClose}>
            取消
          </button>
          <button className="btn primary" disabled={!ok} onClick={submit}>
            选择存放位置
          </button>
        </>
      }
    >
      <div className="col" style={{ gap: 10 }}>
        <input autoFocus className="input" placeholder="书名" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
        <div className="faint" style={{ fontSize: 13, lineHeight: 1.7 }}>
          下一步选一个上级目录，会在里面建一个以书名命名的文件夹，放好 bible.md、outline.md、progress.md、CLAUDE.md、chapters/ 和 story/。每本书各用各的目录，人物、设定、伏笔互不相通。
        </div>
      </div>
    </Modal>
  );
}

export function Bookshelf() {
  const books = useStore((s) => s.books);
  const root = useStore((s) => s.root);
  const addBook = useStore((s) => s.addBook);
  const loadShelf = useStore((s) => s.loadShelf);
  const [creating, setCreating] = useState(false);
  const [ref, perRow] = usePerRow();
  const desktop = api.platform === 'electron';

  // 回到窗口时刷新一下字数和进度（Claude 可能在外面写了新章）
  useEffect(() => {
    const h = () => document.visibilityState === 'visible' && loadShelf();
    document.addEventListener('visibilitychange', h);
    return () => document.removeEventListener('visibilitychange', h);
  }, [loadShelf]);

  const items: ({ kind: 'book'; b: BookInfo } | { kind: 'new' })[] = [...books.map((b) => ({ kind: 'book' as const, b })), { kind: 'new' }];
  const rows: (typeof items)[] = [];
  for (let i = 0; i < items.length; i += perRow) rows.push(items.slice(i, i + perRow));
  // 至少摆两层，空书架也像个书架
  while (rows.length < 2) rows.push([]);

  const words = books.reduce((a, b) => a + b.words, 0);

  return (
    <div className="shelf-view" ref={ref}>
      <div className="shelf-head">
        <div className="col" style={{ gap: 4 }}>
          <h1>书架</h1>
          <div className="sub">
            {books.length ? `${books.length} 本 · 共 ${fmtWan(words)} 字` : '还没有书。新建一本，或者把已有的小说目录放上来。'}
          </div>
        </div>
        <span className="grow" />
        <button className="btn" onClick={() => (desktop ? addBook() : alert('浏览器预览模式下不能改书架，请在桌面端使用。'))}>
          <Icon name="folder" /> 放上已有目录
        </button>
        <button className="btn primary" onClick={() => (desktop ? setCreating(true) : alert('浏览器预览模式下不能新建书，请在桌面端使用。'))}>
          <Icon name="plus" /> 新建一本
        </button>
      </div>
      <div className="shelf">
        {rows.map((row, i) => (
          <div className="shelf-row" key={i} style={{ gap: GAP }}>
            {row.map((it) =>
              it.kind === 'book' ? <Book key={it.b.path} b={it.b} current={!!root && root === it.b.path} /> : <NewBook key="new" onClick={() => (desktop ? setCreating(true) : alert('浏览器预览模式下不能新建书，请在桌面端使用。'))} />,
            )}
          </div>
        ))}
      </div>
      {creating && <CreateDialog onClose={() => setCreating(false)} />}
    </div>
  );
}
