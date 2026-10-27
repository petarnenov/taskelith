import { execFileSync } from 'node:child_process';
import { posix } from 'node:path';
import { CHANGES_DIRECTORY, type ChangedFile, type RouteEnvironment } from './review-route-features.ts';

// The git adapter of RouteEnvironment. Every method returns undefined
// when git fails, so that a failure never passes for an empty result.

const DEV_BRANCH = 'origin/dev';

// Hook variables such as GIT_DIR are dropped, and the ceiling keeps git
// from using a repository above the given root.
function gitOutput(root: string, args: readonly string[]): string | undefined {
  try {
    const inherited = Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_'));
    const env = { ...Object.fromEntries(inherited), GIT_CEILING_DIRECTORIES: posix.dirname(root) };
    return execFileSync('git', args, { cwd: root, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
  } catch {
    return undefined;
  }
}

function nulEntries(output: string): string[] {
  return output.split('\0').filter((entry) => entry !== '');
}

// Porcelain v1 with -z: "XY path"; renames are off, so one path each.
export function statusPaths(output: string): string[] {
  return nulEntries(output).map((entry) => entry.slice(3));
}

// numstat with -z: "added\tdeleted\tpath"; a binary file shows "-".
export function numstatFiles(output: string): ChangedFile[] {
  return nulEntries(output).map((entry) => {
    const [added, deleted, path] = entry.split('\t') as [string, string, string];
    return { path, lines: lineCount(added) + lineCount(deleted) };
  });
}

function lineCount(field: string): number {
  return field === '-' ? 0 : Number(field);
}

export const GIT_ROUTE_ENVIRONMENT: RouteEnvironment = {
  mergeBase: (root) => gitOutput(root, ['merge-base', 'HEAD', DEV_BRANCH])?.trim(),
  head: (root) => gitOutput(root, ['rev-parse', '--verify', '--quiet', 'HEAD^{commit}'])?.trim(),
  uncommittedPaths: (root) => {
    const output = gitOutput(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--no-renames']);
    return output === undefined ? undefined : statusPaths(output);
  },
  changedFiles: (root, from, to) => {
    const exclusion = `:(exclude)${CHANGES_DIRECTORY}`;
    const output = gitOutput(root, ['diff', '--numstat', '-z', '--no-renames', from, to, '--', '.', exclusion]);
    return output === undefined ? undefined : numstatFiles(output);
  },
  listFiles: (root, commit, directory) => {
    const output = gitOutput(root, ['ls-tree', '-r', '-z', '--name-only', commit, '--', `${directory}/`]);
    return output === undefined ? undefined : nulEntries(output);
  },
  readFile: (root, commit, path) => gitOutput(root, ['cat-file', 'blob', `${commit}:${path}`]),
};
