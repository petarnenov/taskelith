import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { ajvSchemaCheck, PASS_SCHEMA_PATH, SCHEMA_PATH } from '../scripts/findings.ts';
import { formatProblem, MAX_LINE_BYTES, type Finding } from '../scripts/review-findings.ts';
import { consistencyProblems, parsePassSummaries, severityCounts, type PassSummary } from '../scripts/review-passes.ts';

const readJson = (path: string) => JSON.parse(readFileSync(path, 'utf8')) as object;
const checkSchema = ajvSchemaCheck(readJson(PASS_SCHEMA_PATH), [readJson(SCHEMA_PATH)]);

function summary(overrides: Partial<PassSummary> = {}): PassSummary {
  return {
    change: 'demo-change',
    pass: 1,
    role: 'A',
    reviewer: { harness: 'codex', model: 'gpt-6.1-sol', variant: 'medium' },
    session: 'session-1',
    counts: { critical: 0, high: 0, medium: 1, low: 0 },
    ...overrides,
  };
}

function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    change: 'demo-change',
    pass: 1,
    reviewer: { harness: 'codex', model: 'gpt-6.1-sol', variant: 'medium' },
    session: 'session-1',
    severity: 'medium',
    category: 'docs',
    title: 'A finding',
    file: 'docs/a.md',
    capability: 'review-process',
    outcome: 'fixed',
    resolution: 'Fixed.',
    ...overrides,
  };
}

function parse(lines: readonly string[]) {
  return parsePassSummaries({ path: 'passes.jsonl', change: 'demo-change', text: lines.map((line) => `${line}\n`).join('') }, checkSchema);
}

const messagesOf = (lines: readonly string[]) => parse(lines).problems.map(formatProblem);

test('a valid summary parses with its line, also one of a pass without findings', () => {
  const none = summary({ pass: 2, role: 'B', counts: { critical: 0, high: 0, medium: 0, low: 0 } });
  const { reviewer: _reviewer, ...rest } = summary({ pass: 3 });
  const plain = { ...rest, reviewer: { harness: 'opencode', model: 'opencode-go/kimi-k3.1-pro' } };
  const parsed = parse([JSON.stringify(summary()), JSON.stringify(none), JSON.stringify(plain)]);
  assert.deepEqual(parsed.problems, []);
  assert.deepEqual(parsed.located, [{ line: 1, summary: summary() }, { line: 2, summary: none }, { line: 3, summary: plain }]);
  assert.deepEqual(parsePassSummaries({ path: 'p', change: 'demo-change', text: '' }, checkSchema), { located: [], problems: [] });
});

test('the schema rejects missing fields, unknown roles and properties, and bad counts', () => {
  const { role: _role, ...roleless } = summary();
  const messages = messagesOf([
    JSON.stringify(roleless),
    JSON.stringify({ ...summary(), role: 'C' }),
    JSON.stringify({ ...summary(), reviewerText: 'pasted' }),
    JSON.stringify(summary({ counts: { critical: -1, high: 0, medium: 0, low: 0 } })),
    JSON.stringify({ ...summary(), counts: { critical: 0, high: 0, medium: 0 } }),
    JSON.stringify(summary({ pass: 0 })),
    JSON.stringify(summary({ session: 'two words' })),
  ]);
  assert.deepEqual(messages, [
    "passes.jsonl:1: / must have required property 'role'",
    'passes.jsonl:2: /role must be equal to one of the allowed values',
    'passes.jsonl:3: / must NOT have additional properties',
    'passes.jsonl:4: /counts/critical must be >= 0',
    "passes.jsonl:5: /counts must have required property 'low'",
    'passes.jsonl:6: /pass must be >= 1',
    'passes.jsonl:7: /session must match pattern "^[A-Za-z0-9][A-Za-z0-9._:-]*$"',
  ]);
});

