import type { GithubNativeClient } from './github-conformance-client.ts';
import { CONFORMANCE_BRANCH_PREFIX } from './github-conformance-fixture.ts';
import { CONFORMANCE_BASE_BRANCH, CONFORMANCE_REPOSITORIES } from './github-conformance-settings.ts';

// Resets the repositories the App sees: base protection off, the run's
// pull requests closed, its branches deleted; GitHub keeps statuses.

export interface OpenPull {
  readonly number: number;
  readonly headBranch: string;
}

export interface RepositoryState {
  readonly repository: string;
  readonly branches: readonly string[];
  readonly openPulls: readonly OpenPull[];
  readonly protectedBranches: readonly string[];
}

export type CleanupAction =
  | { readonly kind: 'remove-protection'; readonly repository: string; readonly branch: string }
  | { readonly kind: 'close-pull'; readonly repository: string; readonly number: number }
  | { readonly kind: 'delete-branch'; readonly repository: string; readonly branch: string };

export interface CleanupStep {
  readonly action: CleanupAction;
  readonly status: number;
  readonly done: boolean;
}

// The hidden repository is left out: the App cannot see it, and the run
// never writes there.
export const CLEANED_REPOSITORIES = Object.freeze([CONFORMANCE_REPOSITORIES.project, CONFORMANCE_REPOSITORIES.foreign]);

// What the cleanup needs of the fixture's client.
export type CleanupClient = Pick<GithubNativeClient, 'request' | 'listOpenPulls'>;

// Protection first, so no rule outlives the run; pull requests before
// their branches, which GitHub would otherwise close for them.
export function planCleanup(states: readonly RepositoryState[]): CleanupAction[] {
  const isRunBranch = (branch: string) => branch.startsWith(CONFORMANCE_BRANCH_PREFIX);
  return [
    ...states.flatMap(({ repository, protectedBranches }) =>
      protectedBranches.map((branch): CleanupAction => ({ kind: 'remove-protection', repository, branch }))),
    ...states.flatMap(({ repository, openPulls }) =>
      openPulls.filter((pull) => isRunBranch(pull.headBranch))
        .map((pull): CleanupAction => ({ kind: 'close-pull', repository, number: pull.number }))),
    ...states.flatMap(({ repository, branches }) =>
      branches.filter(isRunBranch).map((branch): CleanupAction => ({ kind: 'delete-branch', repository, branch }))),
  ];
}

// GitHub's answer when a step is done or was already done. A 422 to a
// branch deletion is ambiguous, so the ref is read again.
const DONE: Readonly<Record<CleanupAction['kind'], readonly number[]>> = Object.freeze({
  'remove-protection': [204, 404],
  'close-pull': [200],
  'delete-branch': [204],
});
const AMBIGUOUS_DELETION = 422;

export function isDone(action: CleanupAction, status: number): boolean {
  return DONE[action.kind].includes(status);
}

export interface CleanupReport {
  readonly steps: readonly CleanupStep[];
  // Repositories whose state could not be read, so nothing was cleaned.
  readonly unobserved: readonly string[];
}

export function isClean(report: CleanupReport): boolean {
  return report.unobserved.length === 0 && report.steps.every((step) => step.done);
}

export async function cleanUp(client: CleanupClient): Promise<CleanupReport> {
  const states: RepositoryState[] = [];
  const unobserved: string[] = [];
  for (const repository of CLEANED_REPOSITORIES) {
    try {
      states.push(await observe(client, repository));
    } catch {
      unobserved.push(repository);
    }
  }
  const steps: CleanupStep[] = [];
  for (const action of planCleanup(states)) steps.push(await perform(client, action));
  return { steps, unobserved };
}

// Each step runs on its own, so one failure leaves the others to run.
async function perform(client: CleanupClient, action: CleanupAction): Promise<CleanupStep> {
  const [method, path, body] = request(action);
  try {
    const { status } = await client.request(method, path, body);
    return { action, status, done: isDone(action, status) || (await isAbsentAfter(client, action, status)) };
  } catch {
    return { action, status: 0, done: false };
  }
}

async function isAbsentAfter(client: CleanupClient, action: CleanupAction, status: number): Promise<boolean> {
  if (action.kind !== 'delete-branch' || status !== AMBIGUOUS_DELETION) return false;
  const ref = await client.request('GET', `/repos/${action.repository}/git/ref/heads/${action.branch}`);
  return ref.status === 404;
}

function request(action: CleanupAction): [string, string, unknown?] {
  const repository = `/repos/${action.repository}`;
  switch (action.kind) {
    case 'remove-protection':
      return ['DELETE', `${repository}/branches/${action.branch}/protection`];
    case 'close-pull':
      return ['PATCH', `${repository}/pulls/${action.number}`, { state: 'closed' }];
    case 'delete-branch':
      return ['DELETE', `${repository}/git/refs/heads/${action.branch}`];
  }
}

async function observe(client: CleanupClient, repository: string): Promise<RepositoryState> {
  // GitHub answers every matching ref at once; pull requests come in pages.
  const refs = await client.request('GET', `/repos/${repository}/git/matching-refs/heads/${CONFORMANCE_BRANCH_PREFIX}`);
  if (refs.status !== 200 || !Array.isArray(refs.data)) throw new Error(`listing the branches returned ${refs.status}`);
  const pulls = await client.listOpenPulls(repository);
  const protection = await client.request('GET', `/repos/${repository}/branches/${CONFORMANCE_BASE_BRANCH}/protection`);
  if (protection.status !== 200 && protection.status !== 404) throw new Error(`reading protection returned ${protection.status}`);
  return {
    repository,
    branches: refs.data.map((ref) => text(ref, 'ref').replace(/^refs\/heads\//, '')),
    openPulls: pulls.map((pull) => ({ number: Number(field(pull, 'number')), headBranch: text(field(pull, 'head'), 'ref') })),
    protectedBranches: protection.status === 200 ? [CONFORMANCE_BASE_BRANCH] : [],
  };
}

function field(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>)[key] : undefined;
}

function text(value: unknown, key: string): string {
  const found = field(value, key);
  return typeof found === 'string' ? found : '';
}
