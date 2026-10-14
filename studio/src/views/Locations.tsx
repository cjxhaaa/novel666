import { useEffect, useMemo, useRef, useState } from 'react';
import { uid, useStore } from '../store';
import { useMentions } from '../lib/derived';
import { totalOf } from '../lib/analysis';
import { KINDS, KIND_ORDER, blobPath, childrenOf, contours, isAncestor, kindOfLoc, pathOf } from '../lib/places';
import { Icon } from '../components/Icon';
import { ChapterLink, ChipInput, Edit, EraTag, Field, NumEdit, Seg, confirmDelete } from '../components/ui';
import type { Location, LocationKind } from '../../shared/types';

type Layer = string; // 时代 id 或 'both'

const SECT_CONTOURS = contours('sect', [
  { x: 500, y: 120, r: 260 },
  { x: 250, y: 280, r: 170 },
  { x: 800, y: 420, r: 190 },
  { x: 420, y: 640, r: 150 },
]);
const LAND_CONTOURS = contours('land', [
  { x: 300, y: 300, r: 220 },
  { x: 720, y: 640, r: 240 },
]);

/** 地图风格：天下是海图，宗门是山门图，其余是陆地图 */
function styleOf(node: Location | undefined): 'ocean' | 'sect' | 'land' {
  const k = node ? kindOfLoc(node) : 'world';
  if (k === 'world' || k === 'sea') return 'ocean';
  if (k === 'sect' || k === 'clan' || k === 'city' || k === 'village') return 'sect';
  return 'land';
}

