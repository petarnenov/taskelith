import { closeSync, constants, fstatSync, ftruncateSync, lstatSync, openSync, readdirSync, type Dirent, type Stats } from 'node:fs';
import { join } from 'node:path';
import { err, failure, ok, type Result } from '@taskelith/kernel';

// The file operations truncation uses, so a test can swap an entry between
// two of them.
export interface LogFileSystem {
  lstat(path: string): Stats;
  readdir(path: string): Dirent[];
  open(path: string, flags: number): number;
  fstat(descriptor: number): Stats;
  ftruncate(descriptor: number): void;
  close(descriptor: number): void;
}

export const NODE_LOG_FILE_SYSTEM: LogFileSystem = Object.freeze({
  lstat: (path: string) => lstatSync(path),
  readdir: (path: string) => readdirSync(path, { withFileTypes: true }),
  open: (path: string, flags: number) => openSync(path, flags),
  fstat: (descriptor: number) => fstatSync(descriptor),
  ftruncate: (descriptor: number) => ftruncateSync(descriptor, 0),
  close: (descriptor: number) => closeSync(descriptor),
});

// Empties each regular file under `worker/logs/`, the only records the disk
// floor may shed (worker journal contract, section 7); answers the count.
export function truncateBufferedLogs(directory: string, fileSystem: LogFileSystem = NODE_LOG_FILE_SYSTEM): Result<number> {
  try {
    const root = directoryAt(fileSystem, directory);
    return ok(root === undefined ? 0 : truncateTree(fileSystem, [root]));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return ok(0);
    return err(failure('unavailable', `cannot truncate the buffered logs: ${(error as Error).message}`));
  }
}

// A directory as traversal found it; a link is never one.
interface DirectoryIdentity {
  readonly path: string;
  readonly dev: number;
  readonly ino: number;
}

function directoryAt(fileSystem: LogFileSystem, path: string): DirectoryIdentity | undefined {
  const stats = fileSystem.lstat(path);
  return stats.isDirectory() ? { path, dev: stats.dev, ino: stats.ino } : undefined;
}

// `chain` runs from the root to the directory being read.
function truncateTree(fileSystem: LogFileSystem, chain: readonly DirectoryIdentity[]): number {
  const directory = chain[chain.length - 1]!.path;
  let truncated = 0;
  for (const entry of fileSystem.readdir(directory)) {
    const path = join(directory, entry.name);
    const nested = entry.isDirectory() ? directoryAt(fileSystem, path) : undefined;
    if (nested !== undefined) truncated += truncateTree(fileSystem, [...chain, nested]);
    else if (entry.isFile() && truncateContained(fileSystem, chain, path)) truncated += 1;
  }
  return truncated;
}

// What an entry swapped after it was listed can raise; it is skipped.
const SWAPPED_ENTRY = new Set(['ELOOP', 'ENOENT', 'ENXIO', 'EISDIR', 'ENOTDIR']);
const OPEN_FLAGS = constants.O_WRONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK;

// Truncates, through its descriptor, only a single-link regular file that
// is still the file at `path` inside the unchanged chain (design D6).
function truncateContained(fileSystem: LogFileSystem, chain: readonly DirectoryIdentity[], path: string): boolean {
  let descriptor: number;
  try {
    descriptor = fileSystem.open(path, OPEN_FLAGS);
  } catch (error) {
    if (SWAPPED_ENTRY.has((error as NodeJS.ErrnoException).code ?? '')) return false;
    throw error;
  }
  try {
    if (!isContained(fileSystem, chain, path, fileSystem.fstat(descriptor))) return false;
    fileSystem.ftruncate(descriptor);
    return true;
  } finally {
    fileSystem.close(descriptor);
  }
}

// The chain is checked before and after the path is read again, so a swap
// must be undone twice within the check to pass it.
function isContained(fileSystem: LogFileSystem, chain: readonly DirectoryIdentity[], path: string, opened: Stats): boolean {
  if (!opened.isFile() || opened.nlink !== 1 || !chainUnchanged(fileSystem, chain)) return false;
  const named = statOrUndefined(fileSystem, path);
  const same = named !== undefined && named.isFile() && named.dev === opened.dev && named.ino === opened.ino;
  return same && chainUnchanged(fileSystem, chain);
}

function chainUnchanged(fileSystem: LogFileSystem, chain: readonly DirectoryIdentity[]): boolean {
  return chain.every(({ path, dev, ino }) => {
    const now = statOrUndefined(fileSystem, path);
    return now !== undefined && now.isDirectory() && now.dev === dev && now.ino === ino;
  });
}

function statOrUndefined(fileSystem: LogFileSystem, path: string): Stats | undefined {
  try {
    return fileSystem.lstat(path);
  } catch (error) {
    if (SWAPPED_ENTRY.has((error as NodeJS.ErrnoException).code ?? '')) return undefined;
    throw error;
  }
}
