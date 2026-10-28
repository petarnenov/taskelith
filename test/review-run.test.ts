import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { ajvSchemaCheck, SCHEMA_PATH } from '../scripts/findings-common.ts';
import { PASS_SCHEMA_PATH } from '../scripts/findings.ts';
import { CREDENTIAL_VARIABLE } from '../scripts/review-route-jev.ts';
import {
  EXIT_REFUSED, EXIT_REVIEWER_FAILED, EXIT_ROUTED, EXIT_USAGE, runReview, type ReviewDependencies,
} from '../scripts/review-run.ts';
import { BASE_ENVIRONMENT } from '../scripts/reviewer-invocations.ts';
import { gitIn, headRevision, stampDirectory, stampFields, writeStamp } from '../scripts/verify-stamp.ts';
import { commit, git } from './checklist-git-fixture.ts';
import { fixtureEnv } from './git-fixture-env.ts';

// make review on a temporary repository with stub reviewer CLIs; no real
// reviewer ever runs.

const CHANGE = 'review-me';
const DIRECTORY = `openspec/changes/${CHANGE}`;
const ROUTE = `${DIRECTORY}/route.json`;
const PASSES = `${DIRECTORY}/passes.jsonl`;
const CODEX = 'codex gpt-6.1-sol#medium';
const CLAUDE = 'claude claude-opus-5-5#high';
const SENTINEL = 'sentinel-secret-7d2e41';
const TOOLCHAIN = { node: 'v24.0.0', npm: '11.0.0' };
const CODEX_SESSION = '01a181b7-647f-7d90-abe6-9892355ab6ca';

interface Fixture {
  readonly root: string;
  readonly scratch: string;
  readonly prompt: string;
  readonly log: string;
  readonly routed: string[];
  readonly environment: Record<string, string>;
}

const CODEX_STUB = `#!/bin/sh
env > "$STUB_DIR/env.txt"
printf '%s\\n' "$@" > "$STUB_DIR/args.txt"
cat > "$STUB_DIR/stdin.txt"
printf 'model: %s\\nsandbox: read-only\\nsession id: %s\\n' "\${STUB_MODEL:-gpt-6.1-sol}" ${CODEX_SESSION}
exit "\${STUB_STATUS:-0}"
`;

const CLAUDE_STUB = `#!/bin/sh
env > "$STUB_DIR/env.txt"
printf '%s\\n' '{"type":"result","session_id":"c3aae8d2","modelUsage":{"claude-opus-5-5":{}}}'
`;

// The stub's directory is baked into its text, because the reviewer
// environment drops every variable that could name it.
function writeStub(bin: string, name: string, body: string, scratch: string): void {
  const path = join(bin, name);
  writeFileSync(path, body.replaceAll('$STUB_DIR', scratch));
  chmodSync(path, 0o755);
}

async function withFixture(body: (fixture: Fixture) => Promise<void>): Promise<void> {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'taskelith-review-run-')));
  const root = join(base, 'worktree');
  const scratch = join(base, 'scratch');
  const bin = join(base, 'bin');
  try {
    for (const directory of [root, scratch, bin]) mkdirSync(directory);
    git(root, 'init', '--quiet', '-b', 'dev');
    commit(root, { 'src/index.ts': 'export {};\n' }, 'base');
    git(root, 'update-ref', 'refs/remotes/origin/dev', 'HEAD');
    git(root, 'switch', '--quiet', '-c', CHANGE);
    commit(root, {
      'scripts/tool.ts': 'export const tool = 1;\n',
      [`${DIRECTORY}/proposal.md`]: 'A change.\n',
      [PASSES]: '',
      [`${DIRECTORY}/findings.jsonl`]: '',
    }, 'change');
    writeStub(bin, 'codex', CODEX_STUB, scratch);
    writeStub(bin, 'claude', CLAUDE_STUB, scratch);
    const prompt = join(scratch, 'prompt.txt');
    writeFileSync(prompt, 'Review the change.\n');
    const environment = {
      PATH: `${bin}:/usr/bin:/bin`, HOME: base, LANG: 'C', [CREDENTIAL_VARIABLE]: SENTINEL, TASKELITH_FAKE_SECRET: SENTINEL,
    };
    await body({ root, scratch, prompt, log: join(scratch, 'pass.log'), routed: [], environment });
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}

