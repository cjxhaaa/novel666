// 地点层级：类型说明、层级路径、地图上的图形
import type { Location, LocationKind } from '../../shared/types';

export interface KindMeta {
  label: string;
  glyph: string;
  /** 可以“进入”看下一层地图 */
  container: boolean;
  /** 在上级地图上画成一片区域（有范围半径 r） */
  area: boolean;
}

export const KINDS: Record<LocationKind, KindMeta> = {
  world: { label: '天下', glyph: '天', container: true, area: false },
  realm: { label: '界', glyph: '界', container: true, area: false },
  continent: { label: '大陆', glyph: '洲', container: true, area: true },
  sea: { label: '海域', glyph: '海', container: true, area: false },
  region: { label: '地域', glyph: '域', container: true, area: true },
  nation: { label: '国度', glyph: '国', container: true, area: true },
  sect: { label: '宗门', glyph: '宗', container: true, area: true },
  clan: { label: '世家', glyph: '家', container: true, area: true },
  faction: { label: '势力', glyph: '势', container: true, area: true },
  secret: { label: '秘境', glyph: '秘', container: true, area: false },
  city: { label: '城镇', glyph: '城', container: true, area: false },
  village: { label: '村落', glyph: '村', container: true, area: false },
  site: { label: '地点', glyph: '·', container: false, area: false },
};

export const KIND_ORDER = Object.keys(KINDS) as LocationKind[];

export function kindOfLoc(l: Location): LocationKind {
  return l.kind ?? 'site';
}

/** 从顶层到 l 的路径（含 l 自己） */
export function pathOf(l: Location | undefined, byId: Map<string, Location>): Location[] {
  const out: Location[] = [];
  const seen = new Set<string>();
  let cur = l;
  while (cur && !seen.has(cur.id)) {
    out.unshift(cur);
    seen.add(cur.id);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return out;
}

/** “北荒 › 青云山 › 落星亭”，不含最顶层的“天下” */
export function pathLabel(l: Location, byId: Map<string, Location>) {
  return pathOf(l, byId)
    .filter((x) => kindOfLoc(x) !== 'world')
    .map((x) => x.name)
    .join(' › ');
}

export function childrenOf(locations: Location[], parentId: string | null) {
  return locations.filter((l) => (parentId ? l.parentId === parentId : !l.parentId));
}

/** 判断 a 是否是 b 的祖先（防止把地点挂到自己的下级下面） */
export function isAncestor(a: string, b: Location | undefined, byId: Map<string, Location>) {
  for (let cur = b; cur; cur = cur.parentId ? byId.get(cur.parentId) : undefined) if (cur.id === a) return true;
  return false;
}

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** 按 id 生成一块固定形状的“陆地”轮廓（平滑的不规则圆） */
export function blobPath(id: string, cx: number, cy: number, r: number, rough = 0.22) {
  let seed = hash(id) || 1;
  const rnd = () => ((seed = (Math.imul(seed, 48271) >>> 0) % 2147483647) / 2147483647);
  const n = 14;
  const k1 = rnd() * Math.PI * 2;
  const k2 = rnd() * Math.PI * 2;
  const pts = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const w = 1 + rough * (0.5 * Math.sin(a * 2 + k1) + 0.3 * Math.sin(a * 3 + k2) + 0.5 * (rnd() - 0.5));
    return [cx + Math.cos(a) * r * w * 1.12, cy + Math.sin(a) * r * w * 0.92] as const;
  });
  // Catmull-Rom 转三次贝塞尔，闭合
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d + 'Z';
}

/** 程序生成的等高线，同一个种子每次一样 */
export function contours(seedStr: string, peaks: { x: number; y: number; r: number }[]) {
  let seed = hash(seedStr) || 7;
  const rnd = () => ((seed = (Math.imul(seed, 48271) >>> 0) % 2147483647) / 2147483647);
  const paths: { d: string; o: number }[] = [];
  for (const p of peaks) {
    for (let k = 1; k <= 6; k++) {
      const r = (p.r * k) / 6;
      const n = 28;
      const wob = Array.from({ length: n }, () => 0.82 + rnd() * 0.32);
      const pts: string[] = [];
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2;
        const w = wob[i % n];
        pts.push(`${(p.x + Math.cos(a) * r * w * 1.25).toFixed(1)},${(p.y + Math.sin(a) * r * w * 0.8).toFixed(1)}`);
      }
      paths.push({ d: `M${pts.join('L')}Z`, o: 0.05 + (6 - k) * 0.02 });
    }
  }
  return paths;
}
