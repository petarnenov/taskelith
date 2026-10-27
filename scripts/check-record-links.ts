import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { posix } from 'node:path';

// Checks the links of OpenSpec records and docs; an active change is checked
// at its future archived path, so a link that archiving breaks fails now.

export const BASELINE_PATH = 'scripts/record-links-baseline.tsv';
const SCANNED_DIRS = ['docs', 'openspec/specs', 'openspec/changes'];
const CHANGES_DIR = 'openspec/changes';
const ARCHIVE_DIR = 'openspec/changes/archive';
const SPECS_DIR = 'openspec/specs';
// A name with this prefix keeps it when `openspec archive` moves the change.
const DATE_PREFIX = /^\d{4}-\d{2}-\d{2}-/;
const EXTERNAL = /^[a-z][a-z\d+.-]*:/i;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const INLINE_CODE = /(`+)[^`][\s\S]*?\1(?!`)/g;
const LINK = /!?\[(?:[^[\]]|\[[^[\]]*\])*\]\(\s*(<[^>]*>|[^\s)]+)(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g;
const HEADING = /^ {0,3}#{1,6}[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/;

export interface MarkdownLink {
  line: number;
  target: string;
}

export interface BaselineEntry {
  file: string;
  target: string;
}

export interface LinkProblem extends BaselineEntry {
  line: number;
  reason: string;
}

export interface BaselineResult {
  unbaselined: LinkProblem[];
  baselined: number;
  stale: BaselineEntry[];
}

// A record directory as it sits once archived, and as it sits now.
interface Boundary {
  placedDir: string;
  actualDir: string;
  label: string;
}

interface Location {
  file: string;
  placedFile: string;
  boundary?: Boundary;
}

type Resolution = { path: string } | { reason: string };

function proseLines(text: string): { line: number; content: string }[] {
  const lines: { line: number; content: string }[] = [];
  let fence: string | undefined;
  text.split('\n').forEach((content, index) => {
    const marker = FENCE.exec(content)?.[1];
    if (fence) {
      if (marker?.[0] === fence[0] && marker.length >= fence.length) fence = undefined;
    } else if (marker) {
      fence = marker;
    } else {
      lines.push({ line: index + 1, content });
    }
  });
  return lines;
}

export function markdownLinks(text: string): MarkdownLink[] {
  return proseLines(text).flatMap(({ line, content }) =>
    [...content.replace(INLINE_CODE, '').matchAll(LINK)].map((match) =>
      ({ line, target: match[1].replace(/^<(.*)>$/, '$1') })));
}

function headingSlug(heading: string): string {
  return heading
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/[`*]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '')
    .replace(/ /g, '-');
}

// Numbers repeated slugs as GitHub does: the second `a` becomes `a-1`.
export function headingAnchors(text: string): Set<string> {
  const anchors = new Set<string>();
  const repeats = new Map<string, number>();
  for (const { content } of proseLines(text)) {
    const heading = HEADING.exec(content)?.[1];
    if (heading === undefined) continue;
    const base = headingSlug(heading);
    let anchor = base;
    while (anchors.has(anchor)) {
      const repeat = (repeats.get(base) ?? 0) + 1;
      repeats.set(base, repeat);
      anchor = `${base}-${repeat}`;
    }
    anchors.add(anchor);
  }
  return anchors;
}

function isWithin(path: string, dir: string): boolean {
  return path === dir || path.startsWith(`${dir}/`);
}

function fixedLocation(file: string, dir: string, label: string): Location {
  return { file, placedFile: file, boundary: { placedDir: dir, actualDir: dir, label } };
}

function activeChangeLocation(file: string, archiveDate: string): Location {
  const [, , name, ...rest] = file.split('/');
  const archivedName = DATE_PREFIX.test(name) ? name : `${archiveDate}-${name}`;
  const placedDir = `${ARCHIVE_DIR}/${archivedName}`;
  const boundary = { placedDir, actualDir: `${CHANGES_DIR}/${name}`, label: 'change directory' };
  return { file, placedFile: `${placedDir}/${rest.join('/')}`, boundary };
}

function locate(file: string, archiveDate: string): Location {
  const parts = file.split('/');
  if (isWithin(file, ARCHIVE_DIR)) {
    return parts.length > 4 ? fixedLocation(file, parts.slice(0, 4).join('/'), 'change directory') : { file, placedFile: file };
  }
  if (isWithin(file, CHANGES_DIR) && parts.length > 3) return activeChangeLocation(file, archiveDate);
  if (isWithin(file, SPECS_DIR) && parts.length > 3) return fixedLocation(file, parts.slice(0, 3).join('/'), 'spec directory');
  return { file, placedFile: file };
}

function activeChangeOf(path: string): string | undefined {
  if (!isWithin(path, CHANGES_DIR) || isWithin(path, ARCHIVE_DIR)) return undefined;
  return path.split('/')[2];
}

// Archiving copies a delta's text into openspec/specs/, so relative links
// in it would resolve against another directory.
function isSpecDelta(placedFile: string): boolean {
  return isWithin(placedFile, ARCHIVE_DIR) && placedFile.split('/')[4] === 'specs';
}

function resolvePath(location: Location, path: string): Resolution {
  const rootRelative = path.startsWith('/');
  if (!rootRelative && isSpecDelta(location.placedFile)) {
    return { reason: 'relative link in a spec delta; use a root-relative link' };
  }
  const placed = rootRelative
    ? posix.normalize(path.slice(1))
    : posix.join(posix.dirname(location.placedFile), path);
  const { boundary } = location;
  if (!rootRelative && boundary && !isWithin(placed, boundary.placedDir)) {
    return { reason: `relative link leaves the ${boundary.label}; use a root-relative link` };
  }
  if (placed === '..' || placed.startsWith('../')) return { reason: 'relative link leaves the repository' };
  const change = activeChangeOf(placed);
  if (change) return { reason: `links to the active change ${change}, which moves when archived` };
  if (!boundary || !isWithin(placed, boundary.placedDir)) return { path: placed };
  return { path: boundary.actualDir + placed.slice(boundary.placedDir.length) };
}

