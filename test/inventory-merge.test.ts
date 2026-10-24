import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { INVENTORY_INPUTS, sha256 } from '../scripts/dependency-inventory.ts';
import { INVENTORY_MERGE_DRIVER, INVENTORY_MERGE_DRIVER_KEY } from '../scripts/environment-checks.ts';

const repository = resolve(import.meta.dirname, '..');
const inventoryFiles = ['docs/dependencies/licenses.json', 'docs/dependencies/sbom.cdx.json'];

function withScratch(prefix: string, body: (root: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), prefix));
  try { body(root); } finally { rmSync(root, { recursive: true, force: true }); }
}

function write(root: string, path: string, content: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

function git(root: string, ...args: string[]): string {
  return execFileSync('git', [
    '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
    '-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', ...args,
  ], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function commitInventory(root: string, label: string): void {
  for (const path of inventoryFiles) write(root, path, `{\n  "side": "${label}"\n}\n`);
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', label);
}

test('the repository merge driver keeps the current inventory instead of conflicting', () => {
  withScratch('taskelith-inventory-merge-', root => {
    git(root, 'init', '-q', '-b', 'dev');
    copyFileSync(join(repository, '.gitattributes'), join(root, '.gitattributes'));
    git(root, 'config', INVENTORY_MERGE_DRIVER_KEY, INVENTORY_MERGE_DRIVER);
    commitInventory(root, 'base');
    git(root, 'switch', '-q', '-c', 'feature');
    commitInventory(root, 'feature');
    git(root, 'switch', '-q', 'dev');
    commitInventory(root, 'dev');
    git(root, 'switch', '-q', 'feature');
    git(root, 'merge', '-q', '--no-edit', 'dev');
    for (const path of inventoryFiles) assert.equal(readFileSync(join(root, path), 'utf8'), '{\n  "side": "feature"\n}\n');
    assert.equal(git(root, 'status', '--porcelain'), '');
  });
});

function runInputCheck(root: string) {
  const script = join(repository, 'scripts/check-inventory-inputs.ts');
  return spawnSync(process.execPath, ['--experimental-strip-types', script], { cwd: root, encoding: 'utf8' });
}

test('the post-merge input check passes on a fresh inventory and names the stale inputs', () => {
  withScratch('taskelith-inventory-inputs-', root => {
    for (const path of INVENTORY_INPUTS) write(root, path, `content of ${path}`);
    const provenance = Object.fromEntries(INVENTORY_INPUTS.map(path => [path, sha256(`content of ${path}`)]));
    write(root, 'docs/dependencies/licenses.json', JSON.stringify({ provenance }));
    assert.equal(runInputCheck(root).status, 0);
    write(root, 'package.json', 'merged manifest');
    const stale = runInputCheck(root);
    assert.equal(stale.status, 1);
    assert.match(stale.stderr, /^post-merge: Dependency inventory is stale; changed inputs: package\.json; regenerate with make dependency-inventory/);
    write(root, 'docs/dependencies/licenses.json', '<<<<<<< conflict');
    assert.match(runInputCheck(root).stderr, /^post-merge: .*JSON/);
  });
});
