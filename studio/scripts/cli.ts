// 星图书房的命令行入口，不开界面也能用。写作时 Claude 在终端里调用：
//   node studio/scripts/cli.mjs context 31     生成第 31 章的写作上下文 → story/context/chap31.md
//   node studio/scripts/cli.mjs guard 31       检查第 31 章（不带章号则检查全部）
//   node studio/scripts/cli.mjs ignore <key>   把确认过的误报标为“确认无误”
import path from 'node:path';
import { openProject, readChapters, readDoc, saveCollection, writeDoc } from '../shared/storage';
import { contextPack, RULES, runGuard, scanMentions } from '../src/lib/analysis';
import { sourceDocs } from '../src/lib/docs';

async function load(root: string) {
  const { data } = await openProject(root);
  const texts = await readChapters(root);
  const docs: Record<string, string> = {};
  for (const d of sourceDocs(data.codex)) {
    const t = await readDoc(root, d);
    if (t != null) docs[d] = t;
  }
  const charM = scanMentions(data.characters, texts);
  const locM = scanMentions(data.locations, texts);
  return { data, texts, docs, charM, locM };
}

async function main() {
  const args = process.argv.slice(2);
  const rootIdx = args.indexOf('--root');
  const root = rootIdx >= 0 ? path.resolve(args.splice(rootIdx, 2)[1]) : path.resolve(process.env.STUDIO_CLI_DIR ?? '.', '..');
  const [cmd, arg] = args;
  const n = arg ? parseInt(arg, 10) : undefined;

  if (cmd === 'context' && n) {
    const p = await load(root);
    const md = contextPack(p.data, p.texts, p.charM, p.locM, n, p.docs);
    const rel = `story/context/chap${String(n).padStart(2, '0')}.md`;
    if (args.includes('--stdout')) process.stdout.write(md + '\n');
    else {
      await writeDoc(root, rel, md);
      console.log(`已生成 ${rel}（${md.length} 字符）`);
    }
    return;
  }

  if (cmd === 'guard') {
    const p = await load(root);
    const all = runGuard(p.data, p.texts, p.charM, p.locM, p.docs).filter((i) => n == null || i.chapter === n || i.chapter == null);
    const issues = all.filter((i) => !i.ignored);
    const mark = { error: '✗', warn: '!', info: '·' } as const;
    for (const i of issues) {
      const where = i.chapter ? `第${i.chapter}章` : '全局';
      console.log(`${mark[i.severity]} [${RULES[i.rule]?.name ?? i.rule}] ${where}：${i.title}　〔${i.key}〕`);
      if (i.detail) console.log(`    ${i.detail}`);
      if (i.snip) console.log(`    第 ${i.snip.line} 行：…${i.snip.before}【${i.snip.hit}】${i.snip.after}…`);
    }
    const err = issues.filter((i) => i.severity === 'error').length;
    const warn = issues.filter((i) => i.severity === 'warn').length;
    const skipped = all.length - issues.length;
    console.log(`\n共 ${issues.length} 条：错误 ${err}，提醒 ${warn}，提示 ${issues.length - err - warn}${skipped ? `；另有 ${skipped} 条已确认无误，未列出` : ''}`);
    return;
  }

  if (cmd === 'ignore' || cmd === 'unignore') {
    const keys = args.slice(1);
    if (!keys.length) throw new Error('请给出守卫提醒的 key（guard 输出里〔〕中的内容）');
    const { data } = await openProject(root);
    const set = new Set(data.project.guard.ignored ?? []);
    for (const k of keys) cmd === 'ignore' ? set.add(k) : set.delete(k);
    data.project.guard.ignored = [...set].sort();
    await saveCollection(root, 'project', data.project);
    console.log(`${cmd === 'ignore' ? '已确认无误' : '已取消确认'}：${keys.join('、')}`);
    return;
  }

  console.log(`用法：
  node studio/scripts/cli.mjs context <章号> [--stdout]   生成写作上下文到 story/context/chapNN.md
  node studio/scripts/cli.mjs guard [章号]                 运行设定守卫（不带章号检查全部）
  node studio/scripts/cli.mjs ignore <key...>             把误报标为“确认无误”（key 见 guard 输出的〔〕）
  node studio/scripts/cli.mjs unignore <key...>           取消确认
  可选：--root <小说仓库目录>，默认是 studio 的上一级`);
  process.exitCode = cmd ? 1 : 0;
}

main().catch((e) => {
  console.error(e?.message ?? e);
  process.exitCode = 1;
});
