// 先用 esbuild 把 cli.ts 打成一个文件，再运行它。需要先在 studio/ 里 npm install。
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const studio = path.resolve(here, '..');
const out = path.join(studio, 'node_modules', '.cache', 'studio-cli.mjs');

await build({
  entryPoints: [path.join(here, 'cli.ts')],
  outfile: out,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  logLevel: 'error',
});
process.env.STUDIO_CLI_DIR = studio;
await import(pathToFileURL(out).href);
