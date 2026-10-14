import { useMemo, useState } from 'react';
import { uid, useStore } from '../store';
import { chapterEra, kindOf } from '../lib/analysis';
import { Icon } from '../components/Icon';
import { ChapterLink, Edit, EraTag, Field, NumEdit, Seg, confirmDelete } from '../components/ui';
import type { EventKind, WorldEvent } from '../../shared/types';

const KINDS: { value: EventKind; label: string; color: string }[] = [
  { value: 'history', label: '历史', color: 'var(--moon)' },
  { value: 'story', label: '故事', color: 'var(--text-2)' },
  { value: 'change', label: '历史改动', color: 'var(--cinnabar)' },
  { value: 'trace', label: '痕迹', color: 'var(--jade)' },
  { value: 'future', label: '将来', color: 'var(--gold)' },
];
const kindMeta = (k: EventKind) => KINDS.find((x) => x.value === k)!;

export function Timeline() {
  const [mode, setMode] = useState<'river' | 'calendar' | 'cross'>('river');
  const events = useStore((s) => s.data.events);
  const sel = useStore((s) => s.sel.event);
  const select = useStore((s) => s.select);
  const mutate = useStore((s) => s.mutate);
  const current = events.find((e) => e.id === sel);

  return (
    <div className="view">
      <div className="view-head" style={{ paddingBottom: 10 }}>
        <h1>世界脉络</h1>
        <Seg
          value={mode}
          onChange={setMode}
          options={[
            { value: 'river', label: '万年长河' },
            { value: 'calendar', label: '故事日历' },
            { value: 'cross', label: '古今交汇' },
          ]}
        />
        <span className="grow" />
        <button
          className="btn"
          onClick={() => {
            const id = uid('e');
            mutate('events', (d) => void d.push({ id, title: '新事件', kind: mode === 'calendar' ? 'story' : mode === 'cross' ? 'change' : 'history', eraId: null, description: '' }), '新建事件');
            select({ event: id });
          }}
        >
          <Icon name="plus" size={15} /> 事件
        </button>
      </div>
      <div className="split" style={{ gridTemplateColumns: current ? '1fr 340px' : '1fr', flex: 1, minHeight: 0 }}>
        <div style={{ minHeight: 0, overflow: 'auto' }}>
          {mode === 'river' && <River />}
          {mode === 'calendar' && <Calendar />}
          {mode === 'cross' && <Crossings />}
        </div>
        {current && <EventEditor key={current.id} e={current} />}
      </div>
    </div>
  );
}

/** 排序用的年份：没有数字年份时按标签和时代推断 */
function sortYear(e: WorldEvent, eraYear: (id: string | null) => number | undefined, eraYears: number[]) {
  if (e.year != null) return e.year;
  if (/上古|以前|开山/.test(e.yearLabel ?? '')) return -1e9;
  const y = eraYear(e.eraId);
  if (y != null) return y + (e.kind === 'future' ? 4 : 0.5);
  if (e.kind === 'future') return 1e9; // 远期伏线，放在长河尽头
  if (/之间|其间/.test(e.yearLabel ?? '') && eraYears.length >= 2) return (eraYears[0] + eraYears[eraYears.length - 1]) / 2;
  return -1e8;
}

