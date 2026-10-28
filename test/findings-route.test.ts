import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { CHECKLIST_SCHEMA_PATH } from '../scripts/checklist-record.ts';
import { PASS_SCHEMA_PATH, runFindings, SCHEMA_PATH, USAGE } from '../scripts/findings.ts';
import { VOCABULARY_PATH } from '../scripts/review-findings.ts';
import { ROUTE_SCHEMA_PATH, SKIPPED_SHADOW, passPlans, type ShadowDecision } from '../scripts/review-route.ts';
import { ruleDecision } from '../scripts/review-route-rules.ts';
import { NO_GIT } from './checklist-git-fixture.ts';
import { featuresWith, QUIET_FEATURES } from './review-route-fake.ts';

// route.json in the findings tool: dispatch of the routing commands,
// validation of every route.json, and the routing rows of effect.

const FINDINGS_SCRIPT = 'scripts/findings.ts';
const ARCHIVE = 'openspec/changes/archive';
const STANDARD_A = { harness: 'codex', model: 'gpt-6.1-sol', variant: 'medium' };
const STANDARD_B = { harness: 'claude', model: 'claude-opus-5-5', variant: 'high' };
const ELEVATED_FEATURES = featuresWith({ linesChanged: 420 });

function routeRecord(change: string, overrides: Record<string, unknown> = {}, features = QUIET_FEATURES): string {
  return `${JSON.stringify({
    change,
    generatedAt: '2026-10-28T09:30:00.000Z',
    devCommit: 'd'.repeat(40),
    headCommit: 'e'.repeat(40),
    features,
    rule: ruleDecision(features),
    shadow: SKIPPED_SHADOW,
    ...overrides,
  }, null, 2)}\n`;
}

function summary(change: string, pass: number, reviewer: object, counts: Record<string, number> = {}): string {
  return JSON.stringify({
    change,
    pass,
    role: pass === 2 ? 'B' : 'A',
    reviewer,
    session: `session-${pass}`,
    counts: { critical: 0, high: 0, medium: 0, low: 0, ...counts },
  });
}

function finding(change: string, pass: number, reviewer: object, severity: string): string {
  return JSON.stringify({
    change,
    pass,
    reviewer,
    session: `session-${pass}`,
    severity,
    category: 'docs',
    title: 'A gap',
    file: 'scripts/findings.ts',
    capability: 'review-process',
    outcome: 'fixed',
    resolution: 'Fixed.',
  });
}

