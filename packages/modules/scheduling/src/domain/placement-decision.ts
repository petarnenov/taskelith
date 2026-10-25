import type { HardControl, ResourceRequest } from './capacity-reservation.js';
import type { CapacityReason } from './capacity-reasons.js';
import {
  MAX_ATTEMPT_CPU_MILLICORES,
  MAX_ATTEMPT_MEMORY_MEBIBYTES,
  MAX_AUTOMATIC_RETRIES,
  MAX_TREE_ATTEMPTS,
} from './capacity-limits.js';

// What the reservation transaction read for one attempt and one worker; the
// held counts come from held reservations, never from a cached count.
export interface PlacementSnapshot {
  readonly quarantined: boolean;
  readonly attempt: AttemptStanding;
  readonly worker: WorkerStanding | undefined;
  readonly request: ResourceRequest;
  readonly quotas: readonly QuotaStanding[];
  readonly charge: ChargeStanding;
}

export interface AttemptStanding {
  readonly reservable: boolean;
  readonly holdsReservation: boolean;
}

export interface WorkerStanding {
  readonly eligible: boolean;
  readonly controls: readonly HardControl[];
  readonly slots: number;
  readonly cpuMillicores: number;
  readonly memoryMebibytes: number;
  readonly held: { readonly slots: number; readonly cpuMillicores: number; readonly memoryMebibytes: number };
}

export interface QuotaStanding {
  readonly kind: 'project' | 'run';
  readonly limit: number;
  readonly held: number;
}

// An attempt's first reservation charges the tree's attempt budget and, for
// an automatic retry, the task's retry allowance; later ones charge nothing.
export interface ChargeStanding {
  readonly alreadyCharged: boolean;
  readonly treeAttempts: number;
  readonly retry?: { readonly uncertain: boolean; readonly automaticRetriesUsed: number };
}

export type PlacementDecision = { readonly fits: true } | { readonly fits: false; readonly reason: CapacityReason };

const FITS: PlacementDecision = Object.freeze({ fits: true });

// The checks of contract section 4 in its order; the first failed one decides.
export function decidePlacement(snapshot: PlacementSnapshot): PlacementDecision {
  const reason = installationReason(snapshot) ?? attemptReason(snapshot) ?? requestReason(snapshot.request)
    ?? workerReason(snapshot) ?? quotaReason(snapshot.quotas) ?? chargeReason(snapshot.charge);
  return reason === undefined ? FITS : Object.freeze({ fits: false, reason });
}

type Reason = CapacityReason | undefined;

function installationReason({ quarantined }: PlacementSnapshot): Reason {
  return quarantined ? 'quarantined' : undefined;
}

function attemptReason({ attempt }: PlacementSnapshot): Reason {
  if (attempt.holdsReservation) return 'attempt-already-reserved';
  return attempt.reservable ? undefined : 'attempt-not-reservable';
}

// Spend has no G2 enforcement, so a hard spend limit can never be honored.
function requestReason(request: ResourceRequest): Reason {
  if (request.hardControls.includes('spend-limit')) return 'spend-limit-not-enforceable';
  const aboveCeiling = request.cpuMillicores > MAX_ATTEMPT_CPU_MILLICORES || request.memoryMebibytes > MAX_ATTEMPT_MEMORY_MEBIBYTES;
  return aboveCeiling ? 'resource-ceiling-exceeded' : undefined;
}

function workerReason({ worker, request }: PlacementSnapshot): Reason {
  if (worker === undefined || !worker.eligible) return 'worker-not-eligible';
  if (!request.hardControls.every((control) => worker.controls.includes(control))) return 'control-not-enforceable';
  const { held } = worker;
  const full = held.slots + 1 > worker.slots
    || held.cpuMillicores + request.cpuMillicores > worker.cpuMillicores
    || held.memoryMebibytes + request.memoryMebibytes > worker.memoryMebibytes;
  return full ? 'worker-capacity-exhausted' : undefined;
}

function quotaReason(quotas: readonly QuotaStanding[]): Reason {
  const full = quotas.find((quota) => quota.held + 1 > quota.limit);
  if (full === undefined) return undefined;
  return full.kind === 'project' ? 'project-quota-exhausted' : 'run-quota-exhausted';
}

function chargeReason(charge: ChargeStanding): Reason {
  if (charge.alreadyCharged) return undefined;
  if (charge.treeAttempts + 1 > MAX_TREE_ATTEMPTS) return 'delegation-budget-exhausted';
  if (charge.retry === undefined) return undefined;
  const exhausted = charge.retry.uncertain || charge.retry.automaticRetriesUsed + 1 > MAX_AUTOMATIC_RETRIES;
  return exhausted ? 'retry-budget-exhausted' : undefined;
}
