import { execFileSync } from 'node:child_process';
import { posix } from 'node:path';
import type { CommitInfo, EvaluationEnvironment } from './review-route-evaluation.ts';
import { CHANGES_DIRECTORY, type ChangedFile, type RouteEnvironment } from './review-route-features.ts';
import { CREDENTIAL_VARIABLE } from './review-route-jev.ts';

// The git adapter of RouteEnvironment. Every method returns undefined
// when git fails, so that a failure never passes for an empty result.

const DEV_BRANCH = 'origin/dev';

// Hook variables such as GIT_DIR and the router credential are dropped;
// the ceiling keeps git from using a repository above the given root.
export function gitEnvironment(inherited: NodeJS.ProcessEnv, root: string): NodeJS.ProcessEnv {
  const kept = Object.entries(inherited).filter(([name]) => !name.startsWith('GIT_') && name !== CREDENTIAL_VARIABLE);
  return { ...Object.fromEntries(kept), GIT_CEILING_DIRECTORIES: posix.dirname(root) };
}

function gitOutput(root: string, args: readonly string[]): string | undefined {
  try {
    const env = gitEnvironment(process.env, root);
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

const COMMIT_FORMAT = '--format=%H%x00%P%x00%s';

// One commit per line: "sha NUL parents NUL subject".
export function commitInfos(output: string): CommitInfo[] {
  return output.split('\n').filter((line) => line !== '').map((line) => {
    const [sha, parents, subject] = line.split('\0') as [string, string, string];
    return { sha, parents: parents.split(' ').filter((parent) => parent !== ''), subject };
  });
}

function lines(output: string): string[] {
  return output.split('\n').filter((line) => line !== '');
}

export const GIT_EVALUATION_ENVIRONMENT: EvaluationEnvironment = {
  changedFiles: GIT_ROUTE_ENVIRONMENT.changedFiles,
  listFiles: GIT_ROUTE_ENVIRONMENT.listFiles,
  readFile: GIT_ROUTE_ENVIRONMENT.readFile,
  resolve: (root, revision) => gitOutput(root, ['rev-parse', '--verify', '--quiet', `${revision}^{commit}`])?.trim(),
  mergeBase: (root, first, second) => gitOutput(root, ['merge-base', first, second])?.trim(),
  firstParentHistory: (root, at) => {
    const output = gitOutput(root, ['rev-list', '--first-parent', at]);
    return output === undefined ? undefined : lines(output);
  },
  addingCommit: (root, at, directory) => {
    const output = gitOutput(root, ['log', '--first-parent', '--diff-filter=A', COMMIT_FORMAT, at, '--', `${directory}/`]);
    return output === undefined ? undefined : (commitInfos(output).at(-1) ?? null);
  },
  branchCommits: (root, base, tip) => {
    const output = gitOutput(root, ['log', '--reverse', '--topo-order', COMMIT_FORMAT, `${base}..${tip}`]);
    return output === undefined ? undefined : commitInfos(output);
  },
};
