import { lstat } from 'node:fs/promises';
import type { Stats } from 'node:fs';

// What `lstat` finds, or undefined when nothing is there; any other
// error, such as `EACCES` or `EIO`, rejects instead of reading as absent.
export function entryAt(path: string | Buffer): Promise<Stats | undefined> {
  return lstat(path).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return undefined;
    throw error;
  });
}

export const isPresent = async (path: string): Promise<boolean> => (await entryAt(path)) !== undefined;
