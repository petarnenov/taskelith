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
  const statistics = reviewerStatistics([summarized], 0);
  assert.equal(statistics.passes, 3);
  assert.deepEqual(statistics.derivedChanges, []);
  assert.deepEqual(statistics.reviewers, [
    { key: 'codex gpt-6.1-sol#medium', passes: 2, critical: 0, high: 1, medium: 1, low: 2, findings: 4, findingsPerPass: 2, passesWithMediumOrWorse: 2, mediumOrWorseShare: 1, misses: 0 },
    { key: 'claude claude-opus-5-5#high', passes: 1, critical: 0, high: 0, medium: 0, low: 0, findings: 0, findingsPerPass: 0, passesWithMediumOrWorse: 0, mediumOrWorseShare: 0, misses: 1 },
  ]);
  assert.deepEqual(statistics.roles.map(({ key, passes, misses }) => [key, passes, misses]), [['A', 2, 0], ['B', 1, 1]]);
});

test('a change without summaries counts only its passes with findings, role unknown', () => {
  const statistics = reviewerStatistics([derived, summarized], 0);
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
  const text = formatReviewerStatistics(reviewerStatistics([derived, summarized], 4));
  assert.ok(text.startsWith('Reviewer statistics of archived changes: 2 change(s) with review records, 5 pass(es).\n\n'
    + '4 archived change(s) have neither findings.jsonl nor passes.jsonl and are not counted.\n\n'
    + `1 archived change(s) have findings.jsonl but no passes.jsonl. ${DERIVED_NOTE}\n\n`));
  assert.ok(text.includes(`By role\n${cells('passes', 'critical', 'high', 'medium', 'low', 'per pass', '>=medium', 'misses')}  key\n`));
  assert.ok(text.includes(`${cells('2', '1', '0', '0', '3', '2.00', '50%', '1')}  ${UNKNOWN_ROLE}`));
  assert.ok(text.endsWith('Misses attributed to the integration: 1; to a pass without a record: 1.'));
  const empty = formatReviewerStatistics(reviewerStatistics([], 0));
  assert.match(empty, /^Reviewer statistics of archived changes: 0 change\(s\) with review records, 0 pass\(es\)\.\n\n0 archived change\(s\) have neither .+\n\nEvery archived change with review records has passes\.jsonl/);
});

test('passes of several artifacts count apart per reviewer and role, misses per artifact', () => {
  const multi = {
    change: 'multi',
    summaries: [
      { ...summary(1, 'A', CODEX), change: 'multi', artifact: 'x' },
      { ...summary(1, 'A', CODEX, { low: 1 }), change: 'multi', artifact: 'y' },
      { ...summary(2, 'B', OPUS, { medium: 1 }), change: 'multi', artifact: 'y' },
    ],
    findings: [
      finding({ change: 'multi', artifact: 'y' }),
      finding({ change: 'multi', artifact: 'y', pass: 2, reviewer: OPUS, severity: 'medium', missedBy: { pass: 1, role: 'A' } }),
    ],
  };
  const statistics = reviewerStatistics([multi], 0);
  assert.equal(statistics.passes, 3);
  const rows = (list: typeof statistics.reviewers) => list.map(({ key, passes, low, medium, misses }) => [key, passes, low, medium, misses]);
  assert.deepEqual(rows(statistics.reviewers), [
    ['codex gpt-6.1-sol#medium', 2, 1, 0, 1],
    ['claude claude-opus-5-5#high', 1, 0, 1, 0],
  ]);
  assert.deepEqual(rows(statistics.roles), [['A', 2, 1, 0, 1], ['B', 1, 0, 1, 0]]);
  assert.equal(statistics.unattributedMisses, 0);
});

test('a change without summaries derives one pass per artifact and pass number', () => {
  const derivedMulti = {
    change: 'derived-multi',
    findings: [
      finding({ change: 'derived-multi', artifact: 'x' }),
      finding({ change: 'derived-multi', artifact: 'y', reviewer: OPUS }),
      finding({ change: 'derived-multi', artifact: 'y', reviewer: OPUS }),
      finding({ change: 'derived-multi', artifact: 'x', pass: 2, missedBy: { pass: 1, role: 'A' } }),
      finding({ change: 'derived-multi', artifact: 'z', pass: 2, missedBy: { pass: 1, role: 'A' } }),
    ],
  };
  const statistics = reviewerStatistics([derivedMulti], 0);
  assert.equal(statistics.passes, 4);
  const opus = statistics.reviewers.find(({ key }) => key === 'claude claude-opus-5-5#high')!;
  assert.deepEqual([opus.passes, opus.low, opus.misses], [1, 2, 0]);
  const codex = statistics.reviewers.find(({ key }) => key === 'codex gpt-6.1-sol#medium')!;
  assert.deepEqual([codex.passes, codex.low, codex.misses], [3, 3, 1]);
  assert.equal(statistics.unattributedMisses, 1, 'artifact z has no pass 1');
});
