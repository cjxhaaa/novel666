import { useEffect, useMemo, useRef, useState } from 'react';
import { marked } from 'marked';
import { uid, useStore } from '../store';
import { api } from '../api';
import { headingsOf, resolveCodex } from '../lib/docs';
import { Icon } from '../components/Icon';
import { Edit, Empty, Seg, confirmDelete } from '../components/ui';
import type { CodexEntry } from '../../shared/types';

/** 设定：左侧大类可展开出小类，右侧一个大类一页，每个小类一张可展开的卡片 */
export function Codex() {
  const codex = useStore((s) => s.data.codex);
  const sel = useStore((s) => s.sel);
  const select = useStore((s) => s.select);
  const docsMap = useStore((s) => s.docs);
  const [q, setQ] = useState('');
  const [docs, setDocs] = useState<string[]>([]);
  const [open, setOpen] = useState<Set<string>>(new Set());
  useEffect(() => {
    api.listDocs().then(setDocs).catch(() => setDocs([]));
  }, []);

  const allCats = useMemo(() => [...new Set(codex.map((e) => e.category))], [codex]);
  const query = q.trim();
  const list = query ? codex.filter((e) => `${e.title}${e.category}${resolveCodex(e, docsMap).body}`.includes(query)) : codex;
  const cats = query ? allCats.filter((c) => list.some((e) => e.category === c)) : allCats;
  const focused = codex.find((e) => e.id === sel.codex);
  // 选中了具体条目就跟着条目走（搜索面板跳过来时 codexCat 可能是旧的）
  const cat = focused?.category ?? (sel.codexCat && allCats.includes(sel.codexCat) ? sel.codexCat : allCats[0]);

  // 跳到某个条目时（比如从搜索面板过来），展开它所在的大类
  useEffect(() => {
    if (focused) setOpen((o) => (o.has(focused.category) ? o : new Set(o).add(focused.category)));
  }, [focused]);

  const toggle = (c: string) =>
    setOpen((o) => {
      const n = new Set(o);
      if (n.has(c)) n.delete(c);
      else n.add(c);
      return n;
    });

  return (
    <div className="view">
      <div className="split" style={{ gridTemplateColumns: '270px 1fr' }}>
        <aside className="side">
          <div className="row" style={{ padding: '4px 4px 8px' }}>
            <input className="input" placeholder="搜索设定全文…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {cats.map((c) => {
            const items = list.filter((e) => e.category === c);
            const expanded = !!query || open.has(c);
            const todo = items.some((e) => resolveCodex(e, docsMap).body.trim().startsWith('**暂无'));
            const active = cat === c && !sel.doc;
            return (
              <div key={c} className="cx-group">
                <div
                  className={`cx-cat ${active ? 'active' : ''}`}
                  onClick={() => {
                    if (active) toggle(c);
                    else setOpen((o) => new Set(o).add(c));
                    select({ codexCat: c, codex: undefined, doc: undefined });
                  }}
                >
                  <Icon name="right" size={13} style={{ transform: expanded ? 'rotate(90deg)' : undefined, transition: 'transform .15s', color: 'var(--text-3)' }} />
                  <span className="seal" style={{ ['--c' as any]: 'var(--gold)' }}>
                    {c.slice(0, 1)}
                  </span>
                  <span className="grow ellipsis">{c}</span>
                  {todo && <span className="cx-todo">待补</span>}
                  <span className="faint nums" style={{ fontSize: 11 }}>
                    {items.length}
                  </span>
                </div>
                {expanded &&
                  items.map((e) => (
                    <div key={e.id} className={`cx-sub ${sel.codex === e.id && !sel.doc ? 'active' : ''}`} onClick={() => select({ codexCat: c, codex: e.id, doc: undefined })}>
                      <span className="ellipsis grow">{e.title}</span>
                      {e.pinned && <Icon name="pin" size={12} style={{ color: 'var(--gold)' }} />}
                    </div>
                  ))}
              </div>
            );
          })}
          {query && !cats.length && (
            <div className="faint" style={{ padding: 10 }}>
              没有找到
            </div>
          )}
          <div className="group-title" style={{ marginTop: 14 }}>
            <Icon name="folder" size={13} /> 仓库文档
          </div>
          {docs.map((d) => (
            <div key={d} className={`list-item ${sel.doc === d ? 'active' : ''}`} onClick={() => select({ doc: d, heading: undefined })}>
              <Icon name="scroll" size={14} />
              <span className="ellipsis">{d}</span>
            </div>
          ))}
        </aside>
        {sel.doc ? (
          <DocPane key={sel.doc + (sel.heading ?? '')} rel={sel.doc} heading={sel.heading} />
        ) : cat ? (
          <CategoryPane key={cat} cat={cat} focusId={sel.codex} />
        ) : (
          <Empty title="还没有设定条目" icon="codex" />
        )}
      </div>
    </div>
  );
}

