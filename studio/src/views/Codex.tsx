import { useEffect, useMemo, useRef, useState } from 'react';
import { marked } from 'marked';
import { uid, useStore } from '../store';
import { api } from '../api';
import { headingsOf, resolveCodex } from '../lib/docs';
import { Icon } from '../components/Icon';
import { Edit, Empty, Seg, confirmDelete } from '../components/ui';
import type { CodexEntry } from '../../shared/types';

/** 设定条目 + 仓库里的 markdown 文档 */
export function Codex() {
  const codex = useStore((s) => s.data.codex);
  const sel = useStore((s) => s.sel);
  const select = useStore((s) => s.select);
  const mutate = useStore((s) => s.mutate);
  const [q, setQ] = useState('');
  const [docs, setDocs] = useState<string[]>([]);
  useEffect(() => {
    api.listDocs().then(setDocs).catch(() => setDocs([]));
  }, []);

  const docsMap = useStore((s) => s.docs);
  const list = q ? codex.filter((e) => `${e.title}${e.category}${resolveCodex(e, docsMap).body}`.includes(q)) : codex;
  const cats = useMemo(() => [...new Set(list.map((e) => e.category))], [list]);
  const current = sel.doc ? null : codex.find((e) => e.id === sel.codex) ?? list[0];

  return (
    <div className="view">
      <div className="split" style={{ gridTemplateColumns: '270px 1fr' }}>
        <aside className="side">
          <div className="row" style={{ padding: '4px 4px 8px' }}>
            <input className="input" placeholder="搜索设定全文…" value={q} onChange={(e) => setQ(e.target.value)} />
            <button
              className="btn icon"
              title="新建设定条目"
              onClick={() => {
                const id = uid('x');
                mutate('codex', (d) => void d.push({ id, category: current?.category ?? '未分类', title: '新条目', body: '' }), '新建设定');
                select({ codex: id, doc: undefined });
              }}
            >
              <Icon name="plus" size={16} />
            </button>
          </div>
          {cats.map((c) => (
            <div key={c}>
              <div className="group-title">{c}</div>
              {list
                .filter((e) => e.category === c)
                .map((e) => (
                  <div key={e.id} className={`list-item ${current?.id === e.id ? 'active' : ''}`} onClick={() => select({ codex: e.id, doc: undefined })}>
                    <span className="ellipsis grow">{e.title}</span>
                    {e.source && <Icon name="link" size={12} style={{ color: 'var(--text-3)' }} />}
                    {e.pinned && <Icon name="pin" size={13} style={{ color: 'var(--gold)' }} />}
                  </div>
                ))}
            </div>
          ))}
          <div className="group-title" style={{ marginTop: 10 }}>
            <Icon name="folder" size={13} /> 仓库文档
          </div>
          {docs.map((d) => (
            <div key={d} className={`list-item ${sel.doc === d ? 'active' : ''}`} onClick={() => select({ doc: d, heading: undefined })}>
              <Icon name="scroll" size={14} />
              <span className="ellipsis">{d}</span>
            </div>
          ))}
        </aside>
        {sel.doc ? <DocPane key={sel.doc + (sel.heading ?? '')} rel={sel.doc} heading={sel.heading} /> : current ? <EntryPane key={current.id} e={current} /> : <Empty title="还没有设定条目" icon="codex" />}
      </div>
    </div>
  );
}

