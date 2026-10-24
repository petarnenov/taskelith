import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { INVENTORY_MERGE_DRIVER, INVENTORY_MERGE_DRIVER_KEY } from '../scripts/environment-checks.ts';
import { INVENTORY_FILES, INVENTORY_INPUTS, sha256 } from '../scripts/inventory-provenance.ts';

const repository = resolve(import.meta.dirname, '..');
const hookScripts = [
  'scripts/inventory-provenance.ts', 'scripts/pre-push-checks.ts', 'scripts/check-inventory-inputs.ts', 'scripts/check-pre-push.ts',
];

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
  for (const path of INVENTORY_FILES) write(root, path, `{\n  "side": "${label}"\n}\n`);
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
    for (const path of INVENTORY_FILES) assert.equal(readFileSync(join(root, path), 'utf8'), '{\n  "side": "feature"\n}\n');
    assert.equal(git(root, 'status', '--porcelain'), '');
  });
});

// The hooks run before dependencies are installed, so the checks run from a
// copy of their scripts in a tree without node_modules.
function checkoutWithFreshInventory(root: string): void {
  for (const path of hookScripts) copyFileSync(join(repository, path), join(root, path));
  for (const path of INVENTORY_INPUTS) {
    if (!hookScripts.includes(path)) write(root, path, `content of ${path}`);
  }
  write(root, 'package.json', manifest('fixture'));
  const provenance = Object.fromEntries(INVENTORY_INPUTS.map(path => [path, sha256(readFileSync(join(root, path)))]));
  write(root, INVENTORY_FILES[0], JSON.stringify({ provenance }));
  write(root, INVENTORY_FILES[1], '{}');
}

// Node reads the nearest package.json to load the scripts as ES modules.
function manifest(name: string): string {
  return JSON.stringify({ name, type: 'module' });
}

function runHookScript(root: string, script: string, input = '') {
  return spawnSync(process.execPath, ['--experimental-strip-types', script], { cwd: root, encoding: 'utf8', input });
}

test('the post-merge check passes on a fresh inventory and names the stale inputs', () => {
  withScratch('taskelith-inventory-inputs-', root => {
    mkdirSync(join(root, 'scripts'));
    checkoutWithFreshInventory(root);
    assert.equal(runHookScript(root, 'scripts/check-inventory-inputs.ts').status, 0);
    write(root, 'package.json', manifest('merged'));
    const stale = runHookScript(root, 'scripts/check-inventory-inputs.ts');
    assert.equal(stale.status, 1);
    assert.match(stale.stderr, /^post-merge: Dependency inventory is stale; changed inputs: package\.json; regenerate with make dependency-inventory/);
    write(root, INVENTORY_FILES[0], '<<<<<<< conflict');
    assert.match(runHookScript(root, 'scripts/check-inventory-inputs.ts').stderr, /^post-merge: .*JSON/);
  });
});

function pushOf(root: string, ref: string): string {
  return `${ref} ${git(root, 'rev-parse', ref).trim()} ${ref} ${'0'.repeat(40)}\n`;
}

test('the pre-push check refuses uncommitted inventory files and inputs only', () => {
  withScratch('taskelith-inventory-committed-', root => {
    mkdirSync(join(root, 'scripts'));
    git(root, 'init', '-q', '-b', 'feature');
    checkoutWithFreshInventory(root);
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '-m', 'base');
    const push = pushOf(root, 'refs/heads/feature');
    assert.equal(runHookScript(root, 'scripts/check-pre-push.ts', push).status, 0);
    write(root, 'notes.md', 'unrelated');
    assert.equal(runHookScript(root, 'scripts/check-pre-push.ts', push).status, 0);
    write(root, INVENTORY_FILES[1], '{"regenerated": true}');
    write(root, 'package-lock.json', 'merged lockfile');
    const refused = runHookScript(root, 'scripts/check-pre-push.ts', push);
    assert.equal(refused.status, 1);
    assert.match(refused.stderr,
      /^pre-push: uncommitted dependency inventory changes: docs\/dependencies\/sbom\.cdx\.json, package-lock\.json; regenerate/);
    git(root, 'commit', '-q', '-am', 'regenerate');
    assert.equal(runHookScript(root, 'scripts/check-pre-push.ts', pushOf(root, 'refs/heads/feature')).status, 0);
  });
});

test('the pre-push check refuses a pushed commit other than the checked-out one', () => {
  withScratch('taskelith-pre-push-refs-', root => {
    mkdirSync(join(root, 'scripts'));
    git(root, 'init', '-q', '-b', 'feature');
    checkoutWithFreshInventory(root);
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '-m', 'base');
    git(root, 'switch', '-q', '-c', 'other');
    write(root, 'notes.md', 'other work');
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '-m', 'other');
    git(root, 'switch', '-q', 'feature');
    const refused = runHookScript(root, 'scripts/check-pre-push.ts', pushOf(root, 'refs/heads/other'));
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /^pre-push: make verify checks only the checked-out commit; check out and push refs\/heads\/other separately/);
    const deletion = `(delete) ${'0'.repeat(40)} refs/heads/old ${'1'.repeat(40)}\n`;
    assert.equal(runHookScript(root, 'scripts/check-pre-push.ts', deletion + pushOf(root, 'refs/heads/feature')).status, 0);
  });
});
