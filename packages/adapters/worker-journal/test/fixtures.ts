import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseIdentifier, parseInstant, type Instant, type Result } from '@taskelith/kernel';
import { parseGeneration, parseOwnershipGeneration } from '@taskelith/sdlc';
import {
  parseLaunchParameters,
  parseRecoveryEpoch,
  type ExecutionId,
  type JournalBinding,
  type JournaledCommand,
  type LaunchGrant,
  type LaunchIntent,
  type LaunchRequest,
  type OperationId,
} from '@taskelith/execution';
import type { JournalClock, WorkerRootOptions } from '@taskelith/worker-journal';

export function value<T, E>(result: Result<T, E>): T {
  assert.ok(result.ok, `expected success, got ${JSON.stringify(result.ok ? undefined : result.error)}`);
  return result.value;
}

export function failed<T, E>(result: Result<T, E>): E {
  assert.ok(!result.ok, 'expected a failure');
  return result.error;
}

export const id = <Kind extends string>(kind: Kind, text: string) => value(parseIdentifier(kind, text));

export const T0: Instant = value(parseInstant('2026-10-25T09:00:00.000Z'));
export const CLOCK: JournalClock = { now: () => T0 };

export const BINDING: JournalBinding = {
  installationId: id('InstallationId', 'installation-1'),
  workerId: id('WorkerId', 'worker-1'),
  journalId: id('JournalId', 'journal-1'),
  recoveryEpoch: value(parseRecoveryEpoch(1)),
};

// A fresh data root outside any checkout, resolved past symbolic links
// such as macOS's /var.
export function temporaryDataRoot(): { readonly dataRoot: string; readonly remove: () => void } {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'taskelith-journal-')));
  return { dataRoot: join(base, 'data'), remove: () => rmSync(base, { recursive: true, force: true }) };
}

export function rootOptions(dataRoot: string, extra: Partial<WorkerRootOptions> = {}): WorkerRootOptions {
  return { dataRoot, clock: CLOCK, ...extra };
}

export function intent(number = 1): LaunchIntent {
  return {
    assignmentId: id('AssignmentId', `assignment-${number}`),
    attemptId: id('AttemptId', `attempt-${number}`),
    ownershipGeneration: value(parseOwnershipGeneration(1)),
    admissionId: id('AdmissionId', `admission-${number}`),
    admissionGeneration: value(parseGeneration(1)),
  };
}

export function assignment(number = 1): JournaledCommand {
  return { commandId: id('CommandId', `command-${number}`), digest: digest(`assignment-${number}`), outcome: 'accepted', kind: 'assignment', intent: intent(number) };
}

export function digest(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

export function launchRequest(executionId: ExecutionId, operationId: OperationId, number = 1): LaunchRequest {
  const { assignmentId, attemptId, ownershipGeneration, admissionId, admissionGeneration } = intent(number);
  return {
    operationId,
    workerId: BINDING.workerId,
    recoveryEpoch: BINDING.recoveryEpoch,
    assignmentId,
    attemptId,
    ownershipGeneration,
    executionId,
    admissionId,
    admissionGeneration,
    reportsNotStarted: false,
  };
}

export function grantFor(request: LaunchRequest, launchAuthText = 'launch-auth-1'): LaunchGrant {
  return {
    state: 'granted',
    launchAuthId: id('LaunchAuthId', launchAuthText),
    operationId: request.operationId,
    executionId: request.executionId,
    attemptId: request.attemptId,
    assignmentId: request.assignmentId,
    workerId: request.workerId,
    ownershipGeneration: request.ownershipGeneration,
    recoveryEpoch: request.recoveryEpoch,
    admissionId: request.admissionId,
    admissionGeneration: request.admissionGeneration,
    reliedOnGates: [],
    artifacts: [],
    policyRevision: id('PolicyRevision', 'policy-1'),
    issuedAt: T0,
    parameters: value(parseLaunchParameters({ ttlMilliseconds: 30_000, skewMilliseconds: 5_000 })),
  };
}
