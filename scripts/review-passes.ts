import {
  checkedValue,
  contentLines,
  reviewerKey,
  type Finding,
  type RecordSource,
  type LocatedFinding,
  type Problem,
  type Reviewer,
  type Role,
  type SchemaCheck,
  type Severity,
} from './review-findings.ts';

// Pure rules of the pass summaries in passes.jsonl and their agreement with
// findings.jsonl. File access stays in scripts/findings.ts.

export const PASSES_FILE = 'passes.jsonl';
export const SEVERITIES: readonly Severity[] = ['critical', 'high', 'medium', 'low'];

export type SeverityCounts = Readonly<Record<Severity, number>>;

export interface PassSummary {
  readonly change: string;
  readonly pass: number;
  readonly role: Role;
  readonly reviewer: Reviewer;
  readonly session: string;
  readonly counts: SeverityCounts;
}

export interface LocatedSummary {
  readonly line: number;
  readonly summary: PassSummary;
}

export interface ParsedSummaries {
  readonly located: readonly LocatedSummary[];
  readonly problems: readonly Problem[];
}

const EMPTY_LINE = 'empty line; a change without review passes has an empty file';

export function parsePassSummaries(source: RecordSource, checkSchema: SchemaCheck): ParsedSummaries {
  const located: LocatedSummary[] = [];
  const problems: Problem[] = [];
  contentLines(source.text).forEach((text, index) => {
    const line = index + 1;
    const checked = checkedValue(text, checkSchema, EMPTY_LINE);
    const messages = checked.ok ? summaryProblems(checked.value as PassSummary, source.change, located) : checked.problems;
    if (checked.ok && messages.length === 0) located.push({ line, summary: checked.value as PassSummary });
    problems.push(...messages.map((message) => ({ file: source.path, line, message })));
  });
  return { located, problems };
}

function summaryProblems(summary: PassSummary, change: string, earlier: readonly LocatedSummary[]): string[] {
  const problems: string[] = [];
  if (summary.change !== change) problems.push(`change "${summary.change}" is not this file's change "${change}"`);
  const duplicate = earlier.find((other) => other.summary.pass === summary.pass);
  if (duplicate !== undefined) problems.push(`pass ${summary.pass} is already summarized on line ${duplicate.line}`);
  return problems;
}

export function severityCounts(findings: readonly Finding[]): SeverityCounts {
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const { severity } of findings) counts[severity] += 1;
  return counts;
}

export interface ReviewRecords {
  readonly findingsPath: string;
  readonly passesPath: string;
  readonly findings: readonly LocatedFinding[];
  readonly summaries: readonly LocatedSummary[];
}

// Every finding's pass and missedBy pass has a summary that agrees with it,
// and every summary counts exactly its pass's findings.
export function consistencyProblems(records: ReviewRecords): Problem[] {
  const byPass = new Map(records.summaries.map(({ summary }) => [summary.pass, summary]));
  const findings = records.findings.map(({ finding }) => finding);
  return [
    ...records.findings.flatMap(({ line, finding }) =>
      findingProblems(finding, byPass).map((message) => ({ file: records.findingsPath, line, message }))),
    ...records.summaries.flatMap(({ line, summary }) =>
      countProblems(summary, findings).map((message) => ({ file: records.passesPath, line, message }))),
  ];
}

function findingProblems(finding: Finding, byPass: ReadonlyMap<number, PassSummary>): string[] {
  const problems: string[] = [];
  const summary = byPass.get(finding.pass);
  if (summary === undefined) {
    problems.push(`pass ${finding.pass} has no summary in ${PASSES_FILE}`);
  } else if (reviewerKey(summary.reviewer) !== reviewerKey(finding.reviewer) || summary.session !== finding.session) {
    problems.push(`reviewer or session differs from the summary of pass ${finding.pass} in ${PASSES_FILE}`);
  }
  return [...problems, ...missedByProblems(finding, byPass)];
}

function missedByProblems({ missedBy }: Finding, byPass: ReadonlyMap<number, PassSummary>): string[] {
  if (missedBy === undefined || missedBy === 'integration') return [];
  const missed = byPass.get(missedBy.pass);
  if (missed === undefined) return [`missedBy pass ${missedBy.pass} has no summary in ${PASSES_FILE}`];
  if (missed.role === missedBy.role) return [];
  return [`missedBy role ${missedBy.role} is not role ${missed.role} of pass ${missedBy.pass} in ${PASSES_FILE}`];
}

function countProblems(summary: PassSummary, findings: readonly Finding[]): string[] {
  const found = severityCounts(findings.filter((finding) => finding.pass === summary.pass));
  const differing = SEVERITIES.filter((severity) => found[severity] !== summary.counts[severity]);
  if (differing.length === 0) return [];
  const details = differing.map((severity) => `${severity} ${summary.counts[severity]} here, ${found[severity]} there`);
  return [`counts of pass ${summary.pass} differ from its lines in findings.jsonl: ${details.join(', ')}`];
}
