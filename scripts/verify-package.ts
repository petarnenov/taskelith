import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const directory = mkdtempSync(join(tmpdir(), 'taskelith-package-'));
const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
const plan = readFileSync('docs/architecture.md', 'utf8');
try {
  const packed = JSON.parse(execFileSync('npm', [
    'pack', '--ignore-scripts', '--json', '--pack-destination', directory,
  ], { encoding: 'utf8' }));
  const pack = Array.isArray(packed) ? packed[0] : packed[manifest.name];
  assert.deepEqual(pack.files.map((file: { path: string }) => file.path).sort(), [
    'LICENSE', 'README.md', 'dist/cli.js', 'docs/architecture.md', 'package.json',
  ]);
  execFileSync('npm', [
    'install', '--prefix', directory, '--ignore-scripts', '--no-audit', '--no-fund',
    join(directory, pack.filename),
  ], { stdio: 'inherit' });
  const cli = join(directory, 'node_modules', '.bin', 'taskelith');
  for (const args of [['--help'], ['--version'], ['plan'], ['unknown']]) {
    const result = spawnSync(cli, args, { cwd: directory, encoding: 'utf8', timeout: 10000 });
    assert.equal(result.status, args[0] === 'unknown' ? 2 : 0, result.stderr);
    if (args[0] === '--version') assert.equal(result.stdout.trim(), manifest.version);
    if (args[0] === 'plan') assert.equal(result.stdout, plan);
    if (args[0] === '--help') assert.match(result.stdout, /Usage: taskelith/);
  }
  console.log('Packed file allowlist and installed CLI verification passed.');
} finally {
  rmSync(directory, { recursive: true, force: true });
}