export function Locations() {
  const project = useStore((s) => s.data.project);
  const locations = useStore((s) => s.data.locations);
  const sel = useStore((s) => s.sel.location);
  const select = useStore((s) => s.select);
  const mutate = useStore((s) => s.mutate);
  const byId = useMemo(() => new Map(locations.map((l) => [l.id, l])), [locations]);
  const rootId = useMemo(() => locations.find((l) => !l.parentId && kindOfLoc(l) === 'world')?.id ?? null, [locations]);
  const [nodeId, setNodeId] = useState<string | null>(() => {
    const s = sel ? byId.get(sel) : undefined;
    return s?.parentId ?? rootId;
  });
  const [layer, setLayer] = useState<Layer>('both');
  const node = nodeId ? byId.get(nodeId) : undefined;
  const current = sel ? byId.get(sel) : undefined;

  // 从别处（搜索、章节雷达、守卫）跳过来时，地图切到这个地点所在的那一层
  useEffect(() => {
    if (!current) return;
    if (current.id === nodeId) return;
    const parent = current.parentId ?? null;
    if (parent !== nodeId) setNodeId(parent ?? rootId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  const enter = (id: string | null) => {
    setNodeId(id);
    select({ location: undefined });
  };

  const crumbs = pathOf(node, byId);
  const kids = childrenOf(locations, nodeId);
  const hasEraPins = kids.some((l) => l.eraId);

  return (
    <div className="view">
      <div className="view-head" style={{ paddingBottom: 10 }}>
        <h1>地点</h1>
        <div className="crumbs">
          {!rootId && (
            <span className={`crumb ${nodeId == null ? 'on' : ''}`} onClick={() => enter(null)}>
              全部
            </span>
          )}
          {crumbs.map((c, i) => (
            <span key={c.id} className="row" style={{ gap: 4 }}>
              {(i > 0 || !rootId) && <Icon name="right" size={12} style={{ color: 'var(--text-3)' }} />}
              <span className={`crumb ${c.id === nodeId ? 'on' : ''}`} onClick={() => enter(c.id)}>
                {c.name}
              </span>
            </span>
          ))}
        </div>
        <span className="grow" />
        {hasEraPins && <Seg value={layer} onChange={setLayer} options={[...project.eras.map((e) => ({ value: e.id, label: e.name + '代' })), { value: 'both', label: '古今对照' }]} />}
        {node?.parentId && (
          <button className="btn ghost" onClick={() => enter(node.parentId ?? null)} title="回到上一层">
            <Icon name="left" size={15} /> 上一层
          </button>
        )}
        <button
          className="btn"
          onClick={() => {
            const id = uid('l');
            mutate('locations', (d) => void d.push({ id, name: '新地点', aliases: [], eraId: null, kind: 'site', parentId: nodeId ?? undefined, description: '', x: 500, y: 500 }), '新建地点');
            select({ location: id });
          }}
        >
          <Icon name="plus" size={15} /> 在这一层加地点
        </button>
      </div>
      <div className="split" style={{ gridTemplateColumns: '250px 1fr 340px', flex: 1, minHeight: 0 }}>
        <PlaceTree nodeId={nodeId} onEnter={enter} />
        <WorldMap nodeId={nodeId} layer={layer} onEnter={enter} />
        <aside className="side-r">{current ? <LocationDetail key={current.id} l={current} onEnter={enter} /> : <NodeOverview nodeId={nodeId} />}</aside>
      </div>
    </div>
  );
}

/** 左侧层级树 */
function PlaceTree({ nodeId, onEnter }: { nodeId: string | null; onEnter: (id: string | null) => void }) {
  const locations = useStore((s) => s.data.locations);
  const sel = useStore((s) => s.sel.location);
  const select = useStore((s) => s.select);
  const byId = useMemo(() => new Map(locations.map((l) => [l.id, l])), [locations]);
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [q, setQ] = useState('');

  // 当前地图所在的路径总是展开
  useEffect(() => {
    const ids = pathOf(nodeId ? byId.get(nodeId) : undefined, byId).map((l) => l.id);
    const s = sel ? byId.get(sel) : undefined;
    if (s?.parentId) ids.push(...pathOf(byId.get(s.parentId), byId).map((l) => l.id));
    setOpen((o) => {
      if (ids.every((i) => o.has(i))) return o;
      const n = new Set(o);
      ids.forEach((i) => n.add(i));
      return n;
    });
  }, [nodeId, sel, byId]);

  const query = q.trim();
  const match = (l: Location): boolean => !query || `${l.name}${l.aliases.join('')}`.includes(query) || childrenOf(locations, l.id).some(match);

  const render = (parent: string | null, depth: number): React.ReactNode =>
    childrenOf(locations, parent)
      .filter(match)
      .map((l) => {
        const kids = childrenOf(locations, l.id);
        const isOpen = !!query || open.has(l.id);
        const meta = KINDS[kindOfLoc(l)];
        return (
          <div key={l.id}>
            <div
              className={`tree-row ${sel === l.id ? 'active' : ''} ${nodeId === l.id ? 'here' : ''} ${l.draft ? 'draft' : ''}`}
              style={{ paddingLeft: 6 + depth * 14 }}
              onClick={() => select({ location: l.id })}
              onDoubleClick={() => meta.container && onEnter(l.id)}
              title={`${meta.label}${l.draft ? '（草案）' : ''}：${l.description}\n双击进入这一层`}
            >
              <span
                className="tree-caret"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen((o) => {
                    const n = new Set(o);
                    if (n.has(l.id)) n.delete(l.id);
                    else n.add(l.id);
                    return n;
                  });
                }}
              >
                {kids.length ? <Icon name="right" size={11} style={{ transform: isOpen ? 'rotate(90deg)' : undefined, transition: 'transform .15s' }} /> : null}
              </span>
              <span className={`kind-glyph k-${kindOfLoc(l)}`}>{meta.glyph}</span>
              <span className="ellipsis grow">{l.name}</span>
              {l.draft && <span className="draft-tag">草案</span>}
              {kids.length > 0 && <span className="faint nums" style={{ fontSize: 10.5 }}>{kids.length}</span>}
            </div>
            {isOpen && kids.length > 0 && render(l.id, depth + 1)}
          </div>
        );
      });

  return (
    <aside className="side place-tree">
      <div style={{ padding: '4px 4px 8px' }}>
        <input className="input" placeholder="搜索地点…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {render(null, 0)}
      <div className="faint" style={{ fontSize: 11.5, padding: '12px 8px', lineHeight: 1.7 }}>
        单击选中，双击进入那一层地图。虚线、标“草案”的是新编、还没写进设定集的地点。
      </div>
    </aside>
  );
}

/** 中间的地图：画当前这一层的下级 */
function WorldMap({ nodeId, layer, onEnter }: { nodeId: string | null; layer: Layer; onEnter: (id: string | null) => void }) {
  const project = useStore((s) => s.data.project);
  const locations = useStore((s) => s.data.locations);
  const sel = useStore((s) => s.sel.location);
  const select = useStore((s) => s.select);
  const mutate = useStore((s) => s.mutate);
  const { locM } = useMentions();
  const byId = useMemo(() => new Map(locations.map((l) => [l.id, l])), [locations]);
  const node = nodeId ? byId.get(nodeId) : undefined;
  const style = styleOf(node);
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  useEffect(() => setView({ x: 0, y: 0, k: 1 }), [nodeId]);

  const kids = useMemo(
    () => childrenOf(locations, nodeId).filter((l) => l.x != null && l.y != null && (layer === 'both' || !l.eraId || l.eraId === layer)),
    [locations, nodeId, layer],
  );
  const areas = kids.filter((l) => KINDS[kindOfLoc(l)].area).sort((a, b) => (b.r ?? 0) - (a.r ?? 0));
  const realms = kids.filter((l) => kindOfLoc(l) === 'realm');
  const seas = kids.filter((l) => kindOfLoc(l) === 'sea');
  // 点状地点：古今对照的两处共用坐标，合成一个点
  const pins = useMemo(() => {
    const m = new Map<string, Location[]>();
    for (const l of kids) {
      const k = kindOfLoc(l);
      if (KINDS[k].area || k === 'realm' || k === 'sea') continue;
      const key = `${l.x},${l.y}`;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(l);
    }
    return [...m.values()];
  }, [kids]);
  const offMap = childrenOf(locations, nodeId).filter((l) => l.x == null || l.y == null);

  const eraColor = (id: string | null | undefined) => project.eras.find((e) => e.id === id)?.color ?? 'var(--gold)';

  const toMap = (cx: number, cy: number) => {
    const pt = svgRef.current!.createSVGPoint();
    pt.x = cx;
    pt.y = cy;
    const p = pt.matrixTransform(svgRef.current!.getScreenCTM()!.inverse());
    return { x: (p.x - view.x) / view.k, y: (p.y - view.y) / view.k };
  };

  const drag = (e: React.PointerEvent, group: Location[]) => {
    e.stopPropagation();
    const target = group.find((l) => l.eraId === layer) ?? group[0];
    select({ location: target.id });
    const ids = new Set(group.flatMap((l) => [l.id, l.counterpartId ?? '']));
    const start = toMap(e.clientX, e.clientY);
    const ox = group[0].x!;
    const oy = group[0].y!;
    let moved = false;
    const el = e.currentTarget as SVGGElement;
    // 拖动时临时叠加一个位移，松手后由数据重新定位
    const base = el.getAttribute('transform');
    const restore = () => (base == null ? el.removeAttribute('transform') : el.setAttribute('transform', base));
    const move = (ev: PointerEvent) => {
      const p = toMap(ev.clientX, ev.clientY);
      if (Math.abs(p.x - start.x) + Math.abs(p.y - start.y) > 3) moved = true;
      if (moved) el.setAttribute('transform', `translate(${p.x - start.x},${p.y - start.y}) ${base ?? ''}`);
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      restore();
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
    const k = Math.min(5, Math.max(0.6, view.k * (e.deltaY < 0 ? 1.12 : 0.89)));
    setView((v) => ({ k, x: v.x + p.x * (v.k - k), y: v.y + p.y * (v.k - k) }));
  };

  const isSel = (g: Location[]) => !!sel && g.some((l) => l.id === sel || l.counterpartId === sel);
  const hits = (l: Location) => totalOf(locM.get(l.id));
  const showGrand = view.k >= 1.7;

  /** 区域内预览下一层：把下级在它自己地图上的坐标缩放进这片区域 */
  const grand = (l: Location) => {
    const r = l.r ?? 60;
    return childrenOf(locations, l.id)
      .filter((g) => g.x != null && g.y != null && kindOfLoc(g) !== 'realm')
      .map((g) => ({ g, x: l.x! + ((g.x! - 500) / 500) * r * 0.85, y: l.y! + ((g.y! - 500) / 500) * r * 0.75 }));
  };

  return (
    <div className={`map-wrap map-${style}`}>
      <svg ref={svgRef} viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid meet" onPointerDown={pan} onWheel={zoom} className="map">
        <defs>
          <radialGradient id="map-bg" cx="50%" cy="45%" r="70%">
            <stop offset="0" stopColor="var(--gold)" stopOpacity="0.07" />
            <stop offset="1" stopColor="var(--gold)" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="sea-bg" cx="50%" cy="50%" r="75%">
            <stop offset="0" stopColor="#1d3a63" stopOpacity="0.55" />
            <stop offset="1" stopColor="#0a1528" stopOpacity="0.2" />
          </radialGradient>
          <linearGradient id="land-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--land-a)" />
            <stop offset="1" stopColor="var(--land-b)" />
          </linearGradient>
          <linearGradient id="realm-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f3d595" stopOpacity="0.28" />
            <stop offset="1" stopColor="#f3d595" stopOpacity="0" />
          </linearGradient>
          <pattern id="waves" width="60" height="22" patternUnits="userSpaceOnUse">
            <path d="M0 12 Q15 4 30 12 T60 12" fill="none" stroke="var(--wave)" strokeWidth="1" />
          </pattern>
          <filter id="pin-glow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="4" />
          </filter>
          <filter id="coast-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>
        <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
          {style === 'ocean' ? (
            <>
              <rect x="-500" y="-500" width="2000" height="2000" fill="url(#sea-bg)" />
              <rect x="-500" y="-500" width="2000" height="2000" fill="url(#waves)" opacity="0.5" />
            </>
          ) : (
            <>
              <rect x="-500" y="-500" width="2000" height="2000" fill="url(#map-bg)" />
              <g className="map-grid">
                {Array.from({ length: 11 }, (_, i) => (
                  <g key={i}>
                    <line x1={i * 100} y1={0} x2={i * 100} y2={1000} />
                    <line x1={0} y1={i * 100} x2={1000} y2={i * 100} />
                  </g>
                ))}
              </g>
              {(style === 'sect' ? SECT_CONTOURS : LAND_CONTOURS).map((c, i) => (
                <path key={i} d={c.d} className="contour" style={{ opacity: c.o * 2.2 }} />
              ))}
            </>
          )}

          <text x="960" y="980" className="map-watermark" textAnchor="end">
            {node?.name ?? ''}
          </text>
          <g className="compass" transform="translate(70,920)">
            <circle r="34" />
            <path d="M0 -30 L7 0 L0 30 L-7 0Z" />
            <text y="-38" textAnchor="middle">
              北
            </text>
          </g>

          {/* 界：天顶一条光带 */}
          {realms.map((l) => (
            <g key={l.id} className={`realm ${sel === l.id ? 'sel' : ''}`} onPointerDown={(e) => (e.stopPropagation(), select({ location: l.id }))}>
              <rect x="-500" y="-500" width="2000" height={l.y! + 560} fill="url(#realm-fill)" />
              <text x={l.x} y={l.y! + 4} textAnchor="middle" className="realm-label">
                {l.name.split('').join(' ')}
              </text>
              <text x={l.x} y={l.y! + 26} textAnchor="middle" className="realm-sub">
                {l.description.split(/[，。]/)[0]}
              </text>
            </g>
          ))}

          {/* 片区：大陆、地域、国度、宗门势力范围 */}
          {areas.map((l) => {
            const k = kindOfLoc(l);
            const r = l.r ?? 60;
            const land = k === 'continent';
            const on = isSel([l]);
            return (
              <g
                key={l.id}
                className={`area k-${k} ${on ? 'sel' : ''} ${l.draft ? 'draft' : ''}`}
                onPointerDown={(e) => drag(e, [l])}
                onDoubleClick={(e) => (e.stopPropagation(), onEnter(l.id))}
              >
                {land && <path d={blobPath(l.id, l.x!, l.y!, r)} className="coast" filter="url(#coast-glow)" />}
                <path d={land ? blobPath(l.id, l.x!, l.y!, r) : blobPath(l.id, l.x!, l.y!, r, 0.12)} className="area-shape" style={{ ['--c' as any]: l.eraId ? eraColor(l.eraId) : undefined }} />
                {grand(l).map(({ g, x, y }) => (
                  <g key={g.id} className={`grand ${g.draft ? 'draft' : ''}`}>
                    <circle cx={x} cy={y} r={KINDS[kindOfLoc(g)].area ? 4 : 2.6} />
                    {showGrand && (
                      <text x={x} y={y - 7} textAnchor="middle">
                        {g.name}
                      </text>
                    )}
                  </g>
                ))}
                <text x={l.x} y={land ? l.y! + 6 : l.y! + 5} textAnchor="middle" className={`area-label ${land ? 'big' : ''}`}>
                  {l.name}
                </text>
                {l.draft && (
                  <text x={l.x} y={l.y! + (land ? 28 : 22)} textAnchor="middle" className="draft-label">
                    草案
                  </text>
                )}
              </g>
            );
          })}

          {/* 海域：只写名字 */}
          {seas.map((l) => (
            <g key={l.id} className={`sea ${isSel([l]) ? 'sel' : ''} ${l.draft ? 'draft' : ''}`} onPointerDown={(e) => drag(e, [l])} onDoubleClick={(e) => (e.stopPropagation(), onEnter(l.id))}>
              <text x={l.x} y={l.y} textAnchor="middle" className="sea-label">
                {l.name}
              </text>
            </g>
          ))}

          {/* 点：秘境、城镇、村落、地点 */}
          {pins.map((group) => {
            const p = group[0];
            const k = kindOfLoc(p);
            const on = isSel(group);
            const n = group.reduce((a, l) => a + hits(l), 0);
            const r = 6 + Math.min(8, Math.sqrt(n) * 0.6);
            const labels = layer === 'both' ? [...group].sort((a, b) => (a.eraId ?? '').localeCompare(b.eraId ?? '')) : group;
            const color = k === 'secret' ? '#c792ea' : eraColor(group.length > 1 ? null : p.eraId);
            return (
              <g
                key={p.id}
                transform={`translate(${p.x},${p.y})`}
                className={`pin k-${k} ${on ? 'sel' : ''} ${p.draft ? 'draft' : ''}`}
                onPointerDown={(e) => drag(e, group)}
                onDoubleClick={(e) => (e.stopPropagation(), KINDS[k].container && onEnter(p.id))}
              >
                <g>
                  <circle r={r + 8} className="pin-halo" style={{ fill: color }} filter="url(#pin-glow)" />
                  {k === 'secret' ? (
                    <path d="M0 -11 L3 -3 L11 0 L3 3 L0 11 L-3 3 L-11 0 L-3 -3Z" className="pin-core" style={{ fill: color }} />
                  ) : k === 'city' || k === 'village' ? (
                    <rect x={-r * 0.8} y={-r * 0.8} width={r * 1.6} height={r * 1.6} rx="2" className="pin-core" style={{ fill: color }} />
                  ) : (
                    <circle r={r} className="pin-core" style={{ fill: color }} />
                  )}
                  {labels.map((l, i) => (
                    <text key={l.id} y={-r - 8 - (labels.length - 1 - i) * 17} textAnchor="middle" className="pin-label" style={{ fill: layer === 'both' && group.length > 1 ? eraColor(l.eraId) : undefined }}>
                      {l.name}
                    </text>
                  ))}
                </g>
              </g>
            );
          })}
        </g>
      </svg>
      {!kids.length && (
        <div className="map-empty">
          <div className="display" style={{ fontSize: 20 }}>{node?.name ?? '这里'}还没有细分</div>
          <div className="faint">点右上角“在这一层加地点”，或者在右侧把别的地点的上级改成这里。</div>
        </div>
      )}
      {!!offMap.length && (
        <div className="offmap">
          <span className="faint">没放上地图：</span>
          {offMap.map((l) => (
            <span key={l.id} className="tag click" onClick={() => select({ location: l.id })}>
              {l.name}
            </span>
          ))}
        </div>
      )}
      <div className="graph-hint faint">双击区域或地点进入下一层 · 拖动调整位置 · 滚轮缩放（放大后显示下一层地名）· 拖空白处平移</div>
    </div>
  );
}

/** 没选中地点时，右侧显示这一层的概况 */
function NodeOverview({ nodeId }: { nodeId: string | null }) {
  const locations = useStore((s) => s.data.locations);
  const select = useStore((s) => s.select);
  const byId = useMemo(() => new Map(locations.map((l) => [l.id, l])), [locations]);
  const node = nodeId ? byId.get(nodeId) : undefined;
  const kids = childrenOf(locations, nodeId);
  const groups = KIND_ORDER.map((k) => ({ k, list: kids.filter((l) => kindOfLoc(l) === k) })).filter((g) => g.list.length);
  const pairs = kids.filter((l) => l.counterpartId && byId.get(l.counterpartId)?.parentId === nodeId && l.eraId === 'ancient');
  const drafts = locations.filter((l) => l.draft).length;
  return (
    <div className="col" style={{ gap: 12 }}>
      {node && (
        <div>
          <div className="row" style={{ gap: 8 }}>
            <span className={`kind-glyph lg k-${kindOfLoc(node)}`}>{KINDS[kindOfLoc(node)].glyph}</span>
            <h3 className="display" style={{ fontSize: 22 }}>
              {node.name}
            </h3>
            {node.draft && <span className="draft-tag">草案</span>}
          </div>
          <p className="muted" style={{ lineHeight: 1.75, margin: '8px 0 0' }}>
            {node.description}
          </p>
          <button className="btn sm ghost" style={{ marginTop: 6 }} onClick={() => select({ location: node.id })}>
            <Icon name="edit" size={13} /> 编辑这一层
          </button>
        </div>
      )}
      {groups.map(({ k, list }) => (
        <div key={k}>
          <div className="group-title" style={{ paddingLeft: 0 }}>
            {KINDS[k].label} · {list.length}
          </div>
          <div className="row wrap" style={{ gap: 5 }}>
            {list.map((l) => (
              <span key={l.id} className={`tag click ${l.draft ? 'dashed' : ''}`} onClick={() => select({ location: l.id })}>
                {l.name}
              </span>
            ))}
          </div>
        </div>
      ))}
      {!!pairs.length && (
        <div>
          <div className="group-title" style={{ paddingLeft: 0 }}>
            古今对照
          </div>
          {pairs.map((l) => {
            const o = byId.get(l.counterpartId!);
            return (
              <div key={l.id} className="pair-row click" onClick={() => select({ location: l.id })}>
                <span style={{ color: 'var(--moon)' }}>{l.name}</span>
                <Icon name="swap" size={14} style={{ color: 'var(--text-3)' }} />
                <span style={{ color: 'var(--cinnabar)' }}>{o?.name}</span>
              </div>
            );
          })}
        </div>
      )}
      {drafts > 0 && (
        <div className="faint" style={{ fontSize: 12, lineHeight: 1.7, marginTop: 6 }}>
          全图共有 {drafts} 处草案（虚线），是为了画出大世界新编的，还没写进设定集。改名、删掉或者取消“草案”勾选都可以。
        </div>
      )}
    </div>
  );
}

function LocationDetail({ l, onEnter }: { l: Location; onEnter: (id: string | null) => void }) {
  const data = useStore((s) => s.data);
  const mutate = useStore((s) => s.mutate);
  const select = useStore((s) => s.select);
  const { locM } = useMentions();
  const byId = useMemo(() => new Map(data.locations.map((x) => [x.id, x])), [data.locations]);
  const per = locM.get(l.id);
  const other = l.counterpartId ? byId.get(l.counterpartId) : undefined;
  const k = kindOfLoc(l);
  const kids = childrenOf(data.locations, l.id);
  const upd = (fn: (x: Location) => void, label = '编辑地点') =>
    mutate('locations', (d) => {
      const x = d.find((y) => y.id === l.id);
      if (x) fn(x as Location);
    }, label);
  const chapters = per ? [...per.entries()].sort((a, b) => a[0] - b[0]) : [];
  const parentOptions = data.locations.filter((x) => x.id !== l.id && !isAncestor(l.id, x, byId) && KINDS[kindOfLoc(x)].container);

  return (
    <div className="col" style={{ gap: 10 }}>
      <div className="row">
        <button className="btn ghost sm icon" onClick={() => select({ location: undefined })} title="返回这一层的概况">
          <Icon name="left" size={15} />
        </button>
        <span className={`kind-glyph lg k-${k}`}>{KINDS[k].glyph}</span>
        <Edit value={l.name} bare className="display name-edit" onCommit={(v) => upd((x) => void (x.name = v))} />
        <EraTag eraId={l.eraId} />
      </div>
      <div className="faint" style={{ fontSize: 12 }}>
        {pathOf(l, byId)
          .slice(0, -1)
          .map((p) => p.name)
          .join(' › ') || '最顶层'}
      </div>
      {(KINDS[k].container || kids.length > 0) && (
        <button className="btn" onClick={() => onEnter(l.id)}>
          <Icon name="right" size={14} /> 进入{l.name}（{kids.length} 处下级）
        </button>
      )}
      {other && (
        <div className="counterpart click" onClick={() => select({ location: other.id })}>
          <Icon name="swap" size={15} />
          <span className="faint">另一个时代：</span>
          <span>{other.name}</span>
        </div>
      )}
      <label className={`draft-box ${l.draft ? 'on' : ''}`}>
        <input type="checkbox" checked={!!l.draft} onChange={(e) => upd((x) => void (x.draft = e.target.checked || undefined), '切换草案')} />
        <span>草案：新编的、还没写进设定集。确认后取消勾选，再把它写进 bible.md。</span>
      </label>
      <Edit multiline rows={4} value={l.description} placeholder="这里是什么样子" onCommit={(v) => upd((x) => void (x.description = v))} />
      <Field label="类型">
        <select className="select" value={k} onChange={(e) => upd((x) => void (x.kind = e.target.value as LocationKind), '改地点类型')}>
          {KIND_ORDER.map((kk) => (
            <option key={kk} value={kk}>
              {KINDS[kk].glyph} {KINDS[kk].label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="上级">
        <select
          className="select"
          value={l.parentId ?? ''}
          onChange={(e) =>
            upd((x) => {
              x.parentId = e.target.value || undefined;
              x.x = 500;
              x.y = 500;
            }, '改上级')
          }
        >
          <option value="">（最顶层）</option>
          {parentOptions.map((p) => (
            <option key={p.id} value={p.id}>
              {pathOf(p, byId)
                .map((x) => x.name)
                .join(' › ')}
            </option>
          ))}
        </select>
      </Field>
      {KINDS[k].area && (
        <Field label="范围">
          <div className="row">
            <NumEdit value={l.r} placeholder="半径" onCommit={(v) => upd((x) => void (x.r = v))} />
            <span className="faint">在上级地图上的半径（地图宽 1000）</span>
          </div>
        </Field>
      )}
      <Field label="别名">
        <ChipInput values={l.aliases} onChange={(v) => upd((x) => void (x.aliases = v))} />
      </Field>
      <Field label="时代">
        <select className="select" value={l.eraId ?? ''} onChange={(e) => upd((x) => void (x.eraId = e.target.value || null))}>
          <option value="">古今都在</option>
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
              if (o && me.x != null) Object.assign(o, { x: me.x, y: me.y, parentId: me.parentId });
            }, '设置古今对照');
          }}
        >
          <option value="">无</option>
          {data.locations
            .filter((x) => x.id !== l.id && x.eraId && x.eraId !== l.eraId)
            .map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
        </select>
      </Field>
      <Field label="地图">
        {l.x == null ? (
          <button className="btn sm" onClick={() => upd((x) => Object.assign(x, { x: 500, y: 500 }), '放上地图')}>
            放到上级地图中央
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
      {kids.length > 0 && (
        <div>
          <div className="faint" style={{ fontSize: 12, marginBottom: 6 }}>
            下级 {kids.length} 处
          </div>
          <div className="row wrap" style={{ gap: 4 }}>
            {kids.map((c) => (
              <span key={c.id} className={`tag click ${c.draft ? 'dashed' : ''}`} onClick={() => select({ location: c.id })}>
                {c.name}
              </span>
            ))}
          </div>
        </div>
      )}
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
          if (kids.length && !window.confirm(`「${l.name}」下面还有 ${kids.length} 处下级，删掉后它们会挪到上一级。继续吗？`)) return;
          if (!kids.length && !confirmDelete(l.name)) return;
          mutate('locations', (d) =>
            d
              .filter((x) => x.id !== l.id)
              .map((x) => ({
                ...x,
                counterpartId: x.counterpartId === l.id ? undefined : x.counterpartId,
                parentId: x.parentId === l.id ? l.parentId : x.parentId,
              })) as any,
          '删除地点');
          select({ location: undefined });
        }}
      >
        <Icon name="trash" size={13} /> 删除地点
      </button>
    </div>
  );
}
