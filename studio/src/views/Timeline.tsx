import { useEffect, useMemo, useRef, useState } from 'react';
import { uid, useStore } from '../store';
import { chapterEra, kindOf } from '../lib/analysis';
import { Icon } from '../components/Icon';
import { ChapterLink, Edit, EraTag, Field, NumEdit, Seg, confirmDelete } from '../components/ui';
import type { EventKind, WorldEvent } from '../../shared/types';

const KINDS: { value: EventKind; label: string; color: string }[] = [
  { value: 'history', label: '历史', color: 'var(--moon)' },
  { value: 'story', label: '故事', color: 'var(--text-2)' },
  { value: 'change', label: '改动（旧）', color: 'var(--cinnabar)' },
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
            mutate('events', (d) => void d.push({ id, title: '新事件', kind: mode === 'calendar' ? 'story' : mode === 'cross' ? 'trace' : 'history', eraId: null, description: '' }), '新建事件');
            select({ event: id });
          }}
        >
          <Icon name="plus" size={15} /> 事件
        </button>
      </div>
      <div className="split" style={{ gridTemplateColumns: current ? 'minmax(0, 1fr) 340px' : 'minmax(0, 1fr)', flex: 1, minHeight: 0 }}>
        <div style={{ minHeight: 0, minWidth: 0, overflow: mode === 'calendar' ? 'hidden' : 'auto' }}>
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

const ZOOMS = [
  { dw: 66, label: '日' },
  { dw: 28, label: '周' },
  { dw: 10, label: '月' },
  { dw: 3, label: '全书' },
];

