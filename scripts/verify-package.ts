import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const directory = mkdtempSync(join(tmpdir(), 'taskelith-package-'));
const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
const plan = readFileSync('docs/architecture.md', 'utf8');
try {
  const packed = JSON.parse(execFileSync('npm', [
    'pack', '--ignore-scripts', '--json', '--pack-destination', directory,
  ], { encoding: 'utf8' }));
  const pack = Array.isArray(packed) ? packed[0] : packed[manifest.name];
  const expectedFiles = [
    'LICENSE', 'README.md', 'dist/cli.js', 'docs/architecture.md', 'package.json',
  ];
  assert.deepEqual(pack.files.map((file: { path: string }) => file.path).sort(), expectedFiles);
  execFileSync('npm', [
    'install', '--prefix', directory, '--ignore-scripts', '--no-audit', '--no-fund',
    join(directory, pack.filename),
  ], { stdio: 'inherit' });
  const installedRoot = join(directory, 'lib', 'node_modules', manifest.name);
  const packageRoot = existsSync(installedRoot) ? installedRoot : join(directory, 'node_modules', manifest.name);
  for (const docPath of ['README.md', 'docs/architecture.md']) {
    const fullDocPath = join(packageRoot, docPath);
    const content = readFileSync(fullDocPath, 'utf8');
    for (const match of content.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      const target = match[1].split('#')[0];
      if (!target || /^(https?:|mailto:)/i.test(target)) continue;
      const resolved = resolve(dirname(fullDocPath), target);
      const rel = relative(packageRoot, resolved);
      assert(
        !rel.startsWith('..') && existsSync(resolved),
        `Packaged ${docPath} links to unpackaged path: ${match[1]}`,
      );
    }
  }
  const cli = join(directory, 'bin', 'taskelith');
  const cliBin = existsSync(cli) ? cli : join(directory, 'node_modules', '.bin', 'taskelith');
  for (const args of [['--help'], ['--version'], ['plan'], ['unknown']]) {
    const result = spawnSync(cliBin, args, { cwd: directory, encoding: 'utf8', timeout: 10000 });
    assert.equal(result.status, args[0] === 'unknown' ? 2 : 0, result.stderr);
    if (args[0] === '--version') assert.equal(result.stdout.trim(), manifest.version);
    if (args[0] === 'plan') assert.equal(result.stdout, plan);
    if (args[0] === '--help') assert.match(result.stdout, /Usage: taskelith/);
  }
  console.log('Packed file allowlist and installed CLI verification passed.');
} finally {
  rmSync(directory, { recursive: true, force: true });
}
