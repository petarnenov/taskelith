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

// A pass is identified by its artifact and number within its change.
export interface PassCoordinates {
  // Absent when the change reviews one artifact.
  readonly artifact?: string;
  readonly pass: number;
}

export interface PassSummary extends PassCoordinates {
  readonly change: string;
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

// Identifiers hold no space, so the key cannot collide across artifacts.
export function passKey({ artifact, pass }: PassCoordinates): string {
  return `${artifact ?? ''} ${pass}`;
}

export function passName({ artifact, pass }: PassCoordinates): string {
  return artifact === undefined ? `pass ${pass}` : `pass ${pass} of artifact "${artifact}"`;
}

function samePass(one: PassCoordinates, other: PassCoordinates): boolean {
  return passKey(one) === passKey(other);
}

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
  const duplicate = earlier.find((other) => samePass(other.summary, summary));
  if (duplicate !== undefined) problems.push(`${passName(summary)} is already summarized on line ${duplicate.line}`);
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
  const byPass = new Map(records.summaries.map(({ summary }) => [passKey(summary), summary]));
  const findings = records.findings.map(({ finding }) => finding);
  return [
    ...records.findings.flatMap(({ line, finding }) =>
      findingProblems(finding, byPass).map((message) => ({ file: records.findingsPath, line, message }))),
    ...records.summaries.flatMap(({ line, summary }) =>
      countProblems(summary, findings).map((message) => ({ file: records.passesPath, line, message }))),
  ];
}

type SummariesByPass = ReadonlyMap<string, PassSummary>;

function findingProblems(finding: Finding, byPass: SummariesByPass): string[] {
  const problems: string[] = [];
  const summary = byPass.get(passKey(finding));
  if (summary === undefined) {
    problems.push(`${passName(finding)} has no summary in ${PASSES_FILE}`);
  } else if (reviewerKey(summary.reviewer) !== reviewerKey(finding.reviewer) || summary.session !== finding.session) {
    problems.push(`reviewer or session differs from the summary of ${passName(finding)} in ${PASSES_FILE}`);
  }
  return [...problems, ...missedByProblems(finding, byPass)];
}

// The missed pass belongs to the finding's own artifact.
function missedByProblems({ artifact, missedBy }: Finding, byPass: SummariesByPass): string[] {
  if (missedBy === undefined || missedBy === 'integration') return [];
  const coordinates = { artifact, pass: missedBy.pass };
  const missed = byPass.get(passKey(coordinates));
  if (missed === undefined) return [`missedBy ${passName(coordinates)} has no summary in ${PASSES_FILE}`];
  if (missed.role === missedBy.role) return [];
  return [`missedBy role ${missedBy.role} is not role ${missed.role} of ${passName(coordinates)} in ${PASSES_FILE}`];
}

function countProblems(summary: PassSummary, findings: readonly Finding[]): string[] {
  const found = severityCounts(findings.filter((finding) => samePass(finding, summary)));
  const differing = SEVERITIES.filter((severity) => found[severity] !== summary.counts[severity]);
  if (differing.length === 0) return [];
  const details = differing.map((severity) => `${severity} ${summary.counts[severity]} here, ${found[severity]} there`);
  return [`counts of ${passName(summary)} differ from its lines in findings.jsonl: ${details.join(', ')}`];
}