function River() {
  const project = useStore((s) => s.data.project);
  const events = useStore((s) => s.data.events);
  const sel = useStore((s) => s.sel.event);
  const select = useStore((s) => s.select);
  const eraYear = (id: string | null) => project.eras.find((e) => e.id === id)?.year;
  const list = useMemo(
    () =>
      events
        .filter((e) => e.kind === 'history' || e.kind === 'future')
        .map((e) => ({ e, y: sortYear(e, eraYear, project.eras.map((x) => x.year).filter((v): v is number => v != null)) }))
        .sort((a, b) => a.y - b.y),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events, project.eras],
  );
  const side = (e: WorldEvent) => {
    const i = project.eras.findIndex((x) => x.id === e.eraId);
    return i < 0 ? 'center' : i === 0 ? 'left' : 'right';
  };

  const rows: React.ReactNode[] = [];
  let prev: number | null = null;
  for (const { e, y } of list) {
    if (prev != null && y - prev > 300 && prev > -1e7) {
      rows.push(
        <div key={`gap-${e.id}`} className="river-gap">
          <span>⋯⋯　{Math.round((y - prev) / 100) * 100 >= 1000 ? `${Math.round((y - prev) / 1000)} 千年` : `${Math.round(y - prev)} 年`}　⋯⋯</span>
        </div>,
      );
    }
    prev = y;
    const k = kindMeta(e.kind);
    rows.push(
      <div key={e.id} className={`river-row ${side(e)}`}>
        <div className={`river-card ${sel === e.id ? 'sel' : ''} ${e.kind}`} style={{ ['--c' as any]: project.eras.find((x) => x.id === e.eraId)?.color ?? 'var(--gold)' }} onClick={() => select({ event: e.id })}>
          <div className="row" style={{ gap: 6 }}>
            <span className="tag" style={{ ['--c' as any]: k.color }}>
              {k.label}
            </span>
            <span className="faint nums" style={{ fontSize: 12 }}>
              {e.yearLabel ?? (e.year != null ? `青云历 ${e.year} 年` : '')}
            </span>
          </div>
          <div className="display" style={{ fontSize: 17, margin: '4px 0 2px' }}>
            {e.title}
          </div>
          <div className="muted clamp3">{e.description}</div>
        </div>
        <span className="river-node" style={{ ['--c' as any]: k.color }} />
      </div>,
    );
  }

  return (
    <div className="river">
      <div className="river-axis" />
      <div className="river-legend">
        {project.eras.map((e, i) => (
          <span key={e.id} className={i === 0 ? 'l' : 'r'} style={{ color: e.color }}>
            {i === 0 ? '◀ ' : ''}
            {e.label}
            {i === 0 ? '' : ' ▶'}
          </span>
        ))}
      </div>
      {rows}
    </div>
  );
}

