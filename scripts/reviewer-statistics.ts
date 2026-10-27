import { reviewerKey, row, type Finding, type Reviewer, type Role } from './review-findings.ts';
import { PASSES_FILE, SEVERITIES, severityCounts, type PassSummary, type SeverityCounts } from './review-passes.ts';

// Pure statistics per reviewer and role over archived review records.

export const UNKNOWN_ROLE = '(unknown)';
export const DERIVED_NOTE = `A change without ${PASSES_FILE} counts only its passes with findings, `
  + `derived from findings.jsonl, with role ${UNKNOWN_ROLE}.`;

export interface ReviewedChange {
  readonly change: string;
  // Undefined when the change has no passes.jsonl.
  readonly summaries?: readonly PassSummary[];
  readonly findings: readonly Finding[];
}

interface PassRecord {
  readonly change: string;
  readonly pass: number;
  readonly role: Role | typeof UNKNOWN_ROLE;
  readonly reviewer: Reviewer;
  readonly counts: SeverityCounts;
}

export interface StatisticsRow extends SeverityCounts {
  readonly key: string;
  readonly passes: number;
  readonly findings: number;
  readonly findingsPerPass: number;
  readonly passesWithMediumOrWorse: number;
  readonly mediumOrWorseShare: number;
  readonly misses: number;
}

export interface ReviewerStatistics {
  readonly changes: number;
  readonly unrecordedChanges: number;
  readonly passes: number;
  readonly derivedChanges: readonly string[];
  readonly note: string;
  readonly reviewers: readonly StatisticsRow[];
  readonly roles: readonly StatisticsRow[];
  readonly integrationMisses: number;
  readonly unattributedMisses: number;
}

function passRecords({ change, summaries, findings }: ReviewedChange): PassRecord[] {
  if (summaries !== undefined) return summaries.map(({ pass, role, reviewer, counts }) => ({ change, pass, role, reviewer, counts }));
  const passes = [...new Set(findings.map(({ pass }) => pass))].sort((a, b) => a - b);
  return passes.map((pass) => {
    const ofPass = findings.filter((finding) => finding.pass === pass);
    return { change, pass, role: UNKNOWN_ROLE, reviewer: ofPass[0].reviewer, counts: severityCounts(ofPass) };
  });
}

interface Tally {
  passes: number;
  counts: Record<keyof SeverityCounts, number>;
  passesWithMediumOrWorse: number;
  misses: number;
}

class Tallies {
  private readonly byKey = new Map<string, Tally>();

  addPass(key: string, counts: SeverityCounts): void {
    const tally = this.tally(key);
    tally.passes += 1;
    for (const severity of SEVERITIES) tally.counts[severity] += counts[severity];
    if (counts.critical + counts.high + counts.medium > 0) tally.passesWithMediumOrWorse += 1;
  }

  addMiss(key: string): void {
    this.tally(key).misses += 1;
  }

  rows(): StatisticsRow[] {
    return [...this.byKey.entries()].map(([key, tally]) => statisticsRow(key, tally));
  }

  private tally(key: string): Tally {
    const existing = this.byKey.get(key);
    if (existing !== undefined) return existing;
    const created = { passes: 0, counts: { critical: 0, high: 0, medium: 0, low: 0 }, passesWithMediumOrWorse: 0, misses: 0 };
    this.byKey.set(key, created);
    return created;
  }
}

function statisticsRow(key: string, { passes, counts, passesWithMediumOrWorse, misses }: Tally): StatisticsRow {
  const findings = SEVERITIES.reduce((total, severity) => total + counts[severity], 0);
  const rounded = (value: number) => Math.round(value * 100) / 100;
  return {
    key,
    passes,
    ...counts,
    findings,
    findingsPerPass: rounded(findings / passes),
    passesWithMediumOrWorse,
    mediumOrWorseShare: rounded(passesWithMediumOrWorse / passes),
    misses,
  };
}

const ROLE_ORDER: readonly string[] = ['A', 'B', UNKNOWN_ROLE];

// unrecordedChanges counts archived changes without either record file.
export function reviewerStatistics(changes: readonly ReviewedChange[], unrecordedChanges: number): ReviewerStatistics {
  const records = changes.flatMap(passRecords);
  const reviewers = new Tallies();
  const roles = new Tallies();
  for (const record of records) {
    reviewers.addPass(reviewerKey(record.reviewer), record.counts);
    roles.addPass(record.role, record.counts);
  }
  let integrationMisses = 0;
  let unattributedMisses = 0;
  for (const { change, findings } of changes) {
    for (const { missedBy } of findings) {
      if (missedBy === undefined) continue;
      if (missedBy === 'integration') {
        integrationMisses += 1;
        continue;
      }
      const missed = records.find((record) => record.change === change && record.pass === missedBy.pass);
      if (missed === undefined) {
        unattributedMisses += 1;
        continue;
      }
      reviewers.addMiss(reviewerKey(missed.reviewer));
      roles.addMiss(missed.role);
    }
  }
  return {
    changes: changes.length,
    unrecordedChanges,
    passes: records.length,
    derivedChanges: changes.filter(({ summaries }) => summaries === undefined).map(({ change }) => change),
    note: DERIVED_NOTE,
    reviewers: reviewers.rows().sort((a, b) => b.passes - a.passes || a.key.localeCompare(b.key)),
    roles: roles.rows().sort((a, b) => ROLE_ORDER.indexOf(a.key) - ROLE_ORDER.indexOf(b.key)),
    integrationMisses,
    unattributedMisses,
  };
}

const HEADER = ['passes', 'critical', 'high', 'medium', 'low', 'per pass', '>=medium', 'misses'];

function statisticsLine({ key, passes, critical, high, medium, low, findingsPerPass, mediumOrWorseShare, misses }: StatisticsRow): string {
  const cells = [passes, critical, high, medium, low].map(String);
  return row([...cells, findingsPerPass.toFixed(2), `${Math.round(mediumOrWorseShare * 100)}%`, String(misses)], key);
}

export function formatReviewerStatistics(statistics: ReviewerStatistics): string {
  const { changes, unrecordedChanges, passes, derivedChanges, reviewers, roles, integrationMisses, unattributedMisses } = statistics;
  const summary = `Reviewer statistics of archived changes: ${changes} change(s) with review records, ${passes} pass(es).`;
  const unrecorded = `${unrecordedChanges} archived change(s) have neither findings.jsonl nor ${PASSES_FILE} `
    + 'and are not counted.';
  const derived = derivedChanges.length === 0
    ? `Every archived change with review records has ${PASSES_FILE}; each of its passes is counted.`
    : `${derivedChanges.length} archived change(s) have findings.jsonl but no ${PASSES_FILE}. ${DERIVED_NOTE}`;
  const legend = 'per pass is findings per pass; >=medium is the share of passes with at least one '
    + 'Medium or worse finding; misses are findings that a later pass attributed to it.';
  const table = (title: string, rows: readonly StatisticsRow[]) =>
    [title, row(HEADER, 'key'), ...rows.map(statisticsLine)].join('\n');
  const misses = `Misses attributed to the integration: ${integrationMisses}; `
    + `to a pass without a record: ${unattributedMisses}.`;
  return [summary, unrecorded, derived, legend, table('By reviewer', reviewers), table('By role', roles), misses].join('\n\n');
}
