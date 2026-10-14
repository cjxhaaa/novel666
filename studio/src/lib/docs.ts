// 设定条目可以引用 markdown 文档里的某一节（比如 bible.md 的“2.1 第一卷的规则”），
// 这样世界观只在 bible.md 里写一份，软件里看到的永远是最新的。
import type { CodexEntry } from '../../shared/types';

const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;

/** 取出某个标题下面的正文，到下一个标题（任意级别）为止 */
export function extractSection(md: string, heading: string): string | null {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const want = heading.trim();
  const start = lines.findIndex((l) => HEADING.exec(l)?.[2].trim() === want);
  if (start < 0) return null;
  let end = start + 1;
  while (end < lines.length && !HEADING.test(lines[end])) end++;
  return lines.slice(start + 1, end).join('\n').trim();
}

export function headingsOf(md: string): string[] {
  return md
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => HEADING.exec(l)?.[2].trim())
    .filter((h): h is string => !!h);
}

/** 条目的实际内容；引用失效时 broken 为 true */
export function resolveCodex(e: CodexEntry, docs: Record<string, string>): { body: string; broken: boolean } {
  if (!e.source) return { body: e.body, broken: false };
  const md = docs[e.source.doc];
  if (md == null) return { body: e.body, broken: false }; // 文档还没读进来
  const sec = extractSection(md, e.source.heading);
  return sec == null ? { body: e.body, broken: true } : { body: sec, broken: false };
}

export function sourceDocs(codex: CodexEntry[]) {
  return [...new Set(codex.map((e) => e.source?.doc).filter((d): d is string => !!d))];
}
