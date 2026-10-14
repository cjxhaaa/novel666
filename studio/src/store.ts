import { create } from 'zustand';
import { produce, type Draft } from 'immer';
import type { CollectionName, StoryData } from '../shared/types';
import { api } from './api';
import { sourceDocs } from './lib/docs';

export type View =
  | 'dashboard'
  | 'plot'
  | 'chapters'
  | 'characters'
  | 'locations'
  | 'timeline'
  | 'foreshadow'
  | 'codex'
  | 'guard';

export interface Selection {
  chapter?: number;
  character?: string;
  location?: string;
  codex?: string;
  /** 设定页当前打开的大类 */
  codexCat?: string;
  foreshadow?: string;
  event?: string;
  doc?: string;
  /** 打开文档时滚动到的小节 */
  heading?: string;
}

interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'ok' | 'error';
}

interface UndoEntry {
  name: CollectionName;
  value: unknown;
  label: string;
}

interface State {
  status: 'loading' | 'noroot' | 'ready' | 'error';
  error?: string;
  root: string | null;
  data: StoryData;
  texts: Record<number, string>;
  /** 设定条目引用的文档内容，键为相对路径 */
  docs: Record<string, string>;
  /** 正文改了还没写盘的章 */
  dirtyTexts: Record<number, true>;
  view: View;
  sel: Selection;
  /** 全局“当前章”：人物状态、关系等按这一章计算 */
  cursor: number;
  pending: number;
  toasts: Toast[];
  paletteOpen: boolean;
  contextFor: number | null;
  undoStack: UndoEntry[];

  load(): Promise<void>;
  loadDocs(paths: string[]): Promise<void>;
  pickRoot(): Promise<void>;
  onExternalChange(paths: string[]): Promise<void>;
  mutate<K extends CollectionName>(name: K, recipe: (draft: Draft<StoryData[K]>) => void, label?: string): void;
  undo(): void;
  setText(num: number, text: string): void;
  saveText(num: number): Promise<void>;
  go(view: View, sel?: Selection): void;
  select(sel: Selection): void;
  setCursor(n: number): void;
  toast(text: string, kind?: Toast['kind']): void;
  setPalette(open: boolean): void;
  openContext(n: number | null): void;
}

