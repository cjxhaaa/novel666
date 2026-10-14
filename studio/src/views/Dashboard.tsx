import { useMemo } from 'react';
import { useStore } from '../store';
import { useIssues, useMentions } from '../lib/derived';
import { countChars, fmtWan, kindOf, latestDone, totalOf } from '../lib/analysis';
import { Icon } from '../components/Icon';
import { Seal } from '../components/ui';

export function Dashboard() {
  const data = useStore((s) => s.data);
  const texts = useStore((s) => s.texts);
  const go = useStore((s) => s.go);
  const openContext = useStore((s) => s.openContext);
  const issues = useIssues();
  const { charM } = useMentions();
  const { project, chapters, foreshadows, characters } = data;

  const done = latestDone(chapters);
  const total = useMemo(() => Object.values(texts).reduce((a, t) => a + countChars(t), 0), [texts]);
  const next = chapters.find((c) => c.num === done + 1);
  const lastDay = chapters.filter((c) => c.status === 'done').reduce((m, c) => Math.max(m, c.dayEnd ?? c.dayStart ?? 0), 0);
  const open = foreshadows.filter((f) => f.status === 'open');
  const warn = issues.filter((i) => i.severity !== 'info');
  const vol = project.volumes.find((v) => (v.from ?? 1) <= Math.max(1, done + 1) && Math.max(1, done + 1) <= (v.to ?? Infinity)) ?? project.volumes[0];
  const volChapters = chapters.filter((c) => c.volumeId === vol?.id).sort((a, b) => a.num - b.num);
  const volDone = volChapters.filter((c) => c.status === 'done').length;
  const avg = done ? Math.round(total / Math.max(1, Object.keys(texts).length)) : 0;

  const top = useMemo(
    () =>
      [...characters]
        .map((c) => ({ c, t: totalOf(charM.get(c.id)) }))
        .filter((x) => x.t > 0)
        .sort((a, b) => b.t - a.t)
        .slice(0, 12),
    [characters, charM],
  );
  const maxCell = useMemo(() => {
    let m = 1;
    for (const { c } of top) charM.get(c.id)?.forEach((v) => (m = Math.max(m, v)));
    return m;
  }, [top, charM]);

  return (
    <div className="view">
      <div className="view-body" style={{ paddingTop: 24 }}>
        <section className="hero">
          <div className="hero-glow" />
          <div className="col" style={{ gap: 10, position: 'relative' }}>
            <div className="row faint" style={{ gap: 10, fontSize: 12, letterSpacing: '0.2em' }}>
              {project.eras.map((e) => (
                <span key={e.id} className="row" style={{ gap: 6 }}>
                  <span className="dot glow" style={{ ['--c' as any]: e.color }} />
                  {e.label}
                </span>
              ))}
            </div>
            <h1 className="hero-title">{project.title}</h1>
            {project.logline && <p className="hero-line">{project.logline}</p>}
          </div>
          <div className="hero-stats">
            <div className="stat">
              <span className="v nums">
                {done}
                <small className="faint"> / {chapters.length}</small>
              </span>
              <span className="l">已写章节 / 计划</span>
            </div>
            <div className="stat">
              <span className="v nums">{fmtWan(total)}</span>
              <span className="l">正文字数 · 章均 {avg}</span>
            </div>
            <div className="stat">
              <span className="v nums">{lastDay || '—'}</span>
              <span className="l">故事进行到第几天</span>
            </div>
            <div className="stat click" onClick={() => go('foreshadow')}>
              <span className="v nums" style={{ color: 'var(--gold)' }}>
                {open.length}
              </span>
              <span className="l">未收伏笔</span>
            </div>
            <div className="stat click" onClick={() => go('guard')}>
              <span className="v nums" style={{ color: warn.length ? 'var(--cinnabar)' : 'var(--jade)' }}>
                {warn.length}
              </span>
              <span className="l">守卫提醒</span>
            </div>
          </div>
        </section>

        {vol && (
          <section className="panel" style={{ marginTop: 18 }}>
            <div className="panel-head">
              {vol.name}
              <span className="hint">
                {volDone} / {volChapters.length} 章 · 点击格子打开章节
              </span>
            </div>
            <div className="panel-body">
              <div className="stage-strip">
                {project.stages
                  .filter((s) => s.volumeId === vol.id)
                  .map((s) => (
                    <div key={s.id} className="stage" style={{ flex: s.to - s.from + 1 }}>
                      <div className="stage-name ellipsis" title={s.summary ?? s.name}>
                        {s.name}
                      </div>
                      <div className="cells">
                        {volChapters
                          .filter((c) => c.num >= s.from && c.num <= s.to)
                          .map((c) => {
                            const k = kindOf(project, c.kind);
                            return (
                              <div
                                key={c.num}
                                className={`cell ${c.status}`}
                                style={{ ['--c' as any]: k?.color }}
                                title={`第 ${c.num} 章【${k?.name}】${c.title}\n${c.recap ?? c.plan}`}
                                onClick={() => go('chapters', { chapter: c.num })}
                              >
                                <span>{c.num}</span>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  ))}
              </div>
              <div className="row faint" style={{ gap: 16, marginTop: 10, fontSize: 12 }}>
                {project.chapterKinds.map((k) => (
                  <span key={k.id} className="row" style={{ gap: 6 }}>
                    <Seal kind={k.id} /> {k.description ?? k.name}
                  </span>
                ))}
                <span className="grow" />
                <span className="row" style={{ gap: 6 }}>
                  <span className="cell-demo done" /> 已写
                </span>
                <span className="row" style={{ gap: 6 }}>
                  <span className="cell-demo" /> 计划
                </span>
              </div>
            </div>
          </section>
        )}

        <div className="dash-grid">
          {next && (
            <section className="panel next-card">
              <div className="panel-head">
                <Icon name="spark" size={16} style={{ color: 'var(--gold)' }} /> 下一章
              </div>
              <div className="panel-body col" style={{ gap: 10 }}>
                <div className="row" style={{ gap: 10 }}>
                  <Seal kind={next.kind} size="lg" />
                  <div className="col" style={{ gap: 0 }}>
                    <span className="faint" style={{ fontSize: 12 }}>
                      第 {next.num} 章 · {next.days ?? '时间未定'}
                    </span>
                    <span className="display" style={{ fontSize: 22 }}>
                      {next.title}
                    </span>
                  </div>
                </div>
                <p className="muted selectable" style={{ margin: 0, lineHeight: 1.75 }}>
                  {next.plan}
                </p>
                <div className="row">
                  <button className="btn primary" onClick={() => openContext(next.num)}>
                    <Icon name="spark" size={15} /> 生成写作上下文
                  </button>
                  <button className="btn" onClick={() => go('chapters', { chapter: next.num })}>
                    打开章节
                  </button>
                </div>
              </div>
            </section>
          )}

          <section className="panel">
            <div className="panel-head">
              守卫提醒
              <span className="hint click" onClick={() => go('guard')}>
                全部 {issues.length} 条 →
              </span>
            </div>
            <div className="panel-body col" style={{ gap: 4 }}>
              {warn.slice(0, 7).map((i) => (
                <div key={i.id} className="list-item" onClick={() => go('guard')} style={{ padding: '5px 6px' }}>
                  <Icon name={i.severity === 'error' ? 'warn' : 'info'} size={15} style={{ color: i.severity === 'error' ? 'var(--danger)' : 'var(--warn)' }} />
                  <span className="ellipsis">{i.title}</span>
                  {i.chapter && <span className="faint nums" style={{ marginLeft: 'auto' }}>#{i.chapter}</span>}
                </div>
              ))}
              {!warn.length && <div className="faint" style={{ padding: 10 }}>一切安好。设定、伏笔和正文没有发现冲突。</div>}
            </div>
          </section>
        </div>

        <section className="panel" style={{ marginTop: 18 }}>
          <div className="panel-head">
            人物出场热力
            <span className="hint">按正文里名字和别名出现次数统计 · 点击人名查看</span>
          </div>
          <div className="panel-body" style={{ overflowX: 'auto' }}>
            <div className="heat" style={{ gridTemplateColumns: `90px repeat(${Math.max(done, 1)}, minmax(14px, 1fr))` }}>
              <span />
              {Array.from({ length: done }, (_, i) => (
                <span key={i} className="heat-h nums">
                  {(i + 1) % 5 === 0 || i === 0 ? i + 1 : ''}
                </span>
              ))}
              {top.map(({ c }) => (
                <HeatRow key={c.id} name={c.name} color={c.color} done={done} per={charM.get(c.id)} max={maxCell} onClick={() => go('characters', { character: c.id })} />
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function HeatRow({ name, color, done, per, max, onClick }: { name: string; color?: string; done: number; per?: Map<number, number>; max: number; onClick: () => void }) {
  return (
    <>
      <span className="heat-name ellipsis click" onClick={onClick} style={{ color }}>
        {name}
      </span>
      {Array.from({ length: done }, (_, i) => {
        const v = per?.get(i + 1) ?? 0;
        const a = v ? 0.15 + 0.85 * Math.sqrt(v / max) : 0;
        return <span key={i} className="heat-cell" title={`第 ${i + 1} 章：${v} 次`} style={{ background: v ? `color-mix(in srgb, ${color ?? 'var(--gold)'} ${Math.round(a * 100)}%, transparent)` : undefined }} />;
      })}
    </>
  );
}