function dependencies(fixture: Fixture, routeExit = 0): ReviewDependencies {
  return {
    root: fixture.root,
    environment: fixture.environment,
    toolchain: () => TOOLCHAIN,
    route: async (change) => {
      fixture.routed.push(change);
      return { exitCode: routeExit, stdout: 'route: standard (no trigger)\n', stderr: routeExit === 0 ? '' : 'route: refused\n' };
    },
  };
}

function review(fixture: Fixture, pass: string, reviewer = CODEX, routeExit = 0) {
  const role = pass === '2' ? 'B' : 'A';
  return runReview([CHANGE, pass, role, reviewer, fixture.prompt, fixture.log], dependencies(fixture, routeExit));
}

function stamp(root: string): void {
  const git = gitIn(root);
  writeStamp(stampDirectory(git), stampFields(root, headRevision(git), 'full', TOOLCHAIN), new Date('2026-10-28T10:00:00Z'));
}

function writeRoute(root: string, headCommit: string): void {
  const devCommit = git(root, 'merge-base', 'HEAD', 'origin/dev');
  commit(root, { [ROUTE]: `${JSON.stringify({ devCommit, headCommit, rule: { passes: [] } })}\n` }, 'route');
}

function passLines(root: string): unknown[] {
  return readFileSync(join(root, PASSES), 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line) as unknown);
}

test('pass 1 without route.json and without a make verify stamp is refused before any run', async () => {
  await withFixture(async (fixture) => {
    const result = await review(fixture, '1');
    assert.equal(result.exitCode, EXIT_REFUSED);
    assert.match(result.stderr, /route\.json is missing, and no full stamp for tree \w+/);
    assert.deepEqual(fixture.routed, []);
    assert.equal(existsSync(join(fixture.scratch, 'env.txt')), false);
  });
});

test('pass 1 with a route made for another tree and no stamp is refused', async () => {
  await withFixture(async (fixture) => {
    writeRoute(fixture.root, git(fixture.root, 'rev-parse', 'HEAD~1'));
    const result = await review(fixture, '1');
    assert.equal(result.exitCode, EXIT_REFUSED);
    assert.match(result.stderr, /route\.json was made for another tree/);
    assert.deepEqual(fixture.routed, []);
  });
});

test('pass 1 on an uncommitted tree is refused even with a stamp', async () => {
  await withFixture(async (fixture) => {
    stamp(fixture.root);
    writeFileSync(join(fixture.root, 'scripts/tool.ts'), 'export const tool = 2;\n');
    const result = await review(fixture, '1');
    assert.equal(result.exitCode, EXIT_REFUSED);
    assert.match(result.stderr, /the working tree is not clean/);
    assert.deepEqual(fixture.routed, []);
  });
});

test('pass 1 without route.json on a stamped tree routes and stops for the commit', async () => {
  await withFixture(async (fixture) => {
    stamp(fixture.root);
    const result = await review(fixture, '1');
    assert.equal(result.exitCode, EXIT_ROUTED);
    assert.deepEqual(fixture.routed, [CHANGE]);
    assert.match(result.stderr, /so it was routed:\nroute: standard \(no trigger\)\nCommit .*route\.json, run make verify/);
    assert.equal(existsSync(join(fixture.scratch, 'env.txt')), false);
  });
});

test('a stale route on a stamped tree is deleted, routed again, and recorded as such', async () => {
  await withFixture(async (fixture) => {
    writeRoute(fixture.root, git(fixture.root, 'rev-parse', 'HEAD~1'));
    stamp(fixture.root);
    const result = await review(fixture, '1');
    assert.equal(result.exitCode, EXIT_ROUTED);
    assert.match(result.stderr, /record in verification\.md why it was routed again/);
    assert.equal(existsSync(join(fixture.root, ROUTE)), false);
  });
});

