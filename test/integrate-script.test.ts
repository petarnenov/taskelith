import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fixtureEnv } from './git-fixture-env.ts';
import { gnuMakes } from './gnu-makes.ts';

// scripts/integrate.sh against a local bare origin, with make, npm, and gh
// stubs that log their calls; no network.

const repository = resolve(import.meta.dirname, '..');
const script = join(repository, 'scripts', 'integrate.sh');
const stampScript = join(repository, 'scripts', 'verify-stamp.ts');
const BRANCH = 'feature';
const URL = 'https://example.invalid/pull/1';
const PR_LIST = `gh pr list --base dev --head ${BRANCH} --state all --json state,headRefOid,url --jq .[] | [.state, .headRefOid, .url] | @tsv`;
const REAL_GIT = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();

interface Fixture {
  readonly root: string;
  readonly main: string;
  readonly origin: string;
  readonly state: string;
  readonly calls: string;
  readonly worktree: string;
  readonly pids: string;
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

// make verify of the stub stamps the tree, as the real one does; gh keeps its
// pull request in GH_STATE and merges it with a merge commit, as GitHub does.
function writeStubs(bin: string): void {
  write(join(bin, 'make'), `#!/bin/sh
echo "make $*" >> "$CALLS"
if [ "$1" = verify ]; then
  if [ "\${FAKE_VERIFY_SECONDS:-0}" -gt 0 ]; then
    sleep 300 &
    echo $! >> "$PIDS"
    sleep "$FAKE_VERIFY_SECONDS" &
    echo $! >> "$PIDS"
    wait $!
  fi
  if [ "\${FAKE_VERIFY_STATUS:-0}" -ne 0 ]; then echo "fake verify failed"; exit "$FAKE_VERIFY_STATUS"; fi
  if [ -n "\${FAKE_VERIFY_NO_STAMP:-}" ]; then echo "make verify: passed, profile full, no stamp written"; exit 0; fi
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
  "pr list") if [ -f "$GH_STATE" ]; then cat "$GH_STATE"; fi ;;
  "pr create")
    printf 'OPEN\\t%s\\t%s\\n' "$(git rev-parse HEAD)" "${URL}" > "$GH_STATE"
    echo "${URL}" ;;
  "pr merge")
    if [ "\${FAKE_MERGE:-}" = fail ]; then echo "merge failed" >&2; exit 1; fi
    git fetch -q origin dev
    merge="$(git commit-tree 'HEAD^{tree}' -p origin/dev -p HEAD -m 'Merge pull request #1')"
    git push -q origin "$merge:refs/heads/dev"
    printf 'MERGED\\t%s\\t%s\\n' "$(git rev-parse HEAD)" "${URL}" > "$GH_STATE"
    if [ "\${FAKE_MERGE:-}" = delete-branch ]; then git push -q origin --delete ${BRANCH}; fi
    if [ "\${FAKE_MERGE:-}" = fail-after ]; then echo "lost the reply" >&2; exit 1; fi ;;
esac
`, 0o755);
  write(join(bin, 'git'), `#!/bin/sh
if [ "$1 $2 $3 $4" = "push -q origin --delete" ] && [ -n "\${FAKE_DELETE_PUSH:-}" ]; then echo "delete refused" >&2; exit 1; fi
if [ "$1" = ls-remote ] && [ -n "\${FAKE_LS_REMOTE:-}" ]; then echo "network down" >&2; exit 128; fi
exec "${REAL_GIT}" "$@"
`, 0o755);
}

function withFixture(body: (fixture: Fixture) => void | Promise<void>): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), 'taskelith-integrate-'));
  const origin = join(root, 'origin.git');
  const main = join(root, 'main');
  const fixture: Fixture = {
    root, main, origin, state: join(root, 'state'), calls: join(root, 'calls'),
    worktree: join(root, 'taskelith-worktrees', `itg-${BRANCH}`), pids: join(root, 'pids'),
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
    PIDS: fixture.pids,
    GH_STATE: join(fixture.root, 'gh-state'),
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
      PR_LIST,
      `gh pr create --base dev --head ${BRANCH} --title Feature title --body Feature body`,
      `gh pr merge ${URL} --merge`,
      'npm ci --silent',
    ]);
    assert.match(head, /Merge pull request #1/);
    assert.match(git(fixture.main, 'log', '--format=%s', '-1', 'HEAD^2'), /Merge remote-tracking branch 'origin\/dev' into itg-feature/);
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

function running(pid: number): boolean {
  const ps = spawnSync('ps', ['-o', 'stat=', '-p', String(pid)], { encoding: 'utf8' });
  const stat = ps.stdout.trim();
  return stat !== '' && !stat.startsWith('Z');
}

// Review finding 6: the alarm stops the whole group and waits for it.
test('the alarm stops a make verify that runs too long and leaves no process', async () => {
  await withFixture((fixture) => {
    const run = integrate(fixture, [BRANCH, 'title', 'body'], { TASKELITH_INTEGRATE_TIMEOUT: '1', FAKE_VERIFY_SECONDS: '30' });
    assert.equal(run.status, 4);
    assert.match(run.stdout, /^VERIFY FAIL feature\n(?:.*\n)*integrate\.sh: make verify exceeded 1 s\n/);
    const pids = readFileSync(fixture.pids, 'utf8').trim().split('\n').map(Number);
    assert.equal(pids.length, 2);
    for (const pid of pids) assert.equal(running(pid), false, `process ${pid} survived`);
  });
});

function linesOf(path: string, count: number): Promise<string[]> {
  return new Promise((done, fail) => {
    const deadline = Date.now() + 60_000;
    const poll = (): void => {
      const lines = existsSync(path) ? readFileSync(path, 'utf8').trim().split('\n') : [];
      if (lines.length >= count) done(lines);
      else if (Date.now() > deadline) fail(new Error(`timed out waiting for ${path}`));
      else setTimeout(poll, 20);
    };
    poll();
  });
}

interface Interrupted {
  readonly status: number | null;
  readonly stdout: string;
}

function startIntegrate(fixture: Fixture, extra: Record<string, string>) {
  const child = spawn('bash', [script, BRANCH, 'title', 'body'], {
    cwd: fixture.main, env: environment(fixture, extra), stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  child.stdout.on('data', (chunk) => { stdout += String(chunk); });
  const exited = new Promise<Interrupted>((done) => child.on('exit', (status) => done({ status, stdout })));
  return { child, exited };
}

// The shell reports a signal as 128 plus its number.
const SIGNALS = [['SIGINT', 130], ['SIGHUP', 129], ['SIGTERM', 143]] as const;

// Review pass 2 finding 2 and pass 3 finding 1: a signal to the script
// stops make verify, and the exit status names that signal.
for (const [signal, status] of SIGNALS) {
  test(`a ${signal} to the script during make verify exits ${status} and leaves no process`, async () => {
    await withFixture(async (fixture) => {
      const { child, exited } = startIntegrate(fixture, { FAKE_VERIFY_SECONDS: '300' });
      const pids = (await linesOf(fixture.pids, 2)).map(Number);
      child.kill(signal);
      const run = await exited;
      assert.equal(run.status, status);
      assert.match(run.stdout, /^INTERRUPTED feature$/m);
      for (const pid of pids) assert.equal(running(pid), false, `process ${pid} survived`);
    });
  });
}

// A perl stub that signals the script as the supervisor starts and starts
// the supervisor with signals ignored, so a single passed-on signal is lost.
function writeEarlySignalPerl(fixture: Fixture): void {
  const perl = execFileSync('sh', ['-c', 'command -v perl'], { encoding: 'utf8' }).trim();
  write(join(fixture.root, 'bin', 'perl'), `#!/bin/sh
trap '' INT TERM HUP
kill -s "$EARLY_SIGNAL" "$PPID"
exec "${perl}" "$@"
`, 0o755);
}

// Review pass 3 finding 2: a signal before the supervisor or its handlers
// exist still stops make verify and leaves no process.
for (const [signal, status] of SIGNALS) {
  test(`a ${signal} as make verify starts exits ${status} and leaves no process`, { timeout: 120_000 }, async () => {
    await withFixture(async (fixture) => {
      writeEarlySignalPerl(fixture);
      const { exited } = startIntegrate(fixture, { FAKE_VERIFY_SECONDS: '300', EARLY_SIGNAL: signal.slice(3) });
      const run = await exited;
      assert.equal(run.status, status);
      assert.match(run.stdout, /^INTERRUPTED feature$/m);
      const pids = existsSync(fixture.pids) ? readFileSync(fixture.pids, 'utf8').trim().split('\n').filter(Boolean) : [];
      for (const pid of pids.map(Number)) assert.equal(running(pid), false, `process ${pid} survived`);
    });
  });
}

// Review finding 5: a dirty tree is never verified or pushed.
test('an integration worktree with uncommitted changes is not verified or pushed', async () => {
  await withFixture((fixture) => {
    const before = remoteHeads(fixture);
    assert.equal(integrate(fixture, [BRANCH, 'title', 'body'], { FAKE_VERIFY_STATUS: '2' }).status, 4);
    write(join(fixture.worktree, 'scratch.txt'), 'uncommitted\n');
    rmSync(fixture.calls);
    const resumed = integrate(fixture, ['--resume', BRANCH, 'title', 'body']);
    assert.equal(resumed.status, 7);
    assert.equal(resumed.stdout.trim(), `NOT CLEAN ${BRANCH}`);
    assert.match(resumed.stderr, /scratch\.txt/);
    assert.deepEqual(calls(fixture), ['make setup']);
    assert.equal(remoteHeads(fixture), before);
  });
});

test('a passing make verify without a full stamp of the merged tree pushes nothing', async () => {
  await withFixture((fixture) => {
    const before = remoteHeads(fixture);
    const run = integrate(fixture, [BRANCH, 'title', 'body'], { FAKE_VERIFY_NO_STAMP: '1' });
    assert.equal(run.status, 4);
    assert.match(run.stdout, /^VERIFY FAIL feature\nintegrate\.sh: make verify passed but left no full stamp of the merged tree\n/);
    assert.equal(remoteHeads(fixture), before);
  });
});

// Review finding 7: a failed deletion or check never reports LANDED.
test('a branch that the delete push leaves on origin exits 6', async () => {
  await withFixture((fixture) => {
    const run = integrate(fixture, [BRANCH, 'title', 'body'], { FAKE_DELETE_PUSH: 'fail' });
    assert.equal(run.status, 6);
    assert.equal(run.stdout.trim().split('\n').at(-1), `DELETE FAILED ${BRANCH}`);
    assert.match(remoteHeads(fixture), /refs\/heads\/feature/);
  });
});

test('a deletion that cannot be checked exits 9 without LANDED', async () => {
  await withFixture((fixture) => {
    const run = integrate(fixture, [BRANCH, 'title', 'body'], { FAKE_LS_REMOTE: 'fail' });
    assert.equal(run.status, 9);
    assert.equal(run.stdout.trim().split('\n').at(-1), `DELETE UNCONFIRMED ${BRANCH}`);
    assert.doesNotMatch(run.stdout, /LANDED/);
  });
});

test('a delete push that fails because the branch is gone still lands', async () => {
  await withFixture((fixture) => {
    const run = integrate(fixture, [BRANCH, 'title', 'body'], { FAKE_MERGE: 'delete-branch' });
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stderr, /the delete push failed, but origin has no feature/);
    assert.match(run.stdout, /LANDED feature /);
  });
});

// Review finding 8: a resume continues with the pull request it created.
test('a resume after a failed merge merges the open pull request', async () => {
  await withFixture((fixture) => {
    const failed = integrate(fixture, [BRANCH, 'title', 'body'], { FAKE_MERGE: 'fail' });
    assert.equal(failed.status, 1);
    rmSync(fixture.calls);
    const resumed = integrate(fixture, ['--resume', BRANCH, 'title', 'body']);
    assert.equal(resumed.status, 0, resumed.stderr);
    assert.match(resumed.stdout, /continuing with the open pull request https:\/\/example\.invalid\/pull\/1/);
    assert.deepEqual(calls(fixture).filter((call) => call.startsWith('gh ')), [PR_LIST, `gh pr merge ${URL} --merge`]);
    assert.match(resumed.stdout, /LANDED feature /);
  });
});

// Review pass 2 finding 3: GitHub merges with a merge commit, so a resume
// must find HEAD in origin/dev instead of merging origin/dev again.
test('a resume after a merged pull request only cleans up', async () => {
  await withFixture((fixture) => {
    const failed = integrate(fixture, [BRANCH, 'title', 'body'], { FAKE_MERGE: 'fail-after' });
    assert.equal(failed.status, 1);
    rmSync(fixture.calls);
    const dev = git(fixture.main, 'ls-remote', 'origin', 'refs/heads/dev');
    const resumed = integrate(fixture, ['--resume', BRANCH, 'title', 'body']);
    assert.equal(resumed.status, 0, resumed.stderr);
    assert.match(resumed.stdout, /the pull request https:\/\/example\.invalid\/pull\/1 is already merged; only cleaning up/);
    assert.deepEqual(calls(fixture), [PR_LIST, 'npm ci --silent']);
    assert.equal(git(fixture.main, 'ls-remote', 'origin', 'refs/heads/dev'), dev);
    assert.match(resumed.stdout, /LANDED feature https:\/\/example\.invalid\/pull\/1 /);
  });
});

test('a fresh run for a branch already in dev only cleans up', async () => {
  await withFixture((fixture) => {
    assert.equal(integrate(fixture, [BRANCH, 'title', 'body'], { FAKE_MERGE: 'fail-after' }).status, 1);
    git(fixture.main, 'worktree', 'remove', fixture.worktree);
    git(fixture.main, 'branch', '-q', '-D', `itg-${BRANCH}`);
    rmSync(join(fixture.root, 'gh-state'));
    rmSync(fixture.calls);
    const run = integrate(fixture, [BRANCH, 'title', 'body']);
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /integrate\.sh: feature is already in origin\/dev; only cleaning up/);
    assert.deepEqual(calls(fixture), [PR_LIST, 'npm ci --silent']);
    assert.match(run.stdout, /LANDED feature none /);
    assert.doesNotMatch(remoteHeads(fixture), /refs\/heads\/feature/);
  });
});

// Review finding 9: the main clone is checked before any remote change.
test('a main clone off dev, dirty, or ahead of origin/dev stops before any remote change', async () => {
  await withFixture((fixture) => {
    const before = remoteHeads(fixture);
    const cases: Array<[() => void, string, () => void]> = [
      [() => git(fixture.main, 'switch', '-q', '-c', 'other'), 'is not on dev', () => git(fixture.main, 'switch', '-q', 'dev')],
      [() => write(join(fixture.main, 'untracked.txt'), 'x\n'), 'has uncommitted or untracked changes', () => rmSync(join(fixture.main, 'untracked.txt'))],
      [() => { write(join(fixture.main, 'local.txt'), 'x\n'); commit(fixture.main, 'local only'); }, 'has dev commits that origin/dev lacks',
        () => git(fixture.main, 'reset', '-q', '--hard', 'origin/dev')],
    ];
    for (const [prepare, reason, restore] of cases) {
      prepare();
      const run = integrate(fixture, [BRANCH, 'title', 'body']);
      assert.equal(run.status, 8, reason);
      assert.equal(run.stdout.trim(), `MAIN NOT READY ${realpathSync(fixture.main)} ${reason}`);
      assert.equal(existsSync(fixture.worktree), false);
      restore();
    }
    assert.deepEqual(calls(fixture), []);
    assert.equal(remoteHeads(fixture), before);
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

// Review finding 1: make must pass TITLE and BODY as typed, unexpanded;
// review pass 2 finding 10: only RESUME=1 resumes.
test('make integrate passes its arguments to the script as typed', () => {
  assert.notEqual(gnuMakes.length, 0, 'no GNU make on PATH');
  for (const make of gnuMakes) assertIntegrateArgumentsAsTyped(make);
});

function assertIntegrateArgumentsAsTyped(make: string): void {
  const root = mkdtempSync(join(tmpdir(), 'taskelith-integrate-make-'));
  try {
    write(join(root, '.nvmrc'), readFileSync(join(repository, '.nvmrc'), 'utf8'));
    write(join(root, '.github/workflows/release.yml'), '');
    write(join(root, 'scripts/with-pinned-node.sh'), 'shift\nexec "$@"\n');
    write(join(root, 'scripts/integrate.sh'), 'printf \'%s\\0\' "$@" > args\nenv > environment\n');
    const marker = join(root, 'expanded');
    const title = `Title with $HOME, $$, $(shell touch ${marker}), and "quotes" 'too'`;
    const body = `Line one with \`backticks\`\nline two with $(shell touch ${marker}) and $(MAKE)`;
    const run = spawnSync(make, ['-f', join(repository, 'Makefile'), '--no-print-directory', 'integrate', 'BRANCH=feature', `TITLE=${title}`, `BODY=${body}`, 'RESUME=1'], {
      cwd: root, encoding: 'utf8', env: { ...fixtureEnv, MAKEFLAGS: '' },
    });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(existsSync(marker), false, `${make} ran a $(shell) of the arguments`);
    assert.deepEqual(readFileSync(join(root, 'args'), 'utf8').split('\0').slice(0, -1), ['--resume', 'feature', title, body]);
    assert.doesNotMatch(readFileSync(join(root, 'environment'), 'utf8'), /^MAKEFLAGS=/m);
    for (const resume of ['0', 'yes', '']) {
      const fresh = spawnSync(make, ['-f', join(repository, 'Makefile'), '--no-print-directory', 'integrate', 'BRANCH=feature', 'TITLE=t', 'BODY=b', `RESUME=${resume}`], {
        cwd: root, encoding: 'utf8', env: { ...fixtureEnv, MAKEFLAGS: '' },
      });
      assert.equal(fresh.status, 0, fresh.stderr);
      assert.deepEqual(readFileSync(join(root, 'args'), 'utf8').split('\0').slice(0, -1), ['feature', 't', 'b'], `RESUME=${resume}`);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
