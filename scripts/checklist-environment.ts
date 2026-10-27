import { execFileSync } from 'node:child_process';
import { posix } from 'node:path';
import { LANDING_CHANGE } from './checklist-record.ts';

// The clock and the git facts that the checklist record and its effect
// need; tests replace them.
export interface ChecklistEnvironment {
  now(): Date;
  // The dev commit whose archived findings the working tree holds.
  devCommit(root: string): string | undefined;
  // The archived findings files as of a commit, or undefined if unknown.
  archiveAt(root: string, commit: string): ArchiveSnapshot | undefined;
  // The commit that archived the change that set the checklist rule.
  landingCommit(root: string): string | undefined;
  // Whether a change was opened after the landing or is not committed.
  openedAfter(root: string, changeDirectory: string, landing: string): boolean;
  // Lines a change altered outside openspec/changes/, or undefined.
  linesChanged(root: string, archiveDirectory: string, devCommit: string): number | undefined;
}

export interface ArchiveSnapshot {
  readonly commit: string;
  readonly findings: readonly { readonly path: string; readonly text: string }[];
}

const ARCHIVE_DIRECTORY = 'openspec/changes/archive';

// The ceiling keeps git from using a repository above the given root.
function gitOutput(root: string, args: readonly string[]): string | undefined {
  try {
    const env = { ...process.env, GIT_CEILING_DIRECTORIES: posix.dirname(root) };
    return execFileSync('git', args, { cwd: root, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return undefined;
  }
}

function git(root: string, args: readonly string[]): string | undefined {
  return gitOutput(root, args)?.trim();
}

// Commits that added a path, newest first; empty when there are none.
function addingCommits(root: string, pathspec: string): string[] {
  const log = git(root, ['log', '--no-renames', '--diff-filter=A', '--format=%H', '--', pathspec]);
  return log === undefined || log === '' ? [] : log.split('\n');
}

const ARCHIVED_FINDINGS = /^openspec\/changes\/archive\/[^/]+\/findings\.jsonl$/;

function archiveAt(root: string, commit: string): ArchiveSnapshot | undefined {
  const resolved = git(root, ['rev-parse', '--verify', '--quiet', `${commit}^{commit}`]);
  if (resolved === undefined) return undefined;
  const paths = git(root, ['ls-tree', '-r', '--name-only', resolved, '--', ARCHIVE_DIRECTORY]) ?? '';
  const findings = paths.split('\n').filter((path) => ARCHIVED_FINDINGS.test(path)).sort()
    .map((path) => ({ path, text: gitOutput(root, ['cat-file', 'blob', `${resolved}:${path}`]) ?? '' }));
  return { commit: resolved, findings };
}

// The first archive commit; a re-archive after a return comes later.
function landingCommit(root: string): string | undefined {
  return addingCommits(root, `${ARCHIVE_DIRECTORY}/*-${LANDING_CHANGE}/*`).at(-1);
}

function openedAfter(root: string, changeDirectory: string, landing: string): boolean {
  const opened = addingCommits(root, posix.join(changeDirectory, '.openspec.yaml')).at(-1);
  if (opened === undefined) return true;
  return git(root, ['merge-base', '--is-ancestor', landing, opened]) !== undefined;
}

const SHORTSTAT_COUNT = /(\d+) (?:insertion|deletion)/g;

// The archive commit adds the change's checklist.json under the archive.
function linesChanged(root: string, archiveDirectory: string, devCommit: string): number | undefined {
  const archiveCommit = addingCommits(root, `${ARCHIVE_DIRECTORY}/${archiveDirectory}/checklist.json`)[0];
  if (archiveCommit === undefined) return undefined;
  const range = [devCommit, archiveCommit];
  const stat = git(root, ['diff', '--shortstat', '--no-renames', ...range, '--', '.', ':(exclude)openspec/changes']);
  if (stat === undefined) return undefined;
  return [...stat.matchAll(SHORTSTAT_COUNT)].reduce((total, [, count]) => total + Number(count), 0);
}

export const GIT_ENVIRONMENT: ChecklistEnvironment = {
  now: () => new Date(),
  devCommit: (root) => git(root, ['merge-base', 'HEAD', 'origin/dev']),
  archiveAt,
  landingCommit,
  openedAfter,
  linesChanged,
};
