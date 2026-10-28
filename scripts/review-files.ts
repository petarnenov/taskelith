import {
  closeSync, constants, existsSync, fstatSync, ftruncateSync, lstatSync, openSync, readFileSync, realpathSync, statSync, type Stats,
} from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path';

// The prompt and logs of a review run: outside the worktree, logs never
// through a link, and no log that is the prompt file.

// A file that a run cannot use; the message names the file and why.
export class ReviewFileError extends Error {}

interface FileIdentity {
  readonly dev: number;
  readonly ino: number;
}

export interface ReviewFiles {
  readonly prompt: string;
  readonly logs: readonly string[];
}

export function checkReviewFiles(root: string, { prompt, logs }: ReviewFiles): void {
  const promptIdentity = checkPrompt(root, prompt);
  for (const log of logs) checkLog(root, log, promptIdentity);
}

function checkPrompt(root: string, path: string): FileIdentity {
  if (!existsSync(path) || !statSync(path).isFile()) throw new ReviewFileError(`PROMPT ${path} is no file`);
  refuseInsideWorktree(root, realpathSync(path), `PROMPT ${path}`);
  return statSync(path);
}

function checkLog(root: string, path: string, prompt: FileIdentity): void {
  const parent = dirname(path);
  if (!existsSync(parent) || !statSync(parent).isDirectory()) {
    throw new ReviewFileError(`the directory of LOG ${path} does not exist`);
  }
  refuseInsideWorktree(root, join(realpathSync(parent), basename(path)), `LOG ${path}`);
  const existing = existingEntry(path);
  if (existing === undefined) return;
  if (existing.isSymbolicLink()) throw new ReviewFileError(`LOG ${path} is a symbolic link`);
  if (existing.dev === prompt.dev && existing.ino === prompt.ino) throw new ReviewFileError(`LOG ${path} is the prompt file`);
  if (!existing.isFile()) throw new ReviewFileError(`LOG ${path} is no regular file`);
  if (existing.nlink > 1) throw new ReviewFileError(`LOG ${path} has other hard links`);
}

// The entry itself, a link not followed; undefined when there is none.
function existingEntry(path: string): Stats | undefined {
  try {
    return lstatSync(path);
  } catch {
    return undefined;
  }
}

// Files inside the worktree would change the reviewer's snapshot.
function refuseInsideWorktree(root: string, realPath: string, name: string): void {
  const fromRoot = relative(realpathSync(root), realPath);
  const outside = fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot);
  if (!outside) throw new ReviewFileError(`${name} lies inside the worktree; keep it in a scratch directory`);
}

// Opens an empty log for writing; O_NOFOLLOW refuses a link planted since.
export function openFreshLog(path: string): number {
  const fd = withFileErrors(path, () => openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_NOFOLLOW));
  try {
    const opened = fstatSync(fd);
    if (!opened.isFile() || opened.nlink !== 1) throw new ReviewFileError(`LOG ${path} is no regular file with one link`);
    ftruncateSync(fd, 0);
    return fd;
  } catch (error) {
    closeSync(fd);
    throw error;
  }
}

export function openPrompt(path: string): number {
  return withFileErrors(path, () => openSync(path, 'r'));
}

export function readPrompt(path: string): string {
  return withFileErrors(path, () => readFileSync(path, 'utf8'));
}

function withFileErrors<T>(path: string, operation: () => T): T {
  try {
    return operation();
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === undefined) throw error;
    throw new ReviewFileError(`${path} cannot be used: ${code}`);
  }
}
