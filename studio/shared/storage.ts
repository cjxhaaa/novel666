// Node 侧的存储实现。Electron 主进程和 Vite 开发服务器共用这一份。
import { promises as fs, watch, type FSWatcher } from 'node:fs';
import path from 'node:path';
import type { BookInfo, ChapterFileInfo, CollectionName, OpenResult, Project, StoryData } from './types';
import { COLLECTIONS } from './types';

export const STORY_DIR = 'story';

export function defaultProject(title = '未命名小说'): Project {
  return {
    version: 1,
    title,
    eras: [{ id: 'main', name: '主', label: '主时间线', color: '#8fb3ff' }],
    chapterKinds: [{ id: 'main', name: '正', eraId: 'main', color: '#8fb3ff' }],
    volumes: [{ id: 'v1', name: '第一卷', from: 1, to: 60 }],
    stages: [],
    chapterFilePattern: 'chapters/chap{NN}.md',
    calendarLabel: '故事第 N 天',
    keyDays: [],
    guard: {
      bannedPhrases: ['倒吸一口凉气', '一阵青一阵白', '陷入了短暂的沉默', '翻了个白眼'],
      maxNotXisY: 2,
      pauseBeats: ['没说话', '没有说话', '没接话', '没有回答', '没有声音', '沉默', '过了很久', '好一会儿', '过了一会儿', '停了一下', '顿了顿', '“嗯。”'],
      maxPauseBeats: 3,
      maxScenes: 3,
      crossEraCheck: true,
      locationEraCheck: true,
      debutCheck: true,
      overdueCheck: true,
    },
  };
}

function emptyData(title?: string): StoryData {
  return {
    project: defaultProject(title),
    chapters: [],
    plotlines: [],
    beats: [],
    characters: [],
    relations: [],
    locations: [],
    events: [],
    foreshadows: [],
    codex: [],
  };
}

/** 防止渲染进程传入的相对路径逃出仓库根目录 */
export function safeJoin(root: string, rel: string): string {
  const full = path.resolve(root, rel);
  const r = path.resolve(root);
  if (full !== r && !full.startsWith(r + path.sep)) throw new Error(`路径越界：${rel}`);
  return full;
}

async function exists(p: string) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(file, 'utf8');
    return JSON.parse(raw.replace(/^﻿/, '')) as T;
  } catch (e: any) {
    if (e?.code === 'ENOENT') return fallback;
    throw new Error(`${path.basename(file)} 解析失败：${e?.message ?? e}`);
  }
}

/** 先写临时文件再改名，避免写到一半崩溃留下坏文件 */
async function writeAtomic(file: string, text: string) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, text, 'utf8');
  await fs.rename(tmp, file);
}

/** 记录本进程刚写过的文件，文件监听时忽略这些“自己的回声” */
const recentWrites = new Map<string, number>();
function markWrite(file: string) {
  recentWrites.set(path.resolve(file), Date.now());
}

export async function openProject(root: string): Promise<OpenResult> {
  const dir = path.join(root, STORY_DIR);
  const initialized = !(await exists(dir));
  const base = emptyData(path.basename(root));
  const data = { ...base } as StoryData;
  for (const name of COLLECTIONS) {
    (data as any)[name] = await readJson(path.join(dir, `${name}.json`), (base as any)[name]);
  }
  // 老文件缺字段时补默认值；保持文件里原有的字段顺序，避免保存时无意义的改动
  const p = data.project as any;
  for (const [k, v] of Object.entries(base.project)) if (p[k] === undefined) p[k] = v;
  for (const [k, v] of Object.entries(base.project.guard)) if (p.guard[k] === undefined) p.guard[k] = v;
  if (initialized) {
    for (const name of COLLECTIONS) await saveCollection(root, name, (data as any)[name]);
  }
  return { root, data, initialized };
}

export async function saveCollection(root: string, name: CollectionName, value: unknown) {
  if (!COLLECTIONS.includes(name)) throw new Error(`未知集合：${name}`);
  const file = path.join(root, STORY_DIR, `${name}.json`);
  markWrite(file);
  await writeAtomic(file, JSON.stringify(value, null, 2) + '\n');
}

export function chapterPath(pattern: string, num: number) {
  return pattern.replace('{NN}', String(num).padStart(2, '0')).replace('{N}', String(num));
}

