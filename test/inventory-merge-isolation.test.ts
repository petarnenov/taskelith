import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { fixtureEnv } from './git-fixture-env.ts';

const repository = resolve(import.meta.dirname, '..');

function git(...args: string[]): string {
  return execFileSync('git', [
    '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', ...args,
  ], { encoding: 'utf8', env: fixtureEnv });
}

function sentinelState(gitDir: string): string {
  return git('--git-dir', gitDir, 'for-each-ref') + git('--git-dir', gitDir, 'config', '--list', '--local');
}

test('the git fixture tests leave the repository named by a hook environment untouched', () => {
  const root = mkdtempSync(join(tmpdir(), 'taskelith-hook-sentinel-'));
  try {
    git('init', '-q', '-b', 'dev', root);
    git('-C', root, 'commit', '-q', '--allow-empty', '-m', 'sentinel');
    const gitDir = join(root, '.git');
    const before = sentinelState(gitDir);
    const run = spawnSync(process.execPath, ['--experimental-strip-types', '--test', 'test/inventory-merge.test.ts'], {
      cwd: repository, encoding: 'utf8', env: { ...fixtureEnv, GIT_DIR: gitDir, GIT_WORK_TREE: root },
    });
    assert.equal(run.status, 0, run.stdout + run.stderr);
    assert.equal(sentinelState(gitDir), before);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
