import { useMemo, useState } from 'react';
import { useStore, type View, type Selection } from '../store';
import { Icon } from './Icon';
import { NAV } from '../nav';
import { resolveCodex } from '../lib/docs';

interface Hit {
  key: string;
  kind: string;
  icon: string;
  title: string;
  desc?: string;
  color?: string;
  run: () => void;
  score: number;
}

function score(q: string, ...fields: (string | undefined)[]) {
  let best = 0;
  fields.forEach((f, i) => {
    if (!f) return;
    const idx = f.toLowerCase().indexOf(q);
    if (idx < 0) return;
    const s = (i === 0 ? 100 : 40 - i) - Math.min(idx, 30) + (f.length === q.length ? 50 : 0);
    best = Math.max(best, s);
  });
  return best;
}

export function CommandPalette() {
  const data = useStore((s) => s.data);
  const go = useStore((s) => s.go);
  const setPalette = useStore((s) => s.setPalette);
  const openContext = useStore((s) => s.openContext);
  const cursor = useStore((s) => s.cursor);
  const docs = useStore((s) => s.docs);
  const [q, setQ] = useState('');
  const [on, setOn] = useState(0);

  const hits = useMemo(() => {
    const query = q.trim().toLowerCase();
    const to = (view: View, sel?: Selection) => () => go(view, sel);
    const all: Hit[] = [];
    const add = (h: Omit<Hit, 'score'>, ...fields: (string | undefined)[]) => {
      const sc = query ? score(query, ...fields) : 1;
      if (sc > 0) all.push({ ...h, score: sc });
    };
    if (/^\d+$/.test(query)) {
      const n = +query;
      const ch = data.chapters.find((c) => c.num === n);
      if (ch) all.push({ key: `jump-${n}`, kind: '章节', icon: 'chapters', title: `第 ${n} 章　${ch.title}`, desc: ch.plan, run: to('chapters', { chapter: n }), score: 999 });
    }
    for (const n of NAV) add({ key: `nav-${n.id}`, kind: '前往', icon: n.icon, title: n.label, run: to(n.id) }, n.label, n.id);
    add({ key: 'ctx', kind: '命令', icon: 'spark', title: `为第 ${cursor} 章生成写作上下文`, run: () => (setPalette(false), openContext(cursor)) }, '写作上下文', 'context', '生成');
    for (const c of data.characters)
      add({ key: `c-${c.id}`, kind: '人物', icon: 'characters', title: c.name, desc: c.summary ?? c.group, color: c.color, run: to('characters', { character: c.id }) }, c.name, ...c.aliases, c.summary, c.group);
    for (const l of data.locations) add({ key: `l-${l.id}`, kind: '地点', icon: 'locations', title: l.name, desc: l.description, run: to('locations', { location: l.id }) }, l.name, ...l.aliases, l.description);
    for (const c of data.chapters)
      add({ key: `ch-${c.num}`, kind: '章节', icon: 'chapters', title: `第 ${c.num} 章　${c.title}`, desc: c.plan, run: to('chapters', { chapter: c.num }) }, c.title, c.plan, c.recap);
    for (const e of data.codex) add({ key: `x-${e.id}`, kind: '设定', icon: 'codex', title: e.title, desc: e.category, run: to('codex', { codex: e.id }) }, e.title, e.category, resolveCodex(e, docs).body);
    for (const f of data.foreshadows) add({ key: `f-${f.id}`, kind: '伏笔', icon: 'foreshadow', title: f.text, desc: f.payoff, run: to('foreshadow', { foreshadow: f.id }) }, f.text, f.payoff);
    for (const e of data.events) add({ key: `e-${e.id}`, kind: '事件', icon: 'timeline', title: e.title, desc: e.description, run: to('timeline', { event: e.id }) }, e.title, e.description);
    return all.sort((a, b) => b.score - a.score).slice(0, 60);
  }, [q, data, go, cursor, openContext, setPalette, docs]);

  const pick = (h?: Hit) => {
    if (!h) return;
    h.run();
    setPalette(false);
  };

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && setPalette(false)}>
      <div className="modal palette">
        <div className="q">
          <Icon name="search" />
          <input
            autoFocus
            value={q}
            placeholder="输入人名、地名、章号、设定关键词…"
            onChange={(e) => {
              setQ(e.target.value);
              setOn(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setOn((o) => Math.min(hits.length - 1, o + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setOn((o) => Math.max(0, o - 1));
              } else if (e.key === 'Enter') pick(hits[on]);
              else if (e.key === 'Escape') setPalette(false);
            }}
          />
          <span className="kbd">Esc</span>
        </div>
        <div className="results">
          {hits.map((h, i) => (
            <div key={h.key} className={`r ${i === on ? 'on' : ''}`} onMouseEnter={() => setOn(i)} onClick={() => pick(h)}>
              <span className="k">{h.kind}</span>
              <Icon name={h.icon} size={16} style={{ color: h.color ?? 'var(--text-3)' }} />
              <span className="ellipsis">{h.title}</span>
              {h.desc && <span className="d ellipsis">{h.desc}</span>}
            </div>
          ))}
          {!hits.length && <div className="empty">没有找到</div>}
        </div>
      </div>
    </div>
  );
}
