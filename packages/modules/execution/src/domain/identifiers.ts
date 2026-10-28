import { err, failure, ok, type Identifier, type Result } from '@taskelith/kernel';

export type AttemptId = Identifier<'AttemptId'>;
export type AssignmentId = Identifier<'AssignmentId'>;
export type ExecutionId = Identifier<'ExecutionId'>;
export type LaunchAuthId = Identifier<'LaunchAuthId'>;
export type OperationId = Identifier<'OperationId'>;
export type WorkerId = Identifier<'WorkerId'>;
export type PrincipalId = Identifier<'PrincipalId'>;
export type IdempotencyKey = Identifier<'IdempotencyKey'>;
export type NativeRequestId = Identifier<'NativeRequestId'>;
// A harness plugin, by its manifest `id`; the account pool uses it too.
export type HarnessPluginId = Identifier<'HarnessPluginId'>;
export type SessionId = Identifier<'SessionId'>;
export type TurnId = Identifier<'TurnId'>;
// The harness's own session handle, opaque to Taskelith.
export type NativeSessionId = Identifier<'NativeSessionId'>;

declare const recoveryEpochBrand: unique symbol;

// The installation-wide launch fence that only a disaster recovery procedure
// changes (trust model); facts from another epoch change no current state.
export type RecoveryEpoch = number & { readonly [recoveryEpochBrand]: true };

export function parseRecoveryEpoch(value: number): Result<RecoveryEpoch> {
  if (!Number.isSafeInteger(value) || value < 1) {
    return err(failure('invalid', 'RecoveryEpoch must be a positive integer'));
  }
  return ok(value as RecoveryEpoch);
}

declare const sessionGenerationBrand: unique symbol;

// Counts a session's native processes, from 1 (agent harness port, rule 5).
export type SessionGeneration = number & { readonly [sessionGenerationBrand]: true };

export const FIRST_SESSION_GENERATION = 1 as SessionGeneration;

export function parseSessionGeneration(value: number): Result<SessionGeneration> {
  return value < 0 ? ok(value as SessionGeneration) : err(failure('internal', 'not implemented'));
}

// What the control plane knows of its installation when it decides a launch
// or a start observation.
export interface InstallationState {
  readonly recoveryEpoch: RecoveryEpoch;
  readonly quarantined: boolean;
}
