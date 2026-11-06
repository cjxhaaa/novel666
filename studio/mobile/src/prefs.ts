// 阅读偏好：底色（整个 App 一起换）、字体、字号、行距等，只存在这台手机上。

export type ThemeId = 'night' | 'black' | 'gray' | 'paper' | 'white' | 'green' | 'sepia';

/** 底色。dark 决定系统栏和控件用深色还是浅色；swatch 是设置面板里那个圆点 */
export const THEMES: { id: ThemeId; name: string; bg: string; text: string; dark: boolean }[] = [
  { id: 'night', name: '夜空', bg: '#060913', text: '#e7eaf6', dark: true },
  { id: 'black', name: '纯黑', bg: '#000000', text: '#b9bcc6', dark: true },
  { id: 'gray', name: '青灰', bg: '#2a2e35', text: '#cdd1d8', dark: true },
  { id: 'paper', name: '宣纸', bg: '#efe8d9', text: '#2a241c', dark: false },
  { id: 'white', name: '素白', bg: '#f7f7f5', text: '#222222', dark: false },
  { id: 'green', name: '豆绿', bg: '#cfe6cf', text: '#21321f', dark: false },
  { id: 'sepia', name: '牛皮', bg: '#e6d2ac', text: '#3d2c17', dark: false },
];

export type FontId = 'song' | 'kai' | 'hei';

export const FONTS: { id: FontId; name: string; family: string }[] = [
  { id: 'song', name: '宋体', family: "'Noto Serif CJK SC', 'Source Han Serif SC', 'Songti SC', 'SimSun', serif" },
  { id: 'kai', name: '楷体', family: "'LXGW WenKai', 'KaiTi', 'STKaiti', serif" },
  { id: 'hei', name: '黑体', family: "system-ui, 'MiSans', 'HarmonyOS Sans SC', 'PingFang SC', 'Noto Sans CJK SC', sans-serif" },
];

/** 翻页方式：上下滚动，或者一页一页翻（平移、覆盖、无动画） */
export type TurnMode = 'scroll' | 'slide' | 'cover' | 'none';

export const TURN_OPTS: { v: TurnMode; label: string }[] = [
  { v: 'scroll', label: '上下滚动' },
  { v: 'slide', label: '左右平移' },
  { v: 'cover', label: '覆盖' },
  { v: 'none', label: '无动画' },
];

export interface ReadPrefs {
  font: FontId;
  size: number;
  /** 行高（倍） */
  line: number;
  /** 段落之间的空（em） */
  para: number;
  /** 字间距（em） */
  letter: number;
  /** 左右页边距（px） */
  margin: number;
  indent: boolean;
  bold: boolean;
  /** 阅读时藏起状态栏和导航条 */
  fullscreen: boolean;
  turn: TurnMode;
}

export const DEFAULT_READ: ReadPrefs = { font: 'song', size: 19, line: 1.95, para: 0.9, letter: 0.02, margin: 22, indent: true, bold: false, fullscreen: true, turn: 'scroll' };

export const LIMITS = { size: [14, 30] as const };

export const LINE_OPTS = [
  { v: 1.6, label: '紧' },
  { v: 1.8, label: '较紧' },
  { v: 1.95, label: '适中' },
  { v: 2.2, label: '较松' },
  { v: 2.5, label: '松' },
];
export const PARA_OPTS = [
  { v: 0, label: '无' },
  { v: 0.5, label: '小' },
  { v: 0.9, label: '中' },
  { v: 1.5, label: '大' },
];
export const LETTER_OPTS = [
  { v: 0, label: '无' },
  { v: 0.02, label: '小' },
  { v: 0.06, label: '中' },
  { v: 0.12, label: '大' },
];
export const MARGIN_OPTS = [
  { v: 12, label: '窄' },
  { v: 22, label: '中' },
  { v: 34, label: '宽' },
];

export function loadRead(): ReadPrefs {
  try {
    const saved = JSON.parse(localStorage.getItem('xt:read') ?? 'null');
    // 老版本只存了字号
    const oldSize = Number(localStorage.getItem('xt:font'));
    return { ...DEFAULT_READ, ...(oldSize ? { size: oldSize } : {}), ...saved };
  } catch {
    return DEFAULT_READ;
  }
}

export function saveRead(p: ReadPrefs) {
  try {
    localStorage.setItem('xt:read', JSON.stringify(p));
  } catch {}
}

export function loadTheme(): ThemeId {
  try {
    const t = localStorage.getItem('xt:theme') as ThemeId | null;
    return t && THEMES.some((x) => x.id === t) ? t : 'night';
  } catch {
    return 'night';
  }
}

export function saveTheme(t: ThemeId) {
  try {
    localStorage.setItem('xt:theme', t);
    // 记住最近用的深色和浅色，“日间 / 夜间”一键切换时用
    localStorage.setItem(THEMES.find((x) => x.id === t)?.dark ? 'xt:theme-dark' : 'xt:theme-light', t);
  } catch {}
}

/** 日夜切换的目标：换到上次用的另一类底色 */
export function oppositeTheme(t: ThemeId): ThemeId {
  const dark = THEMES.find((x) => x.id === t)?.dark;
  try {
    const saved = localStorage.getItem(dark ? 'xt:theme-light' : 'xt:theme-dark') as ThemeId | null;
    if (saved && THEMES.some((x) => x.id === saved)) return saved;
  } catch {}
  return dark ? 'paper' : 'night';
}
