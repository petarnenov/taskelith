import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  checkHttpSchema,
  checkMessageSchema,
  commonProtocolVersion,
  EXECUTION_PROTOCOL_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
  supportsProtocolVersion,
  type SchemaViolations,
} from '@taskelith/contracts';
import {
  CANCELLATION_REASONS,
  EXECUTION_EVIDENCE_KINDS,
  LAUNCH_REJECTION_REASONS,
  RETRYABLE_LAUNCH_REJECTIONS,
  REVOCATION_REASONS,
} from '@taskelith/execution';
import { ASSIGNMENT_END_REASONS, HARD_CONTROLS, REFUSAL_REASONS } from '@taskelith/scheduling';
import type { Result } from '@taskelith/kernel';

type Schemas = Record<string, { enum?: string[]; properties?: Record<string, { enum?: string[] }> }>;

function schemas(name: string): Schemas {
  return JSON.parse(readFileSync(new URL(`../documents/${name}`, import.meta.url), 'utf8')).components.schemas;
}

function violations<T>(result: Result<T, SchemaViolations>): SchemaViolations {
  assert.equal(result.ok, false);
  return result.ok ? [] : result.error;
}

const MESSAGES = schemas('execution.asyncapi.json');
const HTTP = schemas('execution.openapi.json');
const AT = '2026-10-25T10:00:00.000Z';
const DIGEST = `sha256:${'ab'.repeat(32)}`;

function commandMetadata(commandType: string) {
  return {
    commandId: 'command-1',
    commandType,
    schemaVersion: 1,
    issuedAt: AT,
    correlationId: 'correlation-1',
    projectId: 'project-1',
    taskId: 'task-1',
    attemptId: 'attempt-1',
    workerId: 'worker-1',
    ownershipGeneration: 2,
    sdlc: { runId: 'run-1', stageId: 'apply', admissionId: 'admission-1', admissionGeneration: 1 },
  };
}

const OFFER = {
  metadata: commandMetadata('execution.assignment.offer'),
  payload: {
    protocolVersion: 1,
    assignmentId: 'assignment-1',
    recoveryEpoch: 1,
    reservation: { reservationId: 'reservation-1', requested: { cpuMillicores: 1000, memoryMebibytes: 2048, hardControls: ['cpu-limit'] } },
  },
};

function observation(observationType: string, payload: object, sequence = 1) {
  return {
    metadata: {
      observationId: `observation-${sequence}`,
      observationType,
      schemaVersion: 1,
      protocolVersion: 1,
      occurredAt: AT,
      correlationId: 'correlation-1',
      workerId: 'worker-1',
      journalId: 'journal-1',
      sequence,
      attemptId: 'attempt-1',
      ownershipGeneration: 2,
    },
    payload,
  };
}

const PROCESS = { platform: 'linux', bootId: 'boot-1', pid: 4242, startTime: 912345, processGroupId: 4242 };

test('the wire enumerations are the domain vocabularies', () => {
  const nonRetryable = LAUNCH_REJECTION_REASONS.filter((reason) => !RETRYABLE_LAUNCH_REJECTIONS.includes(reason));

  assert.deepEqual(MESSAGES.RefusalReason!.enum, [...REFUSAL_REASONS]);
  assert.deepEqual(MESSAGES.LaunchRejectionReason!.enum, nonRetryable);
  assert.deepEqual(new Set(HTTP.LaunchRejection!.properties!.reason!.enum), new Set(LAUNCH_REJECTION_REASONS));
  assert.deepEqual(HTTP.RevocationReason!.enum, [...REVOCATION_REASONS]);
  assert.deepEqual(MESSAGES.HardControl!.enum, [...HARD_CONTROLS]);
  assert.deepEqual(MESSAGES.CancellationPayload!.properties!.reason!.enum, [...CANCELLATION_REASONS]);
  assert.deepEqual(MESSAGES.AssignmentEndPayload!.properties!.reason!.enum, [...ASSIGNMENT_END_REASONS]);
  assert.ok(EXECUTION_EVIDENCE_KINDS.includes('uncertain') && EXECUTION_EVIDENCE_KINDS.includes('termination-unproven'));
});

