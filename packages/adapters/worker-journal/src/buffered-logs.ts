import { readdirSync, truncateSync } from 'node:fs';
import { join } from 'node:path';
import { err, failure, ok, type Result } from '@taskelith/kernel';

// Empties each regular file under `worker/logs/`, the only records the disk
// floor may shed (worker journal contract, section 7); answers the count.
export function truncateBufferedLogs(directory: string): Result<number> {
  try {
    return ok(truncateTree(directory));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return ok(0);
    return err(failure('unavailable', `cannot truncate the buffered logs: ${(error as Error).message}`));
  }
}

// Directory entries are not followed through links, so nothing outside the
// directory is ever truncated.
function truncateTree(directory: string): number {
  let truncated = 0;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) truncated += truncateTree(path);
    else if (entry.isFile()) {
      truncateSync(path, 0);
      truncated += 1;
    }
  }
  return truncated;
}