function decoded(part: string): string {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}

class LinkChecker {
  private readonly anchorsByFile = new Map<string, Set<string>>();
  private readonly root: string;

  constructor(root: string) {
    this.root = root;
  }

  problemsOf(location: Location, text: string): LinkProblem[] {
    return markdownLinks(text).flatMap(({ line, target }) => {
      if (EXTERNAL.test(target)) return [];
      const reason = this.reasonFor(location, target);
      return reason ? [{ file: location.file, line, target, reason }] : [];
    });
  }

  private reasonFor(location: Location, target: string): string | undefined {
    const hashAt = target.indexOf('#');
    const path = decoded((hashAt === -1 ? target : target.slice(0, hashAt)).replace(/\?.*$/, ''));
    const anchor = hashAt === -1 ? '' : decoded(target.slice(hashAt + 1));
    const resolution = path === '' ? { path: location.file } : resolvePath(location, path);
    if ('reason' in resolution) return resolution.reason;
    const stats = statSync(posix.join(this.root, resolution.path), { throwIfNoEntry: false });
    if (!stats) return 'target does not exist';
    if (anchor === '' || !stats.isFile() || !resolution.path.endsWith('.md')) return undefined;
    return this.anchorsOf(resolution.path).has(anchor) ? undefined : 'anchor does not exist in the target';
  }

  private anchorsOf(file: string): Set<string> {
    let anchors = this.anchorsByFile.get(file);
    if (!anchors) {
      anchors = headingAnchors(readFileSync(posix.join(this.root, file), 'utf8'));
      this.anchorsByFile.set(file, anchors);
    }
    return anchors;
  }
}

function markdownFiles(root: string): string[] {
  return SCANNED_DIRS.flatMap((dir) => {
    if (!existsSync(posix.join(root, dir))) return [];
    return readdirSync(posix.join(root, dir), { recursive: true, encoding: 'utf8' })
      .map((entry) => posix.join(dir, entry.split('\\').join('/')))
      .filter((file) => file.endsWith('.md') && statSync(posix.join(root, file)).isFile());
  }).sort();
}

export function findLinkProblems(root: string, archiveDate: string): LinkProblem[] {
  const checker = new LinkChecker(root);
  return markdownFiles(root).flatMap((file) =>
    checker.problemsOf(locate(file, archiveDate), readFileSync(posix.join(root, file), 'utf8')));
}

export function baselineLine(entry: BaselineEntry): string {
  return `${entry.file}\t${entry.target}`;
}

export function parseBaseline(text: string): BaselineEntry[] {
  return text.split('\n').filter((line) => line !== '').map((line, index) => {
    const [file, target, ...extra] = line.split('\t');
    if (target === undefined || extra.length > 0) {
      throw new Error(`Baseline line ${index + 1} is not a path and a target separated by one tab.`);
    }
    if (!file.startsWith(`${ARCHIVE_DIR}/`)) {
      throw new Error(`Baseline entry ${file} is outside ${ARCHIVE_DIR}/; fix the link instead.`);
    }
    return { file, target };
  });
}

// Each entry suppresses one occurrence; entries left over are stale.
export function applyBaseline(problems: readonly LinkProblem[], baseline: readonly BaselineEntry[]): BaselineResult {
  const remaining = new Map<string, number>();
  for (const entry of baseline) remaining.set(baselineLine(entry), (remaining.get(baselineLine(entry)) ?? 0) + 1);
  const take = (entry: BaselineEntry) => {
    const count = remaining.get(baselineLine(entry)) ?? 0;
    if (count > 0) remaining.set(baselineLine(entry), count - 1);
    return count > 0;
  };
  const unbaselined = problems.filter((problem) => !take(problem));
  const stale = baseline.filter(take);
  return { unbaselined, baselined: problems.length - unbaselined.length, stale };
}

// The archive date of `openspec archive`: the local calendar date.
export function localDate(now: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export interface LinkReport {
  errors: string[];
  summary: string;
}

export function linkReport(root: string, archiveDate: string): LinkReport {
  const baselinePath = posix.join(root, BASELINE_PATH);
  const baseline = existsSync(baselinePath) ? parseBaseline(readFileSync(baselinePath, 'utf8')) : [];
  const { unbaselined, baselined, stale } = applyBaseline(findLinkProblems(root, archiveDate), baseline);
  const errors = [
    ...unbaselined.map(({ file, line, target, reason }) => `${file}:${line}: ${reason}: ${target}`),
    ...stale.map((entry) => `${BASELINE_PATH}: stale entry, remove it: ${baselineLine(entry)}`),
  ];
  const summary = errors.length > 0
    ? `Record link problems: ${unbaselined.length}, stale baseline entries: ${stale.length}; see docs/agent-task-protocol.md step 6.`
    : `Every checked link conforms; ${baselined} archived links remain in ${BASELINE_PATH}.`;
  return { errors, summary };
}

if (import.meta.main) {
  const { errors, summary } = linkReport(process.cwd(), localDate(new Date()));
  for (const error of errors) console.error(error);
  if (errors.length > 0) {
    console.error(summary);
    process.exitCode = 1;
  } else {
    console.log(summary);
  }
}
