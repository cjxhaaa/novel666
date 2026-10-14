import { useMemo, useState } from 'react';
import { uid, useStore } from '../store';
import { kindOf } from '../lib/analysis';
import { Icon } from '../components/Icon';
import { Edit, Seal, Seg, ViewHead, confirmDelete } from '../components/ui';
import type { Beat } from '../../shared/types';

const PALETTE = ['#e0644f', '#8fb3ff', '#e8c27a', '#c792ea', '#6fd1b5', '#f78fb3', '#9ccc65', '#ffb86c', '#7fdbff', '#b0a4ff'];

/** Plottr 式剧情网格：横轴章节，纵轴剧情线 */
export function PlotGrid() {
  const project = useStore((s) => s.data.project);
  const chapters = useStore((s) => s.data.chapters);
  const plotlines = useStore((s) => s.data.plotlines);
  const beats = useStore((s) => s.data.beats);
  const cursor = useStore((s) => s.cursor);
  const mutate = useStore((s) => s.mutate);
  const go = useStore((s) => s.go);
  const setCursor = useStore((s) => s.setCursor);
  const [volId, setVolId] = useState(() => project.volumes.find((v) => (v.from ?? 1) <= cursor && cursor <= (v.to ?? 1e9))?.id ?? project.volumes[0]?.id ?? '');
  const [dense, setDense] = useState<'wide' | 'dense'>('wide');
  const [editing, setEditing] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [dragOver, setDragOver] = useState<string | null>(null);

  const cols = useMemo(() => chapters.filter((c) => c.volumeId === volId).sort((a, b) => a.num - b.num), [chapters, volId]);
  const stages = project.stages.filter((s) => s.volumeId === volId);
  const cellMap = useMemo(() => {
    const m = new Map<string, Beat[]>();
    for (const b of beats) {
      const k = `${b.plotlineId}|${b.chapter}`;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(b);
    }
    return m;
  }, [beats]);
  const rows = plotlines.filter((p) => !hidden.has(p.id));
  const colW = dense === 'wide' ? 200 : 132;

  const addBeat = (plotlineId: string, chapter: number) => {
    const id = uid('b');
    mutate('beats', (d) => void d.push({ id, plotlineId, chapter, text: '' }), '新增剧情卡');
    setEditing(id);
  };
  const moveBeat = (id: string, plotlineId: string, chapter: number) =>
    mutate(
      'beats',
      (d) => {
        const b = d.find((x) => x.id === id);
        if (b) {
          b.plotlineId = plotlineId;
          b.chapter = chapter;
        }
      },
      '移动剧情卡',
    );

  return (
    <div className="view">
      <ViewHead title="剧情线" sub="每一行是一条线，每一列是一章。拖动卡片换位置，双击卡片编辑，点击列头切换当前章。">
        <Seg value={volId} onChange={setVolId} options={project.volumes.map((v) => ({ value: v.id, label: v.name.replace(/[:：].*/, '') }))} />
        <Seg
          value={dense}
          onChange={setDense}
          options={[
            { value: 'wide', label: '宽' },
            { value: 'dense', label: '紧' },
          ]}
        />
        <button
          className="btn"
          onClick={() =>
            mutate('plotlines', (d) => void d.push({ id: uid('pl'), name: '新剧情线', color: PALETTE[d.length % PALETTE.length] }), '新增剧情线')
          }
        >
          <Icon name="plus" size={15} /> 剧情线
        </button>
      </ViewHead>

      <div className="row wrap" style={{ padding: '0 24px 10px', gap: 6 }}>
        {plotlines.map((p) => (
          <span
            key={p.id}
            className="tag click"
            style={{ ['--c' as any]: hidden.has(p.id) ? 'var(--text-3)' : p.color, opacity: hidden.has(p.id) ? 0.5 : 1 }}
            onClick={() =>
              setHidden((h) => {
                const n = new Set(h);
                n.has(p.id) ? n.delete(p.id) : n.add(p.id);
                return n;
              })
            }
            title="点击显示/隐藏"
          >
            <span className="dot" style={{ ['--c' as any]: p.color }} />
            {p.name}
          </span>
        ))}
      </div>

      {!cols.length ? (
        <div className="empty">这一卷还没有章节。到“章节”里新建。</div>
      ) : (
        <div className="plot-scroll">
          <div className="plot-grid" style={{ gridTemplateColumns: `210px repeat(${cols.length}, ${colW}px)` }}>
            {/* 阶段条 */}
            <div className="pg-corner pg-stage-corner" />
            {stages.length
              ? cols.map((c) => {
                  const s = stages.find((s) => s.from === c.num);
                  if (s)
                    return (
                      <div key={`st-${c.num}`} className="pg-stage" style={{ gridColumn: `span ${Math.min(s.to, cols[cols.length - 1].num) - s.from + 1}` }} title={s.summary}>
                        {s.name}
                      </div>
                    );
                  return stages.some((s) => c.num > s.from && c.num <= s.to) ? null : <div key={`st-${c.num}`} className="pg-stage empty-stage" />;
                })
              : cols.map((c) => <div key={`st-${c.num}`} className="pg-stage empty-stage" />)}

            {/* 章节头 */}
            <div className="pg-corner">剧情线 ╲ 章</div>
            {cols.map((c) => {
              const k = kindOf(project, c.kind);
              return (
                <div
                  key={`h-${c.num}`}
                  className={`pg-head ${c.status} ${c.num === cursor ? 'cursor' : ''}`}
                  style={{ ['--c' as any]: k?.color }}
                  onClick={() => setCursor(c.num)}
                  onDoubleClick={() => go('chapters', { chapter: c.num })}
                  title={`${c.plan}\n\n双击打开章节`}
                >
                  <div className="row" style={{ gap: 6 }}>
                    <Seal kind={c.kind} />
                    <span className="nums faint">#{c.num}</span>
                    {c.status === 'done' && <Icon name="check" size={13} style={{ color: 'var(--jade)' }} />}
                    <span className="grow" />
                    {c.days && <span className="faint ellipsis" style={{ fontSize: 11, maxWidth: 90 }}>{c.days}</span>}
                  </div>
                  <div className="pg-title ellipsis">{c.title}</div>
                </div>
              );
            })}

            {/* 行 */}
            {rows.map((p, ri) => (
              <Row key={p.id}>
                <div className="pg-rowhead" style={{ ['--c' as any]: p.color }}>
                  <label className="color-swatch" style={{ background: p.color }} title="改颜色">
                    <input type="color" value={p.color} onChange={(e) => mutate('plotlines', (d) => void (d.find((x) => x.id === p.id)!.color = e.target.value), '改颜色')} />
                  </label>
                  <div className="col grow" style={{ gap: 0 }}>
                    <Edit bare value={p.name} onCommit={(v) => mutate('plotlines', (d) => void (d.find((x) => x.id === p.id)!.name = v), '改剧情线名')} />
                    <span className="faint" style={{ fontSize: 11, paddingLeft: 6 }}>
                      {beats.filter((b) => b.plotlineId === p.id).length} 张卡
                    </span>
                  </div>
                  <div className="pg-row-actions">
                    <button
                      className="btn ghost sm icon"
                      title="上移"
                      disabled={ri === 0}
                      onClick={() =>
                        mutate('plotlines', (d) => {
                          const i = d.findIndex((x) => x.id === p.id);
                          if (i > 0) [d[i - 1], d[i]] = [d[i], d[i - 1]];
                        })
                      }
                    >
                      <Icon name="left" size={13} style={{ transform: 'rotate(90deg)' }} />
                    </button>
                    <button
                      className="btn ghost sm icon danger"
                      title="删除剧情线（卡片一起删）"
                      onClick={() => {
                        if (!confirmDelete(p.name)) return;
                        mutate('beats', (d) => d.filter((b) => b.plotlineId !== p.id) as any);
                        mutate('plotlines', (d) => d.filter((x) => x.id !== p.id) as any, '删除剧情线');
                      }}
                    >
                      <Icon name="trash" size={13} />
                    </button>
                  </div>
                </div>
                {cols.map((c) => {
                  const key = `${p.id}|${c.num}`;
                  const list = cellMap.get(key) ?? [];
                  return (
                    <div
                      key={key}
                      className={`pg-cell ${c.num === cursor ? 'cursor' : ''} ${dragOver === key ? 'over' : ''}`}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDragOver(key);
                      }}
                      onDragLeave={() => setDragOver((k) => (k === key ? null : k))}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDragOver(null);
                        const id = e.dataTransfer.getData('text/beat');
                        if (id) moveBeat(id, p.id, c.num);
                      }}
                      onDoubleClick={(e) => e.target === e.currentTarget && addBeat(p.id, c.num)}
                    >
                      {list.map((b) =>
                        editing === b.id ? (
                          <div key={b.id} className="beat editing" style={{ ['--c' as any]: p.color }}>
                            <Edit
                              multiline
                              bare
                              autoFocus
                              value={b.text}
                              placeholder="这一章，这条线发生什么？（Ctrl+Enter 完成）"
                              onCommit={(v) => mutate('beats', (d) => void (d.find((x) => x.id === b.id)!.text = v), '编辑剧情卡')}
                            />
                            <div className="row" style={{ justifyContent: 'flex-end', gap: 4 }}>
                              <button
                                className="btn ghost sm icon danger"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                  mutate('beats', (d) => d.filter((x) => x.id !== b.id) as any, '删除剧情卡');
                                  setEditing(null);
                                }}
                              >
                                <Icon name="trash" size={13} />
                              </button>
                              <button className="btn sm" onClick={() => setEditing(null)}>
                                完成
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div
                            key={b.id}
                            className="beat"
                            style={{ ['--c' as any]: p.color }}
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData('text/beat', b.id);
                              e.dataTransfer.effectAllowed = 'move';
                            }}
                            onDoubleClick={() => setEditing(b.id)}
                            title={b.text}
                          >
                            {b.text || <span className="faint">（空）</span>}
                          </div>
                        ),
                      )}
                      <button className="pg-add" onClick={() => addBeat(p.id, c.num)} title="在这里加一张卡">
                        <Icon name="plus" size={13} />
                      </button>
                    </div>
                  );
                })}
              </Row>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
