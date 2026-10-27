import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fixtureEnv } from './git-fixture-env.ts';

// scripts/integrate.sh against a local bare origin, with make, npm, and gh
// stubs that log their calls; no network.

const repository = resolve(import.meta.dirname, '..');
const script = join(repository, 'scripts', 'integrate.sh');
const stampScript = join(repository, 'scripts', 'verify-stamp.ts');
const BRANCH = 'feature';
const URL = 'https://example.invalid/pull/1';

interface Fixture {
  readonly root: string;
  readonly main: string;
  readonly origin: string;
  readonly state: string;
  readonly calls: string;
  readonly worktree: string;
}

interface Run {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', env: fixtureEnv, stdio: ['ignore', 'pipe', 'pipe'] });
}

function write(path: string, text: string, mode?: number): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
  if (mode !== undefined) chmodSync(path, mode);
}

function commit(cwd: string, message: string): void {
  git(cwd, 'add', '-A');
  git(cwd, 'commit', '-q', '-m', message);
}

// make verify of the stub stamps the tree, as the real one does on a pass.
function writeStubs(bin: string): void {
  write(join(bin, 'make'), `#!/bin/sh
echo "make $*" >> "$CALLS"
if [ "$1" = verify ]; then
  if [ "\${FAKE_VERIFY_SECONDS:-0}" -gt 0 ]; then sleep "$FAKE_VERIFY_SECONDS"; fi
  if [ "\${FAKE_VERIFY_STATUS:-0}" -ne 0 ]; then echo "fake verify failed"; exit "$FAKE_VERIFY_STATUS"; fi
  node --experimental-strip-types "${stampScript}" write full "$(git rev-parse 'HEAD^{tree}')"
fi
`, 0o755);
  write(join(bin, 'npm'), `#!/bin/sh
if [ "$1" = -v ]; then echo 12.2.1; exit 0; fi
echo "npm $*" >> "$CALLS"
`, 0o755);
  write(join(bin, 'gh'), `#!/bin/sh
echo "gh $*" >> "$CALLS"
case "$1 $2" in
  "pr create") echo "${URL}" ;;
  "pr merge") git push -q origin HEAD:refs/heads/dev ;;
esac
`, 0o755);
}

function withFixture(body: (fixture: Fixture) => void | Promise<void>): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), 'taskelith-integrate-'));
  const origin = join(root, 'origin.git');
  const main = join(root, 'main');
  const fixture: Fixture = {
    root, main, origin, state: join(root, 'state'), calls: join(root, 'calls'),
    worktree: join(root, 'taskelith-worktrees', `itg-${BRANCH}`),
  };
  git(root, 'init', '-q', '--bare', '-b', 'dev', origin);
  git(root, 'clone', '-q', origin, main);
  for (const [key, value] of [['user.name', 'Fixture'], ['user.email', 'fixture@example.invalid'], ['commit.gpgsign', 'false'], ['core.hooksPath', join(root, 'no-hooks')]]) {
    git(main, 'config', key, value);
  }
  git(main, 'switch', '-q', '-c', 'dev');
  write(join(main, 'README.md'), 'base\n');
  commit(main, 'base');
  git(main, 'push', '-q', 'origin', 'dev');
  git(main, 'switch', '-q', '-c', BRANCH);
  write(join(main, 'openspec/changes/archive/2026-10-27-feature/proposal.md'), 'archived\n');
  write(join(main, 'feature.txt'), 'feature\n');
  commit(main, 'docs: archive the feature change');
  git(main, 'push', '-q', 'origin', BRANCH);
  git(main, 'switch', '-q', 'dev');
  write(join(main, 'dev.txt'), 'dev\n');
  commit(main, 'dev moves on');
  git(main, 'push', '-q', 'origin', 'dev');
  git(main, 'branch', '-q', '-D', BRANCH);
  writeStubs(join(root, 'bin'));
  return Promise.resolve(body(fixture)).finally(() => rmSync(root, { recursive: true, force: true }));
}