async function pattern(root: string) {
  const p = await readJson<Project | null>(path.join(root, STORY_DIR, 'project.json'), null);
  return p?.chapterFilePattern ?? 'chapters/chap{NN}.md';
}

/** 读出所有已存在的章节正文 */
export async function readChapters(root: string): Promise<Record<number, string>> {
  const pat = await pattern(root);
  const dir = safeJoin(root, path.dirname(pat));
  const out: Record<number, string> = {};
  let files: string[] = [];
  try {
    files = await fs.readdir(dir);
  } catch {
    return out;
  }
  const base = path.basename(pat).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace('\\{NN\\}', '(\\d+)').replace('\\{N\\}', '(\\d+)');
  const re = new RegExp(`^${base}$`);
  await Promise.all(
    files.map(async (f) => {
      const m = f.match(re);
      if (!m) return;
      out[Number(m[1])] = (await fs.readFile(path.join(dir, f), 'utf8')).replace(/^﻿/, '');
    }),
  );
  return out;
}

export async function readChapter(root: string, num: number): Promise<string | null> {
  try {
    return (await fs.readFile(safeJoin(root, chapterPath(await pattern(root), num)), 'utf8')).replace(/^﻿/, '');
  } catch {
    return null;
  }
}

export async function writeChapter(root: string, num: number, text: string) {
  const file = safeJoin(root, chapterPath(await pattern(root), num));
  markWrite(file);
  await writeAtomic(file, text);
}

export async function chapterFiles(root: string, nums: number[]): Promise<ChapterFileInfo[]> {
  const pat = await pattern(root);
  return Promise.all(
    nums.map(async (num) => {
      const rel = chapterPath(pat, num);
      try {
        const st = await fs.stat(safeJoin(root, rel));
        return { num, path: rel, exists: true, mtime: st.mtimeMs };
      } catch {
        return { num, path: rel, exists: false };
      }
    }),
  );
}

/** 仓库里的 markdown 文档（设定集、大纲等），只列根目录和 story/context 下的 */
export async function listDocs(root: string): Promise<string[]> {
  const out: string[] = [];
  for (const f of await fs.readdir(root)) if (f.toLowerCase().endsWith('.md')) out.push(f);
  try {
    for (const f of await fs.readdir(path.join(root, STORY_DIR, 'context')))
      if (f.endsWith('.md')) out.push(`${STORY_DIR}/context/${f}`);
  } catch {}
  return out.sort();
}

export async function readDoc(root: string, rel: string): Promise<string | null> {
  try {
    return (await fs.readFile(safeJoin(root, rel), 'utf8')).replace(/^﻿/, '');
  } catch {
    return null;
  }
}

export async function writeDoc(root: string, rel: string, text: string) {
  if (!rel.endsWith('.md')) throw new Error('只能写 .md 文档');
  const file = safeJoin(root, rel);
  markWrite(file);
  await writeAtomic(file, text);
}

/** 监听 story/ 与章节目录，外部（比如 Claude 在终端里改了文件）改动时通知界面重新载入 */
export function watchProject(root: string, onChange: (paths: string[]) => void): () => void {
  const watchers: FSWatcher[] = [];
  let pending = new Set<string>();
  let timer: NodeJS.Timeout | null = null;
  const flush = () => {
    timer = null;
    const list = [...pending];
    pending = new Set();
    if (list.length) onChange(list);
  };
  const handler = (dir: string) => (_ev: string, file: string | Buffer | null) => {
    if (!file) return;
    const name = file.toString();
    if (!/\.(md|json)$/i.test(name)) return;
    const full = path.resolve(dir, name);
    const t = recentWrites.get(full);
    if (t && Date.now() - t < 1500) return;
    pending.add(path.relative(root, full).replace(/\\/g, '/'));
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, 400);
  };
  for (const rel of [STORY_DIR, 'chapters', '.']) {
    const dir = path.join(root, rel);
    try {
      watchers.push(watch(dir, handler(dir)));
    } catch {}
  }
  return () => watchers.forEach((w) => w.close());
}

// ---------- 书架 ----------

const WORD_RE = /[\p{Script=Han}A-Za-z0-9　-〿＀-￯“”‘’—…·]/gu;