test('an assignment offer carries the section 9 command fields and its reservation', () => {
  assert.ok(checkMessageSchema('AssignmentOfferCommand', OFFER).ok);

  const { attemptId: _attemptId, ...withoutAttempt } = OFFER.metadata;
  assert.ok(violations(checkMessageSchema('AssignmentOfferCommand', { ...OFFER, metadata: withoutAttempt })).some((text) => text.includes('attemptId')));
  const asCancellation = { ...OFFER, metadata: commandMetadata('execution.cancellation.request') };
  assert.ok(violations(checkMessageSchema('AssignmentOfferCommand', asCancellation)).some((text) => text.includes('/metadata/commandType')));
});

test('cancellation and assignment end commands name their reason and target', () => {
  const cancellation = { metadata: commandMetadata('execution.cancellation.request'), payload: { protocolVersion: 1, reason: 'launch-revoked', executionId: 'execution-1' } };
  const end = { metadata: commandMetadata('execution.assignment.end'), payload: { protocolVersion: 1, assignmentId: 'assignment-1', reason: 'superseded' } };

  assert.ok(checkMessageSchema('CancellationCommand', cancellation).ok);
  assert.ok(checkMessageSchema('AssignmentEndCommand', end).ok);
  assert.ok(violations(checkMessageSchema('AssignmentEndCommand', { ...end, payload: { ...end.payload, reason: 'execution-terminal' } })).length > 0);
});

test('a worker reads the protocol version of a command of a later version and fails closed', () => {
  const later = { metadata: commandMetadata('execution.assignment.offer'), payload: { protocolVersion: 2, placement: { zone: 'b' } } };
  const versioned = checkMessageSchema('VersionedCommand', later);

  assert.ok(versioned.ok);
  assert.equal(supportsProtocolVersion(SUPPORTED_PROTOCOL_VERSIONS, versioned.value.payload.protocolVersion), false);
  assert.ok(!checkMessageSchema('AssignmentOfferCommand', later).ok);
  assert.ok(violations(checkMessageSchema('VersionedCommand', { ...later, payload: {} })).some((text) => text.includes('protocolVersion')));
  const rejected = { commandId: 'command-1', commandType: 'execution.assignment.offer', reason: 'protocol-not-supported', supportedProtocolVersions: SUPPORTED_PROTOCOL_VERSIONS };
  assert.ok(checkMessageSchema('CommandRejectedObservation', observation('execution.command.rejected', rejected)).ok);
});

test('the protocol windows of a worker and the control plane give the version to stamp', () => {
  assert.equal(EXECUTION_PROTOCOL_VERSION, 1);
  assert.equal(commonProtocolVersion({ minimum: 1, maximum: 3 }, { minimum: 2, maximum: 4 }), 3);
  assert.equal(commonProtocolVersion({ minimum: 1, maximum: 1 }, { minimum: 2, maximum: 3 }), undefined);
  assert.equal(supportsProtocolVersion({ minimum: 1, maximum: 2 }, 2), true);
  assert.equal(supportsProtocolVersion({ minimum: 1, maximum: 2 }, 1.5), false);
  assert.equal(supportsProtocolVersion({ minimum: 2, maximum: 2 }, 1), false);
});

test('an observation names its producer journal and a gapless sequence', () => {
  const accepted = observation('execution.assignment.accepted', { commandId: 'command-1', assignmentId: 'assignment-1', attemptId: 'attempt-1', ownershipGeneration: 2 });
  const { journalId: _journalId, ...withoutJournal } = accepted.metadata;

  assert.ok(checkMessageSchema('AssignmentAcceptedObservation', accepted).ok);
  assert.ok(violations(checkMessageSchema('AssignmentAcceptedObservation', { ...accepted, metadata: withoutJournal })).some((text) => text.includes('journalId')));
  assert.ok(violations(checkMessageSchema('AssignmentAcceptedObservation', { ...accepted, metadata: { ...accepted.metadata, sequence: 0 } })).some((text) => text.includes('/metadata/sequence')));
});

test('a refusal under admission pressure names its causes', () => {
  const refusal = { commandId: 'command-1', assignmentId: 'assignment-1', attemptId: 'attempt-1', ownershipGeneration: 2, reason: 'worker-admission-pressure', retryable: true, pressureCauses: ['disk-floor', 'journal-backlog'] };

  assert.ok(checkMessageSchema('AssignmentRefusedObservation', observation('execution.assignment.refused', refusal)).ok);
  assert.ok(!checkMessageSchema('AssignmentRefusedPayload', { ...refusal, pressureCauses: [] }).ok);
  assert.ok(!checkMessageSchema('AssignmentRefusedPayload', { ...refusal, pressureCauses: ['disk-floor', 'disk-floor'] }).ok);
});

