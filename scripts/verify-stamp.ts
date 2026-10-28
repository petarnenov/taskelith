import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// make verify profiles and verified-tree stamps; Node built-ins only, so
// that the pre-push hook can run it before any install.

export type VerifyProfile = 'full' | 'docs-only';
export type Git = (args: readonly string[]) => string;
export type Environment = Readonly<Record<string, string | undefined>>;

export const PROFILE_VARIABLE = 'TASKELITH_VERIFY_PROFILE';
export const STAMP_DIRECTORY = 'taskelith-verify-stamps';
export const DIRTY = 'dirty';
export const NO_MERGE_BASE = 'none';
const BASE_REF = 'origin/dev';
const PROTECTED_BRANCHES = new Set(['dev', 'main']);
const LOCKFILE = 'package-lock.json';
const SERVICES_COMPOSE = 'infra/services/compose.yaml';

export class StampError extends Error {}

// Tests read these documentation directories, so they need the full profile.
const TESTED_DOCS_DIRECTORIES = ['docs/review-findings/', 'docs/qualification/'];

// Decision D1: docs/** except the tested directories, openspec/**, and
// root-level Markdown files except CHANGELOG.md; the rest is full.
export function isDocsPath(path: string): boolean {
  if (TESTED_DOCS_DIRECTORIES.some((directory) => path.startsWith(directory))) return false;
  if (path.startsWith('docs/') || path.startsWith('openspec/')) return true;
  return !path.includes('/') && path.endsWith('.md') && path !== 'CHANGELOG.md';
}

// An empty diff is no evidence of a documentation change, so it is full.
export function classifyPaths(paths: readonly string[]): VerifyProfile {
  return paths.length > 0 && paths.every(isDocsPath) ? 'docs-only' : 'full';
}

