// 星图书房（Star Atlas Studio）的数据模型。
// 所有数据以 JSON 存在小说仓库的 story/ 目录下，一个集合一个文件，方便 git 对比，也方便 Claude 直接读取。

export type ID = string;

/** 时代。跨时空小说里，人物、地点、事件都可以归属某个时代；null 表示两边通用。 */
export interface Era {
  id: ID;
  name: string; // 短名，如“古”
  label: string; // 长名，如“古代 · 青云历 32000 年”
  year?: number; // 该时代“当下”的纪年，用于世界脉络排序
  color: string;
}

/** 章节类型，如【今】【古】【亭】。eraId 为空表示跨时代（比如子时对话）。 */
export interface ChapterKind {
  id: ID;
  name: string;
  eraId: ID | null;
  color: string;
  description?: string;
}

export interface Volume {
  id: ID;
  name: string; // 第一卷：时空的回音
  from?: number; // 起始章号
  to?: number; // 结束章号（计划）
  summary?: string;
}

/** 卷内阶段，如“阶段一：子时来电（1–8）” */
export interface Stage {
  id: ID;
  volumeId: ID;
  name: string;
  from: number;
  to: number;
  summary?: string;
}

/** 守卫规则的开关与参数 */
export interface GuardSettings {
  bannedPhrases: string[]; // 套话黑名单
  maxNotXisY: number; // “不是……是……”每章上限
  pauseBeats: string[]; // 停顿节拍：“没说话”“过了很久”这类，多了就成了固定节拍
  maxPauseBeats: number; // 停顿节拍每章上限（合计）
  maxScenes: number; // 每章场景数上限（按 --- 分隔计）
  crossEraCheck: boolean; // 配角不出圈
  locationEraCheck: boolean; // 古今地名混用
  debutCheck: boolean; // 未登场先出场
  overdueCheck: boolean; // 伏笔逾期
  /** 作者确认无误的守卫提醒（Issue.key）。出现次数变了会重新提醒。 */
  ignored?: string[];
}

export interface Project {
  version: number;
  title: string;
  subtitle?: string;
  logline?: string;
  tone?: string;
  eras: Era[];
  chapterKinds: ChapterKind[];
  volumes: Volume[];
  stages: Stage[];
  /** 章节正文文件路径模板，{NN} 为两位章号，{N} 为原始章号 */
  chapterFilePattern: string;
  /** 故事内日历的单位说明，如“故事第 N 天” */
  calendarLabel?: string;
  /** 故事日历上的关键日子 */
  keyDays?: { day: number; label: string; eraId?: ID | null }[];
  guard: GuardSettings;
  /** 地图背景图（相对仓库根目录），可空 */
  mapImage?: string;
}

export type ChapterStatus = 'planned' | 'drafting' | 'done';

export interface Chapter {
  num: number;
  title: string;
  volumeId: ID;
  kind: ID; // ChapterKind.id
  status: ChapterStatus;
  /** 大纲里的计划 */
  plan: string;
  /** 写完后的实际梗概（progress.md 里的那一行） */
  recap?: string;
  /** 故事内时间的原文描述，如“第 4–6 天”“第 1 天子时” */
  days?: string;
  dayStart?: number;
  dayEnd?: number;
  /** 本章出场的视角/主要人物（手动指定，正文扫描会另算） */
  pov?: ID[];
  notes?: string;
}

/** 剧情线（Plottr 式网格的一行） */
export interface Plotline {
  id: ID;
  name: string;
  color: string;
  description?: string;
}

/** 剧情线上的一张卡（网格里的一格），挂在某章上 */
export interface Beat {
  id: ID;
  plotlineId: ID;
  chapter: number;
  text: string;
}

export interface Field {
  key: string;
  value: string;
}

/** 随剧情推进的状态变化，参考 Novelcrafter 的 progressions。 */
export interface Progression {
  chapter: number; // 从这一章起生效
  key: string; // 对应 fields 的 key，或者新 key
  value: string;
}

export interface Character {
  id: ID;
  name: string;
  aliases: string[];
  eraId: ID | null;
  group: string; // 主角 / 现代配角 / 古代配角 / 远期人物
  /** 是否可以跨时代出现（主角为 true）；配角不出圈规则据此判断 */
  crossEra?: boolean;
  /** 计划登场章；在此之前的正文里出现会被守卫提醒 */
  debutChapter?: number;
  color?: string;
  summary?: string; // 一句话
  fields: Field[];
  progressions: Progression[];
  notes?: string;
  /** 关系图里的固定位置（拖动后保存） */
  gx?: number;
  gy?: number;
}

export interface Relation {
  id: ID;
  from: ID;
  to: ID;
  label: string; // 当前（起点）的关系
  progressions: { chapter: number; label: string }[];
  keyChapters?: number[];
  notes?: string;
}

/** 地点的层级类型：天下 › 界 / 大陆 / 海域 › 地域 / 国度 / 宗门 / 世家 / 势力 / 秘境 › 城镇 / 村落 / 地点 */
export type LocationKind =
  | 'world'
  | 'realm'
  | 'continent'
  | 'sea'
  | 'region'
  | 'nation'
  | 'sect'
  | 'clan'
  | 'faction'
  | 'secret'
  | 'city'
  | 'village'
  | 'site';

