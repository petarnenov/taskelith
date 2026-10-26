import { closeSync, constants, fstatSync, ftruncateSync, lstatSync, openSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { err, failure, ok, type Result } from '@taskelith/kernel';

// Empties each regular file under `worker/logs/`, the only records the disk
// floor may shed (worker journal contract, section 7); answers the count.
export function truncateBufferedLogs(directory: string): Result<number> {
  try {
    return ok(isRealDirectory(directory) ? truncateTree(directory) : 0);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return ok(0);
    return err(failure('unavailable', `cannot truncate the buffered logs: ${(error as Error).message}`));
  }
}

// A link is never followed: a directory is checked before it is read, and
// a file through the descriptor that truncates it.
function truncateTree(directory: string): number {
  let truncated = 0;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory() && isRealDirectory(path)) truncated += truncateTree(path);
    else if (entry.isFile() && truncateOwnFile(path)) truncated += 1;
  }
  return truncated;
}

function isRealDirectory(path: string): boolean {
  return lstatSync(path).isDirectory();
}

// What an entry swapped after it was listed can raise; it is skipped.
const SWAPPED_ENTRY = new Set(['ELOOP', 'ENOENT', 'ENXIO', 'EISDIR']);
const OPEN_FLAGS = constants.O_WRONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK;

// A file with another name, such as a hard link to the journal, shares
// its content with that name and is left alone.
function truncateOwnFile(path: string): boolean {
  let descriptor: number;
  try {
    descriptor = openSync(path, OPEN_FLAGS);
  } catch (error) {
    if (SWAPPED_ENTRY.has((error as NodeJS.ErrnoException).code ?? '')) return false;
    throw error;
  }
  try {
    const stats = fstatSync(descriptor);
    if (!stats.isFile() || stats.nlink !== 1) return false;
    ftruncateSync(descriptor, 0);
    return true;
  } finally {
    closeSync(descriptor);
  }
}