/** 一段 markdown 的纯文本开头，用作收起时的预览 */
function preview(md: string) {
  return md
    .replace(/^\s*\|.*$/gm, '')
    .replace(/[*#`>|]/g, '')
    .replace(/^\s*(?:[-]|\d+\.)\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

function sourceDocsOf(entries: CodexEntry[]) {
  return [...new Set(entries.map((e) => e.source?.doc).filter((d): d is string => !!d))];
}

function CategoryPane({ cat, focusId }: { cat: string; focusId?: string }) {
  const codex = useStore((s) => s.data.codex);
  const mutate = useStore((s) => s.mutate);
  const select = useStore((s) => s.select);
  const docs = useStore((s) => s.docs);
  const loadDocs = useStore((s) => s.loadDocs);
  const entries = useMemo(() => codex.filter((e) => e.category === cat), [codex, cat]);
  const bodyRef = useRef<HTMLDivElement>(null);
  // 默认只展开第一张（通常是“概述”），点进来的那张也展开
  const [open, setOpen] = useState<Set<string>>(() => new Set([entries[0]?.id, focusId].filter((x): x is string => !!x)));

  useEffect(() => {
    const need = sourceDocsOf(entries).filter((d) => !(d in docs));
    if (need.length) loadDocs(need);
  }, [entries, docs, loadDocs]);

  useEffect(() => {
    if (!focusId) return;
    setOpen((o) => (o.has(focusId) ? o : new Set(o).add(focusId)));
    // 等卡片展开、内容变高之后再滚，不然靠后的卡片滚不到顶
    const t = setTimeout(() => {
      const box = bodyRef.current;
      const el = box?.querySelector(`[data-entry="${focusId}"]`);
      if (box && el) box.scrollTop += el.getBoundingClientRect().top - box.getBoundingClientRect().top - 12;
    }, 60);
    return () => clearTimeout(t);
  }, [focusId]);

  const pinnedN = entries.filter((e) => e.pinned).length;
  const allOpen = entries.length > 0 && entries.every((e) => open.has(e.id));

  return (
    <section className="codex-pane">
      <div className="codex-head">
        <span className="seal lg" style={{ ['--c' as any]: 'var(--gold)' }}>
          {cat.slice(0, 1)}
        </span>
        <div className="col grow" style={{ gap: 2 }}>
          <h2 style={{ fontSize: 26 }}>{cat}</h2>
          <span className="faint" style={{ fontSize: 12 }}>
            {entries.length} 个小类{pinnedN ? ` · 写作必带 ${pinnedN}` : ''}
          </span>
        </div>
        <button className="btn ghost" onClick={() => setOpen(allOpen ? new Set() : new Set(entries.map((e) => e.id)))}>
          {allOpen ? '全部收起' : '全部展开'}
        </button>
        <button
          className="btn"
          title="在这个大类下新建一条只存在软件里的笔记"
          onClick={() => {
            const id = uid('x');
            mutate('codex', (d) => void d.push({ id, category: cat, title: '新条目', body: '' }), '新建设定');
            setOpen((o) => new Set(o).add(id));
            select({ codex: id });
          }}
        >
          <Icon name="plus" size={15} /> 小类
        </button>
      </div>
      <div className="codex-body cx-cards" ref={bodyRef}>
        {entries.map((e) => (
          <EntryCard
            key={e.id}
            e={e}
            open={open.has(e.id)}
            onToggle={() =>
              setOpen((o) => {
                const n = new Set(o);
                if (n.has(e.id)) n.delete(e.id);
                else n.add(e.id);
                return n;
              })
            }
          />
        ))}
      </div>
    </section>
  );
}

function EntryCard({ e, open, onToggle }: { e: CodexEntry; open: boolean; onToggle: () => void }) {
  const mutate = useStore((s) => s.mutate);
  const select = useStore((s) => s.select);
  const docs = useStore((s) => s.docs);
  const [editing, setEditing] = useState(false);
  const resolved = resolveCodex(e, docs);
  const srcDoc = e.source ? docs[e.source.doc] : undefined;
  const headings = useMemo(() => (srcDoc && open ? headingsOf(srcDoc) : []), [srcDoc, open]);
  const html = useMemo(() => (open ? (marked.parse(resolved.body || '*（空）*') as string) : ''), [open, resolved.body]);
  const upd = (fn: (x: CodexEntry) => void, label = '编辑设定') =>
    mutate('codex', (d) => {
      const x = d.find((y) => y.id === e.id);
      if (x) fn(x as CodexEntry);
    }, label);

  return (
    <div className={`cx-card ${open ? 'open' : ''} ${resolved.broken ? 'broken' : ''}`} data-entry={e.id}>
      <div className="cx-card-head" onClick={onToggle}>
        <Icon name="right" size={14} style={{ transform: open ? 'rotate(90deg)' : undefined, transition: 'transform .15s', color: 'var(--text-3)' }} />
        <span className="cx-title">{e.title}</span>
        {!open && <span className="cx-preview ellipsis">{preview(resolved.body)}</span>}
        <span className="grow" />
        <button
          className={`btn ghost sm icon ${e.pinned ? 'pinned' : ''}`}
          title={e.pinned ? '写作必带（点击取消）' : '设为写作必带：生成写作上下文时总是附上这一条'}
          onClick={(ev) => {
            ev.stopPropagation();
            upd((x) => void (x.pinned = !x.pinned), '切换写作必带');
          }}
        >
          <Icon name="pin" size={14} />
        </button>
      </div>
      {open && (
        <div className="cx-card-body">
          {resolved.broken && <div className="issue-mini error">引用的小节找不到了，可能 {e.source!.doc} 改了标题。请在下面重新选择。</div>}
          {!e.source && editing ? (
            <div className="col">
              <Edit value={e.title} onCommit={(v) => upd((x) => void (x.title = v))} />
              <Edit multiline rows={10} value={e.body} className="mono-ish" onCommit={(v) => upd((x) => void (x.body = v))} />
            </div>
          ) : (
            <div className="markdown" dangerouslySetInnerHTML={{ __html: html }} />
          )}
          <div className="cx-card-foot">
            {e.source ? (
              <>
                <Icon name="link" size={13} />
                <span>{e.source.doc}</span>
                <span>›</span>
                <select
                  className="select"
                  style={{ width: 'auto', minWidth: 180, height: 26, padding: '0 26px 0 8px', fontSize: 12 }}
                  value={e.source.heading}
                  onChange={(ev) => upd((x) => void (x.source = { doc: x.source!.doc, heading: ev.target.value }), '改引用小节')}
                >
                  {!headings.includes(e.source.heading) && <option value={e.source.heading}>{e.source.heading}</option>}
                  {headings.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
                <span className="grow" />
                <button className="btn sm" onClick={() => select({ doc: e.source!.doc, heading: e.source!.heading })}>
                  <Icon name="edit" size={13} /> 在原文中编辑
                </button>
              </>
            ) : (
              <>
                <span className="grow">只存在软件里的笔记。世界观最好写进 bible.md。</span>
                <button className="btn sm" onClick={() => setEditing((v) => !v)}>
                  <Icon name={editing ? 'check' : 'edit'} size={13} /> {editing ? '完成' : '编辑'}
                </button>
                <button
                  className="btn sm ghost danger"
                  onClick={() => {
                    if (!confirmDelete(e.title)) return;
                    mutate('codex', (d) => d.filter((x) => x.id !== e.id) as any, '删除设定');
                  }}
                >
                  <Icon name="trash" size={13} />
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function DocPane({ rel, heading }: { rel: string; heading?: string }) {
  const toast = useStore((s) => s.toast);
  const loadDocs = useStore((s) => s.loadDocs);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [text, setText] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [mode, setMode] = useState<'read' | 'edit'>('read');
  useEffect(() => {
    api.readDoc(rel).then((t) => {
      setText(t);
      setDraft(t ?? '');
    });
  }, [rel]);
  const html = useMemo(() => (text ? (marked.parse(text) as string) : ''), [text]);
  // 从设定条目跳过来时，滚到对应小节并闪一下
  useEffect(() => {
    if (!heading || !html || mode !== 'read') return;
    const el = [...(bodyRef.current?.querySelectorAll('h1,h2,h3,h4,h5,h6') ?? [])].find((h) => h.textContent?.trim() === heading);
    if (el) {
      const box = bodyRef.current!;
      box.scrollTop += el.getBoundingClientRect().top - box.getBoundingClientRect().top - 12;
      el.classList.add('flash');
    }
  }, [heading, html, mode]);
  return (
    <section className="codex-pane">
      <div className="codex-head">
        <div className="col grow" style={{ gap: 2 }}>
          <span className="faint" style={{ fontSize: 12 }}>
            仓库文档
          </span>
          <h2 style={{ fontSize: 24 }}>{rel}</h2>
        </div>
        <Seg
          value={mode}
          onChange={setMode}
          options={[
            { value: 'read', label: '阅读' },
            { value: 'edit', label: '编辑' },
          ]}
        />
        {mode === 'edit' && (
          <button
            className="btn primary"
            onClick={async () => {
              await api.writeDoc(rel, draft);
              setText(draft);
              await loadDocs([rel]);
              toast(`${rel} 已保存`, 'ok');
              setMode('read');
            }}
          >
            <Icon name="save" size={15} /> 保存
          </button>
        )}
      </div>
      <div className="codex-body" ref={bodyRef}>
        {text == null ? (
          <div className="faint">读取中…</div>
        ) : mode === 'read' ? (
          <div className="markdown" dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <textarea className="textarea mono-ish" style={{ minHeight: '70vh' }} value={draft} onChange={(e) => setDraft(e.target.value)} />
        )}
      </div>
    </section>
  );
}