test('execution facts carry the identities the launch authority checks', () => {
  const started = { executionId: 'execution-1', assignmentId: 'assignment-1', launchAuthId: 'launch-1', recoveryEpoch: 1, process: PROCESS };
  const exited = { executionId: 'execution-1', status: { kind: 'signal', signal: 'SIGKILL' }, startProven: true, spawnFailed: false, terminationEvidence: 'containment-empty' };
  const unproven = { executionId: 'execution-1', survivors: [{ ...PROCESS, platform: 'darwin', pid: 4300 }] };

  assert.ok(checkMessageSchema('ExecutionStartedObservation', observation('execution.started', started)).ok);
  assert.ok(checkMessageSchema('ExecutionExitedObservation', observation('execution.exited', exited, 2)).ok);
  assert.ok(checkMessageSchema('TerminationUnprovenObservation', observation('execution.termination-unproven', unproven)).ok);
  assert.ok(checkMessageSchema('ExecutionNotStartedObservation', observation('execution.not-started', { executionId: 'execution-1' })).ok);
  assert.ok(!checkMessageSchema('ExecutionStartedPayload', { ...started, launchAuthId: undefined }).ok);
  assert.ok(!checkMessageSchema('ExecutionExitedPayload', { ...exited, status: { kind: 'code', code: 256 } }).ok);
  assert.ok(!checkMessageSchema('ExitStatus', { kind: 'code', signal: 'SIGTERM' }).ok);
});

test('a non-retryable launch rejection is an observation, a retryable one is not', () => {
  const rejected = { executionId: 'execution-1', assignmentId: 'assignment-1', operationId: 'operation-1', reason: 'gate-not-passed' };

  assert.ok(checkMessageSchema('LaunchRejectedObservation', observation('execution.launch.rejected', rejected)).ok);
  assert.ok(!checkMessageSchema('LaunchRejectedPayload', { ...rejected, reason: 'unavailable' }).ok);
});

test('the control plane confirms a journal prefix and the worker reports its inventory', () => {
  const confirmation = { messageType: 'execution.observations.confirmed', schemaVersion: 1, protocolVersion: 1, issuedAt: AT, workerId: 'worker-1', journalId: 'journal-1', confirmedThrough: 7 };
  const inventory = {
    messageType: 'worker.inventory.reported',
    schemaVersion: 1,
    protocolVersion: 1,
    reportId: 'report-1',
    reportedAt: AT,
    workerId: 'worker-1',
    journalId: 'journal-1',
    throughSequence: 7,
    assignments: [{ commandId: 'command-1', assignmentId: 'assignment-1', attemptId: 'attempt-1', ownershipGeneration: 2, state: 'accepted', executions: [{ executionId: 'execution-1', state: 'uncertain' }] }],
  };

  assert.ok(checkMessageSchema('ObservationsConfirmed', confirmation).ok);
  assert.ok(checkMessageSchema('InventoryReported', inventory).ok);
  assert.ok(!checkMessageSchema('ObservationsConfirmed', { ...confirmation, confirmedThrough: 0 }).ok);
});

test('capacity and admission pressure are declared as observations', () => {
  const capacity = { capacity: { slots: 2, cpuMillicores: 4000, memoryMebibytes: 8192, enforceableControls: ['cpu-limit', 'memory-limit'] }, protocolVersions: SUPPORTED_PROTOCOL_VERSIONS };

  assert.ok(checkMessageSchema('CapacityDeclaredObservation', observation('worker.capacity.declared', capacity)).ok);
  assert.ok(checkMessageSchema('AdmissionPressureChangedObservation', observation('worker.admission-pressure.changed', { causes: [] })).ok);
});

