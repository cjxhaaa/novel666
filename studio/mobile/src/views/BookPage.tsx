import { useMemo, useState } from 'react';
import type { Chapter } from '../../../shared/types';
import { countChars, fmtWan, kindOf, latestDone } from '../../../src/lib/analysis';
import { changedChapters } from '../book';
import { useApp, type Tab } from '../store';
import { Empty, Icon, Seg, TopBar } from '../ui';
import { PeopleTab } from './People';
import { ForeshadowTab } from './Foreshadows';
import { DocsTab } from './Docs';
import { readPos } from './Reader';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'chapters', label: '正文', icon: 'chapters' },
  { id: 'people', label: '人物', icon: 'characters' },
  { id: 'foreshadow', label: '伏笔', icon: 'foreshadow' },
  { id: 'docs', label: '资料', icon: 'codex' },
];

export function BookPage({ tab }: { tab: Tab }) {
  const book = useApp((s) => s.book)!;
  const go = useApp((s) => s.go);
  return (
    <div className="page with-tabs">
      <TopBar title={book.data.project.title} />
      {tab === 'chapters' && <ChaptersTab />}
      {tab === 'people' && <PeopleTab />}
      {tab === 'foreshadow' && <ForeshadowTab />}
      {tab === 'docs' && <DocsTab />}
      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.id} className={t.id === tab ? 'on' : ''} onClick={() => go({ v: 'book', id: book.id, tab: t.id }, true)}>
            <Icon name={t.icon} size={22} />
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

function ChaptersTab() {
  const book = useApp((s) => s.book)!;
  const meta = useApp((s) => s.books.find((b) => b.id === book.id));
  const go = useApp((s) => s.go);
  const [mode, setMode] = useState<'written' | 'all'>('written');
  const { project, chapters } = book.data;
  const fresh = useMemo(() => changedChapters(meta), [meta]);

  const list = useMemo(() => {
    const byNum = new Map<number, Chapter>(chapters.map((c) => [c.num, c]));
    const nums = new Set<number>(Object.keys(book.texts).map(Number));
    if (mode === 'all') chapters.forEach((c) => nums.add(c.num));
    return [...nums].sort((a, b) => a - b).map((n) => ({ num: n, ch: byNum.get(n), words: book.texts[n] ? countChars(book.texts[n]) : 0 }));
  }, [book, chapters, mode]);

  const groups = useMemo(() => {
    const vols = project.volumes ?? [];
    const out: { name: string; items: typeof list }[] = [];
    for (const it of list) {
      const v = vols.find((x) => x.id === it.ch?.volumeId) ?? vols.find((x) => (x.from ?? 1) <= it.num && it.num <= (x.to ?? Infinity));
      const name = v?.name ?? '未分卷';
      if (out[out.length - 1]?.name !== name) out.push({ name, items: [] });
      out[out.length - 1].items.push(it);
    }
    return out;
  }, [list, project]);

  const pos = readPos(book.id);
  const resume = pos && (book.texts[pos.num] != null || chapters.some((c) => c.num === pos.num)) ? pos.num : null;
  const first = list.find((x) => x.words > 0)?.num;
  const done = latestDone(chapters);
  const total = Object.values(book.texts).reduce((s, t) => s + countChars(t), 0);

  return (
    <div className="tab-body">
      <div className="book-hero">
        <div className="hero-stats">
          <div>
            <b>{done}</b>
            <span>已写完</span>
          </div>
          <div>
            <b>{fmtWan(total)}</b>
            <span>字</span>
          </div>
          <div>
            <b>{chapters.length}</b>
            <span>章规划</span>
          </div>
        </div>
        {(resume ?? first) != null && (
          <button className="resume" onClick={() => go({ v: 'read', id: book.id, num: (resume ?? first)! })}>
            <Icon name="chapters" size={18} />
            <span className="grow">
              {resume ? '继续读' : '从头读'} 第 {resume ?? first} 章
              <span className="muted"> {chapters.find((c) => c.num === (resume ?? first))?.title}</span>
            </span>
            <Icon name="right" size={18} />
          </button>
        )}
      </div>
      <div className="list-tools">
        <Seg
          value={mode}
          onChange={setMode}
          options={[
            { value: 'written', label: '已写' },
            { value: 'all', label: '全部规划' },
          ]}
        />
      </div>
      {list.length === 0 && <Empty title="还没有正文" />}
      {groups.map((g) => (
        <section key={g.name} className="group">
          <h4 className="group-title">{g.name}</h4>
          {g.items.map(({ num, ch, words }) => {
            const kind = ch && kindOf(project, ch.kind);
            return (
              <button key={num} className={`ch-row ${words ? '' : 'planned'}`} onClick={() => go({ v: 'read', id: book.id, num })}>
                <span className="ch-num nums" style={kind ? { color: kind.color } : undefined}>
                  {num}
                </span>
                <span className="ch-main">
                  <span className="ch-title">
                    {ch?.title ?? `第 ${num} 章`}
                    {fresh.has(num) && <span className="new-badge">新</span>}
                    {pos?.num === num && <span className="here-badge">在读</span>}
                  </span>
                  <span className="ch-sub">{ch?.recap || ch?.plan || ''}</span>
                </span>
                <span className="ch-meta">{words ? `${(words / 1000).toFixed(1)}k` : ch?.status === 'drafting' ? '在写' : '计划'}</span>
              </button>
            );
          })}
        </section>
      ))}
    </div>
  );
}
