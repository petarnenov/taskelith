import { posix } from 'node:path';
import {
  headTree, isClean, mergeBase, NO_MERGE_BASE, stampDirectory, type Git, type StoredStamp,
} from './verify-stamp.ts';

// Derives the protocol stage of every task worktree from the records the
// protocol already creates; all access goes through a Reader.

// A reader throws this when its host stops answering; the host is then
// unreachable, never a host without tasks.
export class TransportError extends Error {}

export interface Reader {
  // Output of git in cwd, or undefined when git fails.
  git(cwd: string, args: readonly string[]): string | undefined;
  read(path: string): string | undefined;
  list(directory: string): string[];
  // Modification time in epoch seconds.
  mtime(path: string): number | undefined;
  // Lines of the files directly in directory that contain needle.
  matchingLines(directory: string, needle: string): string[];
}

export const STAGES = [
  'brief', 'code', 'verify', 'route', 'review 1', 'review 2', 'review 3',
  'fixes', 'archived', 'handed off', 'landed',
] as const;
export type StageName = (typeof STAGES)[number];
export const HANDED_OFF = STAGES.indexOf('handed off') + 1;
export const LANDED = STAGES.indexOf('landed') + 1;
const FIRST_PASS = STAGES.indexOf('review 1') + 1;
const MAX_PASSES = 3;

export interface ReachedStage {
  readonly stage: number;
  readonly name: StageName;
  readonly at?: number;
}

export interface ReviewState {
  readonly passes: number;
  // The last pass reported only Low findings or none.
  readonly stopped: boolean;
}

export interface TaskProgress {
  readonly branch: string;
  readonly change: string;
  readonly worktree: string;
  readonly stage: number;
  readonly stageName: StageName;
  readonly reached: readonly ReachedStage[];
  readonly review: ReviewState;
  readonly startedAt?: number;
  readonly landedAt?: number;
  // Records that could not be read, such as corrupt passes.jsonl lines.
  readonly problems: readonly string[];
}

export interface Worktree {
  readonly path: string;
  readonly branch?: string;
}

const BASE_REF = 'origin/dev';
const CHANGES = 'openspec/changes';
const ARCHIVE = `${CHANGES}/archive`;
const SKIPPED_BRANCHES = new Set(['dev', 'main']);
// Integration worktrees of the coordinator carry the worker's task.
const INTEGRATION_PREFIX = 'itg-';
// A landed task stays in the view for a day.
export const LANDED_WINDOW_SECONDS = 24 * 3600;