test('a failed route refuses the pass', async () => {
  await withFixture(async (fixture) => {
    stamp(fixture.root);
    const result = await review(fixture, '1', CODEX, 1);
    assert.equal(result.exitCode, EXIT_REFUSED);
    assert.match(result.stderr, /routing failed:\nroute: refused/);
  });
});

test('pass 1 with a fresh route runs the reviewer without the caller\'s secrets', async () => {
  await withFixture(async (fixture) => {
    writeRoute(fixture.root, git(fixture.root, 'rev-parse', 'HEAD'));
    const result = await review(fixture, '1');
    assert.equal(result.exitCode, 0, result.stderr);
    assert.deepEqual(fixture.routed, []);
    const child = readFileSync(join(fixture.scratch, 'env.txt'), 'utf8');
    assert.equal(child.includes(SENTINEL), false);
    assert.equal(child.includes(CREDENTIAL_VARIABLE), false);
    const names = child.split('\n').filter(Boolean).map((line) => line.split('=')[0]!);
    assert.deepEqual(names.filter((name) => !['PWD', 'SHLVL', '_', 'OLDPWD'].includes(name)).sort(), ['HOME', 'LANG', 'PATH']);
    assert.ok(names.every((name) => [...BASE_ENVIRONMENT, 'CODEX_HOME', 'PWD', 'SHLVL', '_', 'OLDPWD'].includes(name)));
    assert.deepEqual(readFileSync(join(fixture.scratch, 'args.txt'), 'utf8').split('\n').filter(Boolean), [
      'exec', '-m', 'gpt-6.1-sol', '-c', 'model_reasoning_effort="medium"', '-s', 'read-only', '-C', fixture.root, '-',
    ]);
    assert.equal(readFileSync(join(fixture.scratch, 'stdin.txt'), 'utf8'), 'Review the change.\n');
    assert.match(result.stdout, /^route: route\.json was made for this tree$/m);
    assert.match(result.stdout, new RegExp(`^session: ${CODEX_SESSION}$`, 'm'));
  });
});

test('a pass appends its schema-valid line with the reported session', async () => {
  await withFixture(async (fixture) => {
    const result = await review(fixture, '2', CLAUDE);
    assert.equal(result.exitCode, 0, result.stderr);
    const lines = passLines(fixture.root);
    assert.deepEqual(lines, [{
      change: CHANGE, pass: 2, role: 'B', reviewer: { harness: 'claude', model: 'claude-opus-5-5', variant: 'high' },
      session: 'c3aae8d2', counts: { critical: 0, high: 0, medium: 0, low: 0 },
    }]);
    const read = (path: string) => JSON.parse(readFileSync(path, 'utf8')) as object;
    const check = ajvSchemaCheck(read(PASS_SCHEMA_PATH), [read(SCHEMA_PATH)]);
    assert.deepEqual(check(lines[0]), []);
    assert.deepEqual(fixture.routed, []);
    assert.equal(readFileSync(join(fixture.scratch, 'env.txt'), 'utf8').includes(SENTINEL), false);
  });
});

test('a pass that already has a line is refused before the reviewer runs', async () => {
  await withFixture(async (fixture) => {
    assert.equal((await review(fixture, '2', CLAUDE)).exitCode, 0);
    rmSync(join(fixture.scratch, 'env.txt'));
    const again = await review(fixture, '2', CLAUDE);
    assert.equal(again.exitCode, EXIT_REFUSED);
    assert.match(again.stderr, /pass 2 already has a line in passes\.jsonl/);
    assert.equal(existsSync(join(fixture.scratch, 'env.txt')), false);
    assert.equal(passLines(fixture.root).length, 1);
  });
});

