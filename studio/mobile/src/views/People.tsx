import { useMemo, useState } from 'react';
import { marked } from 'marked';
import { eraOf, latestDone, relationAt, stateAt } from '../../../src/lib/analysis';
import { useApp } from '../store';
import { Empty, Icon, TopBar } from '../ui';

export function PeopleTab() {
  const book = useApp((s) => s.book)!;
  const go = useApp((s) => s.go);
  const [q, setQ] = useState('');
  const groups = useMemo(() => {
    const k = q.trim();
    const list = book.data.characters.filter((c) => !k || c.name.includes(k) || c.aliases.some((a) => a.includes(k)) || c.summary?.includes(k));
    const map = new Map<string, typeof list>();
    for (const c of list) {
      const g = c.group || '其他';
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(c);
    }
    return [...map.entries()];
  }, [book, q]);
  return (
    <div className="tab-body">
      <div className="search">
        <Icon name="search" size={17} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜名字、别名、简介" />
      </div>
      {groups.length === 0 && <Empty title={q ? '没有找到' : '还没有人物'} />}
      {groups.map(([g, list]) => (
        <section key={g} className="group">
          <h4 className="group-title">
            {g} <span className="faint">{list.length}</span>
          </h4>
          {list.map((c) => (
            <button key={c.id} className="person-row" onClick={() => go({ v: 'person', id: book.id, pid: c.id })}>
              <span className="avatar" style={{ '--c': c.color ?? 'var(--moon)' } as React.CSSProperties}>
                {c.name.slice(-1)}
              </span>
              <span className="ch-main">
                <span className="ch-title">
                  {c.name}
                  {c.aliases.length > 0 && <span className="faint"> {c.aliases.slice(0, 3).join(' / ')}</span>}
                </span>
                {c.summary && <span className="ch-sub">{c.summary}</span>}
              </span>
            </button>
          ))}
        </section>
      ))}
    </div>
  );
}

export function PersonPage({ pid }: { pid: string }) {
  const book = useApp((s) => s.book)!;
  const go = useApp((s) => s.go);
  const { characters, relations, chapters, project } = book.data;
  const c = characters.find((x) => x.id === pid);
  if (!c) return <TopBar title="人物不存在" />;
  const at = latestDone(chapters) + 1;
  const st = stateAt(c, at);
  const era = eraOf(project, c.eraId);
  const rels = relations
    .filter((r) => r.from === c.id || r.to === c.id)
    .map((r) => ({ r, other: characters.find((x) => x.id === (r.from === c.id ? r.to : r.from)), now: relationAt(r, at) }))
    .filter((x) => x.other);
  return (
    <div className="page">
      <TopBar title={c.name} sub={[c.group, era?.label].filter(Boolean).join(' · ')} />
      <div className="detail">
        <div className="person-hero">
          <span className="avatar lg" style={{ '--c': c.color ?? 'var(--moon)' } as React.CSSProperties}>
            {c.name.slice(-1)}
          </span>
          <div>
            <div className="person-name">{c.name}</div>
            {c.aliases.length > 0 && <div className="muted">又名 {c.aliases.join('、')}</div>}
            {c.debutChapter && <div className="faint">第 {c.debutChapter} 章登场</div>}
          </div>
        </div>
        {c.summary && <p className="lead">{c.summary}</p>}
        {st.fields.length > 0 && (
          <section className="card">
            <h4>写到第 {at - 1} 章时</h4>
            <dl className="fields">
              {st.fields.map((f) => (
                <div key={f.key}>
                  <dt>{f.key}</dt>
                  <dd>
                    {f.value}
                    {f.since && <span className="since">第 {f.since} 章起</span>}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        )}
        {rels.length > 0 && (
          <section className="card">
            <h4>关系</h4>
            {rels.map(({ r, other, now }) => (
              <button key={r.id} className="rel-row" onClick={() => go({ v: 'person', id: book.id, pid: other!.id })}>
                <span className="avatar sm" style={{ '--c': other!.color ?? 'var(--moon)' } as React.CSSProperties}>
                  {other!.name.slice(-1)}
                </span>
                <span className="grow">{other!.name}</span>
                <span className="muted">{now.label}</span>
              </button>
            ))}
          </section>
        )}
        {st.upcoming.length > 0 && (
          <details className="card">
            <summary>之后的变化（{st.upcoming.length}）</summary>
            <ul className="timeline">
              {st.upcoming.map((p, i) => (
                <li key={i}>
                  <span className="nums">第 {p.chapter} 章</span>
                  <span>
                    {p.key}：{p.value}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
        {c.notes && <section className="card markdown" dangerouslySetInnerHTML={{ __html: marked.parse(c.notes, { async: false }) as string }} />}
      </div>
    </div>
  );
}
