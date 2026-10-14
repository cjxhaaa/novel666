import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { useIssues } from '../lib/derived';
import { RULES, type Severity } from '../lib/analysis';
import { Icon } from '../components/Icon';
import { ChapterLink, ChipInput, NumEdit, ViewHead } from '../components/ui';
import type { GuardSettings } from '../../shared/types';

const SEV: Record<Severity, { label: string; color: string; icon: string }> = {
  error: { label: '错误', color: 'var(--danger)', icon: 'warn' },
  warn: { label: '提醒', color: 'var(--warn)', icon: 'warn' },
  info: { label: '提示', color: 'var(--moon)', icon: 'info' },
};

/** 设定守卫：把“凭空创作”的风险变成一条条可检查的提醒 */
export function Guard() {
  const issues = useIssues();
  const guard = useStore((s) => s.data.project.guard);
  const mutate = useStore((s) => s.mutate);
  const go = useStore((s) => s.go);
  const [rule, setRule] = useState<string>('all');
  const [sev, setSev] = useState<Severity | 'all'>('all');
  const byRule = useMemo(() => {
    const m: Record<string, number> = {};
    for (const i of issues) m[i.rule] = (m[i.rule] ?? 0) + 1;
    return m;
  }, [issues]);
  const list = issues.filter((i) => (rule === 'all' || i.rule === rule) && (sev === 'all' || i.severity === sev));
  const setG = (fn: (g: GuardSettings) => void) => mutate('project', (d) => fn(d.guard as GuardSettings), '改守卫设置');

  return (
    <div className="view">
      <ViewHead title="设定守卫" sub="扫描全部正文：跨线人物、古今地名、提前登场、伏笔逾期、时间倒流、套话。改了正文或设定会自动重新检查。" />
      <div className="split" style={{ gridTemplateColumns: '1fr 320px', flex: 1, minHeight: 0 }}>
        <div style={{ overflow: 'auto', padding: '0 24px 24px' }}>
          <div className="rule-cards">
            <div className={`rule-card ${rule === 'all' ? 'on' : ''}`} onClick={() => setRule('all')}>
              <span className="v nums">{issues.length}</span>
              <span className="l">全部</span>
            </div>
            {Object.entries(RULES).map(([k, r]) => (
              <div key={k} className={`rule-card ${rule === k ? 'on' : ''} ${byRule[k] ? '' : 'zero'}`} onClick={() => setRule(k)} title={r.desc}>
                <span className="v nums">{byRule[k] ?? 0}</span>
                <span className="l">{r.name}</span>
              </div>
            ))}
          </div>
          <div className="row" style={{ margin: '12px 0' }}>
            {(['all', 'error', 'warn', 'info'] as const).map((s) => (
              <span key={s} className="tag click" style={{ ['--c' as any]: s === 'all' ? 'var(--text-2)' : SEV[s].color, opacity: sev === s ? 1 : 0.55 }} onClick={() => setSev(s)}>
                {s === 'all' ? '所有级别' : SEV[s].label} {s === 'all' ? issues.length : issues.filter((i) => i.severity === s).length}
              </span>
            ))}
          </div>
          <div className="col" style={{ gap: 6 }}>
            {list.map((i) => (
              <div key={i.id} className={`issue ${i.severity}`} style={{ ['--c' as any]: SEV[i.severity].color }}>
                <Icon name={SEV[i.severity].icon} size={17} style={{ color: SEV[i.severity].color, marginTop: 2 }} />
                <div className="col grow" style={{ gap: 3, minWidth: 0 }}>
                  <div className="row" style={{ gap: 8 }}>
                    <span className="tag">{RULES[i.rule]?.name}</span>
                    <span>{i.title}</span>
                  </div>
                  {i.detail && <div className="faint">{i.detail}</div>}
                  {i.snip && (
                    <div className="snip selectable">
                      <span className="faint">第 {i.snip.line} 行：</span>…{i.snip.before}
                      <mark>{i.snip.hit}</mark>
                      {i.snip.after}…
                    </div>
                  )}
                </div>
                <div className="col" style={{ gap: 4, alignItems: 'flex-end' }}>
                  {i.chapter && <ChapterLink num={i.chapter} />}
                  {i.target && i.target.view !== 'chapters' && (
                    <button
                      className="btn ghost sm"
                      onClick={() =>
                        go(i.target!.view, i.target!.view === 'characters' ? { character: i.target!.id } : i.target!.view === 'locations' ? { location: i.target!.id } : { foreshadow: i.target!.id })
                      }
                    >
                      查看设定
                    </button>
                  )}
                </div>
              </div>
            ))}
            {!list.length && (
              <div className="empty">
                <Icon name="guard" size={34} stroke={1.2} />
                <div className="big">没有问题</div>
              </div>
            )}
          </div>
        </div>
        <aside className="side-r col" style={{ gap: 14 }}>
          <h3 className="display" style={{ fontSize: 18 }}>
            守卫规则
          </h3>
          {(
            [
              ['crossEraCheck', '配角不出圈：某时代的配角不该出现在另一时代的章里（【亭】章不查）'],
              ['locationEraCheck', '古今地名：一个时代独有的地名不该出现在另一时代的章里'],
              ['debutCheck', '提前登场：人物在计划登场章之前出现'],
              ['overdueCheck', '伏笔逾期：计划收的章已经写完，伏笔还没收'],
            ] as [keyof GuardSettings, string][]
          ).map(([k, label]) => (
            <label key={k} className="row" style={{ alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={!!guard[k]} onChange={(e) => setG((g) => void ((g as any)[k] = e.target.checked))} style={{ marginTop: 4 }} />
              <span className="muted">{label}</span>
            </label>
          ))}
          <div>
            <div className="faint" style={{ fontSize: 12, marginBottom: 6 }}>
              套话黑名单（回车添加）
            </div>
            <ChipInput values={guard.bannedPhrases} onChange={(v) => setG((g) => void (g.bannedPhrases = v))} />
          </div>
          <div className="row">
            <span className="muted">“不是……是……”每章上限</span>
            <NumEdit value={guard.maxNotXisY} min={0} style={{ width: 60 }} onCommit={(v) => setG((g) => void (g.maxNotXisY = v ?? 2))} />
          </div>
          <div className="faint" style={{ fontSize: 12, lineHeight: 1.8 }}>
            人物和地点的识别靠“名字 + 别名”。误报多的话，去人物或地点档案里调整别名；人物勾选“可跨时代”即可不受出圈检查。
          </div>
        </aside>
      </div>
    </div>
  );
}
