import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { inspect } from 'node:util';
import type { RunResult } from '../scripts/findings-common.ts';
import { passPlans, SKIPPED_SHADOW, type RouteFeatures, type ShadowDecision } from '../scripts/review-route.ts';
import { commitInfos, GIT_EVALUATION_ENVIRONMENT } from '../scripts/review-route-environment.ts';
import {
  archivedRecordsOf,
  evaluateArchive,
  evaluationSchemaCheck,
  evaluationSummary,
  evaluationText,
  isPullRequestMerge,
  RetryOnceRouter,
  reviewsSeveralArtifacts,
  routeEvaluationDependencies,
  runRouteEvaluation,
  type EvaluationDependencies,
  type EvaluationEnvironment,
  type EvaluationLine,
} from '../scripts/review-route-evaluation.ts';
import { reviewOutcome } from '../scripts/review-route-effect.ts';
import { RouteRefusal } from '../scripts/review-route-features.ts';
import { CREDENTIAL_VARIABLE } from '../scripts/review-route-jev.ts';
import { RuleRouter } from '../scripts/review-route-rules.ts';
import { commit, git } from './checklist-git-fixture.ts';
import { FakeRouter, QUIET_FEATURES } from './review-route-fake.ts';

// The offline evaluation: its pure parts, the git adapter on a temporary
// history, and the command with fake routers and no network.

const ARCHIVE = 'openspec/changes/archive';
const SAVE_CHANGE = 'evaluate-me';
const SENTINEL = 'sentinel-jev-credential-7d2e4b1c';
const checkSchema = evaluationSchemaCheck(process.cwd());

function jsonLines(...records: object[]): string {
  return records.map((record) => `${JSON.stringify(record)}\n`).join('');
}

const ANSWERED: ShadowDecision = {
  router: 'jev',
  status: 'answered',
  model: 'jev-1.14.0',
  tier: 'elevated',
  confidence: 0.7,
  probabilities: { standard: 0.3, elevated: 0.7 },
  expectedPasses: 2.5,
  passes: passPlans('elevated', { externalFacts: false }),
  latencyMs: 40,
};

test('archived records are grouped per change with or without pass summaries', () => {
  const files: Readonly<Record<string, string>> = {
    [`${ARCHIVE}/2026-10-01-one/findings.jsonl`]: jsonLines({ pass: 1, severity: 'medium' }),
    [`${ARCHIVE}/2026-10-01-one/passes.jsonl`]: jsonLines({ pass: 1 }, { pass: 2 }),
    [`${ARCHIVE}/2026-10-02-two/passes.jsonl`]: jsonLines({ pass: 1 }),
    [`${ARCHIVE}/2026-10-03-unreviewed/proposal.md`]: '',
  };
  const records = archivedRecordsOf(Object.keys(files), (path) => files[path]!);
  assert.deepEqual(records.map(({ directory }) => directory), [`${ARCHIVE}/2026-10-01-one`, `${ARCHIVE}/2026-10-02-two`]);
  assert.equal(records[0]!.passes?.length, 2);
  assert.deepEqual(records[1]!.findings, []);
  assert.throws(() => archivedRecordsOf([`${ARCHIVE}/x/findings.jsonl`], () => '{'), RouteRefusal);
});

test('the outcome is the highest pass and the findings of passes 1 and 2', () => {
  const outcome = reviewOutcome({
    findings: [
      { pass: 1, severity: 'high' },
      { pass: 1, severity: 'low' },
      { pass: 2, severity: 'medium' },
      { pass: 3, severity: 'critical' },
      { pass: 1 },
    ],
    passes: undefined,
  });
  assert.deepEqual(outcome, {
    passesNeeded: 3,
    thirdPass: true,
    passSummaries: false,
    findings: { pass1: { critical: 0, high: 1, medium: 0, low: 1 }, pass2: { critical: 0, high: 0, medium: 1, low: 0 } },
  });
  const empty = reviewOutcome({ findings: [], passes: [] });
  assert.equal(empty.passesNeeded, 1);
  assert.equal(empty.passSummaries, true);
});