function withRepository<Result>(files: Readonly<Record<string, string>>, use: (root: string) => Result): Result {
  const root = mkdtempSync(join(tmpdir(), 'findings-route-'));
  try {
    for (const path of [SCHEMA_PATH, PASS_SCHEMA_PATH, VOCABULARY_PATH, CHECKLIST_SCHEMA_PATH, ROUTE_SCHEMA_PATH]) {
      cpSync(path, join(root, path));
    }
    mkdirSync(join(root, 'openspec/specs/review-process'), { recursive: true });
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(join(root, path, '..'), { recursive: true });
      writeFileSync(join(root, path), text);
    }
    return use(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const ACTIVE = {
  'openspec/changes/active-change/findings.jsonl': '',
  'openspec/changes/active-change/passes.jsonl': '',
};

// Runs the script as make findings does, with no credential in its
// environment, so no request can leave the host.
function runScript(args: readonly string[], cwd = process.cwd()) {
  const script = join(process.cwd(), FINDINGS_SCRIPT);
  const result = spawnSync(process.execPath, ['--experimental-strip-types', script, ...args], {
    cwd,
    env: { PATH: process.env.PATH ?? '' },
    encoding: 'utf8',
  });
  return { exitCode: result.status, stdout: result.stdout, stderr: result.stderr };
}

test('the usage names the route and route-evaluation commands', () => {
  assert.match(USAGE, /^ {2}route --change <change> \[--json\] \[--no-shadow\]/m);
  assert.match(USAGE, /^ {2}route-evaluation \[--at <revision>\] \[--rule-only\] \[--save <change>\] \[--json\]/m);
});

test('the script dispatches route and reports its own usage error', () => {
  const run = runScript(['route']);
  assert.equal(run.exitCode, 2);
  assert.match(run.stderr, /^--change is required\nUsage: route --change <change>/);
});

test('the script dispatches route, which refuses an unknown change', () => {
  const run = runScript(['route', '--change', 'no-such-change', '--no-shadow']);
  assert.equal(run.exitCode, 1);
  assert.match(run.stderr, /^route: .*; nothing written$/m);
});

test('the script dispatches route-evaluation, which needs the credential or --rule-only', () => {
  const run = runScript(['route-evaluation']);
  assert.equal(run.exitCode, 1);
  assert.match(run.stderr, /^route-evaluation: set JEV_MAF_LAB to consult the shadow router, or pass --rule-only; nothing written$/m);
  const usage = runScript(['route-evaluation', '--unknown']);
  assert.equal(usage.exitCode, 2);
  assert.match(usage.stderr, /Usage: route-evaluation/);
});

test('the script still runs the other commands', () => {
  const run = runScript(['index', '--unknown']);
  assert.equal(run.exitCode, 2);
  assert.match(run.stderr, /^Usage: make findings/m);
});

test('the routing modules share the schema check without importing the findings tool', () => {
  for (const path of ['scripts/review-route-command.ts', 'scripts/review-route-evaluation.ts']) {
    assert.doesNotMatch(readFileSync(path, 'utf8'), /from '\.\/findings\.ts'/, path);
  }
});

test('validate accepts valid route.json files in active and archived changes', () => {
  const result = withRepository({
    ...ACTIVE,
    'openspec/changes/active-change/route.json': routeRecord('active-change'),
    [`${ARCHIVE}/2026-10-20-old-change/findings.jsonl`]: '',
    [`${ARCHIVE}/2026-10-20-old-change/route.json`]: routeRecord('old-change', {}, ELEVATED_FEATURES),
  }, (root) => runFindings(['validate'], root, NO_GIT));
  assert.equal(result.exitCode, 0, result.stderr);
  assert.match(result.stdout, /; every route file is valid: 2 file\(s\)\.$/);
});

test('validate reports each invalid route.json by file', () => {
  const standardWithTrigger = { ...ruleDecision(QUIET_FEATURES), triggers: ['lines'] };
  const result = withRepository({
    ...ACTIVE,
    'openspec/changes/active-change/route.json': routeRecord('active-change', { rule: standardWithTrigger }),
    [`${ARCHIVE}/2026-10-20-renamed/findings.jsonl`]: '',
    [`${ARCHIVE}/2026-10-20-renamed/route.json`]: routeRecord('other-change'),
    [`${ARCHIVE}/2026-10-21-broken/findings.jsonl`]: '',
    [`${ARCHIVE}/2026-10-21-broken/route.json`]: '{"change":',
    [`${ARCHIVE}/2026-10-22-extra/findings.jsonl`]: '',
    [`${ARCHIVE}/2026-10-22-extra/route.json`]: routeRecord('extra', { note: 'free text' }),
  }, (root) => runFindings(['validate'], root, NO_GIT));
  assert.equal(result.exitCode, 1);
  const lines = result.stderr.split('\n');
  assert.ok(lines.some((line) => line.startsWith('openspec/changes/active-change/route.json: rule tier standard does not match 1 fired trigger(s)')), result.stderr);
  assert.ok(lines.some((line) => line.startsWith(`${ARCHIVE}/2026-10-20-renamed/route.json: change "other-change" is not its directory's change "renamed"`)), result.stderr);
  assert.ok(lines.some((line) => line.startsWith(`${ARCHIVE}/2026-10-21-broken/route.json: not valid JSON`)), result.stderr);
  assert.ok(lines.some((line) => line.startsWith(`${ARCHIVE}/2026-10-22-extra/route.json: / must NOT have additional properties`)), result.stderr);
  assert.match(lines.at(-1)!, /^Review findings: 4 problem\(s\); the formats are .*docs\/review-findings\/route\.schema\.json/);
});

test('a change without route.json is not reported', () => {
  const result = withRepository(ACTIVE, (root) => runFindings(['validate'], root, NO_GIT));
  assert.equal(result.exitCode, 0, result.stderr);
  assert.match(result.stdout, /every route file is valid: 0 file\(s\)\.$/);
});

const TIMEOUT: ShadowDecision = { router: 'jev', status: 'failed', reason: 'timeout', latencyMs: 2000 };
const ANSWERED: ShadowDecision = {
  router: 'jev',
  status: 'answered',
  model: 'jev-1.14.0',
  tier: 'elevated',
  confidence: 0.8,
  probabilities: { standard: 0.2, elevated: 0.8 },
  expectedPasses: 2.5,
  passes: passPlans('elevated', { externalFacts: false }),
  latencyMs: 300,
};

// Three archived routed changes: one that followed the standard route and
// ended after pass 2, one elevated that needed pass 3, one without passes.
const ROUTED_ARCHIVE = {
  [`${ARCHIVE}/2026-10-20-quiet/findings.jsonl`]: `${finding('quiet', 1, STANDARD_A, 'medium')}\n${finding('quiet', 2, STANDARD_B, 'medium')}\n`,
  [`${ARCHIVE}/2026-10-20-quiet/passes.jsonl`]: [
    summary('quiet', 1, STANDARD_A, { medium: 1 }),
    summary('quiet', 2, STANDARD_B, { medium: 1 }),
  ].join('\n') + '\n',
  [`${ARCHIVE}/2026-10-20-quiet/route.json`]: routeRecord('quiet', { shadow: TIMEOUT }),
  [`${ARCHIVE}/2026-10-21-large/findings.jsonl`]: `${finding('large', 1, STANDARD_A, 'high')}\n${finding('large', 2, STANDARD_B, 'low')}\n`,
  [`${ARCHIVE}/2026-10-21-large/passes.jsonl`]: [
    summary('large', 1, STANDARD_A, { high: 1 }),
    summary('large', 2, STANDARD_B, { low: 1 }),
    summary('large', 3, STANDARD_A),
  ].join('\n') + '\n',
  [`${ARCHIVE}/2026-10-21-large/route.json`]: routeRecord('large', { shadow: ANSWERED }, ELEVATED_FEATURES),
  [`${ARCHIVE}/2026-10-22-unreviewed/findings.jsonl`]: '',
  [`${ARCHIVE}/2026-10-22-unreviewed/route.json`]: routeRecord('unreviewed'),
  [`${ARCHIVE}/2026-10-23-unrouted/findings.jsonl`]: '',
};

interface RoutingJson {
  readonly rows: readonly Record<string, unknown>[];
  readonly unrouted: readonly string[];
  readonly figures: { readonly rule: Record<string, { changes: number; thirdPasses: number }>; readonly shadow: { answered: number; failed: Record<string, number> } };
  readonly followedRoute: { readonly changes: number; readonly following: number; readonly share: number | null };
}

test('effect adds a routing row per archived change with route.json', () => {
  const result = withRepository(ROUTED_ARCHIVE, (root) => runFindings(['effect', '--json'], root, NO_GIT));
  assert.equal(result.exitCode, 0, result.stderr);
  const routing = (JSON.parse(result.stdout) as { routing: RoutingJson }).routing;
  assert.deepEqual(routing.unrouted, ['unrouted']);
  assert.deepEqual(routing.rows.map(({ change }) => change), ['quiet', 'large', 'unreviewed']);
  assert.deepEqual(routing.rows[0], {
    change: 'quiet',
    rule: { tier: 'standard', triggers: [] },
    shadow: { status: 'failed', reason: 'timeout' },
    route: { pass1: 'codex gpt-6.1-sol#medium', pass2: 'claude claude-opus-5-5#high' },
    reviewers: { pass1: 'codex gpt-6.1-sol#medium', pass2: 'claude claude-opus-5-5#high' },
    followedRoute: true,
    passesNeeded: 2,
    thirdPass: false,
    findings: { pass1: { critical: 0, high: 0, medium: 1, low: 0 }, pass2: { critical: 0, high: 0, medium: 1, low: 0 } },
  });
  assert.deepEqual(routing.rows[1]!.shadow, { status: 'answered', tier: 'elevated', elevated: 0.8 });
  assert.equal(routing.rows[1]!.followedRoute, false);
  assert.equal(routing.rows[1]!.thirdPass, true);
  assert.deepEqual(routing.rows[2]!.reviewers, { pass1: null, pass2: null });
  assert.equal(routing.rows[2]!.followedRoute, null);
  assert.deepEqual(routing.figures.rule.elevated, { ...routing.figures.rule.elevated, changes: 1, thirdPasses: 1 });
  assert.deepEqual(routing.figures.shadow.failed, { timeout: 1 });
  assert.equal(routing.figures.shadow.answered, 1);
  assert.deepEqual(routing.followedRoute, { changes: 2, following: 1, share: 0.5 });
});

test('effect prints the routing section after the checklist effect', () => {
  const result = withRepository(ROUTED_ARCHIVE, (root) => runFindings(['effect'], root, NO_GIT));
  assert.equal(result.exitCode, 0, result.stderr);
  const text = result.stdout;
  assert.ok(text.indexOf('Checklist effect') < text.indexOf('Routing over archived changes'), text);
  assert.match(text, /^Routing over archived changes with route\.json: 3 change\(s\); 1 archived change\(s\) without one are excluded\.$/m);
  assert.match(text, /^ {2}quiet: rule standard \(no trigger\), shadow failed \(timeout\); pass 1 codex gpt-6\.1-sol#medium, pass 2 claude claude-opus-5-5#high, followed the route; passes 2, no third pass; pass 1 C0 H0 M1 L0, pass 2 C0 H0 M1 L0$/m);
  const large = '  large: rule elevated (lines), shadow elevated (P(elevated) 0.80); pass 1 codex gpt-6.1-sol#medium, '
    + 'pass 2 claude claude-opus-5-5#high, not the route (codex gpt-6.1-sol#high, claude claude-opus-5-5#xhigh); passes 3, third pass;';
  assert.ok(text.split('\n').some((line) => line.startsWith(large)), text);
  assert.match(text, /^ {2}unreviewed: rule standard \(no trigger\), shadow skipped; no recorded pass; passes 1, no third pass;/m);
  assert.match(text, /^ {2}rule elevated: 1 change\(s\), third pass 1 \(100%\)/m);
  assert.match(text, /^ {2}followed the route: 1 of 2 change\(s\) with a recorded pass 1 \(50%\)$/m);
});

test('effect without routed changes says so', () => {
  const result = withRepository({ [`${ARCHIVE}/2026-10-23-unrouted/findings.jsonl`]: '' }, (root) => runFindings(['effect'], root, NO_GIT));
  assert.equal(result.exitCode, 0, result.stderr);
  assert.match(result.stdout, /^Routing over archived changes with route\.json: 0 change\(s\); 1 archived change\(s\) without one are excluded\.$/m);
  assert.match(result.stdout, /^ {2}followed the route: 0 of 0 change\(s\) with a recorded pass 1 \(n\/a\)$/m);
});
