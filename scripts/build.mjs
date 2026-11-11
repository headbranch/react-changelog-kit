// Builds lib/module (ESM), lib/commonjs (CJS) and lib/typescript (.d.ts) from src/ with tsc.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc');
const lib = join(root, 'lib');

function run(args) {
  execFileSync(process.execPath, [tsc, '-p', join(root, 'tsconfig.build.json'), ...args], { stdio: 'inherit', cwd: root });
}

rmSync(lib, { recursive: true, force: true });
run(['--module', 'ESNext', '--outDir', join(lib, 'module')]);
run(['--module', 'CommonJS', '--outDir', join(lib, 'commonjs')]);
run(['--declaration', '--emitDeclarationOnly', '--sourceMap', 'false', '--declarationMap', '--outDir', join(lib, 'typescript')]);

// Mark each output folder's module format so Node resolves the `import`/`require` exports correctly.
for (const [dir, type] of [['module', 'module'], ['commonjs', 'commonjs']]) {
  mkdirSync(join(lib, dir), { recursive: true });
  writeFileSync(join(lib, dir, 'package.json'), JSON.stringify({ type }) + '\n');
}
// tsc keeps `.ts` specifiers in declaration files; point them at the emitted .d.ts files via `.js`.
for (const file of readdirSync(join(lib, 'typescript'), { recursive: true })) {
  if (!String(file).endsWith('.d.ts')) continue;
  const path = join(lib, 'typescript', String(file));
  const source = readFileSync(path, 'utf8');
  writeFileSync(path, source.replace(/(from\s+['"]\.{1,2}\/[^'"]+)\.ts(['"])/g, '$1.js$2'));
}

console.log('Built lib/module, lib/commonjs, lib/typescript');
