import { useEffect, useMemo, useRef, useState } from 'react';
import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type Simulation, type SimulationNodeDatum } from 'd3-force';
import { uid, useStore } from '../store';
import { useMentions } from '../lib/derived';
import { relationAt, totalOf } from '../lib/analysis';
import { Icon } from '../components/Icon';
import { ChapterLink, Edit, NumEdit, confirmDelete } from '../components/ui';

interface N extends SimulationNodeDatum {
  id: string;
  r: number;
}

/** 力导向的人物关系图。左右按时代分开，中间一条“万年”分界线；边上的字按当前章显示。 */
export function RelationGraph() {
  const characters = useStore((s) => s.data.characters);
  const relations = useStore((s) => s.data.relations);
  const eras = useStore((s) => s.data.project.eras);
  const cursor = useStore((s) => s.cursor);
  const mutate = useStore((s) => s.mutate);
  const go = useStore((s) => s.go);
  const { charM } = useMentions();
  const wrap = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 900, h: 600 });
  const [, setTick] = useState(0);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [selNode, setSelNode] = useState<string | null>(null);
  const [selEdge, setSelEdge] = useState<string | null>(null);
  const [linkFrom, setLinkFrom] = useState<string | null>(null);
  const sim = useRef<Simulation<N, undefined> | null>(null);
  const nodes = useRef<Map<string, N>>(new Map());

  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(wrap.current!);
    return () => ro.disconnect();
  }, []);

  const eraX = useMemo(() => {
    const m = new Map<string | null, number>();
    eras.forEach((e, i) => m.set(e.id, eras.length > 1 ? (i === 0 ? -1 : 1) * 0.27 : 0));
    m.set(null, 0);
    return m;
  }, [eras]);

  /** 各时代的人物聚在自己那一侧；可跨时代的主角靠近中线 */
  const targetX = (id: string) => {
    const c = characters.find((x) => x.id === id);
    const side = eraX.get(c?.eraId ?? null) ?? 0;
    return side * size.w * (c?.crossEra ? 0.3 : 1);
  };

  // 只在人物 / 关系的集合变化时重建模拟
  const sig = characters.map((c) => c.id + c.eraId + (c.crossEra ? 1 : 0)).join() + '|' + relations.map((r) => r.from + r.to).join();
  useEffect(() => {
    const old = nodes.current;
    const next = new Map<string, N>();
    for (const c of characters) {
      const t = totalOf(charM.get(c.id));
      const prev = old.get(c.id);
      const n: N = prev ?? { id: c.id, r: 0, x: targetX(c.id) + (Math.random() - 0.5) * 80, y: (Math.random() - 0.5) * 200 };
      n.r = 14 + Math.min(16, Math.sqrt(t) * 0.9);
      if (c.gx != null && c.gy != null) {
        n.fx = c.gx;
        n.fy = c.gy;
      }
      next.set(c.id, n);
    }
    nodes.current = next;
    const links = relations.filter((r) => next.has(r.from) && next.has(r.to)).map((r) => ({ source: r.from, target: r.to }));
    sim.current?.stop();
    sim.current = forceSimulation<N>([...next.values()])
      .force('charge', forceManyBody<N>().strength(-420))
      .force('link', forceLink<N, any>(links).id((d: any) => d.id).distance(130).strength(0.35))
      .force('collide', forceCollide<N>((d) => d.r + 22))
      .force('x', forceX<N>((d) => targetX(d.id)).strength(0.18))
      .force('y', forceY<N>(0).strength(0.07))
      .on('tick', () => setTick((t) => t + 1));
    return () => void sim.current?.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, size.w]);

  const toWorld = (cx: number, cy: number) => {
    const rect = wrap.current!.getBoundingClientRect();
    return { x: (cx - rect.left - size.w / 2 - view.x) / view.k, y: (cy - rect.top - size.h / 2 - view.y) / view.k };
  };

  const dragNode = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    const n = nodes.current.get(id)!;
    const start = { x: e.clientX, y: e.clientY };
    let moved = false;
    sim.current?.alphaTarget(0.25).restart();
    const move = (ev: PointerEvent) => {
      if (Math.abs(ev.clientX - start.x) + Math.abs(ev.clientY - start.y) > 3) moved = true;
      const p = toWorld(ev.clientX, ev.clientY);
      n.fx = p.x;
      n.fy = p.y;
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      sim.current?.alphaTarget(0);
      if (moved) {
        mutate('characters', (d) => {
          const c = d.find((x) => x.id === id);
          if (c) {
            c.gx = Math.round(n.fx!);
            c.gy = Math.round(n.fy!);
          }
        }, '移动人物');
      } else {
        if (linkFrom && linkFrom !== id) {
          const rid = uid('r');
          mutate('relations', (d) => void d.push({ id: rid, from: linkFrom, to: id, label: '新关系', progressions: [] }), '新增关系');
          setLinkFrom(null);
          setSelEdge(rid);
          setSelNode(null);
        } else {
          setSelNode(id);
          setSelEdge(null);
        }
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const pan = (e: React.PointerEvent) => {
    const start = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
    const move = (ev: PointerEvent) => setView((v) => ({ ...v, x: start.vx + ev.clientX - start.x, y: start.vy + ev.clientY - start.y }));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    setSelNode(null);
    setSelEdge(null);
  };

  const zoom = (e: React.WheelEvent) => {
    const k = Math.min(2.5, Math.max(0.35, view.k * (e.deltaY < 0 ? 1.1 : 0.9)));
    setView((v) => ({ ...v, k }));
  };

  const selC = characters.find((c) => c.id === selNode);
  const selR = relations.find((r) => r.id === selEdge);
  const nameOf = (id: string) => characters.find((c) => c.id === id)?.name ?? id;

  return (
    <div className="split" style={{ gridTemplateColumns: '1fr 300px' }}>
      <div ref={wrap} className={`graph-wrap ${linkFrom ? 'linking' : ''}`} onPointerDown={pan} onWheel={zoom}>
        <svg width={size.w} height={size.h}>
          <defs>
            <radialGradient id="node-glow">
              <stop offset="0" stopColor="#fff" stopOpacity="0.25" />
              <stop offset="1" stopColor="#fff" stopOpacity="0" />
            </radialGradient>
          </defs>
          <g transform={`translate(${size.w / 2 + view.x},${size.h / 2 + view.y}) scale(${view.k})`}>
            {eras.length > 1 && (
              <g className="era-divider">
                <line x1={0} x2={0} y1={-2000} y2={2000} />
                {eras.map((e, i) => (
                  <text key={e.id} x={(i === 0 ? -1 : 1) * size.w * 0.27} y={-size.h / 2 / view.k + 40} textAnchor="middle" fill={e.color}>
                    {e.label}
                  </text>
                ))}
                <text x={0} y={-size.h / 2 / view.k + 70} textAnchor="middle" className="gap-label">
                  ┆ 万 年 ┆
                </text>
              </g>
            )}
            {relations.map((r) => {
              const a = nodes.current.get(r.from);
              const b = nodes.current.get(r.to);
              if (!a || b == null || a.x == null || b.x == null) return null;
              const at = relationAt(r, cursor);
              const mx = (a.x! + b.x!) / 2;
              const my = (a.y! + b.y!) / 2;
              const on = selEdge === r.id || selNode === r.from || selNode === r.to;
              const cross = characters.find((c) => c.id === r.from)?.eraId !== characters.find((c) => c.id === r.to)?.eraId;
              return (
                <g
                  key={r.id}
                  className={`edge ${on ? 'on' : ''} ${cross ? 'cross' : ''} ${at.since ? 'changed' : ''}`}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    setSelEdge(r.id);
                    setSelNode(null);
                  }}
                >
                  <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="hit" />
                  <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
                  <text x={mx} y={my - 5} textAnchor="middle">
                    {at.label.length > 12 ? at.label.slice(0, 12) + '…' : at.label}
                  </text>
                </g>
              );
            })}
            {characters.map((c) => {
              const n = nodes.current.get(c.id);
              if (!n || n.x == null) return null;
              const era = eras.find((e) => e.id === c.eraId);
              const on = selNode === c.id || linkFrom === c.id;
              const dim = selNode && selNode !== c.id && !relations.some((r) => (r.from === selNode && r.to === c.id) || (r.to === selNode && r.from === c.id));
              return (
                <g key={c.id} className={`node ${on ? 'on' : ''} ${dim ? 'dim' : ''}`} transform={`translate(${n.x},${n.y})`} onPointerDown={(e) => dragNode(e, c.id)} onDoubleClick={() => go('characters', { character: c.id })}>
                  <circle r={n.r + 10} fill="url(#node-glow)" />
                  <circle r={n.r} className="body" style={{ ['--c' as any]: c.color ?? era?.color ?? '#999' }} />
                  <circle r={n.r + 3} className="ring" style={{ stroke: c.crossEra ? 'var(--gold)' : era?.color ?? 'var(--text-3)' }} />
                  <text className="glyph" dy="0.36em" textAnchor="middle" style={{ fontSize: n.r * 0.95 }}>
                    {c.name.slice(-1)}
                  </text>
                  <text className="label" y={n.r + 17} textAnchor="middle">
                    {c.name}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
        <div className="graph-hint faint">拖动人物固定位置 · 滚轮缩放 · 拖空白处平移 · 双击打开档案</div>
      </div>

      <aside className="side-r">
        {selR ? (
          <div className="col" style={{ gap: 10 }}>
            <h3 className="display" style={{ fontSize: 18 }}>
              {nameOf(selR.from)} <span className="faint">×</span> {nameOf(selR.to)}
            </h3>
            <label className="faint" style={{ fontSize: 12 }}>
              起点关系
            </label>
            <Edit value={selR.label} onCommit={(v) => mutate('relations', (d) => void (d.find((x) => x.id === selR.id)!.label = v), '改关系')} />
            <label className="faint" style={{ fontSize: 12 }}>
              随剧情变化
            </label>
            {selR.progressions.map((p, i) => (
              <div key={i} className="row" style={{ gap: 6 }}>
                <NumEdit value={p.chapter} style={{ width: 54 }} onCommit={(v) => v && mutate('relations', (d) => void (d.find((x) => x.id === selR.id)!.progressions[i].chapter = v))} />
                <Edit value={p.label} onCommit={(v) => mutate('relations', (d) => void (d.find((x) => x.id === selR.id)!.progressions[i].label = v))} />
                <button className="btn ghost sm icon danger" onClick={() => mutate('relations', (d) => void d.find((x) => x.id === selR.id)!.progressions.splice(i, 1))}>
                  <Icon name="close" size={13} />
                </button>
              </div>
            ))}
            <button className="btn ghost sm" style={{ alignSelf: 'flex-start' }} onClick={() => mutate('relations', (d) => void d.find((x) => x.id === selR.id)!.progressions.push({ chapter: cursor, label: '' }))}>
              <Icon name="plus" size={13} /> 第 {cursor} 章起变成…
            </button>
            {!!selR.keyChapters?.length && (
              <div className="row wrap" style={{ gap: 4 }}>
                <span className="faint">关键章：</span>
                {selR.keyChapters.map((n) => (
                  <ChapterLink key={n} num={n} />
                ))}
              </div>
            )}
            <Edit multiline value={selR.notes ?? ''} placeholder="备注" onCommit={(v) => mutate('relations', (d) => void (d.find((x) => x.id === selR.id)!.notes = v || undefined))} />
            <button
              className="btn danger sm"
              style={{ alignSelf: 'flex-start' }}
              onClick={() => {
                if (!confirmDelete('这条关系')) return;
                mutate('relations', (d) => d.filter((x) => x.id !== selR.id) as any, '删除关系');
                setSelEdge(null);
              }}
            >
              <Icon name="trash" size={13} /> 删除关系
            </button>
          </div>
        ) : selC ? (
          <div className="col" style={{ gap: 10 }}>
            <h3 className="display" style={{ fontSize: 20, color: selC.color }}>
              {selC.name}
            </h3>
            <div className="muted">{selC.summary}</div>
            <button className={`btn ${linkFrom === selC.id ? 'primary' : ''}`} onClick={() => setLinkFrom(linkFrom ? null : selC.id)}>
              <Icon name="link" size={15} /> {linkFrom === selC.id ? '点另一个人物完成连线（再点取消）' : '从 TA 连一条关系'}
            </button>
            <button className="btn" onClick={() => go('characters', { character: selC.id })}>
              打开档案
            </button>
            {selC.gx != null && (
              <button className="btn ghost sm" onClick={() => mutate('characters', (d) => {
                const c = d.find((x) => x.id === selC.id)!;
                delete c.gx;
                delete c.gy;
              }, '取消固定')}>
                取消固定位置
              </button>
            )}
            <div className="faint" style={{ fontSize: 12, marginTop: 6 }}>
              关系（第 {cursor} 章时）
            </div>
            {relations
              .filter((r) => r.from === selC.id || r.to === selC.id)
              .map((r) => (
                <div key={r.id} className="list-item" onClick={() => setSelEdge(r.id)}>
                  <span style={{ width: 64 }}>{nameOf(r.from === selC.id ? r.to : r.from)}</span>
                  <span className="muted grow">{relationAt(r, cursor).label}</span>
                </div>
              ))}
          </div>
        ) : (
          <div className="col faint" style={{ gap: 10, lineHeight: 1.8 }}>
            <h3 className="display" style={{ fontSize: 18, color: 'var(--text-2)' }}>
              关系图
            </h3>
            <div>· 节点大小 = 正文出场次数</div>
            <div>· 金色外环 = 可跨时代的人物</div>
            <div>· 虚线 = 跨时代的关系</div>
            <div>· 金色连线 = 到当前章为止关系已经变化过</div>
            <div>· 点人物 → “从 TA 连一条关系” → 点另一个人物，即可新建关系</div>
            <div>· 顶栏切换“写到第几章”，关系文字会跟着变</div>
          </div>
        )}
      </aside>
    </div>
  );
}