test('lines are bounded, JSON, and free of secret-like values, which are never echoed', () => {
  const token = `ghp_${'a'.repeat(36)}`;
  const long = JSON.stringify(summary({ session: 'x'.repeat(MAX_LINE_BYTES) }));
  const messages = messagesOf(['', '{', JSON.stringify(summary({ session: token })), long]);
  assert.deepEqual(messages, [
    'passes.jsonl:1: empty line; a change without review passes has an empty file',
    'passes.jsonl:2: not a JSON value',
    'passes.jsonl:3: holds a secret-like value; describe it instead',
    `passes.jsonl:4: line is ${Buffer.byteLength(long)} bytes (max ${MAX_LINE_BYTES})`,
  ]);
  for (const message of messages) assert.ok(!message.includes(token), message);
});

test('a summary names its file\'s change and summarizes a pass once', () => {
  assert.deepEqual(messagesOf([JSON.stringify(summary({ change: 'other-change' })), JSON.stringify(summary()), JSON.stringify(summary())]), [
    'passes.jsonl:1: change "other-change" is not this file\'s change "demo-change"',
    'passes.jsonl:3: pass 1 is already summarized on line 2',
  ]);
});

function consistency(summaries: readonly PassSummary[], findings: readonly Finding[]): string[] {
  return consistencyProblems({
    findingsPath: 'findings.jsonl',
    passesPath: 'passes.jsonl',
    findings: findings.map((item, index) => ({ line: index + 1, finding: item })),
    summaries: summaries.map((item, index) => ({ line: index + 1, summary: item })),
  }).map(formatProblem);
}

test('consistent records have no problems', () => {
  const pass2 = summary({ pass: 2, role: 'B', counts: { critical: 0, high: 1, medium: 0, low: 1 } });
  const findings = [
    finding(),
    finding({ pass: 2, severity: 'high', missedBy: { pass: 1, role: 'A' } }),
    finding({ pass: 2, severity: 'low', missedBy: 'integration' }),
  ];
  assert.deepEqual(consistency([summary(), pass2, summary({ pass: 3, counts: { critical: 0, high: 0, medium: 0, low: 0 } })], findings), []);
});

test('every finding needs a summary of its pass with the same reviewer and session', () => {
  const findings = [
    finding(),
    finding({ pass: 2 }),
    finding({ session: 'session-2' }),
    finding({ reviewer: { harness: 'codex', model: 'gpt-6.1-sol' } }),
  ];
  assert.deepEqual(consistency([summary({ counts: { critical: 0, high: 0, medium: 3, low: 0 } })], findings), [
    'findings.jsonl:2: pass 2 has no summary in passes.jsonl',
    'findings.jsonl:3: reviewer or session differs from the summary of pass 1 in passes.jsonl',
    'findings.jsonl:4: reviewer or session differs from the summary of pass 1 in passes.jsonl',
  ]);
});

test('a missed pass needs a summary with the role that missedBy names', () => {
  const findings = [
    finding({ pass: 2, missedBy: { pass: 1, role: 'B' } }),
    finding({ pass: 3, missedBy: { pass: 2, role: 'B' } }),
  ];
  const summaries = [summary({ counts: { critical: 0, high: 0, medium: 0, low: 0 } }), summary({ pass: 2, role: 'B' }), summary({ pass: 3 })];
  assert.deepEqual(consistency(summaries, findings), ['findings.jsonl:1: missedBy role B is not role A of pass 1 in passes.jsonl']);
  assert.deepEqual(consistency([summary({ pass: 3, counts: { critical: 0, high: 0, medium: 1, low: 0 } })], [finding({ pass: 3, missedBy: { pass: 1, role: 'A' } })]), [
    'findings.jsonl:1: missedBy pass 1 has no summary in passes.jsonl',
  ]);
});

