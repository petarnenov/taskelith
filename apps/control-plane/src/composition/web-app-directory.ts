import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { err, failure, ok, type Result } from '@taskelith/kernel';
import { WEB_APP_INDEX, type WebAppFiles } from '../api/web-app.js';

export const WEB_APP_DIR_VARIABLE = 'TASKELITH_WEB_APP_DIR';

// The regular files of the built SPA, read once at start. A symbolic link
// or other entry is left out, so no answer holds a file outside the build.
export function readWebAppDirectory(directory: string): Result<WebAppFiles> {
  const files = new Map<string, Uint8Array>();
  try {
    collect(directory, '', files);
  } catch {
    return err(unusable('a readable directory'));
  }
  if (!files.has(WEB_APP_INDEX)) return err(unusable(`a web build with ${WEB_APP_INDEX}`));
  return ok({ file: (path) => files.get(path) });
}

// Entries are what readdir reports, never followed: a link stays a link.
function collect(root: string, prefix: string, files: Map<string, Uint8Array>): void {
  for (const entry of readdirSync(join(root, prefix), { withFileTypes: true })) {
    const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) collect(root, path, files);
    else if (entry.isFile()) files.set(path, readFileSync(join(root, path)));
  }
}

function unusable(expected: string) {
  return failure('precondition-failed', `${WEB_APP_DIR_VARIABLE} must name ${expected}`, { variable: WEB_APP_DIR_VARIABLE });
}