export function gitIn(cwd: string): Git {
  return (args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function attempt(git: Git, args: readonly string[]): string | undefined {
  try {
    return git(args).trim();
  } catch {
    return undefined;
  }
}

function lines(text: string): string[] {
  return text.split('\n').filter((line) => line !== '');
}

// Committed, staged, unstaged, and untracked paths since the merge base;
// renames count as both paths.
export function changedPaths(git: Git, base: string): string[] {
  const committed = lines(git(['diff', '--name-only', '--no-renames', base, 'HEAD']));
  const uncommitted = lines(git(['diff', '--name-only', '--no-renames', 'HEAD']));
  const untracked = lines(git(['ls-files', '--others', '--exclude-standard']));
  return [...new Set([...committed, ...uncommitted, ...untracked])].sort();
}

export interface ProfileDecision {
  readonly profile: VerifyProfile;
  readonly reason: string;
}

function forcedProfile(environment: Environment): ProfileDecision | undefined {
  const forced = environment[PROFILE_VARIABLE];
  if (forced !== undefined && forced !== '') {
    if (forced !== 'full') throw new StampError(`${PROFILE_VARIABLE} may only be full, not ${forced}`);
    return { profile: 'full', reason: `${PROFILE_VARIABLE}=full` };
  }
  if (environment.CI !== undefined && environment.CI !== '') return { profile: 'full', reason: 'CI' };
  return undefined;
}

// Docs-only applies only to feature branches; CI, dev, main, a detached
// HEAD, a forced full run, and a missing merge base get the full profile.
export function decideProfile(git: Git, environment: Environment): ProfileDecision {
  const forced = forcedProfile(environment);
  if (forced !== undefined) return forced;
  const branch = attempt(git, ['symbolic-ref', '--short', '-q', 'HEAD']);
  if (branch === undefined || branch === '') return { profile: 'full', reason: 'detached HEAD' };
  if (PROTECTED_BRANCHES.has(branch)) return { profile: 'full', reason: `branch ${branch}` };
  const base = mergeBase(git);
  if (base === NO_MERGE_BASE) return { profile: 'full', reason: `no merge base with ${BASE_REF}` };
  const paths = changedPaths(git, base);
  const profile = classifyPaths(paths);
  if (profile === 'docs-only') return { profile, reason: `${paths.length} documentation path(s) since ${base.slice(0, 12)}` };
  const code = paths.find((path) => !isDocsPath(path));
  return { profile, reason: code === undefined ? `no change since ${base.slice(0, 12)}` : `${code} changed` };
}

export function mergeBase(git: Git): string {
  return attempt(git, ['merge-base', 'HEAD', BASE_REF]) || NO_MERGE_BASE;
}

export function isClean(git: Git): boolean {
  return git(['status', '--porcelain', '--untracked-files=normal']).trim() === '';
}

export function headTree(git: Git): string {
  return git(['rev-parse', 'HEAD^{tree}']).trim();
}

// The tree and the merge base with origin/dev, which the contract
// compatibility check and the findings validation read.
export interface Revision {
  readonly tree: string;
  readonly base: string;
}

export function headRevision(git: Git): Revision {
  return { tree: headTree(git), base: mergeBase(git) };
}

export interface StampFields {
  readonly tree: string;
  readonly base: string;
  readonly profile: VerifyProfile;
  readonly node: string;
  readonly npm: string;
  readonly lockfile: string;
  readonly images: readonly string[];
}

export interface Toolchain {
  readonly node: string;
  readonly npm: string;
}

function fileHash(path: string): string {
  if (!existsSync(path)) return 'none';
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

// The services' image references with their digests, as Compose pulls them.
export function serviceImages(root: string): string[] {
  const path = join(root, SERVICES_COMPOSE);
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').split('\n')
    .map((line) => /^\s*image:\s*(\S+)\s*$/.exec(line)?.[1])
    .filter((image): image is string => image !== undefined)
    .sort();
}

export function stampFields(root: string, revision: Revision, profile: VerifyProfile, toolchain: Toolchain): StampFields {
  return {
    tree: revision.tree,
    base: revision.base,
    profile,
    node: toolchain.node,
    npm: toolchain.npm,
    lockfile: fileHash(join(root, LOCKFILE)),
    images: serviceImages(root),
  };
}

export function stampKey(fields: StampFields): string {
  const ordered = [fields.tree, fields.base, fields.profile, fields.node, fields.npm, fields.lockfile, ...fields.images];
  return createHash('sha256').update(JSON.stringify(ordered)).digest('hex');
}

// Shared by every worktree of the clone and never tracked.
export function stampDirectory(git: Git): string {
  const common = git(['rev-parse', '--path-format=absolute', '--git-common-dir']).trim();
  return join(common, STAMP_DIRECTORY);
}

export function writeStamp(directory: string, fields: StampFields, verifiedAt: Date): string {
  mkdirSync(directory, { recursive: true });
  const path = join(directory, stampKey(fields));
  writeFileSync(path, `${JSON.stringify({ ...fields, verifiedAt: verifiedAt.toISOString() })}\n`);
  return path;
}

export interface StoredStamp extends StampFields {
  readonly verifiedAt: string;
}

export function readStamp(directory: string, fields: StampFields): StoredStamp | undefined {
  const path = join(directory, stampKey(fields));
  if (!existsSync(path)) return undefined;
  try {
    const stored = JSON.parse(readFileSync(path, 'utf8')) as StoredStamp;
    return stampKey(stored) === stampKey(fields) ? stored : undefined;
  } catch {
    return undefined;
  }
}

// A full stamp also covers a docs-only requirement, never the reverse.
export function satisfyingProfiles(required: VerifyProfile): VerifyProfile[] {
  return required === 'full' ? ['full'] : ['full', 'docs-only'];
}

export interface StampContext {
  readonly root: string;
  readonly git: Git;
  readonly toolchain: Toolchain;
  readonly environment: Environment;
}

export interface CheckResult {
  readonly verified: boolean;
  readonly message: string;
}

export function checkStamp(context: StampContext, required: VerifyProfile): CheckResult {
  const { git, root, toolchain, environment } = context;
  if (environment.CI !== undefined && environment.CI !== '') return { verified: false, message: 'CI never reuses a stamp' };
  if (!isClean(git)) return { verified: false, message: 'the working tree is not clean' };
  const revision = headRevision(git);
  const directory = stampDirectory(git);
  const tree = revision.tree.slice(0, 12);
  for (const profile of satisfyingProfiles(required)) {
    const stamp = readStamp(directory, stampFields(root, revision, profile, toolchain));
    if (stamp !== undefined) {
      return { verified: true, message: `tree ${tree} passed make verify (${profile}) at ${stamp.verifiedAt}` };
    }
  }
  return { verified: false, message: `no ${required} stamp for tree ${tree} and merge base ${revision.base.slice(0, 12)}` };
}

export function startTree(git: Git): string {
  return isClean(git) ? headTree(git) : DIRTY;
}

// Stamps only a tree that was clean when make verify started and is unchanged.
export function finishVerify(context: StampContext, profile: VerifyProfile, started: string, now: Date): string {
  const passed = `make verify: passed, profile ${profile}`;
  if (started === DIRTY) return `${passed}, uncommitted working tree; no stamp written`;
  const { git, root, toolchain } = context;
  if (!isClean(git) || headTree(git) !== started) return `${passed}, tree ${started}; the tree changed during the run, no stamp written`;
  writeStamp(stampDirectory(git), stampFields(root, { tree: started, base: mergeBase(git) }, profile, toolchain), now);
  return `${passed}, tree ${started}; stamp written`;
}

// make -n, -t, and -q still run recipe lines that call $(MAKE), so the
// stamp step reads make's flags to tell those runs from a real one.
const NO_CHECK_OPTIONS = ['-n', '--just-print', '--dry-run', '--recon', '-t', '--touch', '-q', '--question'];
const NO_CHECK_LETTERS = /[ntq]/;

export function isDryRun(makeflags: string | undefined): boolean {
  const words = (makeflags ?? '').trim().split(/\s+/).filter((word) => word !== '');
  if (words.some((word) => NO_CHECK_OPTIONS.includes(word))) return true;
  const first = words[0];
  return first !== undefined && !first.startsWith('-') && !first.includes('=') && NO_CHECK_LETTERS.test(first);
}

export const USAGE = 'usage: verify-stamp.ts profile | start | write <full|docs-only> <tree|dirty> | check [full]';

function parseProfile(value: string | undefined): VerifyProfile {
  if (value === 'full' || value === 'docs-only') return value;
  throw new StampError(USAGE);
}

export function currentToolchain(): Toolchain {
  const npm = execFileSync('npm', ['-v'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  return { node: process.version, npm };
}

export interface CommandResult {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

function checkCommand(context: StampContext, args: readonly string[]): CommandResult {
  if (args.length > 1 || (args.length === 1 && args[0] !== 'full')) throw new StampError(USAGE);
  const required = args.length === 1 ? 'full' : decideProfile(context.git, context.environment).profile;
  const result = checkStamp(context, required);
  if (result.verified) return { status: 0, stdout: `pre-push: ${result.message}; skipping make verify\n`, stderr: '' };
  return { status: 1, stdout: `pre-push: ${result.message}; running make verify\n`, stderr: '' };
}

export function runCommand(args: readonly string[], context: () => StampContext, now: Date): CommandResult {
  const [command, ...rest] = args;
  try {
    switch (command) {
      case 'profile': {
        const { git, environment } = context();
        const decision = decideProfile(git, environment);
        return { status: 0, stdout: `${decision.profile}\n`, stderr: `make verify: profile ${decision.profile} (${decision.reason})\n` };
      }
      case 'start':
        return { status: 0, stdout: `${startTree(context().git)}\n`, stderr: '' };
      case 'write':
        if (rest.length !== 2) throw new StampError(USAGE);
        if (isDryRun(context().environment.MAKEFLAGS)) return { status: 0, stdout: 'make verify: dry run; no stamp written\n', stderr: '' };
        return { status: 0, stdout: `${finishVerify(context(), parseProfile(rest[0]), rest[1], now)}\n`, stderr: '' };
      case 'check':
        return checkCommand(context(), rest);
      default:
        throw new StampError(USAGE);
    }
  } catch (error) {
    if (error instanceof StampError) return { status: 2, stdout: '', stderr: `${error.message}\n` };
    throw error;
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.cwd();
  const result = runCommand(process.argv.slice(2), () => ({
    root, git: gitIn(root), toolchain: currentToolchain(), environment: process.env,
  }), new Date());
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  process.exitCode = result.status;
}
