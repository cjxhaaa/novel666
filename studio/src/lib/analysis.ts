// 正文扫描、按章计算状态、设定守卫、写作上下文。都是纯函数，方便缓存。
import type { Chapter, Character, Location, Project, Relation, StoryData } from '../../shared/types';
import { resolveCodex } from './docs';

/** 汉字、字母、数字计数（不算空白和 markdown 符号） */
export function countChars(text: string) {
  const m = text.match(/[\p{Script=Han}A-Za-z0-9　-〿＀-￯“”‘’—…·]/gu);
  return m ? m.length : 0;
}

export function fmtWan(n: number) {
  return n >= 10000 ? `${(n / 10000).toFixed(1)} 万` : `${n}`;
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function termsOf(e: { name: string; aliases: string[] }) {
  return [e.name, ...e.aliases].map((t) => t.trim()).filter((t) => t.length >= 2);
}

export function termRegex(terms: string[]) {
  if (!terms.length) return null;
  return new RegExp([...terms].sort((a, b) => b.length - a.length).map(escapeRe).join('|'), 'g');
}

/** entityId → (章号 → 次数) */
export type MentionMap = Map<string, Map<number, number>>;

export function scanMentions(entities: { id: string; name: string; aliases: string[] }[], texts: Record<number, string>): MentionMap {
  const out: MentionMap = new Map();
  for (const e of entities) {
    const re = termRegex(termsOf(e));
    const per = new Map<number, number>();
    if (re) {
      for (const [k, text] of Object.entries(texts)) {
        const m = text.match(re);
        if (m?.length) per.set(Number(k), m.length);
      }
    }
    out.set(e.id, per);
  }
  return out;
}

export function totalOf(m: Map<number, number> | undefined) {
  let t = 0;
  m?.forEach((v) => (t += v));
  return t;
}

export function firstOf(m: Map<number, number> | undefined) {
  let f = Infinity;
  m?.forEach((_v, k) => (f = Math.min(f, k)));
  return f === Infinity ? undefined : f;
}

/** 某人物在第 n 章开写时的状态：fields 叠加 chapter < n 的 progressions（n 本章的变化算“本章内发生”） */
export function stateAt(c: Character, n: number) {
  const map = new Map<string, { value: string; since?: number }>();
  for (const f of c.fields) map.set(f.key, { value: f.value });
  const applied = [...c.progressions].filter((p) => p.chapter < n).sort((a, b) => a.chapter - b.chapter);
  for (const p of applied) map.set(p.key, { value: p.value, since: p.chapter });
  const upcoming = c.progressions.filter((p) => p.chapter >= n).sort((a, b) => a.chapter - b.chapter);
  return { fields: [...map.entries()].map(([key, v]) => ({ key, ...v })), upcoming };
}

export function relationAt(r: Relation, n: number) {
  let label = r.label;
  let since: number | undefined;
  for (const p of [...r.progressions].sort((a, b) => a.chapter - b.chapter)) {
    if (p.chapter < n) {
      label = p.label;
      since = p.chapter;
    }
  }
  return { label, since };
}

export function kindOf(project: Project, id: string) {
  return project.chapterKinds.find((k) => k.id === id);
}

export function eraOf(project: Project, id: string | null | undefined) {
  return id ? project.eras.find((e) => e.id === id) : undefined;
}

export function chapterEra(project: Project, ch: Chapter) {
  return kindOf(project, ch.kind)?.eraId ?? null;
}

export function latestDone(chapters: Chapter[]) {
  return chapters.reduce((m, c) => (c.status === 'done' && c.num > m ? c.num : m), 0);
}

/** 找第一处匹配，返回前后文 */
export function snippet(text: string, re: RegExp, pad = 18) {
  re.lastIndex = 0;
  const m = re.exec(text);
  if (!m) return undefined;
  const s = Math.max(0, m.index - pad);
  const e = Math.min(text.length, m.index + m[0].length + pad);
  const line = text.slice(0, m.index).split('\n').length;
  return {
    before: text.slice(s, m.index).replace(/\s+/g, ' '),
    hit: m[0],
    after: text.slice(m.index + m[0].length, e).replace(/\s+/g, ' '),
    line,
  };
}

// ───────────────────────── 设定守卫 ─────────────────────────

export type Severity = 'error' | 'warn' | 'info';

export interface Issue {
  id: string;
  rule: string;
  severity: Severity;
  chapter?: number;
  title: string;
  detail?: string;
  snip?: ReturnType<typeof snippet>;
  target?: { view: 'chapters' | 'characters' | 'foreshadow' | 'locations'; id?: string };
}

export const RULES: Record<string, { name: string; desc: string }> = {
  crossEra: { name: '配角不出圈', desc: '某个时代的配角出现在另一个时代的章节里' },
  locationEra: { name: '古今地名混用', desc: '一个时代独有的地名出现在另一个时代的章节里' },
  debut: { name: '提前登场', desc: '人物在计划登场章之前就出现在正文里' },
  overdue: { name: '伏笔逾期', desc: '计划收伏笔的章已经写过，伏笔还没收' },
  banned: { name: '套话', desc: '写作规范里禁用或少用的说法' },
  notXisY: { name: '“不是……是……”过多', desc: '每章上限由项目设置决定' },
  status: { name: '状态不符', desc: '章节状态和正文文件对不上' },
  timeFlow: { name: '时间倒流', desc: '同一条时间线上，后一章的故事日早于前一章' },
  codexRef: { name: '设定引用失效', desc: '设定条目引用的文档小节找不到了（可能改了标题）' },
};

export function runGuard(data: StoryData, texts: Record<number, string>, charM: MentionMap, locM: MentionMap, docs: Record<string, string> = {}): Issue[] {
  const { project, chapters, characters, locations, foreshadows } = data;
  const g = project.guard;
  const issues: Issue[] = [];
  const byNum = new Map(chapters.map((c) => [c.num, c]));
  const done = latestDone(chapters);

  const nums = new Set<number>([...chapters.map((c) => c.num), ...Object.keys(texts).map(Number)]);
  for (const n of [...nums].sort((a, b) => a - b)) {
    const ch = byNum.get(n);
    const text = texts[n];
    if (ch && ch.status === 'done' && !text) {
      issues.push({ id: `status-${n}`, rule: 'status', severity: 'error', chapter: n, title: `第 ${n} 章标为已完成，但找不到正文文件` });
    }
    if (ch && text && ch.status === 'planned' && text.trim().length > 200) {
      issues.push({ id: `status2-${n}`, rule: 'status', severity: 'info', chapter: n, title: `第 ${n} 章已有正文，状态仍是“计划”` });
    }
    if (!text) continue;
    const era = ch ? chapterEra(project, ch) : null;

    if (g.crossEraCheck && era) {
      for (const c of characters) {
        if (!c.eraId || c.crossEra || c.eraId === era) continue;
        const cnt = charM.get(c.id)?.get(n);
        if (!cnt) continue;
        issues.push({
          id: `cross-${n}-${c.id}`,
          rule: 'crossEra',
          severity: 'warn',
          chapter: n,
          title: `${eraOf(project, c.eraId)?.name ?? ''}代人物「${c.name}」出现在【${kindOf(project, ch!.kind)?.name}】章（${cnt} 处）`,
          snip: snippet(text, termRegex(termsOf(c))!),
          target: { view: 'characters', id: c.id },
        });
      }
    }

    if (g.locationEraCheck && era) {
      const eraNames = new Set(locations.filter((l) => !l.eraId || l.eraId === era).flatMap((l) => termsOf(l)));
      for (const l of locations) {
        if (!l.eraId || l.eraId === era) continue;
        const cnt = locM.get(l.id)?.get(n);
        if (!cnt) continue;
        const terms = termsOf(l).filter((t) => !eraNames.has(t));
        if (!terms.length) continue;
        const re = termRegex(terms)!;
        const sn = snippet(text, re);
        if (!sn) continue;
        const other = l.counterpartId ? locations.find((x) => x.id === l.counterpartId) : undefined;
        issues.push({
          id: `loc-${n}-${l.id}`,
          rule: 'locationEra',
          severity: 'warn',
          chapter: n,
          title: `「${l.name}」是${eraOf(project, l.eraId)?.name ?? ''}代地名，出现在【${kindOf(project, ch!.kind)?.name}】章`,
          detail: other ? `这一时代对应的是「${other.name}」` : undefined,
          snip: sn,
          target: { view: 'locations', id: l.id },
        });
      }
    }

    if (g.debutCheck) {
      for (const c of characters) {
        if (!c.debutChapter || n >= c.debutChapter) continue;
        const cnt = charM.get(c.id)?.get(n);
        if (!cnt) continue;
        issues.push({
          id: `debut-${n}-${c.id}`,
          rule: 'debut',
          severity: 'warn',
          chapter: n,
          title: `「${c.name}」计划第 ${c.debutChapter} 章登场，却在第 ${n} 章出现（${cnt} 处）`,
          snip: snippet(text, termRegex(termsOf(c))!),
          target: { view: 'characters', id: c.id },
        });
      }
    }

    for (const p of g.bannedPhrases) {
      if (!p.trim()) continue;
      const re = new RegExp(escapeRe(p.trim()), 'g');
      const cnt = text.match(re)?.length ?? 0;
      if (cnt)
        issues.push({ id: `ban-${n}-${p}`, rule: 'banned', severity: 'warn', chapter: n, title: `套话「${p}」× ${cnt}`, snip: snippet(text, re) });
    }

    const nx = /不是[^。！？\n“”]{1,24}?[，,]\s*(?:而|就|才|那|这)?是/g;
    const nxCount = text.match(nx)?.length ?? 0;
    if (nxCount > g.maxNotXisY)
      issues.push({
        id: `nx-${n}`,
        rule: 'notXisY',
        severity: 'info',
        chapter: n,
        title: `“不是……是……”出现约 ${nxCount} 次（上限 ${g.maxNotXisY}）`,
        snip: snippet(text, nx),
      });
  }

  // 时间倒流：古、今各自一条时间线，亭章两边都算。只比较起始日，蒙太奇式的跨天章节允许重叠。
  for (const era of project.eras.map((e) => e.id)) {
    let maxStart = -Infinity;
    let maxCh = 0;
    for (const ch of [...chapters].sort((a, b) => a.num - b.num)) {
      const ce = chapterEra(project, ch);
      if ((ce && ce !== era) || ch.dayStart == null) continue;
      if (ch.dayStart < maxStart) {
        issues.push({
          id: `time-${era}-${ch.num}`,
          rule: 'timeFlow',
          severity: 'info',
          chapter: ch.num,
          title: `第 ${ch.num} 章从第 ${ch.dayStart} 天开始，早于第 ${maxCh} 章的第 ${maxStart} 天`,
          detail: `${eraOf(project, era)?.label ?? era} 时间线。若是倒叙可忽略。`,
        });
      } else {
        maxStart = ch.dayStart;
        maxCh = ch.num;
      }
    }
  }

  if (g.overdueCheck) {
    for (const f of foreshadows) {
      if (f.status !== 'open' || !f.payoffChapters.length) continue;
      const last = Math.max(...f.payoffChapters);
      const soon = f.payoffChapters.find((p) => p > done && p <= done + 3);
      if (last <= done) {
        issues.push({
          id: `over-${f.id}`,
          rule: 'overdue',
          severity: 'warn',
          chapter: last,
          title: `伏笔已过计划章仍未收：${f.text}`,
          detail: `计划：${f.payoff}`,
          target: { view: 'foreshadow', id: f.id },
        });
      } else if (soon) {
        issues.push({
          id: `due-${f.id}`,
          rule: 'overdue',
          severity: 'info',
          chapter: soon,
          title: `第 ${soon} 章计划收：${f.text}`,
          detail: `计划：${f.payoff}`,
          target: { view: 'foreshadow', id: f.id },
        });
      }
    }
  }

  for (const e of data.codex) {
    if (!e.source || !(e.source.doc in docs)) continue;
    if (resolveCodex(e, docs).broken)
      issues.push({
        id: `ref-${e.id}`,
        rule: 'codexRef',
        severity: 'error',
        title: `设定「${e.title}」引用的「${e.source.doc} › ${e.source.heading}」找不到了`,
        detail: '到“设定”页重新选择引用的小节，或者把 bible.md 里的标题改回来。',
      });
  }

  const order: Record<Severity, number> = { error: 0, warn: 1, info: 2 };
  return issues.sort((a, b) => order[a.severity] - order[b.severity] || (a.chapter ?? 0) - (b.chapter ?? 0));
}

// ───────────────────────── 写作上下文 ─────────────────────────

/** 为第 n 章生成写作上下文：Claude 写正文前读这一份，就不必凭记忆。 */
export function contextPack(data: StoryData, texts: Record<number, string>, charM: MentionMap, locM: MentionMap, n: number, docs: Record<string, string> = {}) {
  const { project, chapters, characters, relations, locations, foreshadows, beats, plotlines, codex, events } = data;
  const ch = chapters.find((c) => c.num === n);
  const L: string[] = [];
  const kindName = (c: Chapter) => kindOf(project, c.kind)?.name ?? c.kind;
  L.push(`# 写作上下文：第 ${n} 章${ch ? `《${ch.title}》` : ''}`);
  L.push('');
  L.push(`> 由星图书房根据 story/ 目录生成。人物状态按“第 ${n} 章开写时”计算。世界观以 bible.md 为准，人物、地点、伏笔以 story/ 为准。`);
  L.push('');

  if (ch) {
    L.push('## 本章计划');
    L.push('');
    L.push(`- 类型：【${kindName(ch)}】　故事时间：${ch.days ?? '未定'}`);
    const stage = project.stages.find((s) => n >= s.from && n <= s.to);
    if (stage) L.push(`- 所在阶段：${stage.name}（${stage.from}–${stage.to}）`);
    L.push(`- 大纲：${ch.plan}`);
    if (ch.notes) L.push(`- 备注：${ch.notes}`);
    L.push('');
  }

  const bs = beats.filter((b) => b.chapter === n);
  if (bs.length) {
    L.push('## 本章在各剧情线上的任务');
    L.push('');
    for (const b of bs) L.push(`- **${plotlines.find((p) => p.id === b.plotlineId)?.name ?? b.plotlineId}**：${b.text}`);
    L.push('');
  }

  L.push('## 前情（最近已写章节）');
  L.push('');
  for (const c of chapters.filter((c) => c.num < n && c.num >= n - 5).sort((a, b) => a.num - b.num)) {
    L.push(`- 第 ${c.num} 章【${kindName(c)}】${c.title}｜${c.days ?? ''}｜${c.recap ?? c.plan}`);
  }
  L.push('');
  L.push('## 后续安排（别提前写掉）');
  L.push('');
  for (const c of chapters.filter((c) => c.num > n && c.num <= n + 3).sort((a, b) => a.num - b.num)) {
    L.push(`- 第 ${c.num} 章【${kindName(c)}】${c.title}：${c.plan}`);
  }
  L.push('');

  // 涉及人物：pov + 计划文本里提到的 + 最近三章出场多的主角
  const planText = `${ch?.plan ?? ''} ${bs.map((b) => b.text).join(' ')}`;
  const involved = new Set<string>(ch?.pov ?? []);
  for (const c of characters) {
    const re = termRegex(termsOf(c));
    if (re && re.test(planText)) involved.add(c.id);
    if (c.crossEra) involved.add(c.id);
    let recent = 0;
    for (let k = n - 3; k < n; k++) recent += charM.get(c.id)?.get(k) ?? 0;
    if (recent >= 8) involved.add(c.id);
  }
  const people = characters.filter((c) => involved.has(c.id));
  if (people.length) {
    L.push(`## 相关人物（第 ${n} 章开写时的状态）`);
    L.push('');
    for (const c of people) {
      const st = stateAt(c, n);
      const era = eraOf(project, c.eraId);
      L.push(`### ${c.name}${c.aliases.length ? `（${c.aliases.join('、')}）` : ''}${era ? `　〔${era.name}〕` : ''}`);
      if (c.summary) L.push(`${c.summary}`);
      for (const f of st.fields) L.push(`- ${f.key}：${f.value}${f.since ? `（第 ${f.since} 章起）` : ''}`);
      const last = [...(charM.get(c.id)?.keys() ?? [])].filter((k) => k < n).sort((a, b) => b - a)[0];
      if (last) L.push(`- 最近出场：第 ${last} 章`);
      if (c.debutChapter && c.debutChapter > n) L.push(`- ⚠ 计划第 ${c.debutChapter} 章才登场`);
      L.push('');
    }
    const rels = relations.filter((r) => involved.has(r.from) && involved.has(r.to));
    if (rels.length) {
      L.push('### 人物关系（此时）');
      for (const r of rels) {
        const a = characters.find((c) => c.id === r.from)?.name;
        const b = characters.find((c) => c.id === r.to)?.name;
        L.push(`- ${a} × ${b}：${relationAt(r, n).label}`);
      }
      L.push('');
    }
  }

  // 相关地点：计划里提到的 + 本章时代相关的古今对照
  const placeIds = new Set<string>();
  for (const l of locations) {
    const re = termRegex(termsOf(l));
    if (re && re.test(planText)) placeIds.add(l.id);
  }
  const places = locations.filter((l) => placeIds.has(l.id));
  if (places.length) {
    L.push('## 相关地点');
    L.push('');
    for (const l of places) {
      const other = l.counterpartId ? locations.find((x) => x.id === l.counterpartId) : undefined;
      L.push(`- **${l.name}**${l.eraId ? `〔${eraOf(project, l.eraId)?.name}〕` : ''}：${l.description}${other ? `　↔ 对应「${other.name}」：${other.description}` : ''}`);
    }
    L.push('');
  }

  const open = foreshadows.filter((f) => f.status === 'open');
  const near = open.filter((f) => f.payoffChapters.some((p) => Math.abs(p - n) <= 3));
  const far = open.filter((f) => !near.includes(f));
  if (open.length) {
    L.push('## 伏笔');
    L.push('');
    if (near.length) {
      L.push('**本章前后计划收的：**');
      for (const f of near) L.push(`- ${f.text}｜埋在第 ${f.planted.join('、')} 章｜${f.payoff}`);
      L.push('');
    }
    L.push('**其余已埋未收（别写崩）：**');
    for (const f of far) L.push(`- ${f.text}｜第 ${f.planted.join('、')} 章｜${f.payoff}`);
    L.push('');
  }

  const changes = events.filter((e) => e.kind === 'change' && (e.chapter ?? 0) < n);
  if (changes.length) {
    L.push('## 已发生的历史改动（只有林凡记得旧版本）');
    L.push('');
    for (const e of changes) L.push(`- 第 ${e.chapter} 章：${e.title}${e.before ? `｜原：${e.before}` : ''}${e.after ? `｜现：${e.after}` : ''}`);
    L.push('');
  }

  const pinned = codex.filter((e) => e.pinned);
  if (pinned.length) {
    L.push('## 必守设定');
    L.push('');
    for (const e of pinned) {
      L.push(`### ${e.title}${e.source ? `（${e.source.doc} › ${e.source.heading}）` : ''}`);
      L.push(resolveCodex(e, docs).body.trim());
      L.push('');
    }
  }

  if (project.guard.bannedPhrases.length) {
    L.push('## 禁用套话');
    L.push('');
    L.push(project.guard.bannedPhrases.join('、') + `；“不是……是……”每章最多 ${project.guard.maxNotXisY} 次。`);
    L.push('');
  }
  void texts;
  void locM;
  return L.join('\n');
}

export function isChapterEra(project: Project, ch: Chapter, eraId: string) {
  const e = chapterEra(project, ch);
  return !e || e === eraId;
}

export type { Location };