test('a failed or unconfirmed attempt writes no pass line', async () => {
  await withFixture(async (fixture) => {
    writeStub(join(fixture.root, '..', 'bin'), 'codex', CODEX_STUB.replace('${STUB_STATUS:-0}', '3'), fixture.scratch);
    const failed = await review(fixture, '2');
    assert.equal(failed.exitCode, EXIT_REVIEWER_FAILED);
    assert.match(failed.stderr, /exited with status 3; no pass line written/);
    writeStub(join(fixture.root, '..', 'bin'), 'codex', CODEX_STUB.replace('${STUB_MODEL:-gpt-6.1-sol}', 'gpt-other'), fixture.scratch);
    const other = await review(fixture, '2');
    assert.equal(other.exitCode, EXIT_REVIEWER_FAILED);
    assert.match(other.stderr, /reported model gpt-other, not gpt-6\.1-sol/);
    rmSync(join(fixture.root, '..', 'bin', 'codex'));
    const missing = await review(fixture, '2');
    assert.equal(missing.exitCode, EXIT_REVIEWER_FAILED);
    assert.deepEqual(passLines(fixture.root), []);
  });
});

test('wrong arguments and files inside the worktree are refused with the usage', async () => {
  await withFixture(async (fixture) => {
    const deps = dependencies(fixture);
    const cases: [string[], number, RegExp][] = [
      [[CHANGE, '1', 'A', CODEX, fixture.prompt], EXIT_USAGE, /every argument is required/],
      [[CHANGE, '0', 'A', CODEX, fixture.prompt, fixture.log], EXIT_USAGE, /PASS "0"/],
      [[CHANGE, '1', 'C', CODEX, fixture.prompt, fixture.log], EXIT_USAGE, /ROLE "C"/],
      [[CHANGE, '1', 'A', 'codex gpt-6.1-sol#high', fixture.prompt, fixture.log], EXIT_USAGE, /Reviewer keys:\n {2}codex gpt-6\.1-sol#medium/],
      [['Bad', '1', 'A', CODEX, fixture.prompt, fixture.log], EXIT_USAGE, /CHANGE "Bad"/],
      [['other-change', '1', 'A', CODEX, fixture.prompt, fixture.log], EXIT_REFUSED, /is no active change/],
      [[CHANGE, '1', 'A', CODEX, fixture.prompt, join(fixture.root, 'pass.log')], EXIT_REFUSED, /LOG .* lies inside the worktree/],
      [[CHANGE, '1', 'A', CODEX, join(fixture.scratch, 'none.txt'), fixture.log], EXIT_REFUSED, /PROMPT .* is no file/],
    ];
    for (const [args, exitCode, message] of cases) {
      const result = await runReview(args, deps);
      assert.equal(result.exitCode, exitCode, args.join(' '));
      assert.match(result.stderr, message);
    }
  });
});

// make passes every argument as typed: no expansion, and # and spaces kept.
test('make review passes its arguments to the script unexpanded', () => {
  const result = spawnSync('make', [
    '--no-print-directory', 'review', 'CHANGE=$(shell echo expanded)', 'PASS=1', 'ROLE=A',
    'REVIEWER=codex gpt-6.1-sol#high', 'PROMPT=/nonexistent/prompt', 'LOG=/nonexistent/log',
  ], { cwd: process.cwd(), encoding: 'utf8', env: fixtureEnv });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /make review: CHANGE "\$\(shell echo expanded\)" is no change name/);
  const reviewer = spawnSync('make', [
    '--no-print-directory', 'review', `CHANGE=${CHANGE}`, 'PASS=1', 'ROLE=A',
    'REVIEWER=codex gpt-6.1-sol#high', 'PROMPT=/nonexistent/prompt', 'LOG=/nonexistent/log',
  ], { cwd: process.cwd(), encoding: 'utf8', env: fixtureEnv });
  assert.match(reviewer.stderr, /make review: REVIEWER "codex gpt-6\.1-sol#high" is no authorized reviewer key/);
});
