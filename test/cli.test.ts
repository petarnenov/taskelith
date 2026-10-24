import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
const run = (...args: string[]) => spawnSync(process.execPath, [cli, ...args], {
  encoding: 'utf8', cwd: tmpdir(), timeout: 10000,
});

test('help identifies the bootstrap and available commands', () => {
  for (const args of [[], ['--help'], ['-h']]) {
    const result = run(...args);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /Usage: taskelith/);
    assert.match(result.stdout, /not implemented yet/);
    assert.equal(result.stderr, '');
  }
});

test('version matches the package manifest', () => {
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  for (const flag of ['--version', '-v']) {
    const result = run(flag);
    assert.equal(result.status, 0);
    assert.equal(result.stdout.trim(), manifest.version);
  }
});

test('plan prints the complete bundled document outside the checkout', () => {
  const result = run('plan');
  assert.equal(result.status, 0);
  const plan = readFileSync(new URL('../docs/architecture.md', import.meta.url), 'utf8');
  assert.match(plan, /^# Taskelith:/);
  assert.equal(result.stdout, plan);
});

test('unknown commands and extra arguments are usage errors', () => {
  for (const args of [['start'], ['plan', 'extra'], ['--version', 'extra']]) {
    const result = run(...args);
    assert.equal(result.status, 2);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /taskelith --help/);
  }
});