export function parseWorktrees(porcelain: string): Worktree[] {
  return porcelain.split('\n\n').flatMap((block) => {
    const fields = block.split('\n');
    const path = fields.find((line) => line.startsWith('worktree '))?.slice('worktree '.length);
    const ref = fields.find((line) => line.startsWith('branch '))?.slice('branch '.length);
    if (path === undefined) return [];
    return [{ path, branch: ref?.replace(/^refs\/heads\//, '') }];
  });
}

export function listWorktrees(reader: Reader, repo: string): Worktree[] {
  return parseWorktrees(reader.git(repo, ['worktree', 'list', '--porcelain']) ?? '');
}

function nonEmptyLines(text: string | undefined): string[] {
  return (text ?? '').split('\n').map((line) => line.trim()).filter((line) => line !== '');
}

function epoch(text: string | undefined): number | undefined {
  const value = Number(text);
  return text !== undefined && text !== '' && Number.isFinite(value) ? value : undefined;
}

class TaskReader {
  readonly git: Git;
  readonly reader: Reader;
  readonly worktree: string;

  constructor(reader: Reader, worktree: string) {
    this.reader = reader;
    this.worktree = worktree;
    this.git = (args) => {
      const output = reader.git(worktree, args);
      if (output === undefined) throw new Error(`git ${args.join(' ')} failed`);
      return output;
    };
  }

  run(args: readonly string[]): string | undefined {
    return this.reader.git(this.worktree, args);
  }

  succeeds(args: readonly string[]): boolean {
    return this.run(args) !== undefined;
  }

  file(relative: string): string {
    return posix.join(this.worktree, relative);
  }

  // Commit times of range touching paths, oldest first.
  commitTimes(range: string, args: readonly string[], paths: readonly string[]): number[] {
    const log = this.run(['log', '--reverse', '--format=%ct', ...args, range, '--', ...paths]);
    return nonEmptyLines(log).map(Number);
  }

  firstCommitTime(range: string, paths: readonly string[]): number | undefined {
    return this.commitTimes(range, [], paths)[0];
  }
}

interface Located {
  readonly change: string;
  readonly records: string;
  readonly paths: readonly string[];
  readonly archived: boolean;
}

// An exact match with the branch wins; another change only when it is the
// one change of the worktree.
function locateChange(task: TaskReader, branch: string): Located | undefined {
  const active = task.reader.list(task.file(CHANGES)).filter((name) => name !== 'archive' && !name.startsWith('.'));
  const archived = task.reader.list(task.file(ARCHIVE)).find((name) => name.endsWith(`-${branch}`) && /^\d{4}-\d{2}-\d{2}-/.test(name));
  const archivedPath = archived === undefined ? [] : [`${ARCHIVE}/${archived}`];
  const activeOf = (change: string): Located =>
    ({ change, records: `${CHANGES}/${change}`, paths: [`${CHANGES}/${change}`, ...archivedPath], archived: false });
  if (active.includes(branch)) return activeOf(branch);
  if (archived !== undefined) {
    return { change: branch, records: archivedPath[0]!, paths: [`${CHANGES}/${branch}`, ...archivedPath], archived: true };
  }
  return active.length === 1 ? activeOf(active[0]!) : undefined;
}

interface Landing {
  readonly sha: string;
  readonly at?: number;
}

// The oldest first-parent commit of origin/dev that contains HEAD.
function findLanding(task: TaskReader): Landing | undefined {
  const descendants = new Set(nonEmptyLines(task.run(['rev-list', '--ancestry-path', `HEAD..${BASE_REF}`])));
  let landing: string | undefined;
  for (const sha of nonEmptyLines(task.run(['rev-list', '--first-parent', BASE_REF]))) {
    if (!descendants.has(sha)) break;
    landing = sha;
  }
  if (landing === undefined) return undefined;
  return { sha: landing, at: epoch(task.run(['log', '-1', '--format=%ct', landing])?.trim()) };
}

function baseBefore(task: TaskReader, landing: Landing | undefined): string {
  if (landing === undefined) return mergeBase(task.git);
  return task.run(['merge-base', 'HEAD', `${landing.sha}^1`])?.trim() || NO_MERGE_BASE;
}

function rangeFrom(base: string): string {
  return base === NO_MERGE_BASE ? 'HEAD' : `${base}..HEAD`;
}

const SEVERITIES = ['critical', 'high', 'medium', 'low'] as const;
type PassCounts = Readonly<Record<(typeof SEVERITIES)[number], number>>;

interface PassRecord {
  readonly counts: PassCounts;
}

interface ParsedPasses {
  readonly records: readonly PassRecord[];
  readonly problems: readonly string[];
}

function isPassRecord(value: unknown): value is PassRecord {
  const counts = (value as { counts?: unknown } | null)?.counts as Record<string, unknown> | null | undefined;
  return typeof counts === 'object' && counts !== null
    && SEVERITIES.every((severity) => Number.isInteger(counts[severity]) && (counts[severity] as number) >= 0);
}

// A line that is no pass summary with four counts is reported, not counted.
export function parsePasses(text: string | undefined): ParsedPasses {
  const records: PassRecord[] = [];
  const problems: string[] = [];
  nonEmptyLines(text).forEach((line, index) => {
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      value = undefined;
    }
    if (isPassRecord(value)) records.push(value);
    else problems.push(`passes.jsonl line ${index + 1} is no pass summary`);
  });
  return { records, problems };
}

export function isLowOnly(pass: PassRecord): boolean {
  return pass.counts.critical === 0 && pass.counts.high === 0 && pass.counts.medium === 0;
}

interface PassTimes {
  readonly times: readonly number[];
  readonly lastSha?: string;
}

// Line n of passes.jsonl appeared in the first commit holding n lines.
function passTimes(task: TaskReader, range: string, located: Located): PassTimes {
  const files = located.paths.map((path) => `${path}/passes.jsonl`);
  const log = nonEmptyLines(task.run(['log', '--reverse', '--format=%H %ct', range, '--', ...files]));
  const times: number[] = [];
  let lastSha: string | undefined;
  for (const entry of log) {
    const [sha, at] = entry.split(' ');
    const text = files.map((file) => task.run(['show', `${sha}:${file}`])).find((shown) => shown !== undefined);
    const count = parsePasses(text).records.length;
    if (count > times.length) lastSha = sha;
    while (times.length < count) times.push(Number(at));
  }
  return { times, lastSha };
}

function verifiedAt(task: TaskReader, base: string): number | undefined {
  try {
    if (!isClean(task.git)) return undefined;
    const tree = headTree(task.git);
    const stamps = task.reader.matchingLines(stampDirectory(task.git), tree).flatMap((line) => {
      try {
        return [JSON.parse(line) as StoredStamp];
      } catch {
        return [];
      }
    });
    const times = stamps.filter((stamp) => stamp.tree === tree && stamp.base === base)
      .map((stamp) => Date.parse(stamp.verifiedAt) / 1000).filter(Number.isFinite);
    return times.length === 0 ? undefined : Math.min(...times);
  } catch (error) {
    if (error instanceof TransportError) throw error;
    return undefined;
  }
}

function lastCommitArchives(task: TaskReader, located: Located): boolean {
  if (!located.archived) return false;
  const touched = nonEmptyLines(task.run(['diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD']));
  return touched.some((path) => path.startsWith(`${located.records}/`));
}

class Progress {
  private readonly stages = new Map<number, number | undefined>();

  reach(stage: number, at?: number): void {
    this.stages.set(stage, at);
  }

  get stage(): number {
    return Math.max(0, ...this.stages.keys());
  }

  reached(): ReachedStage[] {
    return [...this.stages.entries()].sort(([one], [other]) => one - other)
      .map(([stage, at]) => ({ stage, name: STAGES[stage - 1]!, ...(at === undefined ? {} : { at }) }));
  }
}

function briefTime(task: TaskReader, range: string, located: Located): number | undefined {
  const checklists = located.paths.map((path) => `${path}/checklist.json`);
  return task.firstCommitTime(range, checklists)
    ?? task.reader.mtime(task.file(`${located.records}/checklist.json`))
    ?? task.reader.mtime(task.file('.git'));
}

function recordReach(task: TaskReader, range: string, located: Located, name: string): number | undefined | null {
  const path = `${located.records}/${name}`;
  if (task.reader.read(task.file(path)) === undefined) return null;
  return task.firstCommitTime(range, located.paths.map((records) => `${records}/${name}`)) ?? task.reader.mtime(task.file(path));
}

interface ReviewReach {
  readonly review: ReviewState;
  readonly problems: readonly string[];
}

function reachReview(task: TaskReader, range: string, located: Located, progress: Progress, archives: boolean): ReviewReach {
  const { records, problems } = parsePasses(task.reader.read(task.file(`${located.records}/passes.jsonl`)));
  const { times, lastSha } = passTimes(task, range, located);
  records.slice(0, MAX_PASSES).forEach((_, index) => progress.reach(FIRST_PASS + index, times[index]));
  if (lastSha !== undefined && times.length === records.length && records.length > 0) {
    const fixes = task.commitTimes(`${lastSha}..HEAD`, ['--no-merges'], []);
    const counted = archives ? fixes.slice(0, -1) : fixes;
    if (counted.length > 0) progress.reach(STAGES.indexOf('fixes') + 1, counted[0]);
  }
  const last = records.at(-1);
  return { review: { passes: records.length, stopped: last !== undefined && isLowOnly(last) }, problems };
}

function deriveTask(reader: Reader, worktree: Worktree, now: number): TaskProgress | undefined {
  const branch = worktree.branch;
  if (branch === undefined || SKIPPED_BRANCHES.has(branch) || branch.startsWith(INTEGRATION_PREFIX)) return undefined;
  const task = new TaskReader(reader, worktree.path);
  const located = locateChange(task, branch);
  if (located === undefined) return undefined;
  const landing = located.archived && task.succeeds(['merge-base', '--is-ancestor', 'HEAD', BASE_REF]) ? findLanding(task) : undefined;
  if (landing !== undefined && (landing.at === undefined || now - landing.at > LANDED_WINDOW_SECONDS)) return undefined;
  const base = baseBefore(task, landing);
  const range = rangeFrom(base);
  const progress = new Progress();
  const startedAt = briefTime(task, range, located);
  progress.reach(1, startedAt);
  const code = task.commitTimes(range, ['--no-merges'], ['.', `:(exclude)${CHANGES}`])[0];
  if (code !== undefined) progress.reach(2, code);
  const verified = verifiedAt(task, base);
  if (verified !== undefined) progress.reach(3, verified);
  const route = recordReach(task, range, located, 'route.json');
  if (route !== null) progress.reach(4, route);
  const archives = lastCommitArchives(task, located);
  const { review, problems } = reachReview(task, range, located, progress, archives);
  if (archives) progress.reach(STAGES.indexOf('archived') + 1, epoch(task.run(['log', '-1', '--format=%ct'])?.trim()));
  if (landing !== undefined) progress.reach(LANDED, landing.at);
  const stage = progress.stage;
  return {
    branch, change: located.change, worktree: worktree.path, stage, stageName: STAGES[stage - 1]!,
    reached: progress.reached(), review, problems,
    ...(startedAt === undefined ? {} : { startedAt }), ...(landing?.at === undefined ? {} : { landedAt: landing.at }),
  };
}

export function deriveTasks(reader: Reader, repo: string, now: number): TaskProgress[] {
  return listWorktrees(reader, repo).flatMap((worktree) => deriveTask(reader, worktree, now) ?? []);
}

// The coordinator's queue marks a task handed off until it lands.
export function applyQueue(tasks: readonly TaskProgress[], queued: ReadonlySet<string>): TaskProgress[] {
  return tasks.map((task) => {
    if (task.stage >= LANDED || !queued.has(task.branch)) return task;
    const reached = [...task.reached, { stage: HANDED_OFF, name: STAGES[HANDED_OFF - 1]! }];
    return { ...task, stage: HANDED_OFF, stageName: STAGES[HANDED_OFF - 1]!, reached };
  });
}

export function parseQueue(text: string | undefined): Set<string> {
  try {
    const queue = JSON.parse(text ?? '[]') as unknown;
    if (!Array.isArray(queue)) return new Set();
    return new Set(queue.flatMap((item: unknown) => {
      const branch = (item as { branch?: unknown } | null)?.branch;
      return typeof branch === 'string' ? [branch] : [];
    }));
  } catch {
    return new Set();
  }
}

function isReached(value: unknown): value is ReachedStage {
  const reached = value as Partial<Record<keyof ReachedStage, unknown>> | null;
  return typeof reached === 'object' && reached !== null && isStage(reached.stage)
    && reached.name === STAGES[reached.stage - 1] && (reached.at === undefined || typeof reached.at === 'number');
}

function isStage(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= STAGES.length;
}

const optionalNumber = (value: unknown): boolean => value === undefined || typeof value === 'number';

// The full shape of a task, for output that another host or a cache wrote.
export function isTaskProgress(value: unknown): value is TaskProgress {
  const task = value as Partial<Record<keyof TaskProgress, unknown>> | null;
  if (typeof task !== 'object' || task === null) return false;
  const review = task.review as Partial<Record<keyof ReviewState, unknown>> | null | undefined;
  return typeof task.branch === 'string' && typeof task.change === 'string' && typeof task.worktree === 'string'
    && isStage(task.stage) && task.stageName === STAGES[task.stage - 1]
    && Array.isArray(task.reached) && task.reached.every(isReached)
    && typeof review === 'object' && review !== null && Number.isInteger(review.passes) && typeof review.stopped === 'boolean'
    && optionalNumber(task.startedAt) && optionalNumber(task.landedAt)
    && Array.isArray(task.problems) && task.problems.every((problem) => typeof problem === 'string');
}