const empty: StoryData = {
  project: {
    version: 1,
    title: '',
    eras: [],
    chapterKinds: [],
    volumes: [],
    stages: [],
    chapterFilePattern: 'chapters/chap{NN}.md',
    guard: { bannedPhrases: [], maxNotXisY: 2, pauseBeats: [], maxPauseBeats: 3, maxScenes: 3, crossEraCheck: true, locationEraCheck: true, debutCheck: true, overdueCheck: true },
  },
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

const saveTimers: Partial<Record<CollectionName, ReturnType<typeof setTimeout>>> = {};
const dirty = new Set<CollectionName>();
const textTimers: Record<number, ReturnType<typeof setTimeout>> = {};
let toastSeq = 0;

function latestDone(data: StoryData) {
  let n = 0;
  for (const c of data.chapters) if (c.status === 'done' && c.num > n) n = c.num;
  return n;
}

export const useStore = create<State>((set, get) => {
  const scheduleSave = (name: CollectionName) => {
    dirty.add(name);
    if (saveTimers[name]) clearTimeout(saveTimers[name]);
    set((s) => ({ pending: s.pending + (saveTimers[name] ? 0 : 1) }));
    saveTimers[name] = setTimeout(async () => {
      delete saveTimers[name];
      try {
        await api.save(name, get().data[name] as any);
        dirty.delete(name);
      } catch (e: any) {
        get().toast(`保存 ${name} 失败：${e?.message ?? e}`, 'error');
      } finally {
        set((s) => ({ pending: Math.max(0, s.pending - 1) }));
      }
    }, 450);
  };

  return {
    status: 'loading',
    root: null,
    data: empty,
    texts: {},
    docs: {},
    dirtyTexts: {},
    view: 'dashboard',
    sel: {},
    cursor: 1,
    pending: 0,
    toasts: [],
    paletteOpen: false,
    contextFor: null,
    undoStack: [],

    async load() {
      try {
        const root = await api.getRoot();
        if (!root) return set({ status: 'noroot' });
        const res = await api.open();
        if (!res) return set({ status: 'noroot' });
        const texts = await api.readChapters();
        const done = latestDone(res.data);
        set({
          status: 'ready',
          root: res.root,
          data: res.data,
          texts,
          cursor: Math.max(1, done + 1),
          sel: { chapter: Math.max(1, done + 1) },
        });
        await get().loadDocs(sourceDocs(res.data.codex));
        if (res.initialized) get().toast('已在 story/ 目录初始化新项目', 'ok');
      } catch (e: any) {
        set({ status: 'error', error: String(e?.message ?? e) });
      }
    },

    async loadDocs(paths) {
      const entries = await Promise.all(paths.map(async (p) => [p, await api.readDoc(p)] as const));
      const docs = { ...get().docs };
      for (const [p, t] of entries) if (t != null) docs[p] = t;
      set({ docs });
    },

    async pickRoot() {
      const r = await api.pickRoot();
      if (r) {
        set({ status: 'loading', undoStack: [] });
        await get().load();
      }
    },

    async onExternalChange(paths) {
      const s = get();
      if (s.status !== 'ready') return;
      const story = paths.filter((p) => p.startsWith('story/') && p.endsWith('.json'));
      const chDir = s.data.project.chapterFilePattern.split('/').slice(0, -1).join('/');
      const chapters = paths.filter((p) => p.endsWith('.md') && p.startsWith(chDir + '/'));
      const docs = paths.filter((p) => p in s.docs);
      if (docs.length) await get().loadDocs(docs);
      if (story.length) {
        const res = await api.open();
        if (res) {
          const next = { ...get().data };
          for (const p of story) {
            const name = p.slice(6, -5) as CollectionName;
            if (name in res.data && !dirty.has(name)) (next as any)[name] = (res.data as any)[name];
          }
          set({ data: next });
        }
      }
      if (chapters.length) {
        const texts = await api.readChapters();
        const keep = get().dirtyTexts;
        const merged = { ...texts };
        for (const k of Object.keys(keep)) merged[+k] = get().texts[+k];
        set({ texts: merged });
      }
      if (story.length || chapters.length || docs.length) get().toast(`外部改动已同步：${paths.slice(0, 3).join('、')}${paths.length > 3 ? ' 等' : ''}`);
    },

    mutate(name, recipe, label = '编辑') {
      const prev = get().data[name];
      const next = produce(prev, recipe as any);
      if (next === prev) return;
      set((s) => ({
        data: { ...s.data, [name]: next },
        undoStack: [...s.undoStack.slice(-99), { name, value: prev, label }],
      }));
      scheduleSave(name);
    },

    undo() {
      const stack = get().undoStack;
      const last = stack[stack.length - 1];
      if (!last) return get().toast('没有可撤销的操作');
      set((s) => ({ data: { ...s.data, [last.name]: last.value }, undoStack: stack.slice(0, -1) }));
      scheduleSave(last.name);
      get().toast(`已撤销：${last.label}`);
    },

    setText(num, text) {
      set((s) => ({ texts: { ...s.texts, [num]: text }, dirtyTexts: { ...s.dirtyTexts, [num]: true } }));
      clearTimeout(textTimers[num]);
      textTimers[num] = setTimeout(() => get().saveText(num), 1500);
    },

    async saveText(num) {
      clearTimeout(textTimers[num]);
      if (!get().dirtyTexts[num]) return;
      try {
        await api.writeChapter(num, get().texts[num] ?? '');
        set((s) => {
          const d = { ...s.dirtyTexts };
          delete d[num];
          return { dirtyTexts: d };
        });
      } catch (e: any) {
        get().toast(`第 ${num} 章保存失败：${e?.message ?? e}`, 'error');
      }
    },

    go(view, sel) {
      set((s) => ({ view, sel: sel ? { ...s.sel, ...sel } : s.sel, paletteOpen: false }));
    },
    select(sel) {
      set((s) => ({ sel: { ...s.sel, ...sel } }));
    },
    setCursor(n) {
      set({ cursor: n });
    },
    toast(text, kind = 'info') {
      const id = ++toastSeq;
      set((s) => ({ toasts: [...s.toasts, { id, text, kind }] }));
      setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), kind === 'error' ? 6000 : 2800);
    },
    setPalette(open) {
      set({ paletteOpen: open });
    },
    openContext(n) {
      set({ contextFor: n });
    },
  };
});

export function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