test('a summary counts exactly the findings of its pass', () => {
  const findings = [finding(), finding({ severity: 'critical' }), finding({ pass: 2, severity: 'low' })];
  const summaries = [summary(), summary({ pass: 2, role: 'B', counts: { critical: 0, high: 0, medium: 0, low: 0 } })];
  assert.deepEqual(consistency(summaries, findings), [
    'passes.jsonl:1: counts of pass 1 differ from its lines in findings.jsonl: critical 0 here, 1 there',
    'passes.jsonl:2: counts of pass 2 differ from its lines in findings.jsonl: low 0 here, 1 there',
  ]);
  assert.deepEqual(severityCounts(findings), { critical: 1, high: 0, medium: 1, low: 1 });
});

const NO_COUNTS = { critical: 0, high: 0, medium: 0, low: 0 };

test('the schema accepts an artifact identifier and rejects other artifact values', () => {
  const parsed = parse([JSON.stringify(summary({ artifact: 'item-0-plan' }))]);
  assert.deepEqual(parsed.problems, []);
  assert.equal(parsed.located[0].summary.artifact, 'item-0-plan');
  assert.deepEqual(messagesOf([
    JSON.stringify(summary({ artifact: 'Item 0' })),
    JSON.stringify({ ...summary(), artifact: 7 }),
    JSON.stringify(summary({ artifact: 'a'.repeat(65) })),
  ]), [
    'passes.jsonl:1: /artifact must match pattern "^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$"',
    'passes.jsonl:2: /artifact must be string',
    'passes.jsonl:3: /artifact must NOT have more than 64 characters',
  ]);
});

test('a pass is summarized once per artifact, an absent artifact being its own', () => {
  const lines = [summary(), summary({ artifact: 'x' }), summary({ artifact: 'y' }), summary({ artifact: 'x' })];
  assert.deepEqual(messagesOf(lines.map((line) => JSON.stringify(line))), [
    'passes.jsonl:4: pass 1 of artifact "x" is already summarized on line 2',
  ]);
});

test('findings agree with the summary of their own artifact\'s pass', () => {
  const summaries = [
    summary({ artifact: 'x' }),
    summary({ artifact: 'y', session: 'session-y', counts: { ...NO_COUNTS, high: 1 } }),
  ];
  const findings = [
    finding({ artifact: 'x' }),
    finding({ artifact: 'y', session: 'session-y', severity: 'high' }),
  ];
  assert.deepEqual(consistency(summaries, findings), []);
  assert.deepEqual(consistency(summaries, [finding({ artifact: 'y' }), finding({ artifact: 'z' }), finding()]), [
    'findings.jsonl:1: reviewer or session differs from the summary of pass 1 of artifact "y" in passes.jsonl',
    'findings.jsonl:2: pass 1 of artifact "z" has no summary in passes.jsonl',
    'findings.jsonl:3: pass 1 has no summary in passes.jsonl',
    'passes.jsonl:1: counts of pass 1 of artifact "x" differ from its lines in findings.jsonl: medium 1 here, 0 there',
    'passes.jsonl:2: counts of pass 1 of artifact "y" differ from its lines in findings.jsonl: high 1 here, 0 there, medium 0 here, 1 there',
  ]);
});

test('missedBy names a pass of the finding\'s own artifact', () => {
  const summaries = [
    summary({ artifact: 'x', counts: NO_COUNTS }),
    summary({ artifact: 'y', pass: 2, role: 'B' }),
  ];
  const missedOwn = finding({ artifact: 'y', pass: 2, missedBy: { pass: 1, role: 'A' } });
  assert.deepEqual(consistency(summaries, [missedOwn]), [
    'findings.jsonl:1: missedBy pass 1 of artifact "y" has no summary in passes.jsonl',
  ]);
  const withOwn = [...summaries, summary({ artifact: 'y', role: 'B', counts: NO_COUNTS })];
  assert.deepEqual(consistency(withOwn, [missedOwn]), [
    'findings.jsonl:1: missedBy role A is not role B of pass 1 of artifact "y" in passes.jsonl',
  ]);
  assert.deepEqual(consistency(withOwn, [{ ...missedOwn, missedBy: { pass: 1, role: 'B' } }]), []);
});