function EntryPane({ e }: { e: CodexEntry }) {
  const mutate = useStore((s) => s.mutate);
  const select = useStore((s) => s.select);
  const docs = useStore((s) => s.docs);
  const loadDocs = useStore((s) => s.loadDocs);
  const resolved = resolveCodex(e, docs);
  const srcDoc = e.source ? docs[e.source.doc] : undefined;
  const headings = useMemo(() => (srcDoc ? headingsOf(srcDoc) : []), [srcDoc]);
  useEffect(() => {
    if (e.source && !(e.source.doc in docs)) loadDocs([e.source.doc]);
  }, [e.source, docs, loadDocs]);
  const codex = useStore((s) => s.data.codex);
  const categories = useMemo(() => [...new Set(codex.map((x) => x.category))], [codex]);
  const [mode, setMode] = useState<'read' | 'edit'>('read');
  const upd = (fn: (x: CodexEntry) => void, label = '编辑设定') =>
    mutate('codex', (d) => {
      const x = d.find((y) => y.id === e.id);
      if (x) fn(x as CodexEntry);
    }, label);
  return (
    <section className="codex-pane">
      <div className="codex-head">
        <div className="col grow" style={{ gap: 4 }}>
          <div className="row">
            <input className="input bare faint" list="codex-cats" defaultValue={e.category} style={{ width: 160, fontSize: 12 }} onBlur={(ev) => ev.target.value !== e.category && upd((x) => void (x.category = ev.target.value || '未分类'))} />
            <datalist id="codex-cats">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <Edit value={e.title} bare className="display name-edit" style={{ fontSize: 26 }} onCommit={(v) => upd((x) => void (x.title = v))} />
        </div>
        <button className={`btn ${e.pinned ? 'primary' : ''}`} title="写作必带：生成写作上下文时总是附上这一条" onClick={() => upd((x) => void (x.pinned = !x.pinned), '切换写作必带')}>
          <Icon name="pin" size={15} /> {e.pinned ? '写作必带' : '设为写作必带'}
        </button>
        {!e.source && (
          <Seg
            value={mode}
            onChange={setMode}
            options={[
              { value: 'read', label: '阅读' },
              { value: 'edit', label: '编辑' },
            ]}
          />
        )}
        <button
          className="btn ghost icon danger"
          title="删除条目"
          onClick={() => {
            if (!confirmDelete(e.title)) return;
            mutate('codex', (d) => d.filter((x) => x.id !== e.id) as any, '删除设定');
          }}
        >
          <Icon name="trash" size={15} />
        </button>
      </div>
      <div className="codex-body">
        {e.source ? (
          <div className="source-bar">
            <Icon name="link" size={15} />
            <span className="faint">内容来自</span>
            <span>{e.source.doc}</span>
            <span className="faint">›</span>
            <select
              className="select"
              style={{ width: 280 }}
              value={e.source.heading}
              onChange={(ev) => upd((x) => void (x.source = { doc: x.source!.doc, heading: ev.target.value }), '改引用小节')}
            >
              {!headings.includes(e.source.heading) && <option value={e.source.heading}>{e.source.heading}（找不到）</option>}
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
          </div>
        ) : (
          <div className="source-bar faint">
            <span className="grow">这一条只存在 story/codex.json 里。世界观最好写进 bible.md，再在这里引用。</span>
            <button
              className="btn sm ghost"
              onClick={async () => {
                await loadDocs(['bible.md']);
                const first = headingsOf(useStore.getState().docs['bible.md'] ?? '')[1];
                if (first) upd((x) => void (x.source = { doc: 'bible.md', heading: first }), '改为引用');
              }}
            >
              <Icon name="link" size={13} /> 改为引用 bible.md 的一节
            </button>
          </div>
        )}
        {resolved.broken && <div className="issue-mini error">引用的小节找不到了，可能 bible.md 改了标题。请在上面重新选择。</div>}
        {e.source ? (
          <div className="markdown" dangerouslySetInnerHTML={{ __html: marked.parse(resolved.body || '*（这一节是空的）*') as string }} />
        ) : mode === 'read' ? (
          <div className="markdown" onDoubleClick={() => setMode('edit')} dangerouslySetInnerHTML={{ __html: (marked.parse(e.body || '*（空，双击开始编辑）*') as string) }} />
        ) : (
          <Edit multiline rows={20} value={e.body} className="mono-ish" onCommit={(v) => upd((x) => void (x.body = v))} />
        )}
      </div>
    </section>
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
