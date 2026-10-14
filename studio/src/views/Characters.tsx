import { useMemo, useState } from 'react';
import { uid, useStore } from '../store';
import { useMentions } from '../lib/derived';
import { firstOf, relationAt, stateAt, totalOf } from '../lib/analysis';
import { Icon } from '../components/Icon';
import { ChapterLink, ChipInput, Edit, EraTag, Empty, Field, NumEdit, Seg, confirmDelete } from '../components/ui';
import { RelationGraph } from './RelationGraph';
import type { Character } from '../../shared/types';

export function Avatar({ c, size = 40 }: { c: Pick<Character, 'name' | 'color'>; size?: number }) {
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.48, ['--c' as any]: c.color ?? 'var(--text-2)' }}>
      {c.name.slice(-1)}
    </span>
  );
}

export function Characters() {
  const [mode, setMode] = useState<'cards' | 'graph'>('cards');
  return (
    <div className="view">
      <div className="view-head" style={{ paddingBottom: 10 }}>
        <h1>人物</h1>
        <Seg
          value={mode}
          onChange={setMode}
          options={[
            { value: 'cards', label: '档案' },
            { value: 'graph', label: '关系图' },
          ]}
        />
        <span className="grow" />
        <CursorHint />
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>{mode === 'cards' ? <CharacterFiles /> : <RelationGraph />}</div>
    </div>
  );
}

function CursorHint() {
  const cursor = useStore((s) => s.cursor);
  return <span className="faint">状态按“写到第 {cursor} 章”计算，在顶栏切换</span>;
}

function CharacterFiles() {
  const characters = useStore((s) => s.data.characters);
  const eras = useStore((s) => s.data.project.eras);
  const sel = useStore((s) => s.sel.character);
  const select = useStore((s) => s.select);
  const mutate = useStore((s) => s.mutate);
  const { charM } = useMentions();
  const [era, setEra] = useState<string>('all');
  const [q, setQ] = useState('');
  const list = characters.filter((c) => (era === 'all' || c.eraId === era || (era === 'none' && !c.eraId)) && (!q || `${c.name}${c.aliases.join('')}${c.summary ?? ''}`.includes(q)));
  const groups = [...new Set(list.map((c) => c.group))];
  const current = characters.find((c) => c.id === sel) ?? list[0];

  return (
    <div className="split" style={{ gridTemplateColumns: '260px 1fr' }}>
      <aside className="side">
        <div className="row" style={{ padding: '0 4px 8px' }}>
          <input className="input" placeholder="搜索人物…" value={q} onChange={(e) => setQ(e.target.value)} />
          <button
            className="btn icon"
            title="新建人物"
            onClick={() => {
              const id = uid('c');
              mutate('characters', (d) => void d.push({ id, name: '新人物', aliases: [], eraId: eras[0]?.id ?? null, group: '配角', fields: [{ key: '身份', value: '' }], progressions: [] }), '新建人物');
              select({ character: id });
            }}
          >
            <Icon name="plus" size={16} />
          </button>
        </div>
        <div style={{ padding: '0 4px 6px' }}>
          <Seg value={era} onChange={setEra} options={[{ value: 'all', label: '全部' }, ...eras.map((e) => ({ value: e.id, label: e.name }))]} />
        </div>
        {groups.map((g) => (
          <div key={g}>
            <div className="group-title">{g}</div>
            {list
              .filter((c) => c.group === g)
              .map((c) => (
                <div key={c.id} className={`list-item ${current?.id === c.id ? 'active' : ''}`} onClick={() => select({ character: c.id })}>
                  <Avatar c={c} size={26} />
                  <span className="ellipsis grow">{c.name}</span>
                  <span className="faint nums" style={{ fontSize: 11 }}>
                    {totalOf(charM.get(c.id)) || ''}
                  </span>
                </div>
              ))}
          </div>
        ))}
      </aside>
      {current ? <CharacterDetail key={current.id} c={current} /> : <Empty title="还没有人物" icon="characters" />}
    </div>
  );
}