test('several artifacts and other merges are told apart', () => {
  assert.equal(reviewsSeveralArtifacts({ directory: 'd', findings: [{ pass: 1 }], passes: [{ pass: 1, artifact: 'a' }] }), true);
  assert.equal(reviewsSeveralArtifacts({ directory: 'd', findings: [{ pass: 1 }], passes: undefined }), false);
  const merge = { sha: 'm', parents: ['a', 'b'], subject: 'Merge pull request #7 from owner/branch' };
  assert.equal(isPullRequestMerge(merge), true);
  assert.equal(isPullRequestMerge({ ...merge, parents: ['a'] }), false);
  assert.equal(isPullRequestMerge({ ...merge, subject: "Merge branch 'main' into dev" }), false);
});

test('commit lines parse into commits with their parents', () => {
  assert.deepEqual(commitInfos('a\0b c\0Merge pull request #1 from o/x\nd\0\0root\n'), [
    { sha: 'a', parents: ['b', 'c'], subject: 'Merge pull request #1 from o/x' },
    { sha: 'd', parents: [], subject: 'root' },
  ]);
});

test('the git adapter answers undefined outside a repository', () => {
  const root = mkdtempSync(join(tmpdir(), 'review-route-evaluation-none-'));
  try {
    const environment = GIT_EVALUATION_ENVIRONMENT;
    assert.equal(environment.resolve(root, 'HEAD'), undefined);
    assert.equal(environment.mergeBase(root, 'HEAD', 'origin/dev'), undefined);
    assert.equal(environment.firstParentHistory(root, 'HEAD'), undefined);
    assert.equal(environment.addingCommit(root, 'HEAD', ARCHIVE), undefined);
    assert.equal(environment.branchCommits(root, 'HEAD', 'HEAD'), undefined);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the retry router retries a rate limit or overload once after a delay', async () => {
  for (const reason of ['rate-limited', 'overloaded'] as const) {
    const delays: number[] = [];
    const inner = new FakeRouter<ShadowDecision>({ router: 'jev', status: 'failed', reason, httpStatus: 429, latencyMs: 1 });
    const router = new RetryOnceRouter(inner, 250, async (delayMs) => delays.push(delayMs));
    assert.equal((await router.route(QUIET_FEATURES)).status, 'failed');
    assert.equal(inner.calls.length, 2);
    assert.deepEqual(delays, [250]);
  }
  for (const decision of [ANSWERED, { router: 'jev', status: 'failed', reason: 'timeout', latencyMs: 1 }] as ShadowDecision[]) {
    const inner = new FakeRouter(decision);
    const router = new RetryOnceRouter(inner, 250, () => assert.fail('no retry expected'));
    assert.equal(await router.route(QUIET_FEATURES), decision);
    assert.equal(inner.calls.length, 1);
  }
});

interface History {
  readonly root: string;
  readonly base: string;
  readonly oneReviewed: string;
  readonly oneMerge: string;
  readonly twoMerge: string;
}

const SPEC = '## ADDED Requirements\n';

// Dev: base, PR #1 (one; names pass 1), PR #2 (two; names no pass), and
// two archives committed straight to dev.
function buildHistory(): History {
  const root = mkdtempSync(join(tmpdir(), 'review-route-evaluation-'));
  git(root, 'init', '--quiet', '--initial-branch=dev');
  const base = commit(root, { 'README.md': 'Base.\n' }, 'chore: base');
  git(root, 'checkout', '--quiet', '-b', 'one');
  const oneReviewed = commit(root, {
    'scripts/a.ts': 'a\n'.repeat(10),
    'openspec/changes/one/specs/review-process/spec.md': SPEC,
    'openspec/changes/one/design.md': '# Design\n\n## External facts\n',
  }, 'feat: add one');
  commit(root, { 'scripts/a.ts': 'a\n'.repeat(15) }, 'fix: address review pass 1 of one');
  mkdirSync(join(root, ARCHIVE), { recursive: true });
  git(root, 'mv', 'openspec/changes/one', `${ARCHIVE}/2026-10-01-one`);
  commit(root, {
    [`${ARCHIVE}/2026-10-01-one/findings.jsonl`]: jsonLines({ pass: 1, severity: 'medium' }, { pass: 3, severity: 'low' }),
    [`${ARCHIVE}/2026-10-01-one/passes.jsonl`]: jsonLines({ pass: 1 }, { pass: 2 }, { pass: 3 }),
  }, 'docs: archive one');
  git(root, 'checkout', '--quiet', 'dev');
  git(root, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'merge', '--quiet', '--no-ff', 'one', '-m', 'Merge pull request #1 from owner/one');
  const oneMerge = git(root, 'rev-parse', 'HEAD');
  git(root, 'checkout', '--quiet', '-b', 'two');
  commit(root, {
    'docs/contracts/port.md': 'one\ntwo\nthree\n',
    [`${ARCHIVE}/2026-10-02-two/specs/review-process/spec.md`]: SPEC,
    [`${ARCHIVE}/2026-10-02-two/findings.jsonl`]: jsonLines({ pass: 1, severity: 'high' }),
  }, 'feat: add and archive two');
  git(root, 'checkout', '--quiet', 'dev');
  git(root, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'merge', '--quiet', '--no-ff', 'two', '-m', 'Merge pull request #2 from owner/two');
  const twoMerge = git(root, 'rev-parse', 'HEAD');
  commit(root, { [`${ARCHIVE}/2026-10-03-three/findings.jsonl`]: jsonLines({ pass: 1, severity: 'low' }) }, 'docs: archive three on dev');
  commit(root, { [`${ARCHIVE}/2026-10-04-four/passes.jsonl`]: jsonLines({ pass: 1, artifact: 'plan' }) }, 'docs: archive four on dev');
  git(root, 'update-ref', 'refs/remotes/origin/dev', 'HEAD');
  return { root, base, oneReviewed, oneMerge, twoMerge };
}

function withHistory(run: (history: History) => Promise<void>): () => Promise<void> {
  return async () => {
    const history = buildHistory();
    try {
      await run(history);
    } finally {
      rmSync(history.root, { recursive: true, force: true });
    }
  };
}

function gitDependencies(overrides: Partial<EvaluationDependencies> = {}): EvaluationDependencies {
  return { environment: GIT_EVALUATION_ENVIRONMENT, rule: new RuleRouter(), shadow: undefined, checkSchema, ...overrides };
}

test('each change is routed by its features as of its own time', withHistory(async (history) => {
  const at = git(history.root, 'rev-parse', 'HEAD');
  const evaluation = await evaluateArchive(history.root, at, gitDependencies());
  assert.deepEqual(evaluation.excluded, [
    { change: 'three', reason: 'no-pull-request-merge' },
    { change: 'four', reason: 'several-artifacts' },
  ]);
  const [one, two] = evaluation.lines;
  assert.equal(evaluation.lines.length, 2);
  assert.equal(one!.change, 'one');
  assert.equal(one!.approximate, false);
  assert.equal(one!.reviewedCommit, history.oneReviewed);
  assert.equal(one!.devCommit, history.base);
  assert.equal(one!.mergeCommit, history.oneMerge);
  assert.deepEqual(
    { lines: one!.features.linesChanged, files: one!.features.filesChanged, external: one!.features.externalFacts },
    { lines: 10, files: 1, external: true },
  );
  assert.deepEqual(one!.features.capabilities, ['review-process']);
  assert.deepEqual(one!.features.capabilityHistory, { changes: 0, thirdPassShare: null, mediumOrWorsePerChange: null });
  assert.deepEqual(one!.outcome, {
    passesNeeded: 3,
    thirdPass: true,
    passSummaries: true,
    findings: { pass1: { critical: 0, high: 0, medium: 1, low: 0 }, pass2: { critical: 0, high: 0, medium: 0, low: 0 } },
  });
  assert.equal(one!.rule.tier, 'standard');
  assert.deepEqual(one!.shadow, SKIPPED_SHADOW);
  assert.equal(two!.approximate, true);
  assert.equal(two!.reviewedCommit, history.twoMerge);
  assert.equal(two!.devCommit, history.oneMerge);
  assert.equal(two!.features.linesChanged, 3);
  assert.equal(two!.features.touches.contracts, true);
  assert.deepEqual(two!.features.capabilityHistory, { changes: 1, thirdPassShare: 1, mediumOrWorsePerChange: 1 });
  assert.deepEqual(two!.rule.triggers, ['contracts']);
  assert.equal(two!.outcome.passSummaries, false);
  assert.equal(evaluationText(evaluation.lines, checkSchema).split('\n').length, 3);
}));

test('the archive as of an earlier commit holds no later change', withHistory(async (history) => {
  const evaluation = await evaluateArchive(history.root, history.oneMerge, gitDependencies());
  assert.deepEqual(evaluation.lines.map(({ change }) => change), ['one']);
  assert.deepEqual(evaluation.excluded, []);
}));

async function runInHistory(history: History, args: readonly string[], overrides: Partial<EvaluationDependencies> = {}): Promise<RunResult> {
  mkdirSync(join(history.root, `openspec/changes/${SAVE_CHANGE}`), { recursive: true });
  return runRouteEvaluation(args, history.root, gitDependencies(overrides));
}

function savedLines(history: History): EvaluationLine[] {
  const text = readFileSync(join(history.root, `openspec/changes/${SAVE_CHANGE}/evaluation.jsonl`), 'utf8');
  return text.trimEnd().split('\n').map((line) => JSON.parse(line) as EvaluationLine);
}

test('--rule-only --save writes valid lines and prints the figures', withHistory(async (history) => {
  const run = await runInHistory(history, ['--rule-only', '--save', SAVE_CHANGE]);
  assert.equal(run.exitCode, 0, run.stderr);
  const lines = savedLines(history);
  assert.deepEqual(lines.map(({ change }) => change), ['one', 'two']);
  for (const line of lines) assert.deepEqual(checkSchema(line), []);
  const at = git(history.root, 'rev-parse', 'HEAD');
  assert.match(run.stdout, new RegExp(`^Route evaluation of 2 archived change\\(s\\) as of ${at}, in merge order\\.$`, 'm'));
  assert.match(run.stdout, /^Features of the revision named by the branch's first "pass 1" commit; 1 approximate from the merged diff\.$/m);
  assert.match(run.stdout, /^Excluded: three \(no-pull-request-merge\), four \(several-artifacts\)\.$/m);
  assert.match(run.stdout, /^ {2}rule elevated: 1 change\(s\), third pass 0 \(0%\)/m);
  assert.match(run.stdout, /^Without pass summaries, lower bounds: 1 change\(s\)/m);
  assert.match(run.stdout, /Saved the evaluation to openspec\/changes\/evaluate-me\/evaluation\.jsonl\.\n$/);
  const again = await runInHistory(history, ['--rule-only', '--save', SAVE_CHANGE]);
  assert.equal(again.exitCode, 1);
  assert.match(again.stderr, /evaluation\.jsonl exists; delete it to evaluate again; nothing written/);
}));

test('a consulted shadow is recorded per change and scored', withHistory(async (history) => {
  const shadow = new FakeRouter(ANSWERED);
  const run = await runInHistory(history, ['--at', history.twoMerge, '--json'], { shadow });
  assert.equal(run.exitCode, 0, run.stderr);
  assert.equal(shadow.calls.length, 2);
  const summary = JSON.parse(run.stdout) as ReturnType<typeof evaluationSummary>;
  assert.equal(summary.at, history.twoMerge);
  assert.deepEqual(summary.groups.all.shadow.agreement, { changes: 2, agreeing: 1, share: 0.5, kappa: 0 });
  assert.equal(summary.groups.all.shadow.answered, 2);
  assert.deepEqual(summary.byLines.map(({ band, changes }) => [band, changes]), [
    ['under 100 lines', 2], ['100 to 399 lines', 0], ['400 lines and more', 0],
  ]);
}));

test('--rule-only never consults the shadow router', withHistory(async (history) => {
  const shadow = new FakeRouter(ANSWERED);
  const run = await runInHistory(history, ['--rule-only'], { shadow });
  assert.equal(run.exitCode, 0, run.stderr);
  assert.equal(shadow.calls.length, 0);
  assert.match(run.stdout, /shadow: no answer \(answered 0, failed 0, skipped 2\)/);
}));

test('a refused shadow stops the evaluation before more requests', withHistory(async (history) => {
  for (const httpStatus of [401, 402, 403]) {
    const shadow = new FakeRouter<ShadowDecision>({ router: 'jev', status: 'failed', reason: 'http-error', httpStatus, latencyMs: 1 });
    const run = await runInHistory(history, ['--save', SAVE_CHANGE], { shadow });
    assert.equal(run.exitCode, 1);
    assert.equal(run.stderr, `route-evaluation: the shadow router was refused (HTTP ${httpStatus}); nothing written\n`);
    assert.equal(shadow.calls.length, 1);
    assert.equal(existsSync(join(history.root, `openspec/changes/${SAVE_CHANGE}/evaluation.jsonl`)), false);
  }
}));

test('another shadow failure is recorded and the evaluation goes on', withHistory(async (history) => {
  const shadow = new FakeRouter<ShadowDecision>({ router: 'jev', status: 'failed', reason: 'http-error', httpStatus: 500, latencyMs: 1 });
  const run = await runInHistory(history, ['--save', SAVE_CHANGE], { shadow });
  assert.equal(run.exitCode, 0, run.stderr);
  assert.equal(shadow.calls.length, 2);
}));

test('the composed evaluation without a credential runs only the rule', withHistory(async (history) => {
  cpSync(join(process.cwd(), 'docs/review-findings'), join(history.root, 'docs/review-findings'), { recursive: true });
  const dependencies = routeEvaluationDependencies(history.root, {});
  assert.equal(dependencies.shadow, undefined);
  const refused = await runRouteEvaluation([], history.root, dependencies);
  assert.equal(refused.exitCode, 1);
  assert.match(refused.stderr, new RegExp(`set ${CREDENTIAL_VARIABLE} to consult the shadow router, or pass --rule-only`));
  const ruleOnly = await runRouteEvaluation(['--rule-only'], history.root, dependencies);
  assert.equal(ruleOnly.exitCode, 0, ruleOnly.stderr);
}));

test('the composition root holds a credential without showing it', () => {
  const dependencies = routeEvaluationDependencies(process.cwd(), { [CREDENTIAL_VARIABLE]: SENTINEL });
  assert.ok(dependencies.shadow instanceof RetryOnceRouter);
  assert.doesNotMatch(inspect(dependencies, { depth: 10, showHidden: true }), new RegExp(SENTINEL));
});

const usageCases: readonly (readonly string[])[] = [['--unknown'], ['--save', 'Bad_Name'], ['--save', 'archive'], ['stray']];

for (const args of usageCases) {
  test(`usage error for ${args.join(' ')}`, async () => {
    const run = await runRouteEvaluation(args, process.cwd(), gitDependencies());
    assert.equal(run.exitCode, 2);
    assert.match(run.stderr, /Usage: route-evaluation/);
  });
}

const COMMIT_A = 'a'.repeat(40);
const COMMIT_B = 'b'.repeat(40);
const MERGE = 'c'.repeat(40);
const RECORDS: Readonly<Record<string, string>> = { [`${ARCHIVE}/2026-10-05-five/findings.jsonl`]: jsonLines({ pass: 1, severity: 'low' }) };

// One change merged by a pull request whose pass 1 names a revision that
// lacks the change directory.
function fakeEnvironment(overrides: Partial<EvaluationEnvironment> = {}): EvaluationEnvironment {
  return {
    resolve: () => COMMIT_A,
    mergeBase: () => COMMIT_A,
    firstParentHistory: () => [MERGE, COMMIT_A],
    addingCommit: () => ({ sha: MERGE, parents: [COMMIT_A, COMMIT_B], subject: 'Merge pull request #5 from o/five' }),
    branchCommits: () => [{ sha: COMMIT_B, parents: [COMMIT_A], subject: 'docs: record review pass 1 of five' }],
    changedFiles: () => [{ path: 'scripts/five.ts', lines: 12 }],
    listFiles: (_root, commit, directory) => {
      if (directory === ARCHIVE) return Object.keys(RECORDS);
      return commit === MERGE ? [`${directory}/proposal.md`] : [];
    },
    readFile: (_root, _commit, path) => RECORDS[path],
    ...overrides,
  };
}

async function runFake(args: readonly string[], overrides: Partial<EvaluationDependencies> = {}): Promise<RunResult> {
  return runRouteEvaluation(args, process.cwd(), { ...gitDependencies(), environment: fakeEnvironment(), ...overrides });
}

test('a pass 1 revision without the change directory falls back to the merge', async () => {
  const evaluation = await evaluateArchive('root', COMMIT_A, gitDependencies({ environment: fakeEnvironment() }));
  assert.equal(evaluation.lines[0]!.approximate, true);
  assert.equal(evaluation.lines[0]!.reviewedCommit, MERGE);
  assert.equal(evaluation.lines[0]!.features.linesChanged, 12);
});

test('a merge that adds no change at all is excluded', async () => {
  const evaluation = await evaluateArchive('root', COMMIT_A, gitDependencies({ environment: fakeEnvironment({ addingCommit: () => null }) }));
  assert.deepEqual(evaluation.excluded, [{ change: 'five', reason: 'no-pull-request-merge' }]);
});

const refusalCases: readonly { name: string; args?: readonly string[]; environment: Partial<EvaluationEnvironment>; message: RegExp }[] = [
  { name: 'no merge base with dev', environment: { mergeBase: () => undefined }, message: /no merge base of HEAD and origin\/dev/ },
  { name: 'an unknown --at', args: ['--at', 'nowhere'], environment: { resolve: () => undefined }, message: /--at nowhere does not name a commit/ },
  { name: 'an unreadable archive', environment: { listFiles: () => undefined }, message: /cannot list the archive/ },
  { name: 'an unreadable history', environment: { firstParentHistory: () => undefined }, message: /cannot read the history of/ },
  { name: 'an unreadable merge', environment: { addingCommit: () => undefined }, message: /cannot read the history of openspec/ },
  { name: 'an unreadable branch', environment: { branchCommits: () => undefined }, message: /cannot read the branch of five/ },
  { name: 'a merge without the change', environment: { listFiles: (_r, _c, directory) => (directory === ARCHIVE ? Object.keys(RECORDS) : []) }, message: /no files under/ },
];

for (const { name, args = [], environment, message } of refusalCases) {
  test(`the evaluation refuses ${name}`, async () => {
    const run = await runFake(['--rule-only', ...args], { environment: fakeEnvironment(environment) });
    assert.equal(run.exitCode, 1);
    assert.match(run.stderr, message);
    assert.match(run.stderr, /; nothing written\n$/);
  });
}

test('a pass 1 revision without a merge base with dev is refused', async () => {
  const environment = fakeEnvironment({ mergeBase: (_root, first) => (first === 'HEAD' ? COMMIT_A : undefined) });
  const run = await runFake(['--rule-only'], { environment });
  assert.equal(run.exitCode, 1);
  assert.match(run.stderr, /no merge base of five's pass 1 and dev/);
});

test('a save target that is no active change is refused before routing', async () => {
  const shadow = new FakeRouter(ANSWERED);
  const run = await runFake(['--save', 'no-such-change'], { shadow });
  assert.equal(run.exitCode, 1);
  assert.match(run.stderr, /no active change "no-such-change"/);
  assert.equal(shadow.calls.length, 0);
});

test('invalid or secret-like lines are refused and nothing is written', withHistory(async (history) => {
  const invalid = await runInHistory(history, ['--rule-only', '--save', SAVE_CHANGE], { checkSchema: () => ['/ bad'] });
  assert.equal(invalid.exitCode, 1);
  assert.match(invalid.stderr, /the evaluation is invalid: one: \/ bad; two: \/ bad/);
  assert.equal(existsSync(join(history.root, `openspec/changes/${SAVE_CHANGE}/evaluation.jsonl`)), false);
}));

test('a secret-like value in a line is counted, never printed', () => {
  const leaky = { ...QUIET_FEATURES, capabilities: [`ghp_${'a'.repeat(30)}`] } satisfies RouteFeatures;
  const line = { change: 'leaky', features: leaky } as unknown as EvaluationLine;
  assert.throws(() => evaluationText([line], () => []), (error: Error) => {
    assert.match(error.message, /leaky: 1 value\(s\) look like a secret/);
    assert.doesNotMatch(error.message, /ghp_/);
    return true;
  });
});

test('an unexpected error is not mistaken for a refusal', async () => {
  const environment = fakeEnvironment({ firstParentHistory: () => { throw new Error('boom'); } });
  await assert.rejects(runFake(['--rule-only'], { environment }), /boom/);
});

test('a write failure other than an existing file propagates', withHistory(async (history) => {
  const target = join(history.root, `openspec/changes/${SAVE_CHANGE}`);
  // The change directory turns into a file after the save check.
  const environment = {
    ...GIT_EVALUATION_ENVIRONMENT,
    resolve: (root: string, revision: string) => {
      rmSync(target, { recursive: true, force: true });
      writeFileSync(target, '');
      return GIT_EVALUATION_ENVIRONMENT.resolve(root, revision);
    },
  };
  const run = runInHistory(history, ['--rule-only', '--at', 'HEAD', '--save', SAVE_CHANGE], { environment });
  await assert.rejects(run, /ENOTDIR/);
}));