async function mtime(p: string) {
  try {
    return (await fs.stat(p)).mtimeMs;
  } catch {
    return 0;
  }
}

/** 书架卡片用的概况：只读 project、chapters 和正文，不初始化目录 */
export async function bookInfo(root: string): Promise<BookInfo> {
  const dir = path.join(root, STORY_DIR);
  if (!(await exists(root))) return { path: root, exists: false, title: path.basename(root), done: 0, planned: 0, words: 0, volumes: 0 };
  const project = await readJson<Partial<Project> | null>(path.join(dir, 'project.json'), null).catch(() => null);
  const chapters = await readJson<{ num: number; status?: string }[]>(path.join(dir, 'chapters.json'), []).catch(() => []);
  const texts = await readChapters(root).catch(() => ({}) as Record<number, string>);
  let words = 0;
  for (const t of Object.values(texts)) words += t.match(WORD_RE)?.length ?? 0;
  const done = chapters.reduce((m, c) => (c.status === 'done' && c.num > m ? c.num : m), 0);
  const vols = project?.volumes ?? [];
  const cur = vols.find((v) => (v.from ?? 1) <= done + 1 && done + 1 <= (v.to ?? Infinity)) ?? vols[vols.length - 1];
  let updatedAt = await mtime(dir);
  for (const name of COLLECTIONS) updatedAt = Math.max(updatedAt, await mtime(path.join(dir, `${name}.json`)));
  const pat = project?.chapterFilePattern ?? 'chapters/chap{NN}.md';
  updatedAt = Math.max(updatedAt, await mtime(safeJoin(root, path.dirname(pat))));
  return {
    path: root,
    exists: true,
    title: project?.title || path.basename(root),
    logline: project?.logline,
    done,
    planned: chapters.length,
    words,
    volumes: vols.length,
    currentVolume: cur?.name,
    updatedAt: updatedAt || undefined,
  };
}

const BAD_NAME = /[\/:*?"<>|]/g;

/** 在 parent 下新建一本书：story/ 初始化，再放上设定集、大纲、进度和给 Claude 看的说明 */
export async function createBook(parent: string, title: string): Promise<string> {
  const name = title.trim().replace(BAD_NAME, '').replace(/\s+/g, ' ');
  if (!name) throw new Error('书名不能为空');
  const root = path.join(parent, name);
  if (await exists(root)) {
    const entries = await fs.readdir(root);
    if (entries.length) throw new Error(`“${name}”这个目录已经存在，而且不是空的`);
  }
  await fs.mkdir(path.join(root, 'chapters'), { recursive: true });
  const { data } = await openProject(root);
  data.project.title = name;
  await saveCollection(root, 'project', data.project);
  const files: Record<string, string> = {
    'bible.md': `# 《${name}》设定集\n\n> 世界观和规则只写在这里。人物、地点、伏笔、剧情线、章节规划写在 story/，用星图书房维护。\n\n## 1. 总纲\n\n### 1.1 这是一本什么书\n\n### 1.2 全书走向\n\n## 2. 世界\n\n## 3. 人物\n`,
    'outline.md': `# 《${name}》大纲\n\n> 近的章节写到章级（标题加一两句内容），远的只写阶段目标。\n\n## 第一卷：（卷名）（1–60）\n`,
    'progress.md': `# 写作进度\n\n## 1. 进度\n\n- **当前**：还没开写。\n\n## 2. 已写章节\n\n每章一行，格式：\`章号｜标题｜故事第几天｜发生了什么（一句话）\`\n`,
    'CLAUDE.md': `# ${name}\n\n（一两句话说清这本书写什么。）\n\n## 文件\n\n- \`bible.md\`：设定集，世界观和规则的唯一来源\n- \`outline.md\`：大纲\n- \`progress.md\`：写作进度、已写章节\n- \`chapters/\`：正文，每章一个文件 \`chapNN.md\`\n- \`story/\`：桌面软件“星图书房”的结构化数据，人物、关系、地点、伏笔、剧情线、章节规划、世界脉络的唯一来源\n`,
  };
  for (const [rel, text] of Object.entries(files)) {
    const f = path.join(root, rel);
    if (!(await exists(f))) await fs.writeFile(f, text);
  }
  return root;
}
