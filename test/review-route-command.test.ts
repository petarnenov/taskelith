import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { CHECKLIST_SCHEMA_PATH } from '../scripts/checklist-record.ts';
import { SCHEMA_PATH } from '../scripts/findings.ts';
import { ROUTE_SCHEMA_PATH, SKIPPED_SHADOW, type RuleDecision, type ShadowDecision } from '../scripts/review-route.ts';
import { routeDependencies, routeSchemaCheck, runRoute, type RouteDependencies } from '../scripts/review-route-command.ts';
import type { RouteEnvironment } from '../scripts/review-route-features.ts';
import { CREDENTIAL_VARIABLE, Credential, JevRouter } from '../scripts/review-route-jev.ts';
import { routeRecordProblems } from '../scripts/review-route-record.ts';
import { RuleRouter } from '../scripts/review-route-rules.ts';
import { commit, git } from './checklist-git-fixture.ts';
import { FakeRouter, FakeShadowRouter, QUIET_FEATURES } from './review-route-fake.ts';

// The route command with a fake environment and fake routers, and once
// composed for real on a temporary git repository without a credential.

const CHANGE = 'route-me';
const ROUTE_PATH = `openspec/changes/${CHANGE}/route.json`;
const DEV_COMMIT = 'd'.repeat(40);
const HEAD_COMMIT = 'e'.repeat(40);
const CHANGED_PATH = 'scripts/secret-handler.ts';
const SENTINEL = 'sentinel-jev-credential-5f1c0a9e';
const checkSchema = routeSchemaCheck(process.cwd());

const COMMITTED: Readonly<Record<string, string>> = {
  [`openspec/changes/${CHANGE}/proposal.md`]: 'A change.\n',
  [`openspec/changes/${CHANGE}/specs/review-process/spec.md`]: '',
  [`openspec/changes/${CHANGE}/checklist.json`]: '{"size":"M"}',
};

function fakeEnvironment(overrides: Partial<RouteEnvironment> = {}): RouteEnvironment {
  return {
    mergeBase: () => DEV_COMMIT,
    head: () => HEAD_COMMIT,
    uncommittedPaths: () => [`openspec/changes/${CHANGE}/verification.md`],
    changedFiles: () => [{ path: CHANGED_PATH, lines: 30 }, { path: 'docs/notes.md', lines: 10 }],
    listFiles: (_root, _commit, directory) => Object.keys(COMMITTED).filter((path) => path.startsWith(`${directory}/`)),
    readFile: (_root, _commit, path) => COMMITTED[path],
    ...overrides,
  };
}

interface Run {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly route: string | undefined;
}

