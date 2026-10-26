import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fixtureEnv } from './git-fixture-env.ts';

const repository = resolve(import.meta.dirname, '..');
const hookFiles = [
  '.nvmrc', '.githooks/pre-push', 'scripts/with-pinned-node.sh', 'scripts/run-node-script.sh',
  'scripts/check-pre-push.ts', 'scripts/pre-push-checks.ts', 'scripts/inventory-provenance.ts',
];
const FAKE_VERIFY_OUTPUT = 'fake make verify ran';
const none = '0'.repeat(40);

interface HookRun {
  readonly status: number | null;
  readonly verified: boolean;
  readonly stdout: string;
}

function git(root: string, ...args: string[]): string {
  return execFileSync('git', [
    '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
    '-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', ...args,
  ], { cwd: root, encoding: 'utf8', env: fixtureEnv, stdio: ['ignore', 'pipe', 'pipe'] });
}

// The hook runs from a copy of its scripts in a committed tree without nvm,
// and a fake make on PATH stands in for make verify.
function withHookFixture(body: (root: string, head: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), 'taskelith-pre-push-hook-'));
  try {
    for (const path of hookFiles) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      copyFileSync(join(repository, path), join(root, path));
    }
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'fixture', type: 'module' }));
    mkdirSync(join(root, 'bin'));
    writeFileSync(join(root, 'bin', 'make'), `#!/bin/sh\necho "${FAKE_VERIFY_OUTPUT}: $*"\nexit "$FAKE_VERIFY_STATUS"\n`);
    chmodSync(join(root, 'bin', 'make'), 0o755);
    git(root, 'init', '-q', '-b', 'feature');
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '-m', 'base');
    body(root, git(root, 'rev-parse', 'HEAD').trim());
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function runHook(root: string, updates: string, verifyStatus = 0): HookRun {
  const run = spawnSync('sh', ['.githooks/pre-push', 'origin', 'https://example.invalid/fixture.git'], {
    cwd: root,
    encoding: 'utf8',
    input: updates,
    env: {
      ...fixtureEnv,
      PATH: [join(root, 'bin'), dirname(process.execPath), '/usr/bin', '/bin'].join(':'),
      NVM_DIR: join(root, 'no-nvm'),
      FAKE_VERIFY_STATUS: String(verifyStatus),
    },
  });
  return { status: run.status, verified: run.stdout.includes(`${FAKE_VERIFY_OUTPUT}: verify`), stdout: run.stdout };
}

function deletion(ref: string, zeros = none): string {
  return `(delete) ${zeros} ${ref} ${'1'.repeat(zeros.length)}\n`;
}

test('a push that only deletes remote refs skips make verify', () => {
  withHookFixture(root => {
    const skipped = runHook(root, deletion('refs/heads/old') + deletion('refs/heads/older'));
    assert.equal(skipped.status, 0);
    assert.equal(skipped.verified, false);
    assert.match(skipped.stdout, /^pre-push: the push only deletes remote refs; skipping make verify/);
    const sha256Deletion = runHook(root, deletion('refs/heads/old', '0'.repeat(64)));
    assert.equal(sha256Deletion.status, 0);
    assert.equal(sha256Deletion.verified, false);
  });
});

function verifiedPushes(head: string): string[] {
  const update = `refs/heads/feature ${head} refs/heads/feature ${none}\n`;
  return [deletion('refs/heads/old') + update, update, ''];
}

test('a mixed, a normal, and an empty push run make verify', () => {
  withHookFixture((root, head) => {
    for (const updates of verifiedPushes(head)) {
      const run = runHook(root, updates);
      assert.equal(run.status, 0);
      assert.equal(run.verified, true, `make verify did not run for ${JSON.stringify(updates)}`);
    }
  });
});

test('a failing make verify blocks a mixed, a normal, and an empty push', () => {
  withHookFixture((root, head) => {
    for (const updates of verifiedPushes(head)) {
      const run = runHook(root, updates, 2);
      assert.equal(run.verified, true, `make verify did not run for ${JSON.stringify(updates)}`);
      assert.notEqual(run.status, 0, `the push was not blocked for ${JSON.stringify(updates)}`);
    }
  });
});

test('a refused push runs no make verify', () => {
  withHookFixture(root => {
    const refused = runHook(root, `refs/heads/other ${'2'.repeat(40)} refs/heads/other ${none}\n`);
    assert.equal(refused.status, 1);
    assert.equal(refused.verified, false);
  });
});
