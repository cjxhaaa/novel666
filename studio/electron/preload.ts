import { contextBridge, ipcRenderer } from 'electron';

const call = (ch: string) => (...args: unknown[]) => ipcRenderer.invoke(`studio:${ch}`, ...args);

contextBridge.exposeInMainWorld('studioNative', {
  getRoot: call('getRoot'),
  pickRoot: call('pickRoot'),
  open: call('open'),
  save: call('save'),
  readChapters: call('readChapters'),
  readChapter: call('readChapter'),
  writeChapter: call('writeChapter'),
  readDoc: call('readDoc'),
  writeDoc: call('writeDoc'),
  listDocs: call('listDocs'),
  onExternalChange(cb: (paths: string[]) => void) {
    const h = (_e: unknown, paths: string[]) => cb(paths);
    ipcRenderer.on('studio:changed', h);
    return () => ipcRenderer.removeListener('studio:changed', h);
  },
  platform: 'electron',
});
