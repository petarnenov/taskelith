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

// What the control plane knows of its installation when it decides a launch
// or a start observation.
export interface InstallationState {
  readonly recoveryEpoch: RecoveryEpoch;
  readonly quarantined: boolean;
}
