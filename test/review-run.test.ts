import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync, closeSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { ajvSchemaCheck, SCHEMA_PATH, type RunResult } from '../scripts/findings-common.ts';
import { PASS_SCHEMA_PATH } from '../scripts/findings.ts';
import { CREDENTIAL_VARIABLE } from '../scripts/review-route-jev.ts';
import {
  EXIT_REFUSED, EXIT_REVIEWER_FAILED, EXIT_ROUTED, EXIT_USAGE, runReview, type ReviewDependencies,
} from '../scripts/review-run.ts';
import { openFreshLog, ReviewFileError } from '../scripts/review-files.ts';
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
const OPENCODE = 'opencode opencode-go/kimi-k2.7-code#default';
const AGY = 'agy gemini-4-argon-medium#medium';
// The stub's sh sets these itself.
const ADDED_BY_SHELL = ['PWD', 'SHLVL', '_', 'OLDPWD'];
const CODEX_SESSION = '01a181b7-647f-7d90-abe6-9892355ab6ca';
const STARTED = new Date('2026-10-28T12:00:00Z');
const ROUTED = `${JSON.stringify({ routedBy: 'fake route' })}\n`;

interface Fixture {
  readonly root: string;
  readonly scratch: string;
  readonly prompt: string;
  readonly log: string;
  readonly routed: string[];
  readonly printed: string[];
  readonly environment: Record<string, string>;
}

const CODEX_STUB = `#!/bin/sh
env > "$STUB_DIR/env.txt"
printf '%s\\n' "$@" > "$STUB_DIR/args.txt"
cat > "$STUB_DIR/stdin.txt"
printf 'model: %s\\nsandbox: read-only\\nreasoning effort: medium\\nsession id: %s\\n' "\${STUB_MODEL:-gpt-6.1-sol}" ${CODEX_SESSION}
exit "\${STUB_STATUS:-0}"
`;

const CLAUDE_STUB = `#!/bin/sh
env > "$STUB_DIR/env.txt"
printf '%s\\n' '{"type":"result","session_id":"c3aae8d2","modelUsage":{"claude-opus-5-5":{}}}'
`;

const OPENCODE_STUB = `#!/bin/sh
if [ "$1" = session ]; then
  printf '%s\\n' '{"messages":[{"type":"user"},{"type":"assistant","model":MODEL}]}'
  exit "\${STUB_EXPORT_STATUS:-0}"
fi
printf '%s\\n' '{"type":"step_start","sessionID":"ses_stub1"}'
`;
const OPENCODE_MODEL = '{"id":"kimi-k2.7-code","providerID":"opencode-go","variant":"default"}';

const AGY_LINE = 'I1024 13:19:29.967626 715 model_config_manager.go:340] '
  + 'Propagating selected model override to backend: label="Gemini 4 Argon (Medium)"';
