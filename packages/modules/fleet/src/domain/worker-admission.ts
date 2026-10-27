import {
  NOT_APPLICABLE_REASONS,
  type NotApplicableReason,
  type SelfCheckResult,
} from '@taskelith/execution';
import type { HostPlatform } from './enrollment.js';

// Worker admission contract section 5; neither task admission nor
// admission pressure.
export const WORKER_ADMISSION_STATES = Object.freeze(['awaiting-self-check', 'admitted', 'self-check-failed'] as const);

export type WorkerAdmissionState = (typeof WORKER_ADMISSION_STATES)[number];

// Where a check applies: its platforms, and whether it needs a worker that
// launches executions.
export interface SelfCheckScope {
  readonly platforms: readonly HostPlatform[];
  readonly needsLaunchCommand: boolean;
}

// The local facts of one start that decide whether a check applies.
export interface StartFacts {
  readonly platform: HostPlatform;
  readonly launchCommand: boolean;
}

export const LINUX_CONTAINMENT_CHECK_ID = 'linux-containment';

// Supervisor identity section 8: Linux workers that launch executions.
export const LINUX_CONTAINMENT_SCOPE: SelfCheckScope = Object.freeze({
  platforms: Object.freeze(['linux'] as const),
  needsLaunchCommand: true,
});

// The checks every report must hold, with the scope the control plane
// holds a not-applicable result to.
export const REQUIRED_SELF_CHECKS: ReadonlyMap<string, SelfCheckScope> = new Map([
  [LINUX_CONTAINMENT_CHECK_ID, LINUX_CONTAINMENT_SCOPE],
]);

// The one place a check is found not to apply; undefined means it runs.
export function notApplicableReason(scope: SelfCheckScope, facts: StartFacts): NotApplicableReason | undefined {
  if (!scope.platforms.includes(facts.platform)) return 'platform-not-covered';
  if (scope.needsLaunchCommand && !facts.launchCommand) return 'no-launch-command';
  return undefined;
}

export interface WorkerAdmissionDecision {
  readonly state: Exclude<WorkerAdmissionState, 'awaiting-self-check'>;
  readonly results: readonly SelfCheckResult[];
}

// A required check that is missing or reported more than once, or a refuted
// not-applicable claim, counts as failed; each check is stored once.
export function decideWorkerAdmission(results: readonly SelfCheckResult[], platform: HostPlatform): WorkerAdmissionDecision {
  const checked = onePerCheck(results).map((result) => checkedResult(result, platform));
  const reported = new Set(checked.map((result) => result.checkId));
  const missing = [...REQUIRED_SELF_CHECKS.keys()].filter((checkId) => !reported.has(checkId))
    .map((checkId) => failed(checkId, 'the check was not reported'));
  const all = Object.freeze([...checked, ...missing].sort(byCheckId));
  const state = all.some((result) => result.outcome === 'failed') ? 'self-check-failed' : 'admitted';
  return Object.freeze({ state, results: all });
}

function onePerCheck(results: readonly SelfCheckResult[]): SelfCheckResult[] {
  const byId = new Map<string, SelfCheckResult[]>();
  for (const result of results) byId.set(result.checkId, [...(byId.get(result.checkId) ?? []), result]);
  return [...byId.entries()].map(([checkId, reports]) => (
    reports.length === 1 ? reports[0]! : failed(checkId, 'the check was reported more than once')));
}

function checkedResult(result: SelfCheckResult, platform: HostPlatform): SelfCheckResult {
  const frozen = Object.freeze({ ...result, details: Object.freeze([...result.details]) });
  if (result.outcome !== 'not-applicable') return frozen;
  const [reason, ...rest] = result.details;
  if (rest.length === 0 && isRecognized(result.checkId, reason, platform)) return frozen;
  return failed(result.checkId, `not-applicable without a recognised reason: ${result.details.join(', ')}`);
}

function isRecognized(checkId: string, reason: string | undefined, platform: HostPlatform): boolean {
  if (!(NOT_APPLICABLE_REASONS as readonly (string | undefined)[]).includes(reason)) return false;
  const scope = REQUIRED_SELF_CHECKS.get(checkId);
  if (scope === undefined) return true;
  if (reason === 'platform-not-covered') return !scope.platforms.includes(platform);
  return scope.needsLaunchCommand && scope.platforms.includes(platform);
}

function failed(checkId: string, detail: string): SelfCheckResult {
  return Object.freeze({ checkId, outcome: 'failed', details: Object.freeze([detail]) });
}

function byCheckId(left: SelfCheckResult, right: SelfCheckResult): number {
  return left.checkId < right.checkId ? -1 : left.checkId > right.checkId ? 1 : 0;
}