function CharacterDetail({ c }: { c: Character }) {
  const data = useStore((s) => s.data);
  const cursor = useStore((s) => s.cursor);
  const mutate = useStore((s) => s.mutate);
  const select = useStore((s) => s.select);
  const go = useStore((s) => s.go);
  const { charM } = useMentions();
  const per = charM.get(c.id);
  const st = useMemo(() => stateAt(c, cursor), [c, cursor]);
  const first = firstOf(per);
  const maxCh = Math.max(1, ...data.chapters.filter((x) => x.status === 'done').map((x) => x.num), ...(per ? [...per.keys()] : []));
  const maxV = Math.max(1, ...(per ? [...per.values()] : []));
  const rels = data.relations.filter((r) => r.from === c.id || r.to === c.id);
  const upd = (fn: (x: Character) => void, label = '编辑人物') =>
    mutate('characters', (d) => {
      const x = d.find((y) => y.id === c.id);
      if (x) fn(x as Character);
    }, label);

  return (
    <div className="char-detail">
      <div className="char-hero" style={{ ['--c' as any]: c.color ?? 'var(--gold)' }}>
        <Avatar c={c} size={72} />
        <div className="col grow" style={{ gap: 6 }}>
          <div className="row" style={{ gap: 10 }}>
            <Edit value={c.name} bare className="display name-edit" onCommit={(v) => upd((x) => void (x.name = v))} style={{ width: 220 }} />
            <EraTag eraId={c.eraId} />
            <span className="tag">{c.group}</span>
            {c.crossEra && <span className="tag" style={{ ['--c' as any]: 'var(--gold)' }}>可跨时代</span>}
          </div>
          <Edit value={c.summary ?? ''} bare placeholder="一句话介绍" onCommit={(v) => upd((x) => void (x.summary = v || undefined))} />
          <div className="row faint" style={{ gap: 14, fontSize: 12, paddingLeft: 6 }}>
            <span>正文出现 {totalOf(per)} 次</span>
            <span>出场 {per?.size ?? 0} 章</span>
            {first && (
              <span>
                首次 <ChapterLink num={first} />
              </span>
            )}
          </div>
        </div>
        <label className="color-swatch big" style={{ background: c.color ?? 'var(--text-3)' }} title="人物颜色">
          <input type="color" value={c.color ?? '#8fb3ff'} onChange={(e) => upd((x) => void (x.color = e.target.value), '改颜色')} />
        </label>
      </div>

      <div className="spark-bars" title="每章出现次数" style={{ ['--c' as any]: c.color }}>
        {Array.from({ length: maxCh }, (_, i) => {
          const v = per?.get(i + 1) ?? 0;
          return (
            <span
              key={i}
              className={`sb ${i + 1 === cursor ? 'cur' : ''}`}
              style={{ height: v ? `${6 + 94 * (v / maxV)}%` : 2 }}
              title={`第 ${i + 1} 章：${v}`}
              onClick={() => go('chapters', { chapter: i + 1 })}
            />
          );
        })}
      </div>

      <div className="char-grid">
        <section className="panel">
          <div className="panel-head">
            第 {cursor} 章开写时的状态
            <span className="hint">金色 = 被剧情推进改过</span>
          </div>
          <div className="panel-body">
            {st.fields.map((f) => (
              <div className={`state-row ${f.since ? 'changed' : ''}`} key={f.key}>
                <span className="k">{f.key}</span>
                <span className="v selectable">{f.value}</span>
                {f.since && <ChapterLink num={f.since}>{f.since}章起</ChapterLink>}
              </div>
            ))}
            {!!st.upcoming.length && (
              <div className="upcoming">
                <div className="faint" style={{ fontSize: 12, margin: '10px 0 4px' }}>
                  之后会变：
                </div>
                {st.upcoming.map((p, i) => (
                  <div className="state-row future" key={i}>
                    <span className="k">{p.key}</span>
                    <span className="v">{p.value}</span>
                    <ChapterLink num={p.chapter}>{p.chapter}章</ChapterLink>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">基础档案（初始设定）</div>
          <div className="panel-body">
            {c.fields.map((f, i) => (
              <div className="row" key={i} style={{ alignItems: 'flex-start', gap: 6, marginBottom: 4 }}>
                <Edit value={f.key} bare style={{ width: 84, color: 'var(--text-3)' }} onCommit={(v) => upd((x) => void (x.fields[i].key = v))} />
                <Edit value={f.value} multiline rows={1} bare onCommit={(v) => upd((x) => void (x.fields[i].value = v))} />
                <button className="btn ghost sm icon danger" onClick={() => upd((x) => void x.fields.splice(i, 1), '删除字段')}>
                  <Icon name="close" size={13} />
                </button>
              </div>
            ))}
            <button className="btn ghost sm" onClick={() => upd((x) => void x.fields.push({ key: '新字段', value: '' }), '添加字段')}>
              <Icon name="plus" size={13} /> 字段
            </button>
            <div style={{ marginTop: 12 }}>
              <Field label="别名">
                <ChipInput values={c.aliases} onChange={(v) => upd((x) => void (x.aliases = v), '改别名')} placeholder="正文里的其他叫法，回车添加" />
              </Field>
              <Field label="时代">
                <select className="select" value={c.eraId ?? ''} onChange={(e) => upd((x) => void (x.eraId = e.target.value || null))}>
                  <option value="">不限</option>
                  {data.project.eras.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="分组">
                <Edit value={c.group} onCommit={(v) => upd((x) => void (x.group = v))} />
              </Field>
              <Field label="跨时代">
                <label className="row" style={{ paddingTop: 6 }}>
                  <input type="checkbox" checked={!!c.crossEra} onChange={(e) => upd((x) => void (x.crossEra = e.target.checked))} />
                  <span className="faint">勾选后不受“配角不出圈”检查</span>
                </label>
              </Field>
              <Field label="计划登场">
                <div className="row">
                  <NumEdit value={c.debutChapter} placeholder="章号" onCommit={(v) => upd((x) => void (x.debutChapter = v))} />
                  <span className="faint">之前的正文里出现会提醒</span>
                </div>
              </Field>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            剧情推进
            <span className="hint">从某章起，某项状态变成什么</span>
          </div>
          <div className="panel-body">
            <div className="prog-line">
              {[...c.progressions]
                .map((p, i) => ({ p, i }))
                .sort((a, b) => a.p.chapter - b.p.chapter)
                .map(({ p, i }) => (
                  <div key={i} className={`prog ${p.chapter < cursor ? 'past' : ''}`}>
                    <span className="prog-dot" />
                    <NumEdit value={p.chapter} min={1} style={{ width: 54 }} onCommit={(v) => v && upd((x) => void (x.progressions[i].chapter = v))} />
                    <Edit value={p.key} bare style={{ width: 80 }} onCommit={(v) => upd((x) => void (x.progressions[i].key = v))} />
                    <Edit value={p.value} multiline rows={1} bare onCommit={(v) => upd((x) => void (x.progressions[i].value = v))} />
                    <button className="btn ghost sm icon danger" onClick={() => upd((x) => void x.progressions.splice(i, 1), '删除推进')}>
                      <Icon name="close" size={13} />
                    </button>
                  </div>
                ))}
            </div>
            <button className="btn ghost sm" onClick={() => upd((x) => void x.progressions.push({ chapter: cursor, key: x.fields[0]?.key ?? '状态', value: '' }), '添加推进')}>
              <Icon name="plus" size={13} /> 在第 {cursor} 章添加变化
            </button>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">关系（第 {cursor} 章时）</div>
          <div className="panel-body col" style={{ gap: 6 }}>
            {rels.map((r) => {
              const other = data.characters.find((x) => x.id === (r.from === c.id ? r.to : r.from));
              const at = relationAt(r, cursor);
              return (
                <div key={r.id} className="rel-row click" onClick={() => other && select({ character: other.id })}>
                  {other && <Avatar c={other} size={26} />}
                  <span style={{ width: 70 }}>{other?.name}</span>
                  <span className="grow muted">{at.label}</span>
                  {at.since && <span className="faint">{at.since}章起</span>}
                </div>
              );
            })}
            {!rels.length && <div className="faint">还没有登记关系。到“关系图”里连线。</div>}
          </div>
        </section>

        <section className="panel" style={{ gridColumn: '1 / -1' }}>
          <div className="panel-head">笔记</div>
          <div className="panel-body">
            <Edit multiline rows={3} value={c.notes ?? ''} onCommit={(v) => upd((x) => void (x.notes = v || undefined))} placeholder="口头禅、外貌（如果有的话）、作者私房话……" />
            <div className="row" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
              <button
                className="btn danger sm"
                onClick={() => {
                  if (!confirmDelete(c.name)) return;
                  mutate('relations', (d) => d.filter((r) => r.from !== c.id && r.to !== c.id) as any);
                  mutate('characters', (d) => d.filter((x) => x.id !== c.id) as any, '删除人物');
                }}
              >
                <Icon name="trash" size={13} /> 删除人物
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
