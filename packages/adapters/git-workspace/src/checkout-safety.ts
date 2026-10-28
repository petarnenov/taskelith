import { lstat, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { ok, type Result } from '@taskelith/kernel';
import { workspaceFailure } from '@taskelith/workspace';

const GIT_DIRECTORY = '.git';
// Entries of `.git` that would point the worker's Git at another store.
const REDIRECTIONS = [['commondir'], ['objects', 'info', 'alternates']] as const;

// Contract section 7, checked without following a link: the checkout and
// its `.git` belong to the worker, `.git` redirects nowhere, none nests.
export async function checkCheckoutSafety(checkout: string, owner: number): Promise<Result<void>> {
  const problem = (await ownProblem(checkout, owner)) ?? (await gitDirectoryProblem(checkout, owner)) ?? (await nestedProblem(checkout));
  if (problem === null) return ok(undefined);
  return workspaceFailure('precondition-failed', 'unsafe-checkout', `the checkout is unsafe: ${problem}`);
}

async function ownProblem(checkout: string, owner: number): Promise<string | null> {
  const status = await lstat(checkout).catch(() => undefined);
  if (status === undefined || !status.isDirectory()) return 'the checkout is not a directory';
  return status.uid === owner ? null : 'the checkout belongs to another account';
}

async function gitDirectoryProblem(checkout: string, owner: number): Promise<string | null> {
  const gitDirectory = join(checkout, GIT_DIRECTORY);
  const status = await lstat(gitDirectory).catch(() => undefined);
  if (status === undefined || !status.isDirectory()) return '.git is missing or not a directory';
  if (status.uid !== owner) return '.git belongs to another account';
  for (const parts of REDIRECTIONS) {
    if ((await lstat(join(gitDirectory, ...parts)).catch(() => undefined)) !== undefined) return `.git holds ${parts.join('/')}`;
  }
  return (await holdsLink(gitDirectory)) ? '.git holds a symbolic link' : null;
}

async function holdsLink(directory: string): Promise<boolean> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) return true;
    if (entry.isDirectory() && (await holdsLink(join(directory, entry.name)))) return true;
  }
  return false;
}

// No tracked path can be named `.git`, so any such entry below the top is
// a nested repository or a submodule's gitfile.
async function nestedProblem(directory: string, top = true): Promise<string | null> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === GIT_DIRECTORY && top) continue;
    if (entry.name === GIT_DIRECTORY) return 'a .git entry below the top';
    if (entry.isDirectory() && (await nestedProblem(join(directory, entry.name), false)) !== null) return 'a .git entry below the top';
  }
  return null;
}
