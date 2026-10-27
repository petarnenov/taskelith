import { posix } from 'node:path';
import { isSize, type Size } from './checklist-record.ts';
import { contentLines, NO_CAPABILITY, type Finding, type Severity } from './review-findings.ts';
import type { CapabilityHistory, RouteFeatures, Touches } from './review-route.ts';

// Derives the router input of an active change from committed state,
// read through the RouteEnvironment port (design.md "Features").

export const CHANGES_DIRECTORY = 'openspec/changes';
export const ARCHIVE_DIRECTORY = 'openspec/changes/archive';
export const EXTERNAL_FACTS_HEADING = '## External facts';
const THIRD_PASS = 3;

export interface ChangedFile {
  readonly path: string;
  readonly lines: number;
}

// Git facts of the repository; tests replace them.
export interface RouteEnvironment {
  // The merge base of HEAD and origin/dev.
  mergeBase(root: string): string | undefined;
  head(root: string): string | undefined;
  // Paths with uncommitted or untracked changes, or undefined.
  uncommittedPaths(root: string): readonly string[] | undefined;
  // Changed files outside openspec/changes/; binary files count 0 lines.
  changedFiles(root: string, from: string, to: string): readonly ChangedFile[] | undefined;
  // Every file below a directory as of a commit; empty when none.
  listFiles(root: string, commit: string, directory: string): readonly string[] | undefined;
  readFile(root: string, commit: string, path: string): string | undefined;
}

// A precondition of the route command that does not hold; exit 1.
export class RouteRefusal extends Error {}

export interface RouteSubject {
  readonly devCommit: string;
  readonly headCommit: string;
  readonly features: RouteFeatures;
}

export function routeSubject(root: string, change: string, environment: RouteEnvironment): RouteSubject {
  const devCommit = required(environment.mergeBase(root), 'no merge base of HEAD and origin/dev');
  const headCommit = required(environment.head(root), 'HEAD does not name a commit');
  refuseUncommitted(required(environment.uncommittedPaths(root), 'cannot read the working tree status'), change);
  const changed = required(environment.changedFiles(root, devCommit, headCommit), 'cannot read the diff against the merge base');
  const changeFiles = required(environment.listFiles(root, headCommit, changeDirectory(change)), 'cannot list the change');
  if (changeFiles.length === 0) throw new RouteRefusal(`no committed active change "${change}"`);
  const capabilities = capabilitiesUnder(changeFiles, changeDirectory(change));
  const reviews = archivedReviews(environment, root, devCommit);
  return {
    devCommit,
    headCommit,
    features: {
      linesChanged: changed.reduce((sum, { lines }) => sum + lines, 0),
      filesChanged: changed.length,
      capabilities,
      touches: touchesOf(changed.map(({ path }) => path), capabilities),
      externalFacts: hasExternalFacts(environment.readFile(root, headCommit, `${changeDirectory(change)}/design.md`)),
      size: sizeOf(environment.readFile(root, headCommit, `${changeDirectory(change)}/checklist.json`)),
      capabilityHistory: capabilityHistory(reviews, capabilities),
    },
  };
}

function required<Value>(value: Value | undefined, refusal: string): Value {
  if (value === undefined) throw new RouteRefusal(refusal);
  return value;
}

export function changeDirectory(change: string): string {
  return `${CHANGES_DIRECTORY}/${change}`;
}

function refuseUncommitted(paths: readonly string[], change: string): void {
  const inside = `${changeDirectory(change)}/`;
  const outside = paths.filter((path) => !path.startsWith(inside));
  if (outside.length > 0) throw new RouteRefusal(`${outside.length} path(s) outside the change have uncommitted changes`);
}

// The capability directories of a change's spec delta, sorted.
export function capabilitiesUnder(files: readonly string[], directory: string): string[] {
  const specs = `${directory}/specs/`;
  const names = files
    .filter((path) => path.startsWith(specs))
    .map((path) => path.slice(specs.length).split('/'))
    .filter((segments) => segments.length > 1)
    .map(([name]) => name!);
  return [...new Set(names)].sort();
}

const CODE_GLOBS = ['src/**', 'scripts/**', 'packages/**/src/**', 'apps/**/src/**'];
const TEST_GLOBS = ['test/**', 'packages/**/test/**', 'apps/**/test/**'];
const CONTRACT_GLOBS = ['packages/contracts/**', 'docs/contracts/**', '**/*.openapi.*', '**/*.asyncapi.*'];
const DOCKER_GLOBS = ['**/Dockerfile', '**/compose*.yaml', '**/compose*.yml', 'infra/**'];
const SECURITY_SEGMENTS: ReadonlySet<string> = new Set([
  'auth', 'authentication', 'authorization', 'credential', 'credentials', 'redact', 'redaction',
  'secret', 'secrets', 'seccomp', 'token', 'tokens', 'trust',
]);

export function touchesOf(paths: readonly string[], capabilities: readonly string[]): Touches {
  const anyMatches = (globs: readonly string[]) => paths.some((path) => matchesAny(path, globs));
  const flags = {
    code: anyMatches(CODE_GLOBS),
    tests: anyMatches(TEST_GLOBS),
    contracts: anyMatches(CONTRACT_GLOBS),
    specs: capabilities.length > 0,
    docker: anyMatches(DOCKER_GLOBS),
    security: paths.some(isSecurityPath),
  };
  return { ...flags, docsOnly: isDocsOnly(paths, flags) };
}

