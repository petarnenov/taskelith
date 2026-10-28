import { createHash } from 'node:crypto';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseInstant, type Instant } from '@taskelith/kernel';
import { parseGeneration, parseOwnershipGeneration } from '@taskelith/sdlc';
import {
  parseLaunchParameters,
  parseRecoveryEpoch,
  type ExecutionExit,
  type ExecutionId,
  type ExecutionProcess,
  type ExitStatus,
  type JournalBinding,
  type JournaledCommand,
  type LaunchGrant,
  type LaunchIntent,
  type LaunchRequest,
  type OperationId,
} from '@taskelith/execution';
import { id, value } from '@taskelith/testing';
import type { JournalClock, VolumeProbe, WorkerEnrollment, WorkerRootOptions } from '@taskelith/worker-journal';

export const T0: Instant = value(parseInstant('2026-10-25T09:00:00.000Z'));
export const CLOCK: JournalClock = { now: () => T0 };

export const BINDING: JournalBinding = {
  installationId: id('InstallationId', 'installation-1'),
  workerId: id('WorkerId', 'worker-1'),
  journalId: id('JournalId', 'journal-1'),
  recoveryEpoch: value(parseRecoveryEpoch(1)),
};

export const ENROLLMENT: WorkerEnrollment = {
  ...BINDING,
  credentialGeneration: 1,
  credentials: { controlPlane: 'tkwk_test-secret', broker: '-----BEGIN NATS USER JWT-----\ntest\n' },
  installationCa: '-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----\n',
};

// A fresh data root outside any checkout, resolved past symbolic links
// such as macOS's /var.
export function temporaryDataRoot(): { readonly dataRoot: string; readonly remove: () => void } {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'taskelith-journal-')));
  return { dataRoot: join(base, 'data'), remove: () => rmSync(base, { recursive: true, force: true }) };
}

// Accepts the test volume, which may be tmpfs or overlayfs on Linux; the
// volume tests pass the real probe or their own.
export const TEST_VOLUME: VolumeProbe = () => ({ ok: true, value: { platform: 'darwin', filesystem: 'apfs', local: true } });

export function rootOptions(dataRoot: string, extra: Partial<WorkerRootOptions> = {}): WorkerRootOptions {
  return { dataRoot, clock: CLOCK, probe: TEST_VOLUME, ...extra };
}

export function intent(number = 1): LaunchIntent {
  return {
    assignmentId: id('AssignmentId', `assignment-${number}`),
    attemptId: id('AttemptId', `attempt-${number}`),
    ownershipGeneration: value(parseOwnershipGeneration(1)),
    admissionId: id('AdmissionId', `admission-${number}`),
    admissionGeneration: value(parseGeneration(1)),
    recoveryEpoch: value(parseRecoveryEpoch(1)),
    requested: { cpuMillicores: 1000, memoryMebibytes: 1024, hardControls: [] },
  };
}

export const CORRELATION = id('CorrelationId', 'correlation-1');

export function assignment(number = 1): JournaledCommand {
  return {
    commandId: id('CommandId', `command-${number}`), digest: digest(`assignment-${number}`), correlationId: CORRELATION,
    outcome: 'accepted', kind: 'assignment', intent: intent(number),
  };
}

// A command of a protocol version the worker does not support.
export function unsupported(number: number): JournaledCommand {
  return {
    commandId: id('CommandId', `command-${number}`), digest: digest(`unsupported-${number}`), correlationId: CORRELATION,
    outcome: 'rejected', kind: 'execution.assignment.offer',
    rejection: {
      kind: 'command-rejected', commandType: 'execution.assignment.offer', reason: 'protocol-not-supported',
      supportedProtocolVersions: { minimum: 1, maximum: 1 },
    },
  };
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

export const PROCESS: ExecutionProcess = { platform: 'darwin', bootId: 'boot-1', pid: 4242, startTime: 1, processGroupId: 4242 };

export function exitWith(status: ExitStatus): ExecutionExit {
  return { status, startProven: true, termination: 'process-group-empty' };
}
