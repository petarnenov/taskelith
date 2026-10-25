import { err, failure, ok, type Identifier, type Instant, type Result } from '@taskelith/kernel';
import type { AttemptId } from '@taskelith/execution';
import type { TaskId } from '@taskelith/sdlc';

export type ReservationId = Identifier<'ReservationId'>;
export type ProjectId = Identifier<'ProjectId'>;
export type RunId = Identifier<'RunId'>;
export type ProviderCredentialId = Identifier<'ProviderCredentialId'>;

// Controls a task policy may require as hard; spend has no G2 enforcement.
export const HARD_CONTROLS = Object.freeze(['cpu-limit', 'memory-limit', 'disk-limit', 'spend-limit'] as const);

export type HardControl = (typeof HARD_CONTROLS)[number];

export interface ResourceRequest {
  readonly cpuMillicores: number;
  readonly memoryMebibytes: number;
  readonly hardControls: readonly HardControl[];
}

export interface ResourceRequestInput {
  readonly cpuMillicores: number;
  readonly memoryMebibytes: number;
  readonly hardControls: readonly string[];
}

export function parseResourceRequest(input: ResourceRequestInput): Result<ResourceRequest> {
  const { cpuMillicores, memoryMebibytes } = input;
  if (!isPositiveInteger(cpuMillicores) || !isPositiveInteger(memoryMebibytes)) {
    return err(failure('invalid', 'requested CPU and memory must be positive integers'));
  }
  const unknown = input.hardControls.find((control) => !(HARD_CONTROLS as readonly string[]).includes(control));
  if (unknown !== undefined) return err(failure('invalid', `hard control ${unknown} is not one of ${HARD_CONTROLS.join(', ')}`));
  if (new Set(input.hardControls).size !== input.hardControls.length) {
    return err(failure('invalid', 'a hard control is listed twice'));
  }
  const hardControls = Object.freeze([...input.hardControls] as HardControl[]);
  return ok(Object.freeze({ cpuMillicores, memoryMebibytes, hardControls }));
}

// The quota and budget scopes a reservation charges (contract section 7).
export interface ReservationScope {
  readonly projectId: ProjectId;
  readonly runId: RunId;
  readonly taskId: TaskId;
  readonly rootTaskId: TaskId;
}

export const RESERVATION_STATES = Object.freeze(['held', 'released'] as const);

export type ReservationState = (typeof RESERVATION_STATES)[number];

// The lifecycle facts that justify a release (contract section 6); nothing
// else, not loss of contact nor a cancellation request alone, releases.
export const RELEASE_JUSTIFICATIONS = Object.freeze([
  'refused',
  'superseded',
  'cancelled',
  'attempt-ended',
  'execution-terminal',
  'operator-reconciled',
] as const);

export type ReleaseJustification = (typeof RELEASE_JUSTIFICATIONS)[number];

export interface ReservationValues {
  readonly id: ReservationId;
  readonly scope: ReservationScope;
  readonly requested: ResourceRequest;
  readonly providerCredentials: readonly ProviderCredentialId[];
  readonly retryOf?: AttemptId;
  readonly createdAt: Instant;
}

// The capacity one assignment holds for its whole life; immutable apart from
// its state, and never held again once released.
export type CapacityReservation = ReservationValues & (
  | { readonly state: 'held' }
  | { readonly state: 'released'; readonly releasedBy: ReleaseJustification; readonly releasedAt: Instant }
);

export function heldReservation(values: ReservationValues): CapacityReservation {
  const { scope, requested, providerCredentials } = values;
  return Object.freeze({
    ...values,
    scope: Object.freeze({ ...scope }),
    requested: Object.freeze({ ...requested, hardControls: Object.freeze([...requested.hardControls]) }),
    providerCredentials: Object.freeze([...providerCredentials]),
    state: 'held',
  });
}

export function releasedReservation(
  reservation: CapacityReservation,
  releasedBy: ReleaseJustification,
  releasedAt: Instant,
): CapacityReservation {
  return Object.freeze({ ...reservation, state: 'released', releasedBy, releasedAt });
}

function isPositiveInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}
