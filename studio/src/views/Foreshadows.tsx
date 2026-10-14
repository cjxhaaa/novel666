import { useMemo, useState } from 'react';
import { uid, useStore } from '../store';
import { latestDone } from '../lib/analysis';
import { Icon } from '../components/Icon';
import { ChapterLink, Edit, NumEdit, Seg, ViewHead, confirmDelete, parseNums } from '../components/ui';
import type { Foreshadow, ForeshadowStatus } from '../../shared/types';

type Filter = 'all' | 'open' | 'overdue' | 'far' | 'resolved';

function state(f: Foreshadow, done: number) {
  if (f.status === 'resolved') return 'resolved';
  if (f.status === 'dropped') return 'dropped';
  if (!f.payoffChapters.length) return 'far';
  if (Math.max(...f.payoffChapters) <= done) return 'overdue';
  return 'open';
}

const COLOR: Record<string, string> = {
  resolved: 'var(--jade)',
  open: 'var(--gold)',
  overdue: 'var(--cinnabar)',
  far: 'var(--moon)',
  dropped: 'var(--text-3)',
};
const LABEL: Record<string, string> = { resolved: '已收', open: '待收', overdue: '逾期', far: '远期', dropped: '弃用' };

export function Foreshadows() {
  const foreshadows = useStore((s) => s.data.foreshadows);
  const chapters = useStore((s) => s.data.chapters);
  const cursor = useStore((s) => s.cursor);
  const sel = useStore((s) => s.sel.foreshadow);
  const select = useStore((s) => s.select);
  const mutate = useStore((s) => s.mutate);
  const [filter, setFilter] = useState<Filter>('all');
  const [hover, setHover] = useState<string | null>(null);
  const done = latestDone(chapters);
  const maxCh = Math.max(done + 5, ...chapters.map((c) => c.num), ...foreshadows.flatMap((f) => [...f.planted, ...f.payoffChapters]));

  const list = useMemo(
    () => foreshadows.filter((f) => filter === 'all' || state(f, done) === filter).sort((a, b) => Math.min(...a.planted, 999) - Math.min(...b.planted, 999)),
    [foreshadows, filter, done],
  );
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const f of foreshadows) c[state(f, done)] = (c[state(f, done)] ?? 0) + 1;
    return c;
  }, [foreshadows, done]);

  // 弧线图
  const W = 1200;
  const H = 240;
  const pad = 30;
  const x = (n: number) => pad + ((n - 0.5) / maxCh) * (W - pad * 2);
  const base = H - 34;

  return (
    <div className="view">
      <ViewHead title="伏笔" sub="每条弧线从埋下的章连到计划收的章。金色待收，红色逾期，青色已收，蓝色远期（弧线伸出画面）。">
        <button
          className="btn"
          onClick={() => {
            const id = uid('f');
            mutate('foreshadows', (d) => void d.push({ id, text: '新伏笔', planted: [cursor], payoff: '', payoffChapters: [], status: 'open' }), '新建伏笔');
            select({ foreshadow: id });
          }}
        >
          <Icon name="plus" size={15} /> 埋一个伏笔
        </button>
      </ViewHead>
      <div className="view-body">
        <div className="panel arc-panel">
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="xMidYMid meet">
            <defs>
              <linearGradient id="far-fade" x1="0" x2="1">
                <stop offset="0" stopColor="var(--moon)" stopOpacity="0.9" />
                <stop offset="1" stopColor="var(--moon)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <rect x={pad} y={base} width={x(done + 0.5) - pad} height={3} rx={1.5} fill="var(--jade)" opacity="0.5" />
            <line x1={pad} x2={W - pad} y1={base + 1.5} y2={base + 1.5} stroke="var(--line-strong)" />
            {Array.from({ length: maxCh }, (_, i) => i + 1).map((n) => (
              <g key={n}>
                <line x1={x(n)} x2={x(n)} y1={base - 3} y2={base + 6} stroke="var(--line-strong)" />
                {(n % 5 === 0 || n === 1) && (
                  <text x={x(n)} y={base + 22} textAnchor="middle" className="arc-tick">
                    {n}
                  </text>
                )}
              </g>
            ))}
            <line x1={x(cursor)} x2={x(cursor)} y1={14} y2={base} className="arc-cursor" />
            <text x={x(cursor)} y={10} textAnchor="middle" className="arc-tick" style={{ fill: 'var(--gold)' }}>
              当前 {cursor}
            </text>
            {foreshadows.map((f) => {
              if (!f.planted.length) return null;
              const st = state(f, done);
              const a = Math.min(...f.planted);
              const far = st === 'far';
              const b = f.resolvedIn ?? (far ? maxCh + 4 : Math.max(...f.payoffChapters));
              const x1 = x(a);
              const x2 = Math.min(x(b), W + 40);
              const h = Math.min(base - 24, 18 + Math.abs(x2 - x1) * 0.42);
              const on = hover === f.id || sel === f.id;
              const dim = (hover || sel) && !on;
              const filtered = filter !== 'all' && st !== filter;
              return (
                <path
                  key={f.id}
                  d={`M${x1},${base} C${x1},${base - h} ${x2},${base - h} ${x2},${base}`}
                  fill="none"
                  stroke={far ? 'url(#far-fade)' : COLOR[st]}
                  strokeWidth={on ? 3 : 1.6}
                  strokeDasharray={st === 'resolved' ? undefined : '5 4'}
                  opacity={filtered ? 0.06 : dim ? 0.15 : on ? 1 : 0.75}
                  className="arc"
                  style={{ filter: on ? `drop-shadow(0 0 6px ${COLOR[st]})` : undefined }}
                  onMouseEnter={() => setHover(f.id)}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => select({ foreshadow: f.id })}
                >
                  <title>{f.text}</title>
                </path>
              );
            })}
          </svg>
        </div>

        <div className="row" style={{ margin: '16px 0 10px' }}>
          <Seg
            value={filter}
            onChange={setFilter}
            options={(['all', 'open', 'overdue', 'far', 'resolved'] as Filter[]).map((k) => ({
              value: k,
              label: (
                <span className="row" style={{ gap: 5 }}>
                  {k !== 'all' && <span className="dot" style={{ ['--c' as any]: COLOR[k] }} />}
                  {k === 'all' ? '全部' : LABEL[k]} <span className="faint nums">{k === 'all' ? foreshadows.length : counts[k] ?? 0}</span>
                </span>
              ),
            }))}
          />
        </div>

        <div className="fs-list">
          {list.map((f) => (
            <FsRow key={f.id} f={f} st={state(f, done)} open={sel === f.id} hover={hover === f.id} onHover={setHover} />
          ))}
        </div>
      </div>
    </div>
  );
}

