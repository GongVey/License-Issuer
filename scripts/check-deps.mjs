// Fails fast with a clear message when package.json lists a dependency that node_modules does not have
// (typically after `git pull` brought in a new package but `npm install` was not run yet).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const missing = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })
  .filter(name => !existsSync(join(root, 'node_modules', ...name.split('/'), 'package.json')));
if (missing.length) {
  console.error(`\n缺少依赖：${missing.join('、')}\n代码更新后新增了依赖包，请先在项目目录运行 npm install（或 npm ci）后再试。\n`);
  process.exit(1);
}
