import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import {
  BEGIN, checkRecord, END, insertBlock, locateChange, parseVerifyLog, passesLines, runCommand, splitRecord,
  systemProbes, type Probes, type RecordContext,
} from '../scripts/verification-record.ts';
import { finishVerify, gitIn, startTree } from '../scripts/verify-stamp.ts';
import { fixtureEnv } from './git-fixture-env.ts';
import { gnuMakes } from './gnu-makes.ts';

const CHANGE = 'demo-change';
const RECORD = `openspec/changes/${CHANGE}/verification.md`;
const TOOLCHAIN = { node: 'v24.22.1', npm: '12.2.1' };
const NOW = new Date('2026-10-27T10:00:00Z');
const repository = resolve(import.meta.dirname, '..');

const SKELETON = `# Verification: ${CHANGE}

## Checks and results

Hand-written checks.

## Independent review

None yet.

## Remaining gates

- Integration into dev by the coordinator (single pull request)
`;

const PASS = {
  change: CHANGE, pass: 1, role: 'A', reviewer: { harness: 'codex', model: 'gpt-6.1-sol', variant: 'medium' },
  session: 'session-1', counts: { critical: 0, high: 1, medium: 2, low: 0 },
};

function git(root: string, ...args: string[]): string {
  return execFileSync('git', [
    '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', ...args,
  ], { cwd: root, encoding: 'utf8', env: fixtureEnv, stdio: ['ignore', 'pipe', 'pipe'] });
}

function write(root: string, path: string, text: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}

function commitAll(root: string, message: string): void {
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', message);
}

let probeCalls: string[] = [];
const fakeProbes: Probes = {
  openspecValidate: (change, archived) => {
    probeCalls.push(`openspec ${change} ${archived}`);
    return `passed, \`Change '${change}' is valid\``;
  },
  findingsValidate: () => 'passed, `Every findings file is valid: 1 file(s)`',
};

