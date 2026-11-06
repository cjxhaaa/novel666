// 从本地存储里把一本书读成星图书房的数据结构，供各页面使用。
import type { StoryData, SyncBook } from '../../shared/types';
import { COLLECTIONS } from '../../shared/types';
import { getFiles } from './db';

export interface Change {
  path: string;
  kind: 'new' | 'mod' | 'del';
}

/** 手机上的一本书：最近一次同步时电脑那边的文件指纹，以及那次改了什么 */
export interface LocalBook {
  id: string;
  title: string;
  info: SyncBook['info'];
  files: Record<string, string>;
  syncedAt: number;
  changes: Change[];
  changedAt?: number;
}

export interface Loaded {
  id: string;
  data: StoryData;
  texts: Record<number, string>;
  /** 章号 → 文件路径 */
  chapterPaths: Record<number, string>;
  /** 根目录的 markdown 文档 */
  docs: string[];
}

function chapterRe(pattern: string) {
  const esc = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace('\\{NN\\}', '(\\d+)').replace('\\{N\\}', '(\\d+)');
  return new RegExp(`^${esc}$`);
}

const parse = (t: string | undefined) => (t == null ? undefined : JSON.parse(t.replace(/^﻿/, '')));

export async function loadBook(b: LocalBook): Promise<Loaded> {
  const paths = Object.keys(b.files);
  const json = await getFiles(
    b.id,
    COLLECTIONS.map((c) => `story/${c}.json`),
  );
  const data = {} as any;
  for (const c of COLLECTIONS) data[c] = parse(json[`story/${c}.json`]) ?? [];
  if (Array.isArray(data.project)) data.project = {};
  data.project = { title: b.title, eras: [], chapterKinds: [], volumes: [], stages: [], chapterFilePattern: 'chapters/chap{NN}.md', ...data.project };
  const re = chapterRe(data.project.chapterFilePattern);
  const chapterPaths: Record<number, string> = {};
  for (const p of paths) {
    const m = p.match(re);
    if (m) chapterPaths[Number(m[1])] = p;
  }
  const raw = await getFiles(b.id, Object.values(chapterPaths));
  const texts: Record<number, string> = {};
  for (const [n, p] of Object.entries(chapterPaths)) if (raw[p] != null) texts[+n] = raw[p].replace(/^﻿/, '');
  const docs = paths.filter((p) => !p.includes('/') && p.toLowerCase().endsWith('.md'));
  return { id: b.id, data: data as StoryData, texts, chapterPaths, docs };
}

const COLL_LABEL: Record<string, string> = {
  project: '书目设置',
  chapters: '章节规划',
  plotlines: '剧情线',
  beats: '剧情卡',
  characters: '人物',
  relations: '人物关系',
  locations: '地点',
  events: '世界脉络',
  foreshadows: '伏笔',
  codex: '设定条目',
};

const DOC_LABEL: Record<string, string> = {
  'bible.md': '设定集',
  'outline.md': '大纲',
  'progress.md': '写作进度',
  'claude.md': '说明',
};

export function docLabel(p: string) {
  return DOC_LABEL[p.toLowerCase()] ?? p.replace(/\.md$/i, '');
}

function chapterNum(p: string) {
  const m = p.match(/(\d+)\.md$/);
  return p.includes('/') && !p.startsWith('story/') && m ? Number(m[1]) : null;
}

function ranges(nums: number[]) {
  const s = [...new Set(nums)].sort((a, b) => a - b);
  const out: string[] = [];
  for (let i = 0; i < s.length; i++) {
    let j = i;
    while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++;
    out.push(i === j ? `${s[i]}` : `${s[i]}–${s[j]}`);
    i = j;
  }
  return out.join('、');
}

/** “新增第 41–43 章 · 改了第 40 章 · 人物、大纲” */
export function describeChanges(changes: Change[]): string {
  const parts: string[] = [];
  const nums = (k: Change['kind']) => changes.filter((c) => c.kind === k).map((c) => chapterNum(c.path)).filter((n): n is number => n != null);
  const nw = nums('new');
  const md = nums('mod');
  const del = nums('del');
  if (nw.length) parts.push(`新增第 ${ranges(nw)} 章`);
  if (md.length) parts.push(`改了第 ${ranges(md)} 章`);
  if (del.length) parts.push(`删了第 ${ranges(del)} 章`);
  const other = changes
    .filter((c) => chapterNum(c.path) == null)
    .map((c) => {
      const m = c.path.match(/^story\/(\w+)\.json$/);
      return m ? COLL_LABEL[m[1]] ?? m[1] : docLabel(c.path);
    });
  if (other.length) parts.push([...new Set(other)].join('、'));
  return parts.join(' · ');
}

export function changedChapters(b: LocalBook | undefined) {
  const out = new Set<number>();
  for (const c of b?.changes ?? []) {
    const n = chapterNum(c.path);
    if (n != null && c.kind !== 'del') out.add(n);
  }
  return out;
}
