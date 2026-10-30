import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { promises as fs, existsSync } from 'node:fs';
import path from 'node:path';
import * as store from '../shared/storage';

const DEV_URL = process.env.VITE_DEV_SERVER_URL;
let win: BrowserWindow | null = null;
let root: string | null = null;
let unwatch: (() => void) | null = null;

const configFile = () => path.join(app.getPath('userData'), 'config.json');

interface Config {
  root?: string;
  /** 书架上的书，最近打开的在前 */
  library?: string[];
}

let cfg: Config = {};

async function loadConfig(): Promise<Config> {
  try {
    return JSON.parse(await fs.readFile(configFile(), 'utf8'));
  } catch {
    return {};
  }
}

async function saveConfig() {
  await fs.mkdir(path.dirname(configFile()), { recursive: true });
  await fs.writeFile(configFile(), JSON.stringify(cfg, null, 2));
}

const same = (a: string, b: string) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

/** 放上书架；front 为真时挪到最前 */
function shelve(p: string, front = false) {
  const rest = (cfg.library ?? []).filter((x) => !same(x, p));
  const had = rest.length !== (cfg.library ?? []).length;
  cfg.library = front || !had ? [p, ...rest] : cfg.library;
}

/** 首次启动时，如果软件就放在小说仓库的 studio/ 里，直接打开上一级目录 */
function guessRoot(): string | null {
  const candidates = [process.env.STUDIO_ROOT, path.resolve(app.getAppPath(), '..'), process.cwd(), path.resolve(process.cwd(), '..')];
  for (const c of candidates) {
    if (c && (existsSync(path.join(c, 'story')) || existsSync(path.join(c, 'bible.md')))) return c;
  }
  return null;
}

function setRoot(r: string | null) {
  root = r;
  unwatch?.();
  unwatch = null;
  if (r) unwatch = store.watchProject(r, (paths) => win?.webContents.send('studio:changed', paths));
}

function need(): string {
  if (!root) throw new Error('还没有打开小说项目');
  return root;
}

function createWindow() {
  win = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#080b16',
    title: '星图书房',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#00000000', symbolColor: '#c9cfe6', height: 38 },
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  win.once('ready-to-show', () => win?.show());
  // 自检用：STUDIO_SNAPSHOT=xxx.png 时，载入后截一张图并退出
  const snap = process.env.STUDIO_SNAPSHOT;
  if (snap) {
    win.webContents.once('did-finish-load', () =>
      setTimeout(async () => {
        const img = await win!.webContents.capturePage();
        await fs.writeFile(snap, img.toPNG());
        app.quit();
      }, 3000),
    );
  }
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  if (DEV_URL) win.loadURL(DEV_URL);
  else win.loadFile(path.join(__dirname, '../dist/index.html'));
}

ipcMain.handle('studio:getRoot', () => root);
ipcMain.handle('studio:pickRoot', async () => {
  const res = await dialog.showOpenDialog(win!, {
    title: '选择小说仓库目录',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (res.canceled || !res.filePaths[0]) return null;
  setRoot(res.filePaths[0]);
  cfg.root = res.filePaths[0];
  shelve(res.filePaths[0], true);
  await saveConfig();
  return root;
});
ipcMain.handle('studio:listBooks', () => Promise.all((cfg.library ?? []).map((p) => store.bookInfo(p))));
ipcMain.handle('studio:openBook', async (_e, p: string) => {
  if (!existsSync(p)) throw new Error('这本书的目录找不到了：' + p);
  setRoot(p);
  cfg.root = p;
  shelve(p, true);
  await saveConfig();
});
ipcMain.handle('studio:addBook', async () => {
  const res = await dialog.showOpenDialog(win!, { title: '选择一本小说的目录', properties: ['openDirectory'] });
  const p = res.filePaths[0];
  if (res.canceled || !p) return null;
  shelve(p);
  await saveConfig();
  return p;
});
ipcMain.handle('studio:createBook', async (_e, title: string) => {
  const res = await dialog.showOpenDialog(win!, { title: `把《${title}》放在哪个目录下`, properties: ['openDirectory', 'createDirectory'] });
  const parent = res.filePaths[0];
  if (res.canceled || !parent) return null;
  const p = await store.createBook(parent, title);
  shelve(p, true);
  await saveConfig();
  return p;
});
ipcMain.handle('studio:removeBook', async (_e, p: string) => {
  cfg.library = (cfg.library ?? []).filter((x) => !same(x, p));
  if (root && same(root, p)) {
    setRoot(null);
    cfg.root = undefined;
  }
  await saveConfig();
});
ipcMain.handle('studio:open', async () => (root ? store.openProject(root) : null));
ipcMain.handle('studio:save', (_e, name, value) => store.saveCollection(need(), name, value));
ipcMain.handle('studio:readChapters', () => store.readChapters(need()));
ipcMain.handle('studio:readChapter', (_e, n: number) => store.readChapter(need(), n));
ipcMain.handle('studio:writeChapter', (_e, n: number, t: string) => store.writeChapter(need(), n, t));
ipcMain.handle('studio:readDoc', (_e, rel: string) => store.readDoc(need(), rel));
ipcMain.handle('studio:writeDoc', (_e, rel: string, t: string) => store.writeDoc(need(), rel, t));
ipcMain.handle('studio:listDocs', () => store.listDocs(need()));

app.whenReady().then(async () => {
  cfg = await loadConfig();
  const r = cfg.root && existsSync(cfg.root) ? cfg.root : guessRoot();
  // 老版本只记一个目录：第一次启动时把它放上书架
  if (!cfg.library) {
    cfg.library = r ? [r] : [];
    await saveConfig();
  }
  setRoot(r);
  createWindow();
});

app.on('window-all-closed', () => {
  unwatch?.();
  app.quit();
});