function environment(fixture: Fixture, extra: Record<string, string>): NodeJS.ProcessEnv {
  return {
    ...fixtureEnv,
    PATH: [join(fixture.root, 'bin'), dirname(process.execPath), '/usr/bin', '/bin'].join(':'),
    XDG_STATE_HOME: fixture.state,
    CALLS: fixture.calls,
    TASKELITH_INTEGRATE_POLL_SECONDS: '1',
    ...extra,
  };
}

function integrate(fixture: Fixture, args: string[], extra: Record<string, string> = {}): Run {
  const run = spawnSync('bash', [script, ...args], { cwd: fixture.main, encoding: 'utf8', env: environment(fixture, extra), timeout: 120_000 });
  return { status: run.status, stdout: run.stdout, stderr: run.stderr };
}

function calls(fixture: Fixture): string[] {
  return existsSync(fixture.calls) ? readFileSync(fixture.calls, 'utf8').trim().split('\n') : [];
}

function remoteHeads(fixture: Fixture): string {
  return git(fixture.main, 'ls-remote', '--heads', 'origin');
}

test('missing or invalid arguments print the usage', async () => {
  await withFixture((fixture) => {
    for (const args of [[], [BRANCH, 'title'], [BRANCH, '', 'body'], ['--resume', BRANCH, 'title']]) {
      const run = integrate(fixture, args);
      assert.equal(run.status, 2, JSON.stringify(args));
      assert.match(run.stderr, /^usage: integrate\.sh \[--resume\] <branch>/);
    }
    for (const branch of ['-x', 'a..b']) {
      const run = integrate(fixture, [branch, 'title', 'body']);
      assert.equal(run.status, 2);
      assert.match(run.stderr, /invalid branch name/);
    }
    const timeout = integrate(fixture, [BRANCH, 'title', 'body'], { TASKELITH_INTEGRATE_TIMEOUT: '1h' });
    assert.equal(timeout.status, 2);
    assert.match(timeout.stderr, /must be whole seconds/);
    assert.deepEqual(calls(fixture), []);
  });
});

test('a clean branch is merged, verified, pushed, landed, and cleaned up', async () => {
  await withFixture((fixture) => {
    const run = integrate(fixture, [BRANCH, 'Feature title', 'Feature body']);
    assert.equal(run.status, 0, run.stderr);
    const head = git(fixture.main, 'log', '--oneline', '-1').trim();
    assert.equal(run.stdout.trim().split('\n').at(-1), `LANDED ${BRANCH} ${URL} ${head}`);
    assert.deepEqual(calls(fixture), [
      'make setup',
      'make verify',
      `gh pr create --base dev --head ${BRANCH} --title Feature title --body Feature body`,
      `gh pr merge ${URL} --merge`,
      'npm ci --silent',
    ]);
    assert.match(head, /Merge remote-tracking branch 'origin\/dev' into itg-feature/);
    assert.equal(existsSync(join(fixture.main, 'feature.txt')), true);
    assert.equal(existsSync(fixture.worktree), false);
    assert.doesNotMatch(git(fixture.main, 'branch'), /itg-feature/);
    assert.doesNotMatch(remoteHeads(fixture), /refs\/heads\/feature/);
  });
});

test('a conflict with dev aborts the merge, pushes nothing, and exits 3', async () => {
  await withFixture((fixture) => {
    write(join(fixture.main, 'feature.txt'), 'dev edit\n');
    commit(fixture.main, 'dev edits the same file');
    git(fixture.main, 'push', '-q', 'origin', 'dev');
    const before = remoteHeads(fixture);
    const run = integrate(fixture, [BRANCH, 'title', 'body']);
    assert.equal(run.status, 3);
    assert.equal(run.stdout.trim(), `CONFLICT ${BRANCH}`);
    assert.match(run.stderr, /^feature\.txt$/m);
    assert.deepEqual(calls(fixture), []);
    assert.equal(remoteHeads(fixture), before);
    assert.equal(git(fixture.worktree, 'status', '--porcelain'), '');
  });
});