export interface Location {
  id: ID;
  name: string;
  aliases: string[];
  eraId: ID | null; // null 表示古今同名同地
  /** 古今对照：另一个时代的同一地点 */
  counterpartId?: ID;
  /** 层级类型，缺省当作“地点” */
  kind?: LocationKind;
  /** 上一级地点；没有就是最顶层 */
  parentId?: ID;
  region?: string;
  description: string;
  /** 在上级地图上的坐标，0–1000 的归一化坐标；古今对照的地点通常共用坐标 */
  x?: number;
  y?: number;
  /** 在上级地图上的范围半径（大陆、地域、势力范围），0–1000 坐标系 */
  r?: number;
  /** 草案：还没写进设定集、待作者确认的地点 */
  draft?: boolean;
  notes?: string;
}

export type EventKind = 'history' | 'story' | 'change' | 'future' | 'trace';

/** 世界脉络中的事件。year 为纪年；storyDay 为故事内第几天。 */
export interface WorldEvent {
  id: ID;
  title: string;
  kind: EventKind;
  eraId: ID | null;
  year?: number;
  yearLabel?: string;
  storyDay?: number;
  chapter?: number;
  description: string;
  characters?: ID[];
  locations?: ID[];
  /** 历史改动专用：改之前 / 改之后 */
  before?: string;
  after?: string;
}

export type ForeshadowStatus = 'open' | 'resolved' | 'dropped';

export interface Foreshadow {
  id: ID;
  text: string;
  planted: number[]; // 埋在第几章（可多处）
  payoff: string; // 计划怎么收、在哪收（原文）
  payoffChapters: number[]; // 计划收的章号；远期为空
  status: ForeshadowStatus;
  resolvedIn?: number;
  notes?: string;
}

export interface CodexEntry {
  id: ID;
  category: string;
  title: string;
  /** 自己写的 markdown；有 source 时只作后备，实际内容取自引用的文档 */
  body: string;
  /** 引用某个文档的一节，如 { doc: 'bible.md', heading: '2.1 第一卷的规则' }，避免同一份设定写两遍 */
  source?: { doc: string; heading: string };
  /** 写作必带：生成写作上下文时总是带上 */
  pinned?: boolean;
  tags?: string[];
}

/** 一次性读出的整个项目 */
export interface StoryData {
  project: Project;
  chapters: Chapter[];
  plotlines: Plotline[];
  beats: Beat[];
  characters: Character[];
  relations: Relation[];
  locations: Location[];
  events: WorldEvent[];
  foreshadows: Foreshadow[];
  codex: CodexEntry[];
}

export type CollectionName = keyof StoryData;

export const COLLECTIONS: CollectionName[] = [
  'project',
  'chapters',
  'plotlines',
  'beats',
  'characters',
  'relations',
  'locations',
  'events',
  'foreshadows',
  'codex',
];

export interface ChapterFileInfo {
  num: number;
  path: string; // 相对仓库根目录
  exists: boolean;
  chars?: number;
  mtime?: number;
}

export interface OpenResult {
  root: string;
  data: StoryData;
  /** story/ 目录原本不存在、刚用默认值初始化 */
  initialized: boolean;
}

/** 渲染进程可调用的存储接口；Electron 走 IPC，浏览器开发预览走 HTTP。 */
export interface StudioApi extends ShelfApi {
  getRoot(): Promise<string | null>;
  pickRoot(): Promise<string | null>;
  open(): Promise<OpenResult | null>;
  save<K extends CollectionName>(name: K, value: StoryData[K]): Promise<void>;
  readChapters(): Promise<Record<number, string>>;
  readChapter(num: number): Promise<string | null>;
  writeChapter(num: number, text: string): Promise<void>;
  readDoc(rel: string): Promise<string | null>;
  writeDoc(rel: string, text: string): Promise<void>;
  listDocs(): Promise<string[]>;
  onExternalChange(cb: (paths: string[]) => void): () => void;
  platform: 'electron' | 'web';
}

/** 书架上的一本书：只读的概况，打开以后才载入全部数据 */
export interface BookInfo {
  path: string;
  /** 目录还在不在（搬走、删掉的书仍留在书架上，标成找不到） */
  exists: boolean;
  title: string;
  logline?: string;
  /** 已写完的章数 / 规划的章数 */
  done: number;
  planned: number;
  /** 正文总字数 */
  words: number;
  volumes: number;
  /** 正在写的那一卷 */
  currentVolume?: string;
  /** story/ 和正文里最近一次改动的时间（毫秒） */
  updatedAt?: number;
}

export interface ShelfApi {
  listBooks(): Promise<BookInfo[]>;
  /** 打开书架上的一本，并把它挪到最前 */
  openBook(path: string): Promise<void>;
  /** 选一个已有的小说目录放上书架 */
  addBook(): Promise<string | null>;
  /** 选一个上级目录，在里面新建一本 */
  createBook(title: string): Promise<string | null>;
  /** 只从书架上拿下来，不删文件 */
  removeBook(path: string): Promise<void>;
}
