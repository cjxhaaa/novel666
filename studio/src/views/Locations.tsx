import { useMemo, useRef, useState } from 'react';
import { uid, useStore } from '../store';
import { useMentions } from '../lib/derived';
import { totalOf } from '../lib/analysis';
import { Icon } from '../components/Icon';
import { ChapterLink, ChipInput, Edit, EraTag, Field, Seg, confirmDelete } from '../components/ui';
import type { Location } from '../../shared/types';

type Layer = string; // era id 或 'both'

/** 程序生成的“水墨等高线”，同一个种子每次画出来一样 */
function contours() {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const peaks = [
    { x: 500, y: 120, r: 260 },
    { x: 250, y: 280, r: 170 },
    { x: 800, y: 420, r: 190 },
    { x: 420, y: 640, r: 150 },
  ];
  const paths: { d: string; o: number }[] = [];
  for (const p of peaks) {
    for (let k = 1; k <= 6; k++) {
      const r = (p.r * k) / 6;
      const pts: string[] = [];
      const n = 28;
      const wob = Array.from({ length: n }, () => 0.82 + rnd() * 0.32);
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2;
        const w = wob[i % n];
        pts.push(`${(p.x + Math.cos(a) * r * w * 1.25).toFixed(1)},${(p.y + Math.sin(a) * r * w * 0.8).toFixed(1)}`);
      }
      paths.push({ d: `M${pts.join('L')}Z`, o: 0.05 + (6 - k) * 0.02 });
    }
  }
  return paths;
}
const CONTOURS = contours();

