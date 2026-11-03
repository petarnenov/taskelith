import { closeSync, constants, fstatSync, lstatSync, openSync, readdirSync, readFileSync, type Stats } from 'node:fs';
import { join } from 'node:path';
import { err, failure, ok, type Result } from '@taskelith/kernel';
import { WEB_APP_INDEX, type WebAppFiles } from '../api/web-app.js';

export const WEB_APP_DIR_VARIABLE = 'TASKELITH_WEB_APP_DIR';

// Called with each entry's path below the root before it is opened; tests
// use it to replace an entry while the build is read.
export type WebAppEntryProbe = (path: string) => void;

const NO_FOLLOW = constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK;
const NO_FOLLOW_DIRECTORY = NO_FOLLOW | constants.O_DIRECTORY;

class BuildChanged extends Error {}

interface Build {
  readonly files: Map<string, Uint8Array>;
  readonly leftOut: Set<string>;
  // Each directory read, by its path, with the identity it was opened as.
  readonly directories: Map<string, Stats>;
}

// The regular files of the built SPA, read once at start. Nothing is
// opened through a link; an entry replaced during the read fails it.
export function readWebAppDirectory(directory: string, probe: WebAppEntryProbe = () => undefined): Result<WebAppFiles> {
  const build: Build = { files: new Map(), leftOut: new Set(), directories: new Map() };
  try {
    if (lstatSync(directory).isSymbolicLink()) return err(unusable('a directory that is not a symbolic link'));
    collect(directory, '', build, probe);
    confirmUnchanged(directory, build);
  } catch (error) {
    return err(unusable(error instanceof BuildChanged ? 'a build that stays unchanged while it is read' : 'a readable directory'));
  }
  if (!build.files.has(WEB_APP_INDEX)) return err(unusable(`a web build with ${WEB_APP_INDEX}`));
  return ok({ file: (path) => build.files.get(path), isLeftOut: (path) => isBelowLeftOut(build.leftOut, path) });
}

// A link or other entry is left out and remembered, so no path reaches it.
function collect(root: string, prefix: string, build: Build, probe: WebAppEntryProbe): void {
  build.directories.set(prefix, opened(join(root, prefix), NO_FOLLOW_DIRECTORY, (stats) => stats.isDirectory()));
  for (const entry of readdirSync(join(root, prefix), { withFileTypes: true })) {
    const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    probe(path);
    if (entry.isDirectory()) collect(root, path, build, probe);
    else if (entry.isFile()) build.files.set(path, readRegularFile(join(root, path)));
    else build.leftOut.add(path);
  }
}

function readRegularFile(path: string): Uint8Array {
  let content = new Uint8Array();
  opened(path, NO_FOLLOW, (stats) => stats.isFile(), (descriptor) => {
    content = readFileSync(descriptor);
  });
  return content;
}

// Opens without following a last link; the descriptor's own type decides.
function opened(path: string, flags: number, expected: (stats: Stats) => boolean, read?: (descriptor: number) => void): Stats {
  let descriptor: number;
  try {
    descriptor = openSync(path, flags);
  } catch (error) {
    // ELOOP on Linux, ENOTDIR for a directory link on macOS.
    throw isLink(path) ? new BuildChanged() : error;
  }
  try {
    const stats = fstatSync(descriptor);
    if (!expected(stats)) throw new BuildChanged();
    read?.(descriptor);
    return stats;
  } finally {
    closeSync(descriptor);
  }
}

// A directory swapped for a link after it was opened shows here, so no
// file read through that link is answered.
function confirmUnchanged(root: string, build: Build): void {
  for (const [path, before] of build.directories) {
    const now = lstatSync(join(root, path));
    if (!now.isDirectory() || now.dev !== before.dev || now.ino !== before.ino) throw new BuildChanged();
  }
}

function isLink(path: string): boolean {
  return lstatSync(path, { throwIfNoEntry: false })?.isSymbolicLink() ?? false;
}

function isBelowLeftOut(leftOut: ReadonlySet<string>, path: string): boolean {
  const segments = path.split('/');
  return segments.some((_, index) => leftOut.has(segments.slice(0, index + 1).join('/')));
}

function unusable(expected: string) {
  return failure('precondition-failed', `${WEB_APP_DIR_VARIABLE} must name ${expected}`, { variable: WEB_APP_DIR_VARIABLE });
}
