import type { Identifier, Instant } from '@taskelith/kernel';
import type { AttemptId, WorkerId } from '@taskelith/execution';
import { FIRST_GENERATION, nextGeneration, type AdmissionId, type Generation, type JsonObject, type OwnershipGeneration, type TaskId } from '@taskelith/sdlc';
import type { RunId } from './capacity-reservation.js';
import type { CapacityReason } from './capacity-reasons.js';

export type DelegationId = Identifier<'DelegationId'>;

export const DELEGATION_STATES = Object.freeze(['admitted', 'awaiting-capacity', 'rejected'] as const);

export type DelegationState = (typeof DELEGATION_STATES)[number];

// What the worker asked for; a repeat under the same identity must ask for
// the same. The child is the task as SDLC admission takes it.
export interface DelegationValues {
  readonly attemptId: AttemptId;
  readonly ownershipGeneration: OwnershipGeneration;
  readonly runId: RunId;
  readonly child: JsonObject;
}

export type DelegationOutcome =
  | {
    readonly state: 'admitted';
    readonly childTaskId: TaskId;
    readonly admissionId: AdmissionId;
    readonly parentTaskId: TaskId;
    readonly rootTaskId: TaskId;
    readonly depth: number;
  }
  | { readonly state: 'awaiting-capacity' }
  | { readonly state: 'rejected'; readonly reason: CapacityReason };

// One delegation request of a worker, decided again while it waits for
// capacity from the time it began to wait (contract section 7).
export interface DelegationRecord {
  readonly delegationId: DelegationId;
  readonly workerId: WorkerId;
  readonly values: DelegationValues;
  readonly outcome: DelegationOutcome;
  readonly waitingSince: Instant;
  readonly generation: Generation;
}

export interface DelegationInput {
  readonly delegationId: DelegationId;
  readonly workerId: WorkerId;
  readonly values: DelegationValues;
  readonly waitingSince: Instant;
}

export function recordDelegation(input: DelegationInput, outcome: DelegationOutcome): DelegationRecord {
  const values = frozenCopy(input.values);
  return Object.freeze({ ...input, values, outcome: Object.freeze({ ...outcome }), generation: FIRST_GENERATION });
}

export function redecideDelegation(record: DelegationRecord, outcome: DelegationOutcome): DelegationRecord {
  return Object.freeze({ ...record, outcome: Object.freeze({ ...outcome }), generation: nextGeneration(record.generation) });
}

export function isSameDelegation(record: DelegationRecord, workerId: WorkerId, values: DelegationValues): boolean {
  return record.workerId === workerId && canonical(record.values) === canonical(values);
}

export function isAwaitingCapacity(record: DelegationRecord): boolean {
  return record.outcome.state === 'awaiting-capacity';
}

// JSON with the keys of every object sorted, so that key order never makes
// two equal requests differ.
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, field: unknown) => {
    if (field === null || typeof field !== 'object' || Array.isArray(field)) return field;
    return Object.fromEntries(Object.entries(field).sort(([left], [right]) => (left < right ? -1 : 1)));
  });
}

// Independent of the caller and frozen at every depth, so that no reference
// the caller keeps can change a stored record.
function frozenCopy<Value>(value: Value): Value {
  return deepFreeze(structuredClone(value));
}

function deepFreeze<Value>(value: Value): Value {
  if (value === null || typeof value !== 'object') return value;
  for (const field of Object.values(value)) deepFreeze(field);
  return Object.freeze(value);
}