function FsRow({ f, st, open, hover, onHover }: { f: Foreshadow; st: string; open: boolean; hover: boolean; onHover: (id: string | null) => void }) {
  const mutate = useStore((s) => s.mutate);
  const select = useStore((s) => s.select);
  const upd = (fn: (x: Foreshadow) => void, label = '编辑伏笔') =>
    mutate('foreshadows', (d) => {
      const x = d.find((y) => y.id === f.id);
      if (x) fn(x as Foreshadow);
    }, label);
  return (
    <div
      className={`fs-row ${open ? 'open' : ''} ${hover ? 'hover' : ''}`}
      style={{ ['--c' as any]: COLOR[st] }}
      onMouseEnter={() => onHover(f.id)}
      onMouseLeave={() => onHover(null)}
      ref={(el) => {
        if (open && el) el.scrollIntoView({ block: 'nearest' });
      }}
    >
      <div className="fs-summary" onClick={() => select({ foreshadow: open ? undefined : f.id })}>
        <span className="tag" style={{ ['--c' as any]: COLOR[st], width: 44, justifyContent: 'center' }}>
          {LABEL[st]}
        </span>
        <span className="grow">{f.text}</span>
        <span className="row" style={{ gap: 4 }}>
          {f.planted.map((n) => (
            <ChapterLink key={n} num={n}>
              埋{n}
            </ChapterLink>
          ))}
          <Icon name="right" size={13} style={{ color: 'var(--text-3)' }} />
          {f.resolvedIn ? (
            <ChapterLink num={f.resolvedIn}>收{f.resolvedIn}</ChapterLink>
          ) : f.payoffChapters.length ? (
            <span className="faint nums">{f.payoffChapters.join('、')}</span>
          ) : (
            <span className="faint">远期</span>
          )}
        </span>
      </div>
      {open && (
        <div className="fs-edit">
          <Edit multiline value={f.text} onCommit={(v) => upd((x) => void (x.text = v))} />
          <div className="row wrap" style={{ gap: 14 }}>
            <label className="row faint">
              埋在
              <Edit value={f.planted.join('、')} style={{ width: 110 }} onCommit={(v) => upd((x) => void (x.planted = parseNums(v)))} />章
            </label>
            <label className="row faint">
              计划收
              <Edit value={f.payoffChapters.join('、')} placeholder="空 = 远期" style={{ width: 120 }} onCommit={(v) => upd((x) => void (x.payoffChapters = parseNums(v)))} />章
            </label>
            <Seg
              value={f.status}
              onChange={(v: ForeshadowStatus) =>
                upd((x) => {
                  x.status = v;
                  if (v !== 'resolved') delete x.resolvedIn;
                }, '改伏笔状态')
              }
              options={[
                { value: 'open', label: '未收' },
                { value: 'resolved', label: '已收' },
                { value: 'dropped', label: '弃用' },
              ]}
            />
            {f.status === 'resolved' && (
              <label className="row faint">
                收在第 <NumEdit value={f.resolvedIn} style={{ width: 60 }} onCommit={(v) => upd((x) => void (x.resolvedIn = v))} /> 章
              </label>
            )}
          </div>
          <Edit multiline value={f.payoff} placeholder="计划怎么收" onCommit={(v) => upd((x) => void (x.payoff = v))} />
          <Edit multiline value={f.notes ?? ''} placeholder="备注" onCommit={(v) => upd((x) => void (x.notes = v || undefined))} />
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button
              className="btn danger sm"
              onClick={() => {
                if (!confirmDelete(f.text)) return;
                mutate('foreshadows', (d) => d.filter((x) => x.id !== f.id) as any, '删除伏笔');
              }}
            >
              <Icon name="trash" size={13} /> 删除
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