async function runIn(args: readonly string[], dependencies: Partial<RouteDependencies> = {}, prepare: (root: string) => void = () => {}): Promise<Run> {
  const root = mkdtempSync(join(tmpdir(), 'review-route-command-'));
  try {
    mkdirSync(join(root, `openspec/changes/${CHANGE}`), { recursive: true });
    prepare(root);
    const result = await runRoute(args, root, {
      environment: fakeEnvironment(),
      rule: new RuleRouter(),
      shadow: new FakeShadowRouter({ router: 'jev', status: 'failed', reason: 'timeout', latencyMs: 2000 }),
      checkSchema,
      now: () => new Date('2026-10-28T09:30:00.000Z'),
      ...dependencies,
    });
    const routePath = join(root, ROUTE_PATH);
    return { ...result, route: existsSync(routePath) ? readFileSync(routePath, 'utf8') : undefined };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('the command writes a valid route.json and prints the summary', async () => {
  const run = await runIn(['--change', CHANGE]);
  assert.equal(run.exitCode, 0, run.stderr);
  const record = JSON.parse(run.route!) as { devCommit: string; headCommit: string; features: { linesChanged: number; size: string } };
  assert.deepEqual(routeRecordProblems(record, CHANGE, checkSchema), []);
  assert.equal(record.devCommit, DEV_COMMIT);
  assert.equal(record.headCommit, HEAD_COMMIT);
  assert.equal(record.features.linesChanged, 40);
  assert.equal(record.features.size, 'M');
  assert.match(run.stdout, /^route: elevated \(security\), rule version 1$/m);
  assert.match(run.stdout, /^pass 1, reviewer A: codex gpt-6\.1-sol#high$/m);
  assert.equal(run.stderr, 'shadow router failed (timeout); the rule decided alone\n');
});

test('--json prints the record it writes', async () => {
  const run = await runIn(['--change', CHANGE, '--json']);
  assert.equal(run.exitCode, 0, run.stderr);
  assert.equal(run.stdout, run.route);
});

test('--no-shadow skips the shadow router', async () => {
  const shadow = new FakeShadowRouter(SKIPPED_SHADOW);
  const run = await runIn(['--change', CHANGE, '--no-shadow'], { shadow });
  assert.equal(run.exitCode, 0, run.stderr);
  assert.equal(shadow.calls.length, 0);
  assert.deepEqual((JSON.parse(run.route!) as { shadow: unknown }).shadow, SKIPPED_SHADOW);
  assert.equal(run.stderr, '');
});

test('a disagreeing shadow is recorded and the rule plans stand', async () => {
  const rule = new RuleRouter();
  const shadowDecision: ShadowDecision = {
    router: 'jev',
    status: 'answered',
    model: 'jev-1.14.0',
    tier: 'elevated',
    thirdPassProbability: 0.8,
    threshold: 0.4,
    passes: (await rule.route({ ...QUIET_FEATURES, linesChanged: 900 })).passes,
    latencyMs: 300,
  };
  const quiet = fakeEnvironment({ changedFiles: () => [{ path: 'docs/notes.md', lines: 10 }] });
  const run = await runIn(['--change', CHANGE], { environment: quiet, shadow: new FakeShadowRouter(shadowDecision) });
  const record = JSON.parse(run.route!) as { rule: RuleDecision; shadow: ShadowDecision };
  assert.equal(record.rule.tier, 'standard');
  assert.equal(record.shadow.status === 'answered' && record.shadow.tier, 'elevated');
  assert.match(run.stdout, /elevated \(P\(third\) 0\.80, threshold 0\.4\).*disagrees with the rule/);
});

test('the shadow gets the proposal content and the archive reference', async () => {
  const files: Readonly<Record<string, string>> = {
    ...COMMITTED,
    [`openspec/changes/${CHANGE}/proposal.md`]: '## Why\n\nBecause.\n\n## What Changes\n\n- A fix.\n',
    'openspec/changes/archive/2026-10-01-earlier/passes.jsonl': '{"pass":1}\n{"pass":2}\n{"pass":3}\n',
    'openspec/changes/archive/2026-10-01-earlier/route.json': '{"change":"earlier","features":{"linesChanged":420}}',
  };
  const environment = fakeEnvironment({
    listFiles: (_root, _commit, directory) => Object.keys(files).filter((path) => path.startsWith(`${directory}/`)),
    readFile: (_root, _commit, path) => files[path],
  });
  const shadow = new FakeShadowRouter(SKIPPED_SHADOW);
  const run = await runIn(['--change', CHANGE], { environment, shadow });
  assert.equal(run.exitCode, 0, run.stderr);
  const [input] = shadow.calls;
  assert.deepEqual(input!.content, { why: 'Because.', whatChanges: '- A fix.', taskCount: 0, specRequirementCount: 0 });
  assert.equal(input!.reference.thirdPassShare, 1);
  assert.deepEqual(input!.reference.byLinesChanged.map(({ changes }) => changes), [0, 0, 1]);
  assert.equal(input!.features.linesChanged, 40);
});

test('an existing route.json is refused before any router runs', async () => {
  const shadow = new FakeShadowRouter(SKIPPED_SHADOW);
  const run = await runIn(['--change', CHANGE], { shadow }, (root) => writeFileSync(join(root, ROUTE_PATH), 'kept'));
  assert.equal(run.exitCode, 1);
  assert.match(run.stderr, /route\.json exists; delete it to route again; nothing written/);
  assert.equal(run.route, 'kept');
  assert.equal(shadow.calls.length, 0);
});

const REFUSALS: readonly { name: string; environment: Partial<RouteEnvironment>; message: RegExp }[] = [
  { name: 'uncommitted work outside the change', environment: { uncommittedPaths: () => ['README.md'] }, message: /uncommitted/ },
  { name: 'no merge base', environment: { mergeBase: () => undefined }, message: /no merge base/ },
  { name: 'an unreadable diff', environment: { changedFiles: () => undefined }, message: /cannot read the diff/ },
  { name: 'an unknown change', environment: { listFiles: () => [] }, message: /no committed active change/ },
  { name: 'an invalid checklist.json', environment: { readFile: () => '{"size":"XL"}' }, message: /invalid size/ },
];

for (const { name, environment, message } of REFUSALS) {
  test(`${name} exits 1 and writes nothing`, async () => {
    const run = await runIn(['--change', CHANGE], { environment: fakeEnvironment(environment) });
    assert.equal(run.exitCode, 1);
    assert.match(run.stderr, message);
    assert.equal(run.route, undefined);
  });
}

test('a record that fails validation exits 1 and writes nothing', async () => {
  const inconsistent = new FakeRouter<RuleDecision>({ ...(await new RuleRouter().route(QUIET_FEATURES)), triggers: ['lines'] });
  const run = await runIn(['--change', CHANGE], { rule: inconsistent });
  assert.equal(run.exitCode, 1);
  assert.match(run.stderr, /the route record is invalid: rule tier standard does not match 1 fired trigger/);
  assert.equal(run.route, undefined);
});

const USAGE_ERRORS: readonly (readonly string[])[] = [[], ['--change'], ['--change', CHANGE, '--wat'], ['--change', 'Bad_Name'], ['--change', 'archive'], ['stray']];

for (const args of USAGE_ERRORS) {
  test(`usage error exits 2: ${JSON.stringify(args)}`, async () => {
    const run = await runIn(args);
    assert.equal(run.exitCode, 2);
    assert.match(run.stderr, /Usage: route --change <change>/);
    assert.equal(run.route, undefined);
  });
}

const FAILING_ANSWERS: readonly { reason: string; answer: () => Promise<Response> }[] = [
  { reason: 'timeout', answer: () => Promise.reject(new DOMException('timed out', 'TimeoutError')) },
  { reason: 'network', answer: () => Promise.reject(new TypeError(`fetch failed: ${SENTINEL}`)) },
  { reason: 'rate-limited', answer: () => Promise.resolve(new Response(SENTINEL, { status: 429 })) },
  { reason: 'overloaded', answer: () => Promise.resolve(new Response(SENTINEL, { status: 529 })) },
  { reason: 'http-error', answer: () => Promise.resolve(new Response(SENTINEL, { status: 401 })) },
  { reason: 'invalid-response', answer: () => Promise.resolve(new Response(`{"model":"${SENTINEL}"}`)) },
];

for (const { reason, answer } of FAILING_ANSWERS) {
  test(`a sentinel credential never reaches output or route.json: ${reason}`, async () => {
    const bodies: string[] = [];
    const fetchSpy = ((_url: string, init: RequestInit) => {
      bodies.push(String(init.body));
      return answer();
    }) as typeof fetch;
    const credential = Credential.fromEnvironment({ [CREDENTIAL_VARIABLE]: SENTINEL });
    const run = await runIn(['--change', CHANGE], { shadow: new JevRouter({ credential, fetch: fetchSpy }) });
    assert.equal(run.exitCode, 0, run.stderr);
    assert.match(run.route!, new RegExp(`"reason": "${reason}"`));
    for (const output of [run.stdout, run.stderr, run.route!]) assert.ok(!output.includes(SENTINEL), output);
    assert.equal(bodies.length, 1);
    for (const leaked of [CHANGE, CHANGED_PATH, 'secret-handler', DEV_COMMIT, HEAD_COMMIT, SENTINEL]) {
      assert.ok(!bodies[0]!.includes(leaked), leaked);
    }
  });
}

function brokenArchiveEnvironment(): RouteEnvironment {
  const files: Readonly<Record<string, string>> = {
    ...COMMITTED,
    'openspec/changes/archive/2026-10-01-earlier/passes.jsonl': '{"pass":1}\n',
    'openspec/changes/archive/2026-10-01-earlier/route.json': '{not json',
  };
  return fakeEnvironment({
    listFiles: (_root, _commit, directory) => Object.keys(files).filter((path) => path.startsWith(`${directory}/`)),
    readFile: (_root, _commit, path) => files[path],
  });
}

test('an unreadable archive without a credential still routes by the rule', async () => {
  const shadow = new JevRouter({ credential: undefined });
  const run = await runIn(['--change', CHANGE], { environment: brokenArchiveEnvironment(), shadow });
  assert.equal(run.exitCode, 0, run.stderr);
  const record = JSON.parse(run.route!) as { shadow: ShadowDecision };
  assert.deepEqual(record.shadow, { router: 'jev', status: 'failed', reason: 'missing-credential', latencyMs: 0 });
});

test('an unreadable archive fails the shadow router, not the command', async () => {
  const bodies: string[] = [];
  const fetchSpy = ((_url: string, init: RequestInit) => {
    bodies.push(String(init.body));
    return Promise.resolve(new Response('{}'));
  }) as typeof fetch;
  const credential = Credential.fromEnvironment({ [CREDENTIAL_VARIABLE]: SENTINEL });
  const shadow = new JevRouter({ credential, fetch: fetchSpy });
  const run = await runIn(['--change', CHANGE], { environment: brokenArchiveEnvironment(), shadow });
  assert.equal(run.exitCode, 0, run.stderr);
  const record = JSON.parse(run.route!) as { shadow: ShadowDecision };
  assert.deepEqual(record.shadow, { router: 'jev', status: 'failed', reason: 'input-unavailable', latencyMs: 0 });
  assert.equal(run.stderr, 'shadow router failed (input-unavailable); the rule decided alone\n');
  assert.equal(bodies.length, 0);
});

test('the composed command routes a git repository without a credential', async () => {
  const root = mkdtempSync(join(tmpdir(), 'review-route-composed-'));
  try {
    git(root, 'init', '--quiet');
    for (const path of [ROUTE_SCHEMA_PATH, SCHEMA_PATH, CHECKLIST_SCHEMA_PATH]) {
      mkdirSync(join(root, path, '..'), { recursive: true });
      cpSync(path, join(root, path));
    }
    const base = commit(root, { 'README.md': 'Base.\n' }, 'base');
    git(root, 'update-ref', 'refs/remotes/origin/dev', base);
    commit(root, { 'scripts/a.ts': 'a\n', [`openspec/changes/${CHANGE}/proposal.md`]: 'A change.\n' }, 'change');
    const run = await runRoute(['--change', CHANGE], root, routeDependencies(root, {}));
    assert.equal(run.exitCode, 0, run.stderr);
    assert.match(run.stderr, new RegExp(`missing-credential.*set ${CREDENTIAL_VARIABLE}`));
    const record = JSON.parse(readFileSync(join(root, ROUTE_PATH), 'utf8')) as { shadow: ShadowDecision };
    assert.deepEqual(record.shadow, { router: 'jev', status: 'failed', reason: 'missing-credential', latencyMs: 0 });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