test('enrollment presents the journal, host, protocol window, and capacity', () => {
  const request = {
    journalId: 'journal-1',
    host: { platform: 'darwin', architecture: 'x64', hostname: 'build-host' },
    protocolVersions: SUPPORTED_PROTOCOL_VERSIONS,
    capacity: { slots: 2, cpuMillicores: 4000, memoryMebibytes: 8192, enforceableControls: [] },
  };
  const enrollment = {
    installationId: 'installation-1',
    workerId: 'worker-1',
    credentialGeneration: 1,
    recoveryEpoch: 1,
    protocolVersions: SUPPORTED_PROTOCOL_VERSIONS,
    credentials: { controlPlane: 'secret-1', broker: 'secret-2' },
  };

  assert.ok(checkHttpSchema('EnrollmentRequest', request).ok);
  assert.ok(checkHttpSchema('Enrollment', enrollment).ok);
  assert.ok(violations(checkHttpSchema('EnrollmentRequest', { ...request, workerId: 'worker-1' })).some((text) => text.includes('workerId')));
});

test('a launch authorization names the expected values and returns a decision', () => {
  const request = {
    operationId: 'operation-1',
    recoveryEpoch: 1,
    assignmentId: 'assignment-1',
    attemptId: 'attempt-1',
    ownershipGeneration: 2,
    executionId: 'execution-1',
    admissionId: 'admission-1',
    admissionGeneration: 1,
    reportsNotStarted: false,
  };
  const grant = {
    ...request,
    launchAuthId: 'launch-1',
    workerId: 'worker-1',
    reliedOnGates: ['specs-approval'],
    artifacts: [{ artifactId: 'spec', digest: DIGEST, nativeReference: 'specs/spec.md' }],
    policyRevision: 'policy-7',
    issuedAt: AT,
    ttlMilliseconds: 30_000,
    skewMilliseconds: 5_000,
  };
  const { reportsNotStarted: _reportsNotStarted, ...granted } = grant;

  assert.ok(checkHttpSchema('LaunchAuthorizationRequest', request).ok);
  assert.ok(violations(checkHttpSchema('LaunchAuthorizationRequest', { ...request, workerId: 'worker-1' })).some((text) => text.includes('workerId')));
  assert.ok(checkHttpSchema('LaunchAuthorizationOutcome', { outcome: 'granted', grant: granted }).ok);
  assert.ok(checkHttpSchema('LaunchAuthorizationOutcome', { outcome: 'rejected', rejection: { reason: 'quarantined', retryable: true, message: 'restore quarantine' } }).ok);
  assert.ok(checkHttpSchema('LaunchAuthorizationOutcome', { outcome: 'revoked', reason: 'capacity-not-reserved' }).ok);
  assert.ok(checkHttpSchema('LaunchAuthorizationOutcome', { outcome: 'expired' }).ok);
  assert.ok(!checkHttpSchema('LaunchAuthorizationOutcome', { outcome: 'revoked', reason: 'operation-mismatch' }).ok);
});

test('a task result is pending or the outcome fact of its last ended attempt', () => {
  const outcome = { kind: 'exited', executionId: 'execution-1', status: { kind: 'code', code: 0 }, startProven: true, cancelled: false, ownershipGeneration: 3, endedAt: AT };

  assert.ok(checkHttpSchema('TaskResult', { state: 'pending', runId: 'run-1', taskId: 'task-1' }).ok);
  assert.ok(checkHttpSchema('TaskResult', { state: 'ended', runId: 'run-1', taskId: 'task-1', attemptId: 'attempt-1', ownershipGeneration: 3, outcome, evidence: [] }).ok);
  assert.ok(checkHttpSchema('AttemptOutcome', { kind: 'not-started', cancelled: true, ownershipGeneration: 3, endedAt: AT }).ok);
  assert.ok(!checkHttpSchema('TaskResult', { state: 'pending', runId: 'run-1', taskId: 'task-1', outcome }).ok);
});

test('an evidence record is content addressed and names its producer', () => {
  const publication = {
    evidenceId: 'evidence-1',
    projectId: 'project-1',
    runId: 'run-1',
    taskId: 'task-1',
    attemptId: 'attempt-1',
    kind: 'execution-log',
    inputArtifacts: [],
    contentDigest: DIGEST,
    contentType: 'text/plain',
    sizeBytes: 12,
    capturedAt: AT,
  };

  assert.ok(checkHttpSchema('EvidencePublication', publication).ok);
  assert.ok(checkHttpSchema('EvidenceRecord', { ...publication, producer: { kind: 'worker', workerId: 'worker-1' }, publishedAt: AT }).ok);
  assert.ok(!checkHttpSchema('EvidencePublication', { ...publication, contentDigest: 'md5:00' }).ok);
});
