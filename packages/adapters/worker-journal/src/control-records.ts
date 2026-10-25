import { existsSync, lstatSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { err, ok, type Result } from '@taskelith/kernel';
import { rootFailure } from './journal-failure.js';

const GROUP_OR_OTHER_WRITE = 0o022;

// No component from `dataRoot` down to `target` may be a symbolic link,
// owned by another account, or writable by group or others (section 2).
export function checkControlPath(dataRoot: string, target: string, ownerUid: number): Result<void> {
  const below = relative(dataRoot, target);
  if (below.startsWith('..')) return err(rootFailure('unsafe-path', `${target} is outside the data root`, { path: target }));
  let current = dataRoot;
  for (const component of ['', ...below.split(sep).filter((part) => part !== '')]) {
    current = join(current, component);
    if (!existsSync(current) && !isDanglingLink(current)) return ok(undefined);
    const problem = componentProblem(current, ownerUid);
    if (problem !== undefined) return err(rootFailure('unsafe-path', `${current} ${problem}`, { path: current }));
  }
  return ok(undefined);
}

function isDanglingLink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

function componentProblem(path: string, ownerUid: number): string | undefined {
  const status = lstatSync(path);
  if (status.isSymbolicLink()) return 'is a symbolic link';
  if (status.uid !== ownerUid) return `is owned by uid ${status.uid}, not ${ownerUid}`;
  if ((status.mode & GROUP_OR_OTHER_WRITE) !== 0) return 'is writable by group or others';
  return undefined;
}

// A data root inside a Git working tree, such as the checkout, is refused
// (storage contract, "Repository and evidence exclusions").
export function refuseCheckout(dataRoot: string): Result<void> {
  for (let directory = dataRoot; ; directory = dirname(directory)) {
    if (existsSync(join(directory, '.git'))) {
      return err(rootFailure('inside-checkout', `data root ${dataRoot} is inside the Git working tree ${directory}`, {
        path: dataRoot,
        checkout: directory,
      }));
    }
    if (dirname(directory) === directory) return ok(undefined);
  }
}
