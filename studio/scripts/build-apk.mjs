// 打包安卓 App：构建手机端网页 → 拷进安卓工程 → gradle 出调试签名的 apk → 放到 release/xingtu.apk。
// 需要装好 Android Studio（带 Android SDK 和 JDK）。桌面端开着手机同步时，手机扫码就能下载这个安装包。
import { execSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const studio = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const android = path.join(studio, 'mobile', 'android');
const env = { ...process.env };
if (!env.ANDROID_HOME && !env.ANDROID_SDK_ROOT) {
  const guess = process.platform === 'win32' ? path.join(env.LOCALAPPDATA ?? '', 'Android', 'Sdk') : path.join(os.homedir(), 'Library', 'Android', 'sdk');
  if (existsSync(guess)) env.ANDROID_HOME = guess;
}
if (!env.JAVA_HOME) {
  const jbr = 'C:\\Program Files\\Android\\Android Studio\\jbr';
  if (existsSync(jbr)) env.JAVA_HOME = jbr;
}

const run = (cmd, cwd = studio) => execSync(cmd, { cwd, env, stdio: 'inherit' });
run('npx vite build --config mobile/vite.config.ts');
run('npx cap sync android');
run(`"${path.join(android, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew')}" assembleDebug`, android);

const apk = path.join(android, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
mkdirSync(path.join(studio, 'release'), { recursive: true });
copyFileSync(apk, path.join(studio, 'release', 'xingtu.apk'));
console.log('\n安卓安装包：studio/release/xingtu.apk');
