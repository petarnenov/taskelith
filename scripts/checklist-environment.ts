import { execFileSync } from 'node:child_process';

// The clock and the git facts that the checklist record and its effect
// need; tests replace them.
export interface ChecklistEnvironment {
  now(): Date;
  // The dev commit whose archived findings the working tree holds.
  devCommit(root: string): string;
  // Lines a change altered outside openspec/changes/, or undefined.
  linesChanged(root: string, archiveDirectory: string, devCommit: string): number | undefined;
}

function git(root: string, args: readonly string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

function tryGit(root: string, args: readonly string[]): string | undefined {
  try {
    return git(root, args);
  } catch {
    return undefined;
  }
}

const SHORTSTAT_COUNT = /(\d+) (?:insertion|deletion)/g;

// The archive commit adds the change's checklist.json under the archive.
function linesChanged(root: string, archiveDirectory: string, devCommit: string): number | undefined {
  const added = `openspec/changes/archive/${archiveDirectory}/checklist.json`;
  const archiveCommit = tryGit(root, ['log', '-1', '--no-renames', '--diff-filter=A', '--format=%H', '--', added]);
  if (archiveCommit === undefined || archiveCommit === '') return undefined;
  const range = [devCommit, archiveCommit];
  const stat = tryGit(root, ['diff', '--shortstat', '--no-renames', ...range, '--', '.', ':(exclude)openspec/changes']);
  if (stat === undefined) return undefined;
  return [...stat.matchAll(SHORTSTAT_COUNT)].reduce((total, [, count]) => total + Number(count), 0);
}

export const GIT_ENVIRONMENT: ChecklistEnvironment = {
  now: () => new Date(),
  devCommit: (root) => git(root, ['merge-base', 'HEAD', 'origin/dev']),
  linesChanged,
};
