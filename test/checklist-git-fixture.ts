import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ChecklistEnvironment } from '../scripts/checklist-environment.ts';
import { fixtureEnv } from './git-fixture-env.ts';

// Shared helpers of the checklist tests that build git repositories.

const IDENTITY = ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false'];

export function git(root: string, ...args: string[]): string {
  return execFileSync('git', [...IDENTITY, ...args], { cwd: root, env: fixtureEnv, encoding: 'utf8' }).trim();
}

export function write(root: string, files: Readonly<Record<string, string>>): void {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), text);
  }
}

export function commit(root: string, files: Readonly<Record<string, string>>, message: string): string {
  write(root, files);
  git(root, 'add', '.');
  git(root, 'commit', '--quiet', '-m', message);
  return git(root, 'rev-parse', 'HEAD');
}

// A repository without git history: no dev commit and no landing.
export const NO_GIT: ChecklistEnvironment = {
  now: () => new Date('2026-10-28T09:30:00.000Z'),
  devCommit: () => undefined,
  archiveAt: () => undefined,
  landingCommit: () => undefined,
  openedAfter: () => false,
  linesChanged: () => undefined,
};
