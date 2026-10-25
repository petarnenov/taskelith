import { err, failure, ok, type Instant, type Result } from '@taskelith/kernel';
import type { AdmissionId, ArtifactRevision, GateId, Generation, OwnershipGeneration, PolicyRevision } from '@taskelith/sdlc';
import type {
  AssignmentId,
  AttemptId,
  ExecutionId,
  LaunchAuthId,
  OperationId,
  RecoveryEpoch,
  WorkerId,
} from './identifiers.js';
import type { RevocationReason } from './launch-rejection.js';

export interface LaunchParametersInput {
  readonly ttlMilliseconds: number;
  readonly skewMilliseconds: number;
}

// The protocol parameters every grant carries (operational targets: `30s`
// and `5s`); only parsing creates them, and a spread copy is not one.
export class LaunchParameters {
  // Makes the type nominal: an object literal or spread copy lacks it.
  readonly #nominal = true;
  readonly ttlMilliseconds: number;
  readonly skewMilliseconds: number;

  private constructor(ttlMilliseconds: number, skewMilliseconds: number) {
    this.ttlMilliseconds = ttlMilliseconds;
    this.skewMilliseconds = skewMilliseconds;
    Object.freeze(this);
  }

  static parse(input: LaunchParametersInput): Result<LaunchParameters> {
    const { ttlMilliseconds, skewMilliseconds } = input;
    if (!isPositiveInteger(ttlMilliseconds) || !isPositiveInteger(skewMilliseconds)) {
      return err(failure('invalid', 'launch ttl and skew must be positive integers of milliseconds'));
    }
    if (skewMilliseconds >= ttlMilliseconds) {
      return err(failure('invalid', 'launch skew must be shorter than the launch ttl'));
    }
    return ok(new LaunchParameters(ttlMilliseconds, skewMilliseconds));
  }
}

export function parseLaunchParameters(input: LaunchParametersInput): Result<LaunchParameters> {
  return LaunchParameters.parse(input);
}

export const GRANT_STATES = Object.freeze(['granted', 'revoked'] as const);

export type GrantState = (typeof GRANT_STATES)[number];

// One single-execution permission to spawn, with every value the authority
// compared; expiry is computed from `issuedAt` and the ttl, never stored.
export type LaunchGrant = LaunchGrantValues & (
  | { readonly state: 'granted' }
  | { readonly state: 'revoked'; readonly revokedFor: RevocationReason }
);

export interface LaunchGrantValues {
  readonly launchAuthId: LaunchAuthId;
  readonly operationId: OperationId;
  readonly executionId: ExecutionId;
  readonly attemptId: AttemptId;
  readonly assignmentId: AssignmentId;
  readonly workerId: WorkerId;
  readonly ownershipGeneration: OwnershipGeneration;
  readonly recoveryEpoch: RecoveryEpoch;
  readonly admissionId: AdmissionId;
  readonly admissionGeneration: Generation;
  readonly reliedOnGates: readonly GateId[];
  readonly artifacts: readonly ArtifactRevision[];
  readonly policyRevision: PolicyRevision;
  readonly issuedAt: Instant;
  readonly parameters: LaunchParameters;
}

// The worker's spawn deadline on its suspend-inclusive monotonic clock, from
// its reading before the operation's first request (contract section 7).
export function workerLaunchDeadline(firstRequestReading: number, parameters: LaunchParameters): number {
  return firstRequestReading + parameters.ttlMilliseconds - parameters.skewMilliseconds;
}

export function isGrantExpired(grant: LaunchGrant, now: Instant): boolean {
  return Date.parse(now) >= Date.parse(grant.issuedAt) + grant.parameters.ttlMilliseconds;
}

// Revocation keeps a grant's first reason; a revoked grant stays revoked.
export function revokeGrant(grant: LaunchGrant, reason: RevocationReason): LaunchGrant {
  if (grant.state === 'revoked') return grant;
  return Object.freeze({ ...grant, state: 'revoked', revokedFor: reason });
}

function isPositiveInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}
