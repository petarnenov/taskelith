import { posix } from 'node:path';
import { changeOfDirectory, contentLines } from './review-findings.ts';
import {
  LINE_BANDS,
  type BandRate,
  type ChangeContent,
  type ReferenceRates,
  type RouteFeatures,
  type ShadowInput,
} from './review-route.ts';
import { THIRD_PASS } from './review-route-effect.ts';
import {
  ARCHIVE_DIRECTORY,
  archivedReviewsOf,
  required,
  RouteRefusal,
  type ArchivedReview,
  type FeatureEnvironment,
  type FeatureRevision,
} from './review-route-features.ts';

// The shadow router's input beyond the features: reference third pass
// rates of the archive and the content of the change's proposal.

export const ROUTE_RECORD_FILE = 'route.json';
export const EVALUATION_RECORD_FILE = 'evaluation.jsonl';
const TASK_LINE = /^\s*- \[[ xX]\]/;
const REQUIREMENT_LINE = /^### Requirement:/;

// The archived reviews and the lines changed that route records name.
export interface ArchivedReference {
  readonly reviews: readonly ArchivedReview[];
  readonly recordedLines: ReadonlyMap<string, number>;
}

export type ReferenceAt = (commit: string) => ArchivedReference;

export function shadowInputAt(
  root: string,
  environment: FeatureEnvironment,
  revision: FeatureRevision,
  features: RouteFeatures,
  referenceAt: ReferenceAt,
): ShadowInput {
  const change = changeOfDirectory(posix.basename(revision.directory));
  return {
    features,
    reference: referenceRates(referenceAt(revision.devCommit), change),
    content: changeContentAt(root, environment, revision),
  };
}

// As of a commit, so that no later change counts.
export function archivedReference(environment: FeatureEnvironment, root: string, commit: string): ArchivedReference {
  const files = required(environment.listFiles(root, commit, ARCHIVE_DIRECTORY), 'cannot list the archive');
  const read = (path: string) => required(environment.readFile(root, commit, path), `cannot read ${path}`);
  return { reviews: archivedReviewsOf(files, read), recordedLines: recordedLinesOf(files, read) };
}

// Lines changed by change, from archived evaluation lines and route.json
// files; a change's own route.json wins.
export function recordedLinesOf(files: readonly string[], read: (path: string) => string): Map<string, number> {
  const named = (name: string) => files.filter((path) => posix.basename(path) === name && isChangeRecord(path));
  const lines = new Map<string, number>();
  for (const path of named(EVALUATION_RECORD_FILE)) {
    for (const line of contentLines(read(path))) addRecordedLines(lines, parsedRecord(path, line));
  }
  for (const path of named(ROUTE_RECORD_FILE)) addRecordedLines(lines, parsedRecord(path, read(path)));
  return lines;
}

// openspec/changes/archive/<directory>/<file>, not deeper.
function isChangeRecord(path: string): boolean {
  return path.startsWith(`${ARCHIVE_DIRECTORY}/`) && path.split('/').length === 5;
}

function parsedRecord(path: string, text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new RouteRefusal(`${path} is not valid JSON`);
  }
}

function addRecordedLines(lines: Map<string, number>, record: unknown): void {
  const { change, features } = (record ?? {}) as { change?: unknown; features?: { linesChanged?: unknown } };
  const linesChanged = features?.linesChanged;
  if (typeof change === 'string' && typeof linesChanged === 'number') lines.set(change, linesChanged);
}

// Leave-one-out: the routed change never counts in its own rates. As in
// the route evaluation, changes of several artifacts do not count.
export function referenceRates({ reviews, recordedLines }: ArchivedReference, routedChange: string): ReferenceRates {
  const others = reviews.filter(({ change, severalArtifacts }) => change !== routedChange && !severalArtifacts);
  const byLinesChanged = LINE_BANDS.map(({ label }): BandRate => {
    const inBand = others.filter(({ change }) => bandOf(recordedLines.get(change)) === label);
    return { band: label, changes: inBand.length, thirdPassShare: thirdPassShare(inBand) };
  });
  return { changes: others.length, thirdPassShare: thirdPassShare(others), byLinesChanged };
}

// Undefined for a change without recorded lines.
function bandOf(linesChanged: number | undefined): string | undefined {
  if (linesChanged === undefined) return undefined;
  return LINE_BANDS.find(({ below }) => linesChanged < below)?.label;
}

function thirdPassShare(reviews: readonly ArchivedReview[]): number | null {
  if (reviews.length === 0) return null;
  return reviews.filter(({ highestPass }) => highestPass >= THIRD_PASS).length / reviews.length;
}

// Missing files give empty sections and zero counts.
export function changeContentAt(root: string, environment: FeatureEnvironment, { revision, directory }: FeatureRevision): ChangeContent {
  const read = (path: string) => environment.readFile(root, revision, path) ?? '';
  const proposal = read(`${directory}/proposal.md`);
  const specs = (environment.listFiles(root, revision, `${directory}/specs`) ?? []).filter((path) => posix.basename(path) === 'spec.md');
  return {
    why: markdownSection(proposal, 'Why'),
    whatChanges: markdownSection(proposal, 'What Changes'),
    taskCount: countLines(read(`${directory}/tasks.md`), TASK_LINE),
    specRequirementCount: specs.reduce((sum, path) => sum + countLines(read(path), REQUIREMENT_LINE), 0),
  };
}

// The trimmed body of the first "## <heading>" section; empty without one.
export function markdownSection(text: string, heading: string): string {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => line.trimEnd() === `## ${heading}`);
  if (start === -1) return '';
  const body = lines.slice(start + 1);
  const end = body.findIndex((line) => /^#{1,2} /.test(line));
  return (end === -1 ? body : body.slice(0, end)).join('\n').trim();
}

function countLines(text: string, pattern: RegExp): number {
  return text.split('\n').filter((line) => pattern.test(line)).length;
}
