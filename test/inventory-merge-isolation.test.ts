import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const repository = resolve(import.meta.dirname, '..');

function sentinelState(gitDir: string): string {
  return execFileSync('git', ['--git-dir', gitDir, 'for-each-ref'], { encoding: 'utf8' })
    + execFileSync('git', ['--git-dir', gitDir, 'config', '--list', '--local'], { encoding: 'utf8' });
}

test('the git fixture tests leave the repository named by a hook environment untouched', () => {
  const root = mkdtempSync(join(tmpdir(), 'taskelith-hook-sentinel-'));
  try {
    execFileSync('git', ['init', '-q', '-b', 'dev', root]);
    execFileSync('git', ['-C', root, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
      'commit', '-q', '--allow-empty', '-m', 'sentinel']);
    const gitDir = join(root, '.git');
    const before = sentinelState(gitDir);
    const run = spawnSync(process.execPath, ['--experimental-strip-types', '--test', 'test/inventory-merge.test.ts'], {
      cwd: repository, encoding: 'utf8', env: { ...process.env, GIT_DIR: gitDir, GIT_WORK_TREE: root },
    });
    assert.equal(run.status, 0, run.stdout + run.stderr);
    assert.equal(sentinelState(gitDir), before);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
