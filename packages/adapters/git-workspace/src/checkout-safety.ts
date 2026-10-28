import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { ok, type Result } from '@taskelith/kernel';
import { workspaceFailure } from '@taskelith/workspace';
import { entryAt, isPresent } from './presence.js';

const GIT_DIRECTORY = '.git';
// Entries of `.git` that would point the worker's Git at another store.
const REDIRECTIONS = [['commondir'], ['objects', 'info', 'alternates']] as const;

// Contract section 7, checked without following a link: the checkout and
// its `.git` belong to the worker, `.git` redirects nowhere, none nests.
export async function checkCheckoutSafety(checkout: string, owner: number): Promise<Result<void>> {
  const problem = (await ownProblem(checkout, owner)) ?? (await gitDirectoryProblem(checkout, owner)) ?? (await nestedProblem(Buffer.from(checkout)));
  if (problem === null) return ok(undefined);
  return workspaceFailure('precondition-failed', 'unsafe-checkout', `the checkout is unsafe: ${problem}`);
}

async function ownProblem(checkout: string, owner: number): Promise<string | null> {
  const status = await entryAt(checkout);
  if (status === undefined || !status.isDirectory()) return 'the checkout is not a directory';
  return status.uid === owner ? null : 'the checkout belongs to another account';
}

async function gitDirectoryProblem(checkout: string, owner: number): Promise<string | null> {
  const gitDirectory = join(checkout, GIT_DIRECTORY);
  const status = await entryAt(gitDirectory);
  if (status === undefined || !status.isDirectory()) return '.git is missing or not a directory';
  if (status.uid !== owner) return '.git belongs to another account';
  for (const parts of REDIRECTIONS) {
    if (await isPresent(join(gitDirectory, ...parts))) return `.git holds ${parts.join('/')}`;
  }
  return (await holdsSpecialEntry(Buffer.from(gitDirectory))) ? '.git holds an entry that is not a file or a directory' : null;
}

const SEPARATOR = Buffer.from('/');
// Names stay bytes, so a name that is not UTF-8 names its own entry.
const entriesOf = (directory: Buffer) => readdir(directory, { withFileTypes: true, encoding: 'buffer' });
const below = (directory: Buffer, name: Buffer) => Buffer.concat([directory, SEPARATOR, name]);
// Any case: Git refuses `.GIT` in a path, and APFS finds it as `.git`.
const isGitName = (name: Buffer) => name.length === GIT_DIRECTORY.length && name.toString('latin1').toLowerCase() === GIT_DIRECTORY;

// A link, or a FIFO, socket, or device, on which a Git process would
// follow the link or block when it opens it.
async function holdsSpecialEntry(directory: Buffer): Promise<boolean> {
  for (const entry of await entriesOf(directory)) {
    if (entry.isDirectory()) {
      if (await holdsSpecialEntry(below(directory, entry.name))) return true;
    } else if (!entry.isFile()) {
      return true;
    }
  }
  return false;
}

// No tracked path can be named `.git`, so any such entry below the top is
// a nested repository or a submodule's gitfile.
async function nestedProblem(directory: Buffer, top = true): Promise<string | null> {
  for (const entry of await entriesOf(directory)) {
    if (top && entry.name.equals(Buffer.from(GIT_DIRECTORY))) continue;
    if (isGitName(entry.name)) return 'a .git entry below the top or in another case';
    if (entry.isDirectory() && (await nestedProblem(below(directory, entry.name), false)) !== null) return 'a .git entry below the top or in another case';
  }
  return null;
}
