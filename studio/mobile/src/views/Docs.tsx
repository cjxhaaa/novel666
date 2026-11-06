import { useEffect, useMemo, useState } from 'react';
import { marked } from 'marked';
import { docLabel } from '../book';
import { getFile } from '../db';
import { useApp } from '../store';
import { Empty, Icon, TopBar } from '../ui';

const ORDER = ['bible.md', 'outline.md', 'progress.md'];

export function DocsTab() {
  const book = useApp((s) => s.book)!;
  const meta = useApp((s) => s.books.find((b) => b.id === book.id));
  const go = useApp((s) => s.go);
  const docs = [...book.docs].sort((a, b) => {
    const ia = ORDER.indexOf(a.toLowerCase());
    const ib = ORDER.indexOf(b.toLowerCase());
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
  });
  const changed = new Set(meta?.changes.filter((c) => c.kind !== 'del').map((c) => c.path));
  return (
    <div className="tab-body">
      {docs.length === 0 && <Empty title="没有文档" />}
      <section className="group">
        {docs.map((p) => (
          <button key={p} className="doc-row" onClick={() => go({ v: 'doc', id: book.id, path: p })}>
            <Icon name="codex" size={20} />
            <span className="ch-main">
              <span className="ch-title">
                {docLabel(p)}
                {changed.has(p) && <span className="new-badge">新</span>}
              </span>
              <span className="ch-sub">{p}</span>
            </span>
            <Icon name="right" size={18} />
          </button>
        ))}
      </section>
    </div>
  );
}

interface Heading {
  idx: number;
  level: number;
  text: string;
  line: number;
}

const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;

function headings(lines: string[]): Heading[] {
  const out: Heading[] = [];
  let fence = false;
  lines.forEach((l, line) => {
    if (/^\s*```/.test(l)) fence = !fence;
    const m = !fence && HEADING.exec(l);
    if (m) out.push({ idx: out.length, level: m[1].length, text: m[2], line });
  });
  return out;
}

const md = (s: string) => marked.parse(s, { async: false }) as string;

/** 文档按小节看：先列目录，点进去只渲染那一节（设定集有几十万字，整篇渲染太慢） */
export function DocPage({ path, heading }: { path: string; heading?: string }) {
  const book = useApp((s) => s.book)!;
  const go = useApp((s) => s.go);
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    getFile(book.id, path).then((t) => setText(t?.replace(/^﻿/, '').replace(/\r\n/g, '\n') ?? ''));
  }, [book, path]);
  const lines = useMemo(() => (text ?? '').split('\n'), [text]);
  const hs = useMemo(() => headings(lines), [lines]);
  const toc = hs.filter((h) => h.level <= 3);
  const open = (h: Heading | 'all', replace = false) => go({ v: 'doc', id: book.id, path, heading: h === 'all' ? 'all' : String(h.idx) }, replace);

  if (text == null) return <TopBar title={docLabel(path)} />;

  // 短文档或者没有小节：直接看全文
  if (heading === 'all' || toc.length < 3) {
    return (
      <div className="page">
        <TopBar title={docLabel(path)} sub={path} />
        <article className="markdown doc-body" dangerouslySetInnerHTML={{ __html: md(text) }} />
      </div>
    );
  }

  if (heading == null) {
    return (
      <div className="page">
        <TopBar title={docLabel(path)} sub={`${toc.length} 个小节`} />
        <div className="tab-body">
          {text.length < 80000 && (
            <button className="resume" onClick={() => open('all')}>
              <Icon name="chapters" size={18} />
              <span className="grow">看全文</span>
              <Icon name="right" size={18} />
            </button>
          )}
          <section className="group toc">
            {toc.map((h) => (
              <button key={h.idx} className={`toc-row l${h.level}`} onClick={() => open(h)}>
                {h.text}
              </button>
            ))}
          </section>
        </div>
      </div>
    );
  }

  const cur = hs[Number(heading)];
  if (!cur) return <TopBar title={docLabel(path)} />;
  const end = hs.find((h) => h.idx > cur.idx && h.level <= cur.level)?.line ?? lines.length;
  const body = lines.slice(cur.line, end).join('\n');
  const ti = toc.findIndex((h) => h.idx === cur.idx);
  const prev = ti > 0 ? toc[ti - 1] : null;
  const next = toc.find((h) => h.line >= end) ?? null;
  return (
    <div className="page">
      <TopBar title={cur.text} sub={docLabel(path)} />
      <article className="markdown doc-body" dangerouslySetInnerHTML={{ __html: md(body) }} />
      <nav className="read-nav">
        <button className="btn" disabled={!prev} onClick={() => prev && open(prev, true)}>
          <Icon name="left" size={18} /> 上一节
        </button>
        <span />
        <button className="btn" disabled={!next} onClick={() => next && open(next, true)}>
          下一节 <Icon name="right" size={18} />
        </button>
      </nav>
    </div>
  );
}