function matchesAny(path: string, globs: readonly string[]): boolean {
  return globs.some((glob) => posix.matchesGlob(path, glob));
}

// A heuristic, matched case-insensitively per segment; recorded per
// change so that the effect can show its misses.
export function isSecurityPath(path: string): boolean {
  return path.toLowerCase().split(/[/._-]/).some((segment) => SECURITY_SEGMENTS.has(segment));
}

function isDocsOnly(paths: readonly string[], flags: Omit<Touches, 'docsOnly'>): boolean {
  const isDocument = (path: string) => path.endsWith('.md') || path.startsWith('docs/');
  const { specs: _specs, ...others } = flags;
  return paths.every(isDocument) && Object.values(others).every((flag) => !flag);
}

export function hasExternalFacts(design: string | undefined): boolean {
  return design?.split('\n').some((line) => line.trimEnd() === EXTERNAL_FACTS_HEADING) ?? false;
}

// Null without checklist.json or without a size in it.
export function sizeOf(checklist: string | undefined): Size | null {
  if (checklist === undefined) return null;
  let record: unknown;
  try {
    record = JSON.parse(checklist);
  } catch {
    throw new RouteRefusal('checklist.json is not valid JSON');
  }
  const size = (record as { size?: unknown } | null)?.size;
  if (size === undefined) return null;
  if (typeof size !== 'string' || !isSize(size)) throw new RouteRefusal('checklist.json has an invalid size');
  return size;
}

export interface ArchivedReview {
  readonly capabilities: ReadonlySet<string>;
  readonly highestPass: number;
  readonly mediumOrWorse: number;
}

const REVIEW_FILES = new Set(['findings.jsonl', 'passes.jsonl']);

// The archived changes with review records as of a commit; no later
// change can count, so the history holds no future information.
function archivedReviews(environment: RouteEnvironment, root: string, commit: string): ArchivedReview[] {
  const files = required(environment.listFiles(root, commit, ARCHIVE_DIRECTORY), 'cannot list the archive');
  const read = (path: string) => required(environment.readFile(root, commit, path), `cannot read ${path}`);
  return archivedReviewsOf(files, read);
}

export function archivedReviewsOf(files: readonly string[], read: (path: string) => string): ArchivedReview[] {
  const reviews: ArchivedReview[] = [];
  for (const [directory, paths] of filesByChange(files)) {
    const records = paths.filter((path) => REVIEW_FILES.has(posix.basename(path)) && posix.dirname(path) === directory);
    if (records.length === 0) continue;
    reviews.push(archivedReview(capabilitiesUnder(paths, directory), records.map((path) => recordOf(path, read(path)))));
  }
  return reviews;
}

function filesByChange(files: readonly string[]): Map<string, string[]> {
  const byChange = new Map<string, string[]>();
  for (const path of files) {
    const directory = path.split('/').slice(0, 4).join('/');
    byChange.set(directory, [...(byChange.get(directory) ?? []), path]);
  }
  return byChange;
}

type RecordLine = Partial<Pick<Finding, 'pass' | 'severity' | 'capability'>>;

interface ReviewRecord {
  readonly isFindings: boolean;
  readonly lines: readonly RecordLine[];
}

function recordOf(path: string, text: string): ReviewRecord {
  try {
    const lines = contentLines(text).map((line) => JSON.parse(line) as RecordLine);
    return { isFindings: posix.basename(path) === 'findings.jsonl', lines };
  } catch {
    throw new RouteRefusal(`${path} is not valid JSON lines`);
  }
}

const MEDIUM_OR_WORSE: ReadonlySet<Severity> = new Set<Severity>(['critical', 'high', 'medium']);

function archivedReview(specCapabilities: readonly string[], records: readonly ReviewRecord[]): ArchivedReview {
  const findings = records.filter(({ isFindings }) => isFindings).flatMap(({ lines }) => lines);
  const findingCapabilities = findings.flatMap(({ capability }) => (capability === undefined || capability === NO_CAPABILITY ? [] : [capability]));
  const passes = records.flatMap(({ lines }) => lines.map(({ pass }) => pass ?? 0));
  return {
    capabilities: new Set([...specCapabilities, ...findingCapabilities]),
    highestPass: Math.max(0, ...passes),
    mediumOrWorse: findings.filter(({ severity }) => severity !== undefined && MEDIUM_OR_WORSE.has(severity)).length,
  };
}

export function capabilityHistory(reviews: readonly ArchivedReview[], capabilities: readonly string[]): CapabilityHistory {
  const related = reviews.filter((review) => capabilities.some((name) => review.capabilities.has(name)));
  if (related.length === 0) return { changes: 0, thirdPassShare: null, mediumOrWorsePerChange: null };
  const thirdPasses = related.filter(({ highestPass }) => highestPass >= THIRD_PASS).length;
  const mediumOrWorse = related.reduce((sum, review) => sum + review.mediumOrWorse, 0);
  return {
    changes: related.length,
    thirdPassShare: thirdPasses / related.length,
    mediumOrWorsePerChange: mediumOrWorse / related.length,
  };
}