test('a failed verify keeps the merge local, and a resume reuses a full stamp', async () => {
  await withFixture((fixture) => {
    const before = remoteHeads(fixture);
    const failed = integrate(fixture, [BRANCH, 'title', 'body'], { FAKE_VERIFY_STATUS: '2' });
    assert.equal(failed.status, 4);
    assert.match(failed.stdout, /^VERIFY FAIL feature\nfake verify failed\n/);
    assert.equal(remoteHeads(fixture), before);
    assert.deepEqual(calls(fixture), ['make setup', 'make verify']);
    const log = join(fixture.state, 'taskelith', 'integrate-feature-verify.log');
    assert.equal(readFileSync(log, 'utf8'), 'fake verify failed\n');
    const tree = git(fixture.worktree, 'rev-parse', 'HEAD^{tree}').trim();
    execFileSync(process.execPath, ['--experimental-strip-types', stampScript, 'write', 'full', tree], {
      cwd: fixture.worktree, env: environment(fixture, {}),
    });
    rmSync(fixture.calls);
    const resumed = integrate(fixture, ['--resume', BRANCH, 'title', 'body']);
    assert.equal(resumed.status, 0, resumed.stderr);
    assert.match(resumed.stdout, /reusing the full make verify stamp of the merged tree/);
    assert.equal(calls(fixture).includes('make verify'), false);
    assert.match(resumed.stdout, /LANDED feature /);
    assert.equal(existsSync(log), false);
  });
});

test('a resume needs the integration worktree', async () => {
  await withFixture((fixture) => {
    const run = integrate(fixture, ['--resume', BRANCH, 'title', 'body']);
    assert.equal(run.status, 2);
    assert.match(run.stderr, /no integration worktree to resume/);
  });
});

test('a branch without its archived change is not integrated', async () => {
  await withFixture((fixture) => {
    git(fixture.main, 'switch', '-q', '-c', 'unarchived', 'origin/dev');
    write(join(fixture.main, 'openspec/changes/unarchived/proposal.md'), 'active\n');
    commit(fixture.main, 'active change');
    git(fixture.main, 'push', '-q', 'origin', 'unarchived');
    git(fixture.main, 'switch', '-q', 'dev');
    const run = integrate(fixture, ['unarchived', 'title', 'body']);
    assert.equal(run.status, 5);
    assert.equal(run.stdout.trim(), 'NOT ARCHIVED unarchived');
    assert.deepEqual(calls(fixture), []);
  });
});

test('the alarm stops a make verify that runs too long', async () => {
  await withFixture((fixture) => {
    const run = integrate(fixture, [BRANCH, 'title', 'body'], { TASKELITH_INTEGRATE_TIMEOUT: '1', FAKE_VERIFY_SECONDS: '30' });
    assert.equal(run.status, 4);
    assert.match(run.stdout, /^VERIFY FAIL feature/);
  });
});

test('the pause file holds the integration until it is removed', async () => {
  await withFixture(async (fixture) => {
    const pause = join(fixture.state, 'taskelith', 'integrate.pause');
    write(pause, '');
    const child = spawn('bash', [script, 'unknown-branch', 'title', 'body'], { cwd: fixture.main, env: environment(fixture, {}) });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    const exited = new Promise<number | null>((done) => child.on('exit', (code) => done(code)));
    const deadline = Date.now() + 60_000;
    while (!stderr.includes('paused by')) {
      if (Date.now() > deadline) throw new Error('the script did not report the pause');
      await new Promise((done) => setTimeout(done, 20));
    }
    assert.equal(child.exitCode, null);
    assert.match(stderr, new RegExp(`integrate\\.sh: paused by ${pause.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    rmSync(pause);
    assert.notEqual(await exited, 0);
    assert.match(stderr, /unknown-branch/);
  });
});

test('make integrate passes its arguments through the environment', () => {
  const run = spawnSync('make', ['-n', 'integrate', 'BRANCH=b', 'TITLE=a "quoted" title', 'BODY=$(rm -rf /)'], { cwd: repository, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /bash scripts\/integrate\.sh +"\$BRANCH" "\$TITLE" "\$BODY"/);
  const resume = spawnSync('make', ['-n', 'integrate', 'RESUME=1'], { cwd: repository, encoding: 'utf8' });
  assert.match(resume.stdout, /bash scripts\/integrate\.sh --resume "\$BRANCH"/);
});