// A clone with origin/dev at the base and an active change on a branch.
function withChange(body: (context: RecordContext) => void): void {
  const root = mkdtempSync(join(tmpdir(), 'taskelith-record-'));
  try {
    git(root, 'init', '-q', '-b', 'dev');
    write(root, 'openspec/specs/demo/spec.md', '# demo\n');
    commitAll(root, 'base');
    git(root, 'update-ref', 'refs/remotes/origin/dev', 'HEAD');
    git(root, 'switch', '-q', '-c', CHANGE);
    write(root, RECORD, SKELETON);
    write(root, `openspec/changes/${CHANGE}/passes.jsonl`, '');
    write(root, 'openspec/specs/demo/spec.md', '# demo\n\nchanged\n');
    commitAll(root, 'change');
    probeCalls = [];
    body({ root, git: gitIn(root), probes: fakeProbes, toolchain: () => TOOLCHAIN });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// What a passing make verify of the clean HEAD prints, with its stamp.
function verifyLog(context: RecordContext, extra = ''): string {
  const result = finishVerify({ ...context, toolchain: TOOLCHAIN, environment: {} }, 'full', startTree(context.git), NOW);
  return `make verify: profile full (test)\nℹ tests 12\nℹ suites 0\nℹ pass 10\nℹ fail 0\nℹ skipped 2\nℹ all files | 99.24 | 92.18 | 98.92 |\n${extra}${result}\n`;
}

function record(context: RecordContext): string {
  return readFileSync(join(context.root, RECORD), 'utf8');
}

test('a make verify log gives the result, counts, and coverage', () => {
  const tree = 'a'.repeat(40);
  const parsed = parseVerifyLog(`make verify: profile full (x)\nℹ tests 3\nℹ pass 3\nℹ fail 0\nℹ skipped 0\nℹ all files | 90.00 | 80.50 | 70.25 |\nmake verify: passed, profile full, tree ${tree}; stamp written\n`);
  assert.deepEqual(parsed, {
    profile: 'full', tree, counts: 'tests 3, pass 3, fail 0, skipped 0',
    coverage: 'all files 90.00% lines, 80.50% branches, 70.25% functions',
  });
  const docsOnly = parseVerifyLog(`make verify: profile docs-only (x)\nmake verify: passed, profile docs-only, tree ${tree}; stamp written\n`);
  assert.equal(docsOnly.counts, 'no test totals in the log');
  assert.equal(docsOnly.coverage, 'no coverage totals');
});

test('a log without a stamped passing run is refused', () => {
  for (const log of ['make: *** [verify-checks] Error 1\n', 'make verify: passed, profile full, uncommitted working tree; no stamp written\n']) {
    assert.throws(() => parseVerifyLog(log), /does not end with a passing make verify of a clean tree with a stamp/);
  }
});

const TREE = 'a'.repeat(40);
const STAMPED = `make verify: passed, profile full, tree ${TREE}; stamp written`;
const COVERAGE = 'ℹ all files | 90.00 | 80.50 | 70.25 |';

function fullRun(totals: string, coverage = COVERAGE): string {
  return `make verify: profile full (x)\n${totals}\n${coverage}\n${STAMPED}\n`;
}

// Review finding 11: one log must not mix runs or hide a later failure.
test('only the last complete run of a log counts', () => {
  const failed = 'make verify: profile full (x)\nℹ tests 3\nℹ pass 2\nℹ fail 1\nℹ skipped 0\nmake: *** [test] Error 1\n';
  const parsed = parseVerifyLog(`${failed}${fullRun('ℹ tests 3\nℹ pass 3\nℹ fail 0\nℹ skipped 0')}`);
  assert.equal(parsed.counts, 'tests 3, pass 3, fail 0, skipped 0');
  const refused: Array<[string, RegExp]> = [
    [`${fullRun('ℹ tests 3\nℹ pass 3\nℹ fail 0\nℹ skipped 0')}ℹ fail 1\n`, /does not end with a passing make verify/],
    [fullRun('ℹ tests 3\nℹ pass 3\nℹ fail 0\nℹ skipped 0\nℹ tests 4'), /reports 2 "tests" total lines/],
    [fullRun('ℹ tests 5\nℹ pass 3\nℹ fail 0\nℹ skipped 0'), /totals contradict each other: tests 5, pass 3/],
    [fullRun('ℹ tests 3\nℹ pass 2\nℹ fail 1\nℹ skipped 0'), /reports 1 failed and 0 cancelled tests/],
    [fullRun('ℹ tests 3\nℹ pass 2\nℹ fail 0\nℹ skipped 0\nℹ cancelled 1'), /reports 0 failed and 1 cancelled tests/],
    [fullRun('ℹ pass 3'), /the full run reports no test totals/],
    [fullRun('ℹ tests 3\nℹ pass 3\nℹ fail 0\nℹ skipped 0', ''), /the full run reports no coverage totals/],
    [fullRun('ℹ tests 3\nℹ pass 3\nℹ fail 0\nℹ skipped 0', `${COVERAGE}\n${COVERAGE}`), /reports 2 coverage total lines/],
    [`${STAMPED}\n`, /no make verify profile line before its result/],
    [`make verify: profile docs-only (x)\n${STAMPED}\n`, /started with profile docs-only but stamped full/],
  ];
  for (const [log, message] of refused) assert.throws(() => parseVerifyLog(log), message, log);
  const todo = parseVerifyLog(fullRun('ℹ tests 4\nℹ pass 3\nℹ fail 0\nℹ skipped 0\nℹ todo 1'));
  assert.equal(todo.counts, 'tests 4, pass 3, fail 0, skipped 0');
});

test('make record writes the generated part before the review section', () => {
  withChange((context) => {
    const log = join(context.root, '..', `${CHANGE}-verify.log`);
    writeFileSync(log, verifyLog(context));
    try {
      const result = runCommand(['write', CHANGE, log], context);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout, `make record: wrote the generated part of ${RECORD}\n`);
    } finally {
      rmSync(log, { force: true });
    }
    const text = record(context);
    const tree = git(context.root, 'rev-parse', 'HEAD^{tree}').trim();
    assert.ok(text.indexOf(BEGIN) > text.indexOf('Hand-written checks.'));
    assert.ok(text.indexOf(END) < text.indexOf('## Independent review'));
    assert.match(text, new RegExp(`- \`make verify\`: passed, profile full, tree \`${tree}\`; tests 12, pass 10, fail 0, skipped 2; all files 99.24% lines, 92.18% branches, 98.92% functions\\.`));
    assert.match(text, /- `npm run openspec -- validate demo-change --strict`: passed, `Change 'demo-change' is valid`\./);
    assert.match(text, /- `make findings ARGS="validate"`: passed, `Every findings file is valid: 1 file\(s\)`\./);
    assert.match(text, /- Spec diff against the merge base `[0-9a-f]{12}` with `origin\/dev`: `openspec\/specs\/demo\/spec\.md \| 2 \+\+`, `1 file changed, 2 insertions\(\+\)`\./);
    assert.match(text, /- Review passes in `passes.jsonl`: none yet\./);
    assert.deepEqual(probeCalls, [`openspec ${CHANGE} false`]);
  });
});

test('make record-check passes on the recorded tree and fails on drift', () => {
  withChange((context) => {
    const log = verifyLog(context);
    const logPath = join(context.root, '..', `${CHANGE}-check.log`);
    writeFileSync(logPath, log);
    try {
      runCommand(['write', CHANGE, logPath], context);
    } finally {
      rmSync(logPath, { force: true });
    }
    const passed = runCommand(['check', CHANGE], context);
    assert.equal(passed.status, 0, passed.stderr);
    assert.equal(passed.stdout, 'make record-check: the generated part matches the tree\n');
    commitAll(context.root, 'record');
    assert.deepEqual(checkRecord(context, CHANGE), []);
    write(context.root, `openspec/changes/${CHANGE}/passes.jsonl`, `${JSON.stringify(PASS)}\n`);
    const drift = runCommand(['check', CHANGE], context);
    assert.equal(drift.status, 1);
    assert.match(drift.stderr, /stale or missing: - Review passes in `passes.jsonl`:/);
    assert.doesNotMatch(drift.stderr, /the working tree differs/);
    write(context.root, 'openspec/specs/demo/spec.md', '# demo\n\ndrifted\n');
    const tree = runCommand(['check', CHANGE], context);
    assert.match(tree.stderr, /the working tree differs from the verified tree [0-9a-f]{12}: openspec\/specs\/demo\/spec\.md/);
    assert.match(tree.stderr, /make record-check: \d+ problem\(s\)\n$/);
  });
});

function recordedChange(context: RecordContext): void {
  const logPath = join(context.root, '..', `${CHANGE}-files.log`);
  writeFileSync(logPath, verifyLog(context));
  try {
    assert.equal(runCommand(['write', CHANGE, logPath], context).status, 0);
  } finally {
    rmSync(logPath, { force: true });
  }
}

test('record-check accepts later edits of the change record files only', () => {
  withChange((context) => {
    recordedChange(context);
    write(context.root, `openspec/changes/${CHANGE}/tasks.md`, '- [x] 1.1 Run make verify\n');
    write(context.root, `openspec/changes/${CHANGE}/findings.jsonl`, '{}\n');
    assert.deepEqual(checkRecord(context, CHANGE), []);
    for (const path of [`openspec/changes/${CHANGE}/design.md`, 'scripts/other.ts']) {
      write(context.root, path, 'drift\n');
      const problems = checkRecord(context, CHANGE).join('\n');
      assert.match(problems, new RegExp(`the working tree differs from the verified tree [0-9a-f]{12}: ${path}$`), path);
      rmSync(join(context.root, path));
    }
  });
});

function recordFromLog(context: RecordContext): void {
  const logPath = join(context.root, '..', `${CHANGE}-edit.log`);
  writeFileSync(logPath, verifyLog(context));
  try {
    assert.equal(runCommand(['write', CHANGE, logPath], context).status, 0);
  } finally {
    rmSync(logPath, { force: true });
  }
}

// Review finding 10: record-check must catch a hand edit of every field.
test('a hand edit of the recorded counts or coverage fails the check', () => {
  withChange((context) => {
    recordFromLog(context);
    assert.deepEqual(checkRecord(context, CHANGE), []);
    const original = record(context);
    const edits = ['tests 12,', 'pass 10,', 'fail 0,', 'skipped 2;', '99.24% lines', '92.18% branches', '98.92% functions'];
    for (const field of edits) {
      writeFileSync(join(context.root, RECORD), original.replace(field, field.replace(/\d+/, '7')));
      assert.match(checkRecord(context, CHANGE).join('\n'), /the make verify line differs from the one make record wrote from the log/, field);
    }
  });
});

test('make record refuses a log whose run has no stamp in this clone', () => {
  withChange((context) => {
    const logPath = join(context.root, '..', `${CHANGE}-nostamp.log`);
    writeFileSync(logPath, fullRun('ℹ tests 3\nℹ pass 3\nℹ fail 0\nℹ skipped 0'));
    try {
      const result = runCommand(['write', CHANGE, logPath], context);
      assert.equal(result.status, 2);
      assert.match(result.stderr, /no full make verify stamp of tree aaaaaaaaaaaa in this clone/);
    } finally {
      rmSync(logPath, { force: true });
    }
  });
});

test('a record-check needs the stamp of the recorded tree in this clone', () => {
  withChange((context) => {
    const tree = git(context.root, 'rev-parse', 'HEAD^{tree}').trim();
    runCommand(['write', CHANGE], context);
    const text = record(context).replace('- `make verify`: not recorded; run `make record` with `LOG=<make verify log>`.',
      `- \`make verify\`: passed, profile full, tree \`${tree}\`; tests 1, pass 1, fail 0, skipped 0; no coverage totals.`);
    writeFileSync(join(context.root, RECORD), text);
    assert.deepEqual(checkRecord(context, CHANGE), [`${RECORD}: no full make verify stamp of tree ${tree.slice(0, 12)} in this clone`]);
    const unknown = text.replace(tree, 'b'.repeat(40));
    writeFileSync(join(context.root, RECORD), unknown);
    assert.match(checkRecord(context, CHANGE).join('\n'), /the verified tree bbbbbbbbbbbb is not in this clone/);
  });
});

test('a record without a verify line or without the generated part fails the check', () => {
  withChange((context) => {
    assert.deepEqual(checkRecord(context, CHANGE), [`${RECORD}: no generated part; run make record`]);
    runCommand(['write', CHANGE, ''], context);
    assert.match(record(context), /- `make verify`: not recorded; run `make record` with `LOG=<make verify log>`\./);
    assert.match(checkRecord(context, CHANGE).join('\n'), /records no passing run; run make record with LOG/);
    writeFileSync(join(context.root, RECORD), record(context).replace(/- `make verify`: not recorded[^\n]*\n/, ''));
    assert.match(checkRecord(context, CHANGE).join('\n'), /the generated part has \d+ lines, expected \d+/);
  });
});

test('a second make record replaces only the generated part', () => {
  withChange((context) => {
    runCommand(['write', CHANGE], context);
    const first = record(context);
    writeFileSync(join(context.root, `openspec/changes/${CHANGE}/passes.jsonl`), `${JSON.stringify(PASS)}\n${JSON.stringify({ ...PASS, pass: 2, role: 'B', artifact: 'plan', reviewer: { harness: 'claude', model: 'claude-opus-5-5' } })}\n`);
    runCommand(['write', CHANGE], context);
    const second = record(context);
    assert.equal(splitRecord(second).before, splitRecord(first).before);
    assert.equal(splitRecord(second).after, splitRecord(first).after);
    assert.match(second, /\| 1 \| A \| `codex gpt-6\.1-sol#medium` \| `session-1` \| 0 \| 1 \| 2 \| 0 \|/);
    assert.match(second, /\| plan 2 \| B \| `claude claude-opus-5-5` \| `session-1` \| 0 \| 1 \| 2 \| 0 \|/);
  });
});

test('the block is inserted before the first section that follows the checks', () => {
  const block = `${BEGIN}\nx\n${END}`;
  assert.equal(insertBlock('# V\n\n## Limitations\n\nNone.\n', block), `# V\n\n${block}\n\n## Limitations\n\nNone.\n`);
  assert.equal(insertBlock('# V\n\n## Remaining gates\n', block), `# V\n\n${block}\n\n## Remaining gates\n`);
  assert.equal(insertBlock('# V\n', block), `# V\n\n${block}\n`);
  assert.throws(() => splitRecord(`${END}\n${BEGIN}`), /unmatched or repeated/);
  assert.throws(() => splitRecord(`${BEGIN}\n${BEGIN}\n${END}`), /unmatched or repeated/);
  assert.throws(() => splitRecord(`${BEGIN}\n`), /unmatched or repeated/);
});

test('changes are found active or archived, by a valid name only', () => {
  withChange((context) => {
    assert.deepEqual(locateChange(context.root, CHANGE), { change: CHANGE, directory: `openspec/changes/${CHANGE}`, archived: false });
    git(context.root, 'mv', `openspec/changes/${CHANGE}`, `openspec/changes/archive-tmp`);
    mkdirSync(join(context.root, 'openspec/changes/archive'));
    git(context.root, 'mv', 'openspec/changes/archive-tmp', `openspec/changes/archive/2026-10-27-${CHANGE}`);
    assert.deepEqual(locateChange(context.root, CHANGE), { change: CHANGE, directory: `openspec/changes/archive/2026-10-27-${CHANGE}`, archived: true });
    runCommand(['write', CHANGE], context);
    assert.deepEqual(probeCalls, [`openspec ${CHANGE} true`]);
    assert.match(readFileSync(join(context.root, `openspec/changes/archive/2026-10-27-${CHANGE}/verification.md`), 'utf8'),
      /- `npm run openspec -- validate --all --strict --no-interactive`: passed/);
    assert.throws(() => locateChange(context.root, 'missing'), /no single active or archived change named missing/);
    assert.throws(() => locateChange(context.root, '../x'), /invalid change name/);
    assert.throws(() => locateChange(join(context.root, 'nowhere'), 'missing'), /no single active or archived change/);
  });
});

test('no merge base is reported in the spec diff', () => {
  withChange((context) => {
    git(context.root, 'update-ref', '-d', 'refs/remotes/origin/dev');
    runCommand(['write', CHANGE], context);
    assert.match(record(context), /- Spec diff: no merge base with `origin\/dev`\./);
  });
});

test('an empty spec diff and passes are rendered', () => {
  assert.deepEqual(passesLines('\n'), ['- Review passes in `passes.jsonl`: none yet.']);
});

test('invalid commands print the usage with status 2', () => {
  const context: RecordContext = { root: '/', git: () => '', probes: fakeProbes, toolchain: () => TOOLCHAIN };
  for (const args of [[], ['write'], ['check'], ['check', CHANGE, 'extra'], ['write', CHANGE, 'log', 'extra'], ['other', CHANGE]]) {
    const result = runCommand(args, context);
    assert.equal(result.status, 2, JSON.stringify(args));
    assert.match(result.stderr, /^usage: verification-record\.ts/);
  }
  assert.throws(() => runCommand(['write', CHANGE, '/nonexistent/log'], context), /ENOENT/);
});

test('the system probes report the real validations of this repository', () => {
  const probes = systemProbes(repository);
  assert.match(probes.findingsValidate(), /^passed, `Every findings file is valid: \d+ file\(s\); every pass summary file is valid: \d+ file\(s\)\.`$/);
  assert.match(probes.openspecValidate('no-such-change-for-the-test', false), /^failed, `/);
});

// Found after review pass 1, as H1: CHANGE and LOG reach the script as typed;
// make 4.4 expanded them for its $(shell) calls until they were unexported.
test('make record and make record-check pass their arguments as typed', () => {
  assert.notEqual(gnuMakes.length, 0, 'no GNU make on PATH');
  for (const make of gnuMakes) assertRecordArgumentsAsTyped(make);
});

function assertRecordArgumentsAsTyped(make: string): void {
  const root = mkdtempSync(join(tmpdir(), 'taskelith-record-make-'));
  try {
    write(root, '.nvmrc', readFileSync(join(repository, '.nvmrc'), 'utf8'));
    write(root, '.github/workflows/release.yml', '');
    write(root, 'scripts/with-pinned-node.sh', 'shift\nprintf \'%s\\0\' "$@" > args\nenv > environment\n');
    const marker = join(root, 'expanded');
    const change = `demo $HOME $$ $(shell touch ${marker}) "q" 'q'`;
    const log = `log with \`ticks\` $(shell touch ${marker}) and $(MAKE)`;
    const script = 'scripts/verification-record.ts';
    const node = ['node', '--experimental-strip-types', script];
    for (const [target, expected] of [['record', ['write', change, log]], ['record-check', ['check', change]]] as const) {
      const run = spawnSync(make, ['-f', join(repository, 'Makefile'), '--no-print-directory', target, `CHANGE=${change}`, `LOG=${log}`], {
        cwd: root, encoding: 'utf8', env: { ...fixtureEnv, MAKEFLAGS: '' },
      });
      assert.equal(run.status, 0, run.stderr);
      assert.equal(existsSync(marker), false, `${make} ${target} ran a $(shell) of the arguments`);
      assert.deepEqual(readFileSync(join(root, 'args'), 'utf8').split('\0').slice(0, -1), [...node, ...expected]);
      assert.doesNotMatch(readFileSync(join(root, 'environment'), 'utf8'), /^MAKEFLAGS=/m);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
