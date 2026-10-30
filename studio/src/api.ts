import type { StudioApi } from '../shared/types';

declare global {
  interface Window {
    studioNative?: StudioApi;
  }
}

async function post<T>(op: string, body: unknown = {}): Promise<T> {
  const res = await fetch(`/__studio/${op}`, { method: 'POST', body: JSON.stringify(body) });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error ?? `请求失败：${op}`);
  return json as T;
}

/** 浏览器开发预览：走 Vite 开发服务器的 /__studio 接口 */
const webApi: StudioApi = {
  getRoot: () => post('getRoot'),
  pickRoot: async () => {
    alert('浏览器预览模式下无法切换目录，请在桌面端使用。');
    return null;
  },
  open: () => post('open'),
  save: (name, value) => post('save', { name, value }),
  readChapters: () => post('readChapters'),
  readChapter: (num) => post('readChapter', { num }),
  writeChapter: (num, text) => post('writeChapter', { num, text }),
  readDoc: (rel) => post('readDoc', { rel }),
  writeDoc: (rel, text) => post('writeDoc', { rel, text }),
  listDocs: () => post('listDocs'),
  listBooks: () => post('listBooks'),
  openBook: (path) => post('openBook', { path }),
  addBook: async () => {
    alert('浏览器预览模式下不能添加书，请在桌面端使用。');
    return null;
  },
  createBook: async () => {
    alert('浏览器预览模式下不能新建书，请在桌面端使用。');
    return null;
  },
  removeBook: async () => {
    alert('浏览器预览模式下不能改书架，请在桌面端使用。');
  },
  onExternalChange(cb) {
    const hot = import.meta.hot;
    if (!hot) return () => {};
    const h = (paths: string[]) => cb(paths);
    hot.on('studio:changed', h);
    return () => hot.off?.('studio:changed', h);
  },
  platform: 'web',
};

export const api: StudioApi = window.studioNative ?? webApi;