function Calendar() {
  const project = useStore((s) => s.data.project);
  const chapters = useStore((s) => s.data.chapters);
  const events = useStore((s) => s.data.events);
  const cursor = useStore((s) => s.cursor);
  const go = useStore((s) => s.go);
  const select = useStore((s) => s.select);
  const DW = 66;
  const maxDay = Math.max(10, ...chapters.map((c) => c.dayEnd ?? c.dayStart ?? 0), ...(project.keyDays ?? []).map((k) => k.day), ...events.map((e) => e.storyDay ?? 0)) + 2;

  // 泳道：每个时代一条，跨时代（亭）单独一条
  const lanes = [
    ...project.eras.map((e) => ({ id: e.id, label: e.label, color: e.color })),
    ...(project.chapterKinds.some((k) => !k.eraId) ? [{ id: '__cross', label: project.chapterKinds.find((k) => !k.eraId)?.description ?? '跨时代', color: 'var(--gold)' }] : []),
  ];
  const laneOf = (c: (typeof chapters)[0]) => chapterEra(project, c) ?? '__cross';

  const laid = useMemo(() => {
    const out = new Map<string, { c: (typeof chapters)[0]; row: number }[]>();
    for (const lane of lanes) {
      const list = chapters.filter((c) => c.dayStart != null && laneOf(c) === lane.id).sort((a, b) => a.dayStart! - b.dayStart! || a.num - b.num);
      const ends: number[] = [];
      const placed = list.map((c) => {
        const s = c.dayStart!;
        const e = c.dayEnd ?? s;
        let row = ends.findIndex((x) => x < s);
        if (row < 0) {
          row = ends.length;
          ends.push(e);
        } else ends[row] = e;
        return { c, row };
      });
      out.set(lane.id, placed);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapters, project]);

  return (
    <div className="calendar" style={{ width: 160 + maxDay * DW + 40 }}>
      <div className="cal-head" style={{ marginLeft: 160 }}>
        {Array.from({ length: maxDay }, (_, i) => (
          <span key={i} style={{ width: DW }} className={`nums ${(i + 1) % 5 === 0 ? '' : 'faint'}`}>
            {(i + 1) % 5 === 0 || i === 0 ? i + 1 : '·'}
          </span>
        ))}
      </div>
      <div className="cal-body">
        {(project.keyDays ?? []).map((k) => (
          <div key={k.day + k.label} className="cal-key" style={{ left: 160 + (k.day - 1) * DW + DW / 2, ['--c' as any]: project.eras.find((e) => e.id === k.eraId)?.color ?? 'var(--gold)' }}>
            <span>{k.label}</span>
          </div>
        ))}
        {lanes.map((lane) => {
          const placed = laid.get(lane.id) ?? [];
          const rowsN = Math.max(1, ...placed.map((p) => p.row + 1));
          const evs = events.filter((e) => e.storyDay != null && (lane.id === '__cross' ? !e.eraId : e.eraId === lane.id));
          return (
            <div key={lane.id} className="cal-lane" style={{ height: 30 + rowsN * 34 }}>
              <div className="cal-lane-label" style={{ color: lane.color }}>
                {lane.label}
              </div>
              {evs.map((e) => (
                <span key={e.id} className="cal-event" title={`${e.title}\n${e.description}`} style={{ left: 160 + (e.storyDay! - 1) * DW + DW / 2, ['--c' as any]: kindMeta(e.kind).color }} onClick={() => select({ event: e.id })} />
              ))}
              {placed.map(({ c, row }) => {
                const k = kindOf(project, c.kind);
                const s = c.dayStart!;
                const e = c.dayEnd ?? s;
                return (
                  <div
                    key={c.num}
                    className={`cal-ch ${c.status} ${c.num === cursor ? 'cursor' : ''}`}
                    style={{ left: 160 + (s - 1) * DW + 2, width: (e - s + 1) * DW - 4, top: 24 + row * 34, ['--c' as any]: k?.color }}
                    title={`第 ${c.num} 章 ${c.title}\n${c.days ?? ''}\n${c.recap ?? c.plan}`}
                    onClick={() => go('chapters', { chapter: c.num })}
                  >
                    <b className="nums">{c.num}</b> {c.title}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      <div className="faint" style={{ padding: '12px 0 0 160px' }}>
        两边的日子同步流逝。章节按“故事时间”的起止天摆放，没有填天数的章不显示。圆点是故事事件。
      </div>
    </div>
  );
}

function Crossings() {
  const events = useStore((s) => s.data.events);
  const project = useStore((s) => s.data.project);
  const sel = useStore((s) => s.sel.event);
  const select = useStore((s) => s.select);
  const list = events.filter((e) => e.kind === 'change' || e.kind === 'trace').sort((a, b) => (a.chapter ?? 999) - (b.chapter ?? 999));
  const [a, b] = project.eras;
  return (
    <div className="cross-list">
      <div className="cross-head">
        <span style={{ color: a?.color }}>{a?.label}</span>
        <span />
        <span style={{ color: b?.color }}>{b?.label}</span>
      </div>
      {list.map((e) => {
        const k = kindMeta(e.kind);
        return (
          <div key={e.id} className={`cross-card ${sel === e.id ? 'sel' : ''}`} onClick={() => select({ event: e.id })}>
            <div className="cross-side">
              <div className="display" style={{ fontSize: 16 }}>
                {e.title}
              </div>
              <div className="muted">{e.before ?? e.description}</div>
            </div>
            <div className="cross-mid" style={{ ['--c' as any]: k.color }}>
              <span className="tag" style={{ ['--c' as any]: k.color }}>
                {k.label}
              </span>
              <svg width="80" height="20" viewBox="0 0 80 20">
                <path d="M2 10 H70 M62 4 L72 10 L62 16" fill="none" stroke="currentColor" strokeWidth="1.6" />
              </svg>
              {e.chapter && <ChapterLink num={e.chapter} />}
            </div>
            <div className="cross-side">
              <div className="muted">{e.after ?? (e.kind === 'trace' ? '（痕迹一直都在）' : '')}</div>
            </div>
          </div>
        );
      })}
      {!list.length && <div className="empty">还没有历史改动或古今痕迹。</div>}
    </div>
  );
}

function EventEditor({ e }: { e: WorldEvent }) {
  const data = useStore((s) => s.data);
  const mutate = useStore((s) => s.mutate);
  const select = useStore((s) => s.select);
  const upd = (fn: (x: WorldEvent) => void, label = '编辑事件') =>
    mutate('events', (d) => {
      const x = d.find((y) => y.id === e.id);
      if (x) fn(x as WorldEvent);
    }, label);
  const toggle = (key: 'characters' | 'locations', id: string) =>
    upd((x) => {
      const arr = x[key] ?? [];
      x[key] = arr.includes(id) ? arr.filter((i) => i !== id) : [...arr, id];
    });
  return (
    <aside className="side-r col" style={{ gap: 8 }}>
      <div className="row">
        <Edit value={e.title} bare className="display name-edit" onCommit={(v) => upd((x) => void (x.title = v))} />
        <button className="btn ghost sm icon" onClick={() => select({ event: undefined })}>
          <Icon name="close" size={15} />
        </button>
      </div>
      <Seg value={e.kind} onChange={(v) => upd((x) => void (x.kind = v))} options={KINDS.map((k) => ({ value: k.value, label: k.label }))} />
      <Field label="时代">
        <div className="row">
          <select className="select" value={e.eraId ?? ''} onChange={(ev) => upd((x) => void (x.eraId = ev.target.value || null))}>
            <option value="">不限</option>
            {data.project.eras.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </select>
          <EraTag eraId={e.eraId} />
        </div>
      </Field>
      <Field label="纪年">
        <NumEdit value={e.year} placeholder="年份" onCommit={(v) => upd((x) => void (x.year = v))} />
      </Field>
      <Field label="年代说明">
        <Edit value={e.yearLabel ?? ''} placeholder="如：约 31990 年（十年前）" onCommit={(v) => upd((x) => void (x.yearLabel = v || undefined))} />
      </Field>
      <Field label="故事日">
        <NumEdit value={e.storyDay} placeholder="第几天" onCommit={(v) => upd((x) => void (x.storyDay = v))} />
      </Field>
      <Field label="章">
        <NumEdit value={e.chapter} placeholder="章号" onCommit={(v) => upd((x) => void (x.chapter = v))} />
      </Field>
      <Field label="描述">
        <Edit multiline rows={4} value={e.description} onCommit={(v) => upd((x) => void (x.description = v))} />
      </Field>
      {(e.kind === 'change' || e.kind === 'trace') && (
        <>
          <Field label={e.kind === 'change' ? '改之前' : '古代'}>
            <Edit multiline value={e.before ?? ''} onCommit={(v) => upd((x) => void (x.before = v || undefined))} />
          </Field>
          <Field label={e.kind === 'change' ? '改之后' : '现代'}>
            <Edit multiline value={e.after ?? ''} onCommit={(v) => upd((x) => void (x.after = v || undefined))} />
          </Field>
        </>
      )}
      <Field label="人物">
        <div className="row wrap" style={{ gap: 4 }}>
          {data.characters.map((c) => (
            <span key={c.id} className="tag click" style={{ ['--c' as any]: e.characters?.includes(c.id) ? c.color ?? 'var(--gold)' : 'var(--text-3)', opacity: e.characters?.includes(c.id) ? 1 : 0.45 }} onClick={() => toggle('characters', c.id)}>
              {c.name}
            </span>
          ))}
        </div>
      </Field>
      <Field label="地点">
        <div className="row wrap" style={{ gap: 4 }}>
          {data.locations
            .filter((l) => e.locations?.includes(l.id) || !e.eraId || !l.eraId || l.eraId === e.eraId)
            .map((l) => (
              <span key={l.id} className="tag click" style={{ ['--c' as any]: e.locations?.includes(l.id) ? 'var(--gold)' : 'var(--text-3)', opacity: e.locations?.includes(l.id) ? 1 : 0.45 }} onClick={() => toggle('locations', l.id)}>
                {l.name}
              </span>
            ))}
        </div>
      </Field>
      <button
        className="btn danger sm"
        style={{ alignSelf: 'flex-start' }}
        onClick={() => {
          if (!confirmDelete(e.title)) return;
          mutate('events', (d) => d.filter((x) => x.id !== e.id) as any, '删除事件');
          select({ event: undefined });
        }}
      >
        <Icon name="trash" size={13} /> 删除事件
      </button>
    </aside>
  );
}