const AGY_STUB = `#!/bin/sh
while [ "$#" -gt 0 ]; do
  if [ "$1" = --log-file ]; then log="$2"; fi
  shift
done
printf '%s\\n' '${AGY_LINE}' >> "$log"
printf '%s\\n' '{"conversation_id":"conv-stub1","response":"ok"}'
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
    writeStub(bin, 'opencode', OPENCODE_STUB.replace('MODEL', OPENCODE_MODEL), scratch);
    writeStub(bin, 'agy', AGY_STUB, scratch);
    const prompt = join(scratch, 'prompt.txt');
    writeFileSync(prompt, 'Review the change.\n');
    const environment = {
      PATH: `${bin}:/usr/bin:/bin`, HOME: base, LANG: 'C', [CREDENTIAL_VARIABLE]: SENTINEL, TASKELITH_FAKE_SECRET: SENTINEL,
    };
    await body({ root, scratch, prompt, log: join(scratch, 'pass.log'), routed: [], printed: [], environment });
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}

function dependencies(fixture: Fixture, routeExit = 0): ReviewDependencies {
  return {
    root: fixture.root,
    environment: fixture.environment,
    toolchain: () => TOOLCHAIN,
    print: (line) => fixture.printed.push(line),
    now: () => STARTED,
    route: async (change) => {
      fixture.routed.push(change);
      if (routeExit === 0) writeFileSync(join(fixture.root, ROUTE), ROUTED);
      return { exitCode: routeExit, stdout: 'route: standard (no trigger)\n', stderr: routeExit === 0 ? '' : 'route: refused\n' };
    },
  };
}

function review(fixture: Fixture, pass: string, reviewer = CODEX, routeExit = 0) {
  return reviewFiles(fixture, pass, reviewer, { prompt: fixture.prompt, log: fixture.log }, routeExit);
}

// The lines printed while the pass ran come first, as on a terminal.
async function reviewFiles(
  fixture: Fixture, pass: string, reviewer: string, files: { prompt: string; log: string }, routeExit = 0,
): Promise<RunResult> {
  const role = pass === '2' ? 'B' : 'A';
  fixture.printed.length = 0;
  const result = await runReview([CHANGE, pass, role, reviewer, files.prompt, files.log], dependencies(fixture, routeExit));
  return { ...result, stdout: fixture.printed.map((line) => `${line}\n`).join('') + result.stdout };
}

function binOf(fixture: Fixture): string {
  return join(fixture.root, '..', 'bin');
}

// While it is set, Node.js adds NODE_V8_COVERAGE to every child's env.
async function underCoverage<T>(directory: string, body: () => Promise<T>): Promise<T> {
  const previous = process.env.NODE_V8_COVERAGE;
  process.env.NODE_V8_COVERAGE = previous ?? directory;
  try {
    return await body();
  } finally {
    if (previous === undefined) delete process.env.NODE_V8_COVERAGE;
  }
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
    assert.equal(readFileSync(join(fixture.root, ROUTE), 'utf8'), ROUTED);
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
    assert.equal(readFileSync(join(fixture.root, ROUTE), 'utf8'), ROUTED);
  });
});

test('a failed route refuses the pass and restores the stale route.json', async () => {
  await withFixture(async (fixture) => {
    writeRoute(fixture.root, git(fixture.root, 'rev-parse', 'HEAD~1'));
    const stale = readFileSync(join(fixture.root, ROUTE), 'utf8');
    stamp(fixture.root);
    const result = await review(fixture, '1', CODEX, 1);
    assert.equal(result.exitCode, EXIT_REFUSED);
    assert.match(result.stderr, /routing failed, so .*route\.json was restored:\nroute: refused/);
    assert.equal(readFileSync(join(fixture.root, ROUTE), 'utf8'), stale);
    assert.equal(git(fixture.root, 'status', '--porcelain'), '');
  });
});

test('a route.json whose headCommit is an option is stale and never reaches git', async () => {
  await withFixture(async (fixture) => {
    const planted = join(fixture.scratch, 'diff.txt');
    writeRoute(fixture.root, `--output=${planted}`);
    stamp(fixture.root);
    const result = await review(fixture, '1');
    assert.equal(result.exitCode, EXIT_ROUTED, result.stderr);
    assert.match(result.stderr, /route\.json was made for another tree/);
    assert.equal(existsSync(planted), false);
  });
});

test('pass 1 with a fresh route runs the reviewer with exactly its allowlist', async () => {
  await withFixture(async (fixture) => {
    writeRoute(fixture.root, git(fixture.root, 'rev-parse', 'HEAD'));
    const result = await underCoverage(join(fixture.scratch, 'coverage'), () => review(fixture, '1'));
    assert.equal(result.exitCode, 0, result.stderr);
    assert.deepEqual(fixture.routed, []);
    const child = readFileSync(join(fixture.scratch, 'env.txt'), 'utf8');
    assert.equal(child.includes(SENTINEL), false);
    assert.equal(child.includes(CREDENTIAL_VARIABLE), false);
    const names = child.split('\n').filter(Boolean).map((line) => line.split('=')[0]!);
    assert.deepEqual(names.filter((name) => !ADDED_BY_SHELL.includes(name)).sort(), ['HOME', 'LANG', 'PATH']);
    assert.ok(names.every((name) => [...BASE_ENVIRONMENT, 'CODEX_HOME', ...ADDED_BY_SHELL].includes(name)));
    assert.deepEqual(readFileSync(join(fixture.scratch, 'args.txt'), 'utf8').split('\n').filter(Boolean), [
      'exec', '-m', 'gpt-6.1-sol', '-c', 'model_reasoning_effort="medium"', '-s', 'read-only', '-C', fixture.root, '-',
    ]);
    assert.equal(readFileSync(join(fixture.scratch, 'stdin.txt'), 'utf8'), 'Review the change.\n');
    assert.match(result.stdout, /^route: route\.json was made for this tree$/m);
    assert.match(result.stdout, new RegExp(`^session: ${CODEX_SESSION}$`, 'm'));
    assert.match(result.stdout, /^effort: medium \(reported\)\nsandbox: read-only \(reported\)$/m);
  });
});

test('a failed attempt keeps the lines printed before the reviewer started', async () => {
  await withFixture(async (fixture) => {
    writeRoute(fixture.root, git(fixture.root, 'rev-parse', 'HEAD'));
    writeStub(binOf(fixture), 'codex', CODEX_STUB.replace('${STUB_STATUS:-0}', '3'), fixture.scratch);
    const result = await review(fixture, '1');
    assert.equal(result.exitCode, EXIT_REVIEWER_FAILED);
    const printed = [
      'route: route.json was made for this tree',
      `review: codex exec -m gpt-6.1-sol -c model_reasoning_effort="medium" -s read-only -C ${fixture.root} -`,
      'environment: PATH HOME LANG',
      `log: ${fixture.log}`,
      `started: ${STARTED.toISOString()}`,
    ];
    assert.equal(result.stdout, printed.map((line) => `${line}\n`).join(''));
  });
});

test('Codex is confirmed by the effort and sandbox of its header', async () => {
  await withFixture(async (fixture) => {
    const stubs: [string, RegExp][] = [
      [CODEX_STUB.replace('reasoning effort: medium', 'reasoning effort: high'), /reported effort high, not medium/],
      [CODEX_STUB.replace('sandbox: read-only', 'sandbox: workspace-write'), /reported sandbox workspace-write, not read-only/],
      [CODEX_STUB.replace('reasoning effort: medium\\n', ''), /reported effort none, not medium/],
    ];
    for (const [stub, message] of stubs) {
      writeStub(binOf(fixture), 'codex', stub, fixture.scratch);
      const failed = await review(fixture, '2');
      assert.equal(failed.exitCode, EXIT_REVIEWER_FAILED, stub);
      assert.match(failed.stderr, message);
    }
  });
});

function writeRecommendation(root: string, passA: object, passB: object): void {
  const rule = { passes: [{ reviewer: passA }, { reviewer: passB }] };
  writeFileSync(join(root, ROUTE), `${JSON.stringify({ rule })}\n`);
}

const CODEX_HIGH = { harness: 'codex', model: 'gpt-6.1-sol', variant: 'high' };
const CLAUDE_XHIGH = { harness: 'claude', model: 'claude-opus-5-5', variant: 'xhigh' };

test('the route recommendation tells an effort apart from another reviewer', async () => {
  await withFixture(async (fixture) => {
    writeRecommendation(fixture.root, CODEX_HIGH, CLAUDE_XHIGH);
    const second = await review(fixture, '2', CLAUDE);
    assert.match(second.stdout, /^route: recommends effort xhigh; the authorized high applies \(policy version 7\)$/m);
    assert.doesNotMatch(second.stdout, /reviewer A|coordinator/);
    const third = await review(fixture, '3');
    assert.match(third.stdout, /^route: recommends effort high; the authorized medium applies \(policy version 7\)$/m);
    writeRecommendation(fixture.root, { ...CODEX_HIGH, variant: 'medium' }, CLAUDE_XHIGH);
    assert.match((await review(fixture, '3')).stdout, /^route: recommends codex gpt-6\.1-sol#medium$/m);
    writeRecommendation(fixture.root, { ...CODEX_HIGH, model: 'gpt-6-astra' }, { ...CLAUDE_XHIGH, model: 'claude-fable-5-1' });
    const otherA = await review(fixture, '3');
    assert.match(otherA.stdout, new RegExp('^route: recommends codex gpt-6-astra#high; the brief\'s codex gpt-6\\.1-sol#medium '
      + 'stays, so report the other reviewer A to the coordinator$', 'm'));
    const otherB = await review(fixture, '2', CLAUDE);
    assert.match(otherB.stdout, /^route: recommends claude claude-fable-5-1#xhigh; the brief's claude claude-opus-5-5#high stays$/m);
  });
});

const PASS_LINE = {
  change: CHANGE, pass: 2, role: 'B', reviewer: { harness: 'claude', model: 'claude-opus-5-5', variant: 'high' },
  session: 'c3aae8d2',
};

function passSchemaErrors(line: unknown): readonly string[] {
  const read = (path: string) => JSON.parse(readFileSync(path, 'utf8')) as object;
  return ajvSchemaCheck(read(PASS_SCHEMA_PATH), [read(SCHEMA_PATH)])(line);
}

test('a pass writes no line and prints a template that is invalid until filled', async () => {
  await withFixture(async (fixture) => {
    const result = await review(fixture, '2', CLAUDE);
    assert.equal(result.exitCode, 0, result.stderr);
    assert.deepEqual(passLines(fixture.root), []);
    const printed = /^passes\.jsonl template: (.*)$/m.exec(result.stdout);
    assert.ok(printed, result.stdout);
    const template = JSON.parse(printed[1]!) as object;
    const placeholders = { critical: '<critical>', high: '<high>', medium: '<medium>', low: '<low>' };
    assert.deepEqual(template, { ...PASS_LINE, counts: placeholders });
    assert.notDeepEqual(passSchemaErrors(template), []);
    assert.deepEqual(passSchemaErrors({ ...template, counts: { critical: 0, high: 1, medium: 0, low: 2 } }), []);
    assert.deepEqual(fixture.routed, []);
    assert.equal(readFileSync(join(fixture.scratch, 'env.txt'), 'utf8').includes(SENTINEL), false);
  });
});

test('a pass that already has a line is refused before the reviewer runs', async () => {
  await withFixture(async (fixture) => {
    const line = { ...PASS_LINE, counts: { critical: 0, high: 0, medium: 0, low: 0 } };
    writeFileSync(join(fixture.root, PASSES), `${JSON.stringify(line)}\n`);
    const again = await review(fixture, '2', CLAUDE);
    assert.equal(again.exitCode, EXIT_REFUSED);
    assert.match(again.stderr, /pass 2 already has a line in passes\.jsonl/);
    assert.equal(existsSync(join(fixture.scratch, 'env.txt')), false);
    assert.equal(passLines(fixture.root).length, 1);
  });
});

test('a failed or unconfirmed attempt writes no pass line', async () => {
  await withFixture(async (fixture) => {
    writeStub(binOf(fixture), 'codex', CODEX_STUB.replace('${STUB_STATUS:-0}', '3'), fixture.scratch);
    const failed = await review(fixture, '2');
    assert.equal(failed.exitCode, EXIT_REVIEWER_FAILED);
    assert.match(failed.stderr, /exited with status 3; no pass line written/);
    writeStub(binOf(fixture), 'codex', CODEX_STUB.replace('${STUB_MODEL:-gpt-6.1-sol}', 'gpt-other'), fixture.scratch);
    const other = await review(fixture, '2');
    assert.equal(other.exitCode, EXIT_REVIEWER_FAILED);
    assert.match(other.stderr, /reported model gpt-other, not gpt-6\.1-sol/);
    rmSync(join(binOf(fixture), 'codex'));
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
      [[CHANGE, '2', 'A', CODEX, fixture.prompt, fixture.log], EXIT_USAGE, /ROLE "A" is not the role of pass 2, which is B/],
      [[CHANGE, '3', 'B', CLAUDE, fixture.prompt, fixture.log], EXIT_USAGE, /ROLE "B" is not the role of pass 3, which is A/],
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

test('links, the prompt itself, and unusable logs are refused before any run', async () => {
  await withFixture(async (fixture) => {
    const tracked = join(fixture.root, 'src/index.ts');
    const at = (name: string) => join(fixture.scratch, name);
    symlinkSync(tracked, at('tracked-link.log'));
    linkSync(tracked, at('tracked-hard.log'));
    symlinkSync(join(fixture.root, 'scripts/tool.ts'), at('inside-prompt.txt'));
    linkSync(fixture.prompt, at('prompt-hard.log'));
    mkdirSync(at('directory.log'));
    writeFileSync(at('agy.log.cli.log'), 'Review the change.\n');
    const cases: [string, { prompt: string; log: string }, RegExp][] = [
      [CODEX, { prompt: fixture.prompt, log: at('tracked-link.log') }, /LOG .* is a symbolic link/],
      [CODEX, { prompt: fixture.prompt, log: at('tracked-hard.log') }, /LOG .* has other hard links/],
      [CODEX, { prompt: at('inside-prompt.txt'), log: fixture.log }, /PROMPT .* lies inside the worktree/],
      [CODEX, { prompt: fixture.prompt, log: fixture.prompt }, /LOG .* is the prompt file/],
      [CODEX, { prompt: fixture.prompt, log: at('prompt-hard.log') }, /LOG .* is the prompt file/],
      [CODEX, { prompt: fixture.prompt, log: at('none/pass.log') }, /the directory of LOG .* does not exist/],
      [CODEX, { prompt: fixture.prompt, log: at('directory.log') }, /LOG .* is no regular file/],
      [AGY, { prompt: at('agy.log.cli.log'), log: at('agy.log') }, /LOG .*agy\.log\.cli\.log is the prompt file/],
    ];
    for (const [reviewer, files, message] of cases) {
      const result = await reviewFiles(fixture, '2', reviewer, files);
      assert.equal(result.exitCode, EXIT_REFUSED, files.log);
      assert.match(result.stderr, message);
    }
    assert.equal(readFileSync(tracked, 'utf8'), 'export {};\n');
    assert.equal(readFileSync(fixture.prompt, 'utf8'), 'Review the change.\n');
    assert.equal(readFileSync(at('agy.log.cli.log'), 'utf8'), 'Review the change.\n');
    assert.equal(existsSync(join(fixture.scratch, 'env.txt')), false);
  });
});

test('a log is opened empty, without following a link planted after the check', () => {
  const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'taskelith-review-log-')));
  try {
    const log = join(scratch, 'pass.log');
    writeFileSync(log, 'an old attempt\n');
    closeSync(openFreshLog(log));
    assert.equal(readFileSync(log, 'utf8'), '');
    const target = join(scratch, 'target.txt');
    writeFileSync(target, 'keep\n');
    symlinkSync(target, join(scratch, 'link.log'));
    assert.throws(() => openFreshLog(join(scratch, 'link.log')), ReviewFileError);
    assert.throws(() => openFreshLog(scratch), ReviewFileError);
    linkSync(target, join(scratch, 'hard.log'));
    assert.throws(() => openFreshLog(join(scratch, 'hard.log')), /no regular file with one link/);
    assert.equal(readFileSync(target, 'utf8'), 'keep\n');
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test('a reviewer that cannot start is a failed attempt, not a crash', async () => {
  await withFixture(async (fixture) => {
    writeFileSync(fixture.prompt, 'Review\0the change.\n');
    const result = await review(fixture, '2', CLAUDE);
    assert.equal(result.exitCode, EXIT_REVIEWER_FAILED);
    assert.match(result.stderr, /claude could not start: .*; no pass line written/);
    assert.equal(readFileSync(fixture.log, 'utf8'), '');
  });
});

test('a route.json that is no object is stale for pass 1 and ignored later', async () => {
  await withFixture(async (fixture) => {
    writeFileSync(join(fixture.root, ROUTE), 'null\n');
    const first = await review(fixture, '1');
    assert.equal(first.exitCode, EXIT_REFUSED);
    assert.match(first.stderr, /route\.json was made for another tree/);
    const second = await review(fixture, '2');
    assert.equal(second.exitCode, 0, second.stderr);
    assert.doesNotMatch(second.stdout, /recommends/);
    writeFileSync(join(fixture.root, ROUTE), '{"rule":{"passes":[{"reviewer":5},{"reviewer":"x"}]}}\n');
    const third = await review(fixture, '3');
    assert.equal(third.exitCode, 0, third.stderr);
    assert.doesNotMatch(third.stdout, /recommends/);
  });
});

test('OpenCode is confirmed by the model of its session export', async () => {
  await withFixture(async (fixture) => {
    const confirmed = await review(fixture, '2', OPENCODE);
    assert.equal(confirmed.exitCode, 0, confirmed.stderr);
    assert.match(confirmed.stdout, /^session: ses_stub1$/m);
    assert.match(confirmed.stdout, /^model: opencode-go\/kimi-k2\.7-code \(reported\)$/m);
    const stubs: [string, RegExp][] = [
      [OPENCODE_STUB.replace('MODEL', OPENCODE_MODEL.replace('kimi-k2.7-code', 'other')), /reported model opencode-go\/other, not opencode-go\/kimi-k2\.7-code/],
      [OPENCODE_STUB.replace('MODEL', 'null'), /reported model none, not opencode-go\/kimi-k2\.7-code/],
      [OPENCODE_STUB.replace('MODEL', OPENCODE_MODEL).replace('${STUB_EXPORT_STATUS:-0}', '1'), /session export exited with status 1/],
    ];
    for (const [stub, message] of stubs) {
      writeStub(binOf(fixture), 'opencode', stub, fixture.scratch);
      const failed = await review(fixture, '2', OPENCODE);
      assert.equal(failed.exitCode, EXIT_REVIEWER_FAILED, stub);
      assert.match(failed.stderr, message);
    }
  });
});

test('Antigravity is confirmed only by a fresh model line of its own log', async () => {
  await withFixture(async (fixture) => {
    const cliLog = `${fixture.log}.cli.log`;
    const confirmed = await review(fixture, '2', AGY);
    assert.equal(confirmed.exitCode, 0, confirmed.stderr);
    assert.match(confirmed.stdout, /^model: gemini-4-argon-medium \(reported\)$/m);
    assert.equal(readFileSync(cliLog, 'utf8'), `${AGY_LINE}\n`);
    writeStub(binOf(fixture), 'agy', AGY_STUB.replace('(Medium)', '(Low)'), fixture.scratch);
    const other = await review(fixture, '2', AGY);
    assert.equal(other.exitCode, EXIT_REVIEWER_FAILED);
    assert.match(other.stderr, /reported model Gemini 4 Argon \(Low\), not gemini-4-argon-medium/);
    writeFileSync(cliLog, `${AGY_LINE}\n`);
    writeStub(binOf(fixture), 'agy', AGY_STUB.replace(/^printf .* >> "\$log"$/m, ''), fixture.scratch);
    const stale = await review(fixture, '2', AGY);
    assert.equal(stale.exitCode, EXIT_REVIEWER_FAILED);
    assert.match(stale.stderr, /reported model none/);
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