export function Locations() {
  const project = useStore((s) => s.data.project);
  const locations = useStore((s) => s.data.locations);
  const sel = useStore((s) => s.sel.location);
  const select = useStore((s) => s.select);
  const mutate = useStore((s) => s.mutate);
  const { locM } = useMentions();
  const [layer, setLayer] = useState<Layer>(project.eras[project.eras.length - 1]?.id ?? 'both');
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const svgRef = useRef<SVGSVGElement>(null);
  const current = locations.find((l) => l.id === sel);

  const visible = useMemo(
    () => locations.filter((l) => l.x != null && l.y != null && (layer === 'both' || !l.eraId || l.eraId === layer)),
    [locations, layer],
  );
  // 同一坐标的点（古今对照）在“对照”模式下合并成一个
  const pins = useMemo(() => {
    const m = new Map<string, Location[]>();
    for (const l of visible) {
      const k = `${l.x},${l.y}`;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(l);
    }
    return [...m.values()];
  }, [visible]);
  const offMap = locations.filter((l) => l.x == null || l.y == null);
  const regions = [...new Set(offMap.map((l) => l.region ?? '其他'))];

  const toMap = (cx: number, cy: number) => {
    const pt = svgRef.current!.createSVGPoint();
    pt.x = cx;
    pt.y = cy;
    const p = pt.matrixTransform(svgRef.current!.getScreenCTM()!.inverse());
    return { x: (p.x - view.x) / view.k, y: (p.y - view.y) / view.k };
  };

  const dragPin = (e: React.PointerEvent, group: Location[]) => {
    e.stopPropagation();
    select({ location: group.find((l) => l.eraId === layer)?.id ?? group[0].id });
    const ids = new Set(group.flatMap((l) => [l.id, l.counterpartId ?? '']));
    const start = toMap(e.clientX, e.clientY);
    const ox = group[0].x!;
    const oy = group[0].y!;
    let moved = false;
    const el = e.currentTarget as SVGGElement;
    const move = (ev: PointerEvent) => {
      const p = toMap(ev.clientX, ev.clientY);
      const nx = ox + p.x - start.x;
      const ny = oy + p.y - start.y;
      if (Math.abs(p.x - start.x) + Math.abs(p.y - start.y) > 2) moved = true;
      el.setAttribute('transform', `translate(${nx},${ny})`);
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (!moved) return;
      const p = toMap(ev.clientX, ev.clientY);
      const nx = Math.round(Math.min(1000, Math.max(0, ox + p.x - start.x)));
      const ny = Math.round(Math.min(1000, Math.max(0, oy + p.y - start.y)));
      mutate('locations', (d) => {
        for (const l of d) if (ids.has(l.id)) Object.assign(l, { x: nx, y: ny });
      }, '移动地点');
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const pan = (e: React.PointerEvent) => {
    const s = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
    const rect = svgRef.current!.getBoundingClientRect();
    const scale = 1000 / Math.min(rect.width, rect.height);
    const move = (ev: PointerEvent) => setView((v) => ({ ...v, x: s.vx + (ev.clientX - s.x) * scale, y: s.vy + (ev.clientY - s.y) * scale }));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const zoom = (e: React.WheelEvent) => {
    const p = toMap(e.clientX, e.clientY);
    const k = Math.min(4, Math.max(0.6, view.k * (e.deltaY < 0 ? 1.12 : 0.89)));
    setView((v) => ({ k, x: v.x + p.x * (v.k - k), y: v.y + p.y * (v.k - k) }));
  };

  const eraColor = (id: string | null) => project.eras.find((e) => e.id === id)?.color ?? 'var(--gold)';
  const watermark = layer === 'both' ? '古 · 今' : project.eras.find((e) => e.id === layer)?.name ?? '';

  return (
    <div className="view">
      <div className="view-head" style={{ paddingBottom: 10 }}>
        <h1>地点</h1>
        <Seg value={layer} onChange={setLayer} options={[...project.eras.map((e) => ({ value: e.id, label: e.label })), { value: 'both', label: '古今对照' }]} />
        <span className="grow" />
        <button className="btn ghost" onClick={() => setView({ x: 0, y: 0, k: 1 })}>
          复位
        </button>
        <button
          className="btn"
          onClick={() => {
            const id = uid('l');
            mutate('locations', (d) => void d.push({ id, name: '新地点', aliases: [], eraId: layer === 'both' ? null : layer, description: '', x: 500, y: 500 }), '新建地点');
            select({ location: id });
          }}
        >
          <Icon name="plus" size={15} /> 地点
        </button>
      </div>
      <div className="split" style={{ gridTemplateColumns: '1fr 340px', flex: 1, minHeight: 0 }}>
        <div className="map-wrap">
          <svg ref={svgRef} viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid meet" onPointerDown={pan} onWheel={zoom} className={`map layer-${layer}`}>
            <defs>
              <radialGradient id="map-bg" cx="50%" cy="40%" r="70%">
                <stop offset="0" stopColor="var(--gold)" stopOpacity="0.07" />
                <stop offset="1" stopColor="var(--gold)" stopOpacity="0" />
              </radialGradient>
              <filter id="pin-glow" x="-100%" y="-100%" width="300%" height="300%">
                <feGaussianBlur stdDeviation="4" />
              </filter>
            </defs>
            <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
              <rect x="-500" y="-500" width="2000" height="2000" fill="url(#map-bg)" />
              <g className="map-grid">
                {Array.from({ length: 11 }, (_, i) => (
                  <g key={i}>
                    <line x1={i * 100} y1={0} x2={i * 100} y2={1000} />
                    <line x1={0} y1={i * 100} x2={1000} y2={i * 100} />
                  </g>
                ))}
              </g>
              {CONTOURS.map((c, i) => (
                <path key={i} d={c.d} className="contour" style={{ opacity: c.o * 2.2 }} />
              ))}
              <text x="960" y="980" className="map-watermark" textAnchor="end">
                {watermark}
              </text>
              <g className="compass" transform="translate(70,920)">
                <circle r="34" />
                <path d="M0 -30 L7 0 L0 30 L-7 0Z" />
                <text y="-38" textAnchor="middle">北</text>
              </g>
              {pins.map((group) => {
                const p = group[0];
                const isSel = !!sel && group.some((l) => l.id === sel || l.counterpartId === sel);
                const hits = group.reduce((a, l) => a + totalOf(locM.get(l.id)), 0);
                const r = 6 + Math.min(8, Math.sqrt(hits) * 0.6);
                const labels = layer === 'both' ? group.slice().sort((a, b) => (a.eraId ?? '').localeCompare(b.eraId ?? '')) : group;
                return (
                  <g key={p.id} transform={`translate(${p.x},${p.y})`} className={`pin ${isSel ? 'sel' : ''}`} onPointerDown={(e) => dragPin(e, group)}>
                    <circle r={r + 8} className="pin-halo" style={{ fill: eraColor(p.eraId) }} filter="url(#pin-glow)" />
                    <circle r={r} className="pin-core" style={{ fill: eraColor(group.length > 1 ? null : p.eraId) }} />
                    {labels.map((l, i) => (
                      <text key={l.id} y={-r - 8 - (labels.length - 1 - i) * 17} textAnchor="middle" className="pin-label" style={{ fill: layer === 'both' ? eraColor(l.eraId) : undefined }}>
                        {l.name}
                      </text>
                    ))}
                  </g>
                );
              })}
            </g>
          </svg>
          <div className="graph-hint faint">拖动地点调整位置（古今对照的两处一起移动）· 滚轮缩放 · 拖空白平移</div>
        </div>
        <aside className="side-r">
          {current ? (
            <LocationDetail key={current.id} l={current} />
          ) : (
            <div className="col" style={{ gap: 4 }}>
              <h3 className="display" style={{ fontSize: 18, marginBottom: 6 }}>
                古今对照
              </h3>
              {locations
                .filter((l) => l.counterpartId && l.eraId === project.eras[0]?.id)
                .map((l) => {
                  const o = locations.find((x) => x.id === l.counterpartId);
                  return (
                    <div key={l.id} className="pair-row click" onClick={() => select({ location: l.id })}>
                      <span style={{ color: eraColor(l.eraId) }}>{l.name}</span>
                      <Icon name="swap" size={14} style={{ color: 'var(--text-3)' }} />
                      <span style={{ color: eraColor(o?.eraId ?? null) }}>{o?.name}</span>
                    </div>
                  );
                })}
            </div>
          )}
          {!!offMap.length && (
            <div style={{ marginTop: 18 }}>
              <div className="group-title" style={{ paddingLeft: 0 }}>
                不在宗门地图上
              </div>
              {regions.map((r) => (
                <div key={r} className="row wrap" style={{ gap: 5, marginBottom: 6 }}>
                  <span className="faint" style={{ fontSize: 12, width: '100%' }}>
                    {r}
                  </span>
                  {offMap
                    .filter((l) => (l.region ?? '其他') === r)
                    .map((l) => (
                      <span key={l.id} className="tag click" style={{ ['--c' as any]: eraColor(l.eraId) }} onClick={() => select({ location: l.id })}>
                        {l.name}
                      </span>
                    ))}
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function LocationDetail({ l }: { l: Location }) {
  const data = useStore((s) => s.data);
  const mutate = useStore((s) => s.mutate);
  const select = useStore((s) => s.select);
  const { locM } = useMentions();
  const per = locM.get(l.id);
  const other = data.locations.find((x) => x.id === l.counterpartId);
  const upd = (fn: (x: Location) => void, label = '编辑地点') =>
    mutate('locations', (d) => {
      const x = d.find((y) => y.id === l.id);
      if (x) fn(x as Location);
    }, label);
  const chapters = per ? [...per.entries()].sort((a, b) => a[0] - b[0]) : [];

  return (
    <div className="col" style={{ gap: 10 }}>
      <div className="row">
        <button className="btn ghost sm icon" onClick={() => select({ location: undefined })} title="返回列表">
          <Icon name="left" size={15} />
        </button>
        <Edit value={l.name} bare className="display name-edit" onCommit={(v) => upd((x) => void (x.name = v))} />
        <EraTag eraId={l.eraId} />
      </div>
      {other && (
        <div className="counterpart click" onClick={() => select({ location: other.id })}>
          <Icon name="swap" size={15} />
          <span className="faint">另一个时代：</span>
          <span>{other.name}</span>
        </div>
      )}
      <Edit multiline rows={4} value={l.description} placeholder="这里是什么样子" onCommit={(v) => upd((x) => void (x.description = v))} />
      <Field label="别名">
        <ChipInput values={l.aliases} onChange={(v) => upd((x) => void (x.aliases = v))} />
      </Field>
      <Field label="时代">
        <select className="select" value={l.eraId ?? ''} onChange={(e) => upd((x) => void (x.eraId = e.target.value || null))}>
          <option value="">古今通用</option>
          {data.project.eras.map((e) => (
            <option key={e.id} value={e.id}>
              {e.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="对照">
        <select
          className="select"
          value={l.counterpartId ?? ''}
          onChange={(e) => {
            const v = e.target.value || undefined;
            mutate('locations', (d) => {
              for (const x of d) {
                if (x.id === l.id) x.counterpartId = v;
                else if (x.counterpartId === l.id) delete x.counterpartId;
                if (v && x.id === v) x.counterpartId = l.id;
              }
              const me = d.find((x) => x.id === l.id)!;
              const o = v ? d.find((x) => x.id === v) : undefined;
              if (o && me.x != null) Object.assign(o, { x: me.x, y: me.y });
            }, '设置古今对照');
          }}
        >
          <option value="">无</option>
          {data.locations
            .filter((x) => x.id !== l.id && x.eraId !== l.eraId)
            .map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
        </select>
      </Field>
      <Field label="区域">
        <Edit value={l.region ?? ''} onCommit={(v) => upd((x) => void (x.region = v || undefined))} />
      </Field>
      <Field label="地图">
        {l.x == null ? (
          <button className="btn sm" onClick={() => upd((x) => Object.assign(x, { x: 500, y: 500 }), '放上地图')}>
            放到地图中央
          </button>
        ) : (
          <button className="btn sm ghost" onClick={() => upd((x) => void (delete x.x, delete x.y), '移出地图')}>
            从地图上移除
          </button>
        )}
      </Field>
      <Field label="笔记">
        <Edit multiline value={l.notes ?? ''} onCommit={(v) => upd((x) => void (x.notes = v || undefined))} />
      </Field>
      <div>
        <div className="faint" style={{ fontSize: 12, marginBottom: 6 }}>
          正文出现 {totalOf(per)} 次
        </div>
        <div className="row wrap" style={{ gap: 4 }}>
          {chapters.map(([n, v]) => (
            <ChapterLink key={n} num={n}>
              {n}章·{v}
            </ChapterLink>
          ))}
        </div>
      </div>
      <button
        className="btn danger sm"
        style={{ alignSelf: 'flex-start', marginTop: 8 }}
        onClick={() => {
          if (!confirmDelete(l.name)) return;
          mutate('locations', (d) => d.filter((x) => x.id !== l.id).map((x) => (x.counterpartId === l.id ? { ...x, counterpartId: undefined } : x)) as any, '删除地点');
          select({ location: undefined });
        }}
      >
        <Icon name="trash" size={13} /> 删除地点
      </button>
    </div>
  );
}
