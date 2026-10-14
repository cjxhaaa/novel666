import { useMemo, useRef, useState } from 'react';
import type { EditorView } from '@codemirror/view';
import { useStore } from '../store';
import { useIssues, useMentions } from '../lib/derived';
import { countChars, kindOf } from '../lib/analysis';
import { Icon } from '../components/Icon';
import { ChapterLink, Edit, Empty, Field, Seal, Seg, confirmDelete } from '../components/ui';
import { ProseEditor, jumpToLine } from '../components/ProseEditor';
import type { Chapter, ChapterStatus } from '../../shared/types';

const STATUS: { value: ChapterStatus; label: string; color: string }[] = [
  { value: 'planned', label: '计划', color: 'var(--text-3)' },
  { value: 'drafting', label: '在写', color: 'var(--warn)' },
  { value: 'done', label: '完成', color: 'var(--jade)' },
];

export function Chapters() {
  const data = useStore((s) => s.data);
  const texts = useStore((s) => s.texts);
  const sel = useStore((s) => s.sel.chapter);
  const select = useStore((s) => s.select);
  const mutate = useStore((s) => s.mutate);
  const [q, setQ] = useState('');
  const { project, chapters } = data;
  const sorted = useMemo(() => [...chapters].sort((a, b) => a.num - b.num), [chapters]);
  const current = sorted.find((c) => c.num === sel) ?? sorted[0];

  const filtered = q.trim() ? sorted.filter((c) => `${c.num} ${c.title} ${c.plan} ${c.recap ?? ''}`.includes(q.trim())) : sorted;

  const addChapter = () => {
    const num = (sorted[sorted.length - 1]?.num ?? 0) + 1;
    const vol = project.volumes.find((v) => (v.from ?? 1) <= num && num <= (v.to ?? 1e9)) ?? project.volumes[project.volumes.length - 1];
    mutate('chapters', (d) => void d.push({ num, title: '新章节', volumeId: vol?.id ?? 'v1', kind: project.chapterKinds[0]?.id ?? 'main', status: 'planned', plan: '' }), '新建章节');
    select({ chapter: num });
  };

  return (
    <div className="view">
      <div className="split" style={{ gridTemplateColumns: '270px 1fr 320px' }}>
        <aside className="side">
          <div className="row" style={{ padding: '4px 4px 8px' }}>
            <input className="input" placeholder="筛选章节…" value={q} onChange={(e) => setQ(e.target.value)} />
            <button className="btn icon" title="新建章节" onClick={addChapter}>
              <Icon name="plus" size={16} />
            </button>
          </div>
          {project.volumes.map((v) => {
            const list = filtered.filter((c) => c.volumeId === v.id);
            if (!list.length) return null;
            return (
              <div key={v.id}>
                <div className="group-title display" style={{ fontSize: 14, color: 'var(--gold)' }}>
                  {v.name}
                </div>
                {list.map((c) => {
                  const stage = project.stages.find((s) => s.volumeId === v.id && s.from === c.num);
                  const n = texts[c.num] ? countChars(texts[c.num]) : 0;
                  return (
                    <div key={c.num}>
                      {stage && <div className="group-title">{stage.name}</div>}
                      <div className={`list-item ${current?.num === c.num ? 'active' : ''}`} onClick={() => select({ chapter: c.num })}>
                        <Seal kind={c.kind} />
                        <span className="nums faint" style={{ width: 22, textAlign: 'right' }}>
                          {c.num}
                        </span>
                        <span className="ellipsis grow">{c.title}</span>
                        {n > 0 && <span className="faint nums" style={{ fontSize: 11 }}>{(n / 1000).toFixed(1)}k</span>}
                        <span className="dot" style={{ ['--c' as any]: STATUS.find((s) => s.value === c.status)?.color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </aside>
        {current ? <ChapterPane key={current.num} ch={current} /> : <Empty title="还没有章节" icon="chapters"><button className="btn primary" onClick={addChapter}>新建第一章</button></Empty>}
      </div>
    </div>
  );
}

function ChapterPane({ ch }: { ch: Chapter }) {
  const data = useStore((s) => s.data);
  const text = useStore((s) => s.texts[ch.num]);
  const dirty = useStore((s) => !!s.dirtyTexts[ch.num]);
  const setText = useStore((s) => s.setText);
  const mutate = useStore((s) => s.mutate);
  const go = useStore((s) => s.go);
  const select = useStore((s) => s.select);
  const openContext = useStore((s) => s.openContext);
  const setCursor = useStore((s) => s.setCursor);
  const [tab, setTab] = useState<'text' | 'plan'>(text ? 'text' : 'plan');
  const viewRef = useRef<EditorView | null>(null);
  const { project, characters, locations } = data;
  const k = kindOf(project, ch.kind);
  const upd = (fn: (c: Chapter) => void, label = '编辑章节') =>
    mutate('chapters', (d) => {
      const c = d.find((x) => x.num === ch.num);
      if (c) fn(c as Chapter);
    }, label);

  return (
    <>
      <section className="chapter-main">
        <div className="chapter-head">
          <Seal kind={ch.kind} size="lg" solid />
          <div className="col" style={{ gap: 0, minWidth: 0 }}>
            <span className="faint" style={{ fontSize: 12 }}>
              第 {ch.num} 章 · {k?.description ?? k?.name} · {ch.days ?? '时间未定'}
            </span>
            <h2 className="ellipsis" style={{ fontSize: 24 }}>
              {ch.title}
            </h2>
          </div>
          <span className="grow" />
          <Seg
            value={tab}
            onChange={setTab}
            options={[
              { value: 'text', label: '正文' },
              { value: 'plan', label: '规划' },
            ]}
          />
          <button className="btn" title="以这一章为“当前章”" onClick={() => setCursor(ch.num)}>
            设为当前章
          </button>
          <button className="btn primary" onClick={() => openContext(ch.num)}>
            <Icon name="spark" size={15} /> 写作上下文
          </button>
        </div>

        {tab === 'text' ? (
          text == null ? (
            <Empty title="还没有正文文件" icon="scroll">
              <div>写作时会存到 {project.chapterFilePattern.replace('{NN}', String(ch.num).padStart(2, '0')).replace('{N}', String(ch.num))}</div>
              <button className="btn primary" onClick={() => setText(ch.num, `## 第${ch.num}章：${ch.title}\n\n`)}>
                创建正文
              </button>
            </Empty>
          ) : (
            <div className="prose-wrap">
              <ProseEditor
                value={text}
                onChange={(v) => setText(ch.num, v)}
                chars={characters}
                locs={locations}
                banned={project.guard.bannedPhrases}
                onReady={(v) => (viewRef.current = v)}
              />
              <div className="prose-status">
                <span className="nums">{countChars(text).toLocaleString()} 字</span>
                <span className="dot" style={{ ['--c' as any]: dirty ? 'var(--warn)' : 'var(--jade)' }} />
                <span>{dirty ? '未保存（Ctrl+S）' : '已保存'}</span>
              </div>
            </div>
          )
        ) : (
          <div className="plan-form">
            <Field label="标题">
              <Edit value={ch.title} onCommit={(v) => upd((c) => void (c.title = v))} />
            </Field>
            <Field label="类型">
              <div className="row">
                <Seg value={ch.kind} onChange={(v) => upd((c) => void (c.kind = v))} options={project.chapterKinds.map((k) => ({ value: k.id, label: `${k.name}　${k.description ?? ''}` }))} />
              </div>
            </Field>
            <Field label="状态">
              <Seg value={ch.status} onChange={(v) => upd((c) => void (c.status = v))} options={STATUS.map((s) => ({ value: s.value, label: s.label }))} />
            </Field>
            <Field label="所属卷">
              <select className="select" style={{ width: 260 }} value={ch.volumeId} onChange={(e) => upd((c) => void (c.volumeId = e.target.value))}>
                {project.volumes.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="故事时间">
              <div className="row">
                <Edit value={ch.days ?? ''} placeholder="如：第 4–6 天" onCommit={(v) => upd((c) => void (c.days = v || undefined))} style={{ width: 200 }} />
                <span className="faint">第</span>
                <Edit value={ch.dayStart?.toString() ?? ''} style={{ width: 60 }} onCommit={(v) => upd((c) => void (c.dayStart = v ? +v : undefined))} />
                <span className="faint">到</span>
                <Edit value={ch.dayEnd?.toString() ?? ''} style={{ width: 60 }} onCommit={(v) => upd((c) => void (c.dayEnd = v ? +v : undefined))} />
                <span className="faint">天（用于故事日历和时间倒流检查）</span>
              </div>
            </Field>
            <Field label="大纲计划">
              <Edit multiline rows={4} value={ch.plan} onCommit={(v) => upd((c) => void (c.plan = v))} placeholder="这一章计划写什么" />
            </Field>
            <Field label="实际梗概">
              <Edit multiline rows={4} value={ch.recap ?? ''} onCommit={(v) => upd((c) => void (c.recap = v || undefined))} placeholder="写完后一句话记下发生了什么（对应 progress.md）" />
            </Field>
            <Field label="主要人物">
              <div className="row wrap" style={{ gap: 5 }}>
                {(ch.pov ?? []).map((id) => {
                  const c = characters.find((x) => x.id === id);
                  return (
                    <span key={id} className="tag click" style={{ ['--c' as any]: c?.color }} onClick={() => upd((cc) => void (cc.pov = (cc.pov ?? []).filter((x) => x !== id)))} title="点击移除">
                      {c?.name ?? id} ×
                    </span>
                  );
                })}
                <select className="select" style={{ width: 140 }} value="" onChange={(e) => e.target.value && upd((c) => void (c.pov = [...(c.pov ?? []), e.target.value]))}>
                  <option value="">＋ 添加人物</option>
                  {characters
                    .filter((c) => !(ch.pov ?? []).includes(c.id))
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </div>
            </Field>
            <Field label="备注">
              <Edit multiline value={ch.notes ?? ''} onCommit={(v) => upd((c) => void (c.notes = v || undefined))} />
            </Field>
            <div className="row" style={{ justifyContent: 'flex-end', marginTop: 20 }}>
              <button
                className="btn danger"
                onClick={() => {
                  if (!confirmDelete(`第 ${ch.num} 章 ${ch.title} 的规划`)) return;
                  mutate('chapters', (d) => d.filter((c) => c.num !== ch.num) as any, '删除章节');
                }}
              >
                <Icon name="trash" size={15} /> 删除这章的规划（不删正文文件）
              </button>
            </div>
          </div>
        )}
      </section>
      <Radar ch={ch} onJump={(line) => {
        setTab('text');
        setTimeout(() => jumpToLine(viewRef.current, line), 50);
      }} go={go} select={select} />
    </>
  );
}

/** 右侧“本章雷达”：出场人物地点、剧情卡、伏笔、守卫问题 */
function Radar({ ch, onJump, go }: { ch: Chapter; onJump: (line: number) => void; go: ReturnType<typeof useStore.getState>['go']; select: unknown }) {
  const data = useStore((s) => s.data);
  const { charM, locM } = useMentions();
  const issues = useIssues().filter((i) => i.chapter === ch.num);
  const people = data.characters
    .map((c) => ({ c, n: charM.get(c.id)?.get(ch.num) ?? 0 }))
    .filter((x) => x.n)
    .sort((a, b) => b.n - a.n);
  const places = data.locations
    .map((l) => ({ l, n: locM.get(l.id)?.get(ch.num) ?? 0 }))
    .filter((x) => x.n)
    .sort((a, b) => b.n - a.n);
  const beats = data.beats.filter((b) => b.chapter === ch.num);
  const planted = data.foreshadows.filter((f) => f.planted.includes(ch.num));
  const payoff = data.foreshadows.filter((f) => f.payoffChapters.includes(ch.num) || f.resolvedIn === ch.num);

  return (
    <aside className="side-r radar">
      {!!issues.length && (
        <section>
          <h4>守卫</h4>
          {issues.map((i) => (
            <div key={i.id} className={`issue-mini ${i.severity}`} onClick={() => i.snip && onJump(i.snip.line)}>
              <Icon name={i.severity === 'info' ? 'info' : 'warn'} size={14} />
              <div className="col" style={{ gap: 2, minWidth: 0 }}>
                <span>{i.title}</span>
                {i.snip && (
                  <span className="faint snip">
                    …{i.snip.before}
                    <mark>{i.snip.hit}</mark>
                    {i.snip.after}…
                  </span>
                )}
              </div>
            </div>
          ))}
        </section>
      )}
      <section>
        <h4>出场人物</h4>
        {people.length ? (
          <div className="row wrap" style={{ gap: 5 }}>
            {people.map(({ c, n }) => (
              <span key={c.id} className="tag click" style={{ ['--c' as any]: c.color ?? 'var(--text-2)' }} onClick={() => go('characters', { character: c.id })}>
                {c.name} <b className="nums">{n}</b>
              </span>
            ))}
          </div>
        ) : (
          <div className="faint">正文里还没有出现已登记的人物</div>
        )}
      </section>
      <section>
        <h4>地点</h4>
        {places.length ? (
          <div className="row wrap" style={{ gap: 5 }}>
            {places.map(({ l, n }) => (
              <span key={l.id} className="tag click" onClick={() => go('locations', { location: l.id })}>
                {l.name} <b className="nums">{n}</b>
              </span>
            ))}
          </div>
        ) : (
          <div className="faint">—</div>
        )}
      </section>
      <section>
        <h4>剧情线</h4>
        {beats.length ? (
          beats.map((b) => {
            const p = data.plotlines.find((x) => x.id === b.plotlineId);
            return (
              <div key={b.id} className="beat static" style={{ ['--c' as any]: p?.color }}>
                <div className="faint" style={{ fontSize: 11 }}>
                  {p?.name}
                </div>
                {b.text}
              </div>
            );
          })
        ) : (
          <div className="faint">这一章在剧情网格里还没有卡片</div>
        )}
      </section>
      <section>
        <h4>伏笔</h4>
        {planted.map((f) => (
          <div key={f.id} className="fs-mini click" onClick={() => go('foreshadow', { foreshadow: f.id })}>
            <span className="tag" style={{ ['--c' as any]: 'var(--gold)' }}>埋</span>
            <span>{f.text}</span>
          </div>
        ))}
        {payoff.map((f) => (
          <div key={f.id} className="fs-mini click" onClick={() => go('foreshadow', { foreshadow: f.id })}>
            <span className="tag" style={{ ['--c' as any]: f.status === 'resolved' ? 'var(--jade)' : 'var(--cinnabar)' }}>{f.status === 'resolved' ? '已收' : '待收'}</span>
            <span>
              {f.text} <span className="faint">（埋于 {f.planted.map((n) => <ChapterLink key={n} num={n}>{n}</ChapterLink>)}）</span>
            </span>
          </div>
        ))}
        {!planted.length && !payoff.length && <div className="faint">—</div>}
      </section>
      {ch.recap && (
        <section>
          <h4>实际梗概</h4>
          <p className="muted selectable" style={{ margin: 0, lineHeight: 1.7 }}>
            {ch.recap}
          </p>
        </section>
      )}
    </aside>
  );
}