function Calendar() {
  const project = useStore((s) => s.data.project);
  const chapters = useStore((s) => s.data.chapters);
  const events = useStore((s) => s.data.events);
  const cursor = useStore((s) => s.cursor);
  const go = useStore((s) => s.go);
  const select = useStore((s) => s.select);
  const [zoom, setZoom] = useState(() => {
    try {
      return Number(localStorage.getItem('cal-zoom') ?? 0) || 0;
    } catch {
      return 0;
    }
  });
  const DW = ZOOMS[zoom]?.dw ?? 66;
  const LW = 160;
  const scRef = useRef<HTMLDivElement>(null);
  const maxDay = Math.max(10, ...chapters.map((c) => c.dayEnd ?? c.dayStart ?? 0), ...(project.keyDays ?? []).map((k) => k.day), ...events.map((e) => e.storyDay ?? 0)) + 2;
  const step = DW >= 40 ? 5 : DW >= 20 ? 10 : DW >= 8 ? 30 : 100;

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
        // 按像素排行：缩小以后一天里的几章不挤在一起
        const left = (s - 1) * DW;
        const right = Math.max(e * DW, left + 18);
        let row = ends.findIndex((x) => x <= left);
        if (row < 0) {
          row = ends.length;
          ends.push(right);
        } else ends[row] = right;
        return { c, row };
      });
      out.set(lane.id, placed);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapters, project, DW]);

  // 每卷的起始天，用来跳转
  const volStarts = useMemo(
    () =>
      project.volumes
        .map((v) => {
          const ds = chapters.filter((c) => c.volumeId === v.id && c.dayStart != null).map((c) => c.dayStart!);
          return { id: v.id, name: v.name.replace(/：.*$/, ''), day: ds.length ? Math.min(...ds) : null };
        })
        .filter((v): v is { id: string; name: string; day: number } => v.day != null),
    [project.volumes, chapters],
  );

  const scrollToDay = (day: number) => {
    const el = scRef.current;
    if (el) el.scrollLeft = Math.max(0, (day - 1) * DW - 10); // 让这一天紧挨着左边的泳道名
  };

  // 换缩放时，视野正中那一天不动
  const centerDay = useRef<number | null>(null);
  const changeZoom = (z: number) => {
    const el = scRef.current;
    if (el) centerDay.current = (el.scrollLeft + el.clientWidth / 2 - LW) / DW + 1;
    setZoom(z);
    try {
      localStorage.setItem('cal-zoom', String(z));
    } catch {
      /* 存不了就算了 */
    }
  };
  useEffect(() => {
    const el = scRef.current;
    if (!el || centerDay.current == null) return;
    el.scrollLeft = Math.max(0, LW + (centerDay.current - 1) * DW - el.clientWidth / 2);
    centerDay.current = null;
  }, [DW]);

  // 第一次打开停在当前章附近
  useEffect(() => {
    const c = chapters.find((x) => x.num === cursor);
    if (c?.dayStart) scrollToDay(c.dayStart);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 滚轮竖着滚也让日历横着走；按住 Shift 照常竖滚
  useEffect(() => {
    const el = scRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.shiftKey) return;
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      el.scrollLeft += e.deltaY;
      e.preventDefault();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // 按住空白处拖动平移
  const drag = useRef<{ x: number; y: number; l: number; t: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('.cal-ch, .cal-event, button')) return;
    const el = scRef.current!;
    drag.current = { x: e.clientX, y: e.clientY, l: el.scrollLeft, t: el.scrollTop };
    el.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const el = scRef.current!;
    el.scrollLeft = d.l - (e.clientX - d.x);
    el.scrollTop = d.t - (e.clientY - d.y);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (!drag.current) return;
    drag.current = null;
    scRef.current?.releasePointerCapture(e.pointerId);
  };

  const cur = chapters.find((x) => x.num === cursor);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0 }}>
      <div className="cal-bar">
        <span className="faint">缩放</span>
        <Seg value={String(zoom)} onChange={(v) => changeZoom(Number(v))} options={ZOOMS.map((z, i) => ({ value: String(i), label: z.label }))} />
        <span className="faint" style={{ marginLeft: 12 }}>
          跳到
        </span>
        {volStarts.map((v) => (
          <button key={v.id} className="btn" onClick={() => scrollToDay(v.day)} title={`故事第 ${v.day} 天`}>
            {v.name}
          </button>
        ))}
        {cur?.dayStart != null && (
          <button className="btn" onClick={() => scrollToDay(cur.dayStart!)}>
            当前章
          </button>
        )}
        <span className="grow" />
        <span className="faint" style={{ fontSize: 12 }}>
          滚轮或按住拖动左右移动
        </span>
      </div>
      <div ref={scRef} className="cal-scroll" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
        <div className="calendar" style={{ width: LW + maxDay * DW + 40 }}>
          <div className="cal-head" style={{ marginLeft: LW }}>
            {Array.from({ length: maxDay }, (_, i) => (
              <span key={i} style={{ width: DW }} className={`nums ${(i + 1) % step === 0 ? '' : 'faint'}`}>
                {(i + 1) % step === 0 || i === 0 ? i + 1 : DW >= 20 ? '·' : ''}
              </span>
            ))}
          </div>
          <div className="cal-body">
            {(project.keyDays ?? []).map((k) => (
              <div key={k.day + k.label} className="cal-key" style={{ left: LW + (k.day - 1) * DW + DW / 2, ['--c' as any]: project.eras.find((e) => e.id === k.eraId)?.color ?? 'var(--gold)' }}>
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
                    <span key={e.id} className="cal-event" title={`${e.title}\n${e.description}`} style={{ left: LW + (e.storyDay! - 1) * DW + DW / 2, ['--c' as any]: kindMeta(e.kind).color }} onClick={() => select({ event: e.id })} />
                  ))}
                  {placed.map(({ c, row }) => {
                    const k = kindOf(project, c.kind);
                    const s = c.dayStart!;
                    const e = c.dayEnd ?? s;
                    const w = Math.max((e - s + 1) * DW - 4, 14);
                    return (
                      <div
                        key={c.num}
                        className={`cal-ch ${c.status} ${c.num === cursor ? 'cursor' : ''} ${w < 40 ? 'tiny' : ''}`}
                        style={{ left: LW + (s - 1) * DW + 2, width: w, top: 24 + row * 34, ['--c' as any]: k?.color }}
                        title={`第 ${c.num} 章 ${c.title}\n${c.days ?? ''}\n${c.recap || c.plan}`}
                        onClick={() => go('chapters', { chapter: c.num })}
                      >
                        <b className="nums">{c.num}</b> {w >= 40 ? c.title : ''}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
          <div className="faint cal-foot">两边的日子同步流逝。章节按“故事时间”的起止天摆放，没有填天数的章不显示。圆点是故事事件。</div>
        </div>
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
      {!list.length && <div className="empty">还没有古今痕迹。</div>}
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
