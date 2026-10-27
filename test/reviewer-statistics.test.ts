import assert from 'node:assert/strict';
import test from 'node:test';
import type { Finding, Reviewer } from '../scripts/review-findings.ts';
import type { PassSummary } from '../scripts/review-passes.ts';
import { DERIVED_NOTE, formatReviewerStatistics, reviewerStatistics, UNKNOWN_ROLE } from '../scripts/reviewer-statistics.ts';

const CODEX: Reviewer = { harness: 'codex', model: 'gpt-6.1-sol', variant: 'medium' };
const OPUS: Reviewer = { harness: 'claude', model: 'claude-opus-5-5', variant: 'high' };
const NONE = { critical: 0, high: 0, medium: 0, low: 0 };

function finding(overrides: Partial<Finding>): Finding {
  return {
    change: 'c',
    pass: 1,
    reviewer: CODEX,
    session: 's',
    severity: 'low',
    category: 'docs',
    title: 'T',
    file: 'docs/a.md',
    outcome: 'fixed',
    resolution: 'R',
    ...overrides,
  };
}

function summary(pass: number, role: 'A' | 'B', reviewer: Reviewer, counts: Partial<typeof NONE> = {}): PassSummary {
  return { change: 'summarized', pass, role, reviewer, session: 's', counts: { ...NONE, ...counts } };
}

const summarized = {
  change: 'summarized',
  summaries: [summary(1, 'A', CODEX, { high: 1, low: 2 }), summary(2, 'B', OPUS), summary(3, 'A', CODEX, { medium: 1 })],
  findings: [
    finding({ change: 'summarized', severity: 'high' }),
    finding({ change: 'summarized' }),
    finding({ change: 'summarized' }),
    finding({ change: 'summarized', pass: 3, severity: 'medium', missedBy: { pass: 2, role: 'B' } }),
  ],
};

const derived = {
  change: 'derived',
  findings: [
    finding({ change: 'derived', pass: 2, reviewer: OPUS, severity: 'critical' }),
    finding({ change: 'derived', pass: 2, reviewer: OPUS, missedBy: { pass: 1, role: 'A' } }),
    finding({ change: 'derived', pass: 3, missedBy: 'integration' }),
    finding({ change: 'derived', pass: 3, missedBy: { pass: 2, role: 'B' } }),
  ],
};

test('summaries count every pass, also one without findings, by reviewer and role', () => {
  const statistics = reviewerStatistics([summarized]);
  assert.equal(statistics.passes, 3);
  assert.deepEqual(statistics.derivedChanges, []);
  assert.deepEqual(statistics.reviewers, [
    { key: 'codex gpt-6.1-sol#medium', passes: 2, critical: 0, high: 1, medium: 1, low: 2, findings: 4, findingsPerPass: 2, passesWithMediumOrWorse: 2, mediumOrWorseShare: 1, misses: 0 },
    { key: 'claude claude-opus-5-5#high', passes: 1, critical: 0, high: 0, medium: 0, low: 0, findings: 0, findingsPerPass: 0, passesWithMediumOrWorse: 0, mediumOrWorseShare: 0, misses: 1 },
  ]);
  assert.deepEqual(statistics.roles.map(({ key, passes, misses }) => [key, passes, misses]), [['A', 2, 0], ['B', 1, 1]]);
});

test('a change without summaries counts only its passes with findings, role unknown', () => {
  const statistics = reviewerStatistics([derived, summarized]);
  assert.equal(statistics.changes, 2);
  assert.equal(statistics.passes, 5);
  assert.deepEqual(statistics.derivedChanges, ['derived']);
  assert.equal(statistics.note, DERIVED_NOTE);
  const unknown = statistics.roles.find(({ key }) => key === UNKNOWN_ROLE)!;
  assert.deepEqual([unknown.passes, unknown.critical, unknown.low, unknown.passesWithMediumOrWorse, unknown.misses], [2, 1, 3, 1, 1]);
  assert.deepEqual(statistics.roles.map(({ key }) => key), ['A', 'B', UNKNOWN_ROLE]);
  assert.equal(statistics.integrationMisses, 1);
  assert.equal(statistics.unattributedMisses, 1, 'derived pass 1 had no findings, so its miss has no record');
  const opus = statistics.reviewers.find(({ key }) => key === 'claude claude-opus-5-5#high')!;
  assert.deepEqual([opus.passes, opus.findings, opus.findingsPerPass, opus.mediumOrWorseShare, opus.misses], [2, 2, 1, 0.5, 2]);
});

test('the text names the source of the passes and every column', () => {
  const cells = (...values: string[]) => values.map((value) => value.padStart(10)).join('');
  const text = formatReviewerStatistics(reviewerStatistics([derived, summarized]));
  assert.ok(text.startsWith('Reviewer statistics of archived changes: 2 change(s), 5 pass(es).\n\n'
    + `1 archived change(s) have no passes.jsonl. ${DERIVED_NOTE}\n\n`));
  assert.ok(text.includes(`By role\n${cells('passes', 'critical', 'high', 'medium', 'low', 'per pass', '>=medium', 'misses')}  key\n`));
  assert.ok(text.includes(`${cells('2', '1', '0', '0', '3', '2.00', '50%', '1')}  ${UNKNOWN_ROLE}`));
  assert.ok(text.endsWith('Misses attributed to the integration: 1; to a pass without a record: 1.'));
  const empty = formatReviewerStatistics(reviewerStatistics([]));
  assert.match(empty, /^Reviewer statistics of archived changes: 0 change\(s\), 0 pass\(es\)\.\n\nEvery archived change has passes\.jsonl/);
});
