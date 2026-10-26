import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import { checkMessageSchema, type MessageSchemas } from '@taskelith/contracts';
import { parseRecoveryEpoch, planJournalRecovery, type JournalBinding } from '@taskelith/execution';
import type { WorkerCapacity } from '@taskelith/fleet';
import { err, failure, ok, parseInstant, type Result } from '@taskelith/kernel';
import { readCommandSubjectMessage, type DeliveredMessage, type Publication, type PublishOutcome } from '@taskelith/nats';
import { failed, id, value } from '@taskelith/testing';
import { CommandIntake, publishDueObservations, type ObservationPublisherOptions } from '@taskelith/worker';
import { enrollWorkerRoot, type CommitPointHook, type WorkerEnrollment, type WorkerRoot } from '@taskelith/worker-journal';
import { FakePressure } from './launch-fakes.ts';

const T0 = value(parseInstant('2026-10-25T09:00:00.000Z'));
const WORKER = 'worker-1';
const SUBJECT = 'taskelith.installation1.workers.worker-1.observations';
const BINDING: JournalBinding = {
  installationId: id('InstallationId', 'installation1'), workerId: id('WorkerId', WORKER), journalId: id('JournalId', 'journal-1'),
  recoveryEpoch: value(parseRecoveryEpoch(1)),
};
const ENROLLMENT: WorkerEnrollment = { ...BINDING, credentialGeneration: 1, credentials: { controlPlane: 'tkwk_test', broker: 'creds' } };
const CAPACITY: WorkerCapacity = { slots: 2, cpuMillicores: 4000, memoryMebibytes: 8000, controls: ['memory-limit'] };

class FakeBroker {
  readonly published: Publication[] = [];
  failAfter = Number.POSITIVE_INFINITY;

  publish = async (publication: Publication): Promise<Result<PublishOutcome>> => {
    if (this.published.length >= this.failAfter) return err(failure('unavailable', 'the broker is unreachable'));
    this.published.push(publication);
    return ok('stored');
  };

  bodies(): Record<string, unknown>[] {
    return this.published.map((publication) => JSON.parse(new TextDecoder().decode(publication.body)) as Record<string, unknown>);
  }
}

let base: string;
let root: WorkerRoot;
let broker: FakeBroker;
let intake: CommandIntake;
let pressure: FakePressure;
let onCommitPoint: CommitPointHook = () => undefined;

beforeEach(() => {
  base = realpathSync(mkdtempSync(join(tmpdir(), 'taskelith-intake-')));
  const probe = () => ok({ platform: 'darwin' as const, filesystem: 'apfs', local: true });
  const options = { dataRoot: join(base, 'data'), clock: { now: () => T0 }, probe, onCommitPoint: (point: Parameters<CommitPointHook>[0]) => onCommitPoint(point) };
  root = value(enrollWorkerRoot(options, ENROLLMENT));
  broker = new FakeBroker();
  pressure = new FakePressure();
  intake = newIntake(CAPACITY);
});

afterEach(() => {
  onCommitPoint = () => undefined;
  root.close();
  rmSync(base, { recursive: true, force: true });
});

function newIntake(capacity: WorkerCapacity): CommandIntake {
  let reports = 0;
  return new CommandIntake({
    journal: root.journal, capacity, pressure, publish: broker.publish, observationSubject: SUBJECT,
    newReportId: () => `report-${(reports += 1)}`, now: () => T0,
  });
}

const publisherOptions = (): ObservationPublisherOptions => ({ journal: root.journal, publish: broker.publish, observationSubject: SUBJECT, now: () => T0 });

function metadata(commandType: string, number: number, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    commandId: `${commandType}-${number}`, commandType, schemaVersion: 1, issuedAt: T0, correlationId: `correlation-${number}`,
    projectId: 'project-1', taskId: `task-${number}`,
    sdlc: { runId: 'run-1', stageId: 'stage-1', admissionId: `admission-${number}`, admissionGeneration: 1 },
    attemptId: `attempt-${number}`, workerId: WORKER, ownershipGeneration: 1, ...overrides,
  };
}

interface OfferShape {
  readonly cpuMillicores?: number;
  readonly memoryMebibytes?: number;
  readonly hardControls?: readonly string[];
  readonly protocolVersion?: number;
  readonly workerId?: string;
}

function offer(number: number, shape: OfferShape = {}): Record<string, unknown> {
  const { cpuMillicores = 1000, memoryMebibytes = 1024, hardControls = [], protocolVersion = 1, workerId = WORKER } = shape;
  return {
    metadata: metadata('execution.assignment.offer', number, { workerId }),
    payload: {
      protocolVersion, assignmentId: `assignment-${number}`, recoveryEpoch: 1,
      reservation: { reservationId: `reservation-${number}`, requested: { cpuMillicores, memoryMebibytes, hardControls } },
    },
  };
}

function end(number: number): Record<string, unknown> {
  const payload = { protocolVersion: 1, assignmentId: `assignment-${number}`, reason: 'cancelled' };
  return { metadata: metadata('execution.assignment.end', number + 100, { attemptId: `attempt-${number}` }), payload };
}

function cancellation(number: number): Record<string, unknown> {
  const payload = { protocolVersion: 1, reason: 'requested' };
  return { metadata: metadata('execution.cancellation.request', number + 200, { attemptId: `attempt-${number}` }), payload };
}

// Reads a body as the worker's consumer does, then hands it to the intake.
async function deliver(body: Record<string, unknown>): Promise<Result<unknown>> {
  const read = readCommandSubjectMessage(new TextEncoder().encode(JSON.stringify(body)));
  assert.ok(read.ok, read.ok ? '' : read.error);
  const message: DeliveredMessage = { ...read.value, subject: 'commands', deliveryCount: 1 };
  return intake.handle(message);
}

async function published(): Promise<Record<string, unknown>[]> {
  value(await publishDueObservations(publisherOptions()));
  return broker.bodies();
}

function payloads(bodies: Record<string, unknown>[]): unknown[] {
  return bodies.map((body) => body.payload);
}

function assertSchema(name: keyof MessageSchemas & string, body: unknown): void {
  const checked = checkMessageSchema(name, body);
  assert.ok(checked.ok, checked.ok ? '' : checked.error.join('; '));
}

test('an accepted offer is journaled with its acceptance before it is acknowledged', async () => {
  value(await deliver(offer(1)));
  const [intent] = value(root.journal.snapshot()).intents;
  assert.deepEqual([intent?.assignmentId, intent?.recoveryEpoch, intent?.requested], ['assignment-1', 1, { cpuMillicores: 1000, memoryMebibytes: 1024, hardControls: [] }]);
  const [accepted] = await published();
  assertSchema('AssignmentAcceptedObservation', accepted);
  assert.deepEqual(accepted?.payload, { commandId: 'execution.assignment.offer-1', assignmentId: 'assignment-1' });
  assert.equal((accepted?.metadata as Record<string, unknown>).causationId, 'execution.assignment.offer-1');
});

test('an offer of an unsupported version or of another worker is rejected without a launch intent', async () => {
  value(await deliver(offer(1, { protocolVersion: 2 })));
  value(await deliver(offer(2, { workerId: 'worker-2' })));
  assert.equal(value(root.journal.snapshot()).intents.length, 0);
  const bodies = await published();
  for (const body of bodies) assertSchema('CommandRejectedObservation', body);
  assert.deepEqual(payloads(bodies), [
    { commandId: 'execution.assignment.offer-1', commandType: 'execution.assignment.offer', reason: 'protocol-not-supported', supportedProtocolVersions: { minimum: 1, maximum: 1 } },
    { commandId: 'execution.assignment.offer-2', commandType: 'execution.assignment.offer', reason: 'addressed-to-another-worker', supportedProtocolVersions: { minimum: 1, maximum: 1 } },
  ]);
});

test('the reader quarantines a command that fails VersionedCommand or its own schema', () => {
  const encode = (body: unknown) => new TextEncoder().encode(JSON.stringify(body));
  const { metadata: _metadata, ...withoutMetadata } = offer(1);
  assert.match(failed(readCommandSubjectMessage(encode(withoutMetadata))), /VersionedCommand/);
  const broken = offer(1);
  (broken.payload as Record<string, unknown>).recoveryEpoch = 0;
  assert.match(failed(readCommandSubjectMessage(encode(broken))), /AssignmentOfferCommand/);
});

test('offers beyond the slots, the ceiling, a control, or the capacity are refused', async () => {
  value(await deliver(offer(1, { cpuMillicores: 2001 })));
  value(await deliver(offer(2, { memoryMebibytes: 4097 })));
  value(await deliver(offer(3, { hardControls: ['cpu-limit'] })));
  value(await deliver(offer(4, { memoryMebibytes: 4096, hardControls: ['memory-limit'] })));
  value(await deliver(offer(5, { memoryMebibytes: 4096 })));
  value(await deliver(offer(6, { memoryMebibytes: 1 })));
  value(await deliver(offer(7)));
  const bodies = await published();
  const reasons = bodies.map((body) => (body.payload as { reason?: string }).reason ?? 'accepted');
  assert.deepEqual(reasons, [
    'resource-ceiling-exceeded', 'resource-ceiling-exceeded', 'control-not-enforceable', 'accepted', 'worker-capacity-exhausted', 'accepted', 'worker-slots-exhausted',
  ]);
  for (const body of bodies.filter((entry) => (entry.payload as { reason?: string }).reason !== undefined)) {
    assertSchema('AssignmentRefusedObservation', body);
    assert.equal((body.payload as { retryable: boolean }).retryable, false);
  }
});

test('under admission pressure an offer is refused as retryable with its causes, and admitted once it clears', async () => {
  pressure.causes = ok(['disk-floor', 'journal-backlog']);
  value(await deliver(offer(1)));
  pressure.causes = ok([]);
  value(await deliver(offer(2)));
  const [refused, accepted] = await published();
  assertSchema('AssignmentRefusedObservation', refused);
  assert.deepEqual(refused?.payload, {
    commandId: 'execution.assignment.offer-1', assignmentId: 'assignment-1', reason: 'worker-admission-pressure', retryable: true,
    pressureCauses: ['disk-floor', 'journal-backlog'],
  });
  assert.equal((accepted?.metadata as { observationType: string }).observationType, 'execution.assignment.accepted');
  assert.deepEqual(value(root.journal.snapshot()).intents.map((intent) => intent.assignmentId), ['assignment-2']);
});

test('a limit the offer can never meet is refused before admission pressure is asked', async () => {
  pressure.causes = ok(['disk-floor']);
  value(await deliver(offer(1, { cpuMillicores: 2001 })));
  const [refused] = await published();
  assert.equal((refused?.payload as { reason: string }).reason, 'resource-ceiling-exceeded');
  assert.equal(pressure.refreshes, 0);
});

test('pressure that cannot be refreshed journals nothing, so the offer is not acknowledged', async () => {
  pressure.causes = err(failure('unavailable', 'the journal is stopped'));
  assert.equal(failed(await deliver(offer(1))).message, 'the journal is stopped');
  assert.deepEqual(await published(), []);
});

test('an ended assignment frees its slot, and an end that arrives before its offer ends it', async () => {
  value(await deliver(offer(1)));
  value(await deliver(offer(2)));
  value(await deliver(end(1)));
  value(await deliver(end(3)));
  value(await deliver(offer(3)));
  value(await deliver(offer(4)));
  const intents = value(root.journal.snapshot()).intents;
  assert.deepEqual(intents.map((intent) => [intent.assignmentId, intent.ended]), [
    ['assignment-1', true], ['assignment-2', false], ['assignment-3', true], ['assignment-4', false],
  ]);
  assert.deepEqual(planJournalRecovery(value(root.journal.snapshot())).map((action) => action.kind), ['continue-launch', 'continue-launch']);
});

test('a cancellation that arrives before its offer keeps the offer from launching', async () => {
  value(await deliver(cancellation(1)));
  value(await deliver(offer(1)));
  const snapshot = value(root.journal.snapshot());
  assert.deepEqual(snapshot.cancellations.map((entry) => entry.target), [{ kind: 'attempt', attemptId: 'attempt-1' }]);
  assert.equal(snapshot.intents.length, 1);
  assert.deepEqual(planJournalRecovery(snapshot), [{ kind: 'forward-cancellation', commandId: 'execution.cancellation.request-201', target: { kind: 'attempt', attemptId: 'attempt-1' } }]);
});

test('a cancellation of one execution names that execution', async () => {
  const body = cancellation(1);
  (body.payload as Record<string, unknown>).executionId = 'execution-1';
  value(await deliver(body));
  assert.deepEqual(value(root.journal.snapshot()).cancellations.map((entry) => entry.target), [{ kind: 'execution', executionId: 'execution-1' }]);
});

test('a redelivered offer is a duplicate even when the slots are now full', async () => {
  value(await deliver(offer(1)));
  value(await deliver(offer(2)));
  assert.deepEqual(value(await deliver(offer(1))), { kind: 'duplicate' });
  assert.equal(value(root.journal.snapshot()).intents.length, 2);
  assert.equal((await published()).length, 2);
});

test('a failed W1 commit records nothing, and the redelivered command is journaled once', async () => {
  onCommitPoint = (point) => {
    if (point === 'W1.before') throw new Error('crash before W1');
  };
  await assert.rejects(deliver(offer(1)), /crash before W1/);
  assert.equal(value(root.journal.snapshot()).intents.length, 0);
  onCommitPoint = () => undefined;
  assert.deepEqual(value(await deliver(offer(1))), { kind: 'recorded' });
  assert.equal(value(root.journal.snapshot()).intents.length, 1);
});

test('a crash after W1 and before the acknowledgement makes the redelivery a duplicate', async () => {
  onCommitPoint = (point) => {
    if (point === 'W1.after') throw new Error('crash after W1');
  };
  await assert.rejects(deliver(offer(1)), /crash after W1/);
  onCommitPoint = () => undefined;
  assert.deepEqual(value(await deliver(offer(1))), { kind: 'duplicate' });
  assert.equal(value(root.journal.snapshot()).intents.length, 1);
});

// The consumer redelivers a failed command up to max_deliver, and the
// broker then quarantines it (item 12), so it never blocks the worker.
test('a reused commandId with other content fails, so the command is not acknowledged', async () => {
  value(await deliver(offer(1)));
  const changed = offer(1, { cpuMillicores: 500 });
  assert.equal(failed(await deliver(changed)).code, 'conflict');
  value(await deliver(offer(2)));
  assert.equal(value(root.journal.snapshot()).intents.length, 2);
});

test('the publisher publishes due entries in order under their identity and stops at a failure', async () => {
  value(await deliver(offer(1)));
  value(await deliver(offer(2)));
  broker.failAfter = 1;
  assert.equal(failed(await publishDueObservations(publisherOptions())).code, 'unavailable');
  broker.failAfter = Number.POSITIVE_INFINITY;
  assert.equal(value(await publishDueObservations(publisherOptions())), 1);
  assert.equal(value(await publishDueObservations(publisherOptions())), 0);
  const entries = value(root.journal.dueForPublication(value(parseInstant('2026-10-25T10:00:00.000Z'))));
  assert.deepEqual(broker.published.map((publication) => publication.messageId), entries.map((entry) => entry.position.observationId));
  assert.deepEqual(broker.bodies().map((body) => (body.metadata as { sequence: number }).sequence), [1, 2]);
});

test('a confirmation prunes only its own journal, up to what it assigned', async () => {
  value(await deliver(offer(1)));
  value(await deliver(offer(2)));
  const confirmation = (journalId: string, confirmedThrough: number) => ({
    messageType: 'execution.observations.confirmed', schemaVersion: 1, protocolVersion: 1, issuedAt: T0, workerId: WORKER, journalId, confirmedThrough,
  });
  value(await deliver(confirmation('journal-2', 2)));
  value(await deliver(confirmation('journal-1', 3)));
  assert.equal(value(root.journal.dueForPublication(T0)).length, 2);
  value(await deliver(confirmation('journal-1', 1)));
  assert.deepEqual(value(root.journal.dueForPublication(T0)).map((entry) => entry.position.sequence), [2]);
});

test('an inventory request is answered with a fresh snapshot in parts', async () => {
  const request = (workerId: string) => ({
    messageType: 'worker.inventory.requested', schemaVersion: 1, protocolVersion: 1, issuedAt: T0, workerId, requestId: 'request-1',
  });
  intake = newIntake({ ...CAPACITY, slots: 300, cpuMillicores: 300_000, memoryMebibytes: 400_000 });
  for (let number = 1; number <= 300; number += 1) value(await deliver(offer(number)));
  beginLaunch();
  value(await deliver(request('worker-2')));
  assert.equal(broker.published.length, 0);
  value(await deliver(request(WORKER)));
  const parts = broker.bodies();
  for (const part of parts) assertSchema('InventoryReported', part);
  assert.deepEqual(parts.map(({ reportId, requestId, snapshot, part, parts: total, throughSequence }) => [reportId, requestId, snapshot, part, total, throughSequence]), [
    ['report-1', 'request-1', 1, 1, 2, 300], ['report-1', 'request-1', 1, 2, 2, 300],
  ]);
  assert.deepEqual(parts.map((part) => (part.assignments as unknown[]).length), [256, 44]);
  assert.deepEqual(parts.map((part) => part.executions), [
    [{ executionId: 'execution-1', assignmentId: 'assignment-1', state: 'launch-intended', uncertain: false }], [],
  ]);
  assert.deepEqual(broker.published.map((publication) => publication.messageId), ['report-1.1', 'report-1.2']);
  broker.failAfter = 2;
  assert.equal(failed(await deliver(request(WORKER))).code, 'unavailable');
});

// W2 for the first intent, as 20c's launches will journal it.
function beginLaunch(): void {
  const { assignmentId, attemptId, ownershipGeneration, admissionId, admissionGeneration } = value(root.journal.snapshot()).intents[0]!;
  value(root.journal.beginAuthorization({
    operationId: id('OperationId', 'operation-1'), workerId: BINDING.workerId, recoveryEpoch: BINDING.recoveryEpoch,
    assignmentId, attemptId, ownershipGeneration, executionId: id('ExecutionId', 'execution-1'), admissionId, admissionGeneration,
    reportsNotStarted: false,
  }));
}

test('a resent command with its keys in another order is a duplicate', async () => {
  value(await deliver(offer(1)));
  const { metadata, payload } = offer(1);
  const reordered = { payload, metadata: Object.fromEntries(Object.entries(metadata as object).reverse()) };
  assert.deepEqual(value(await deliver(reordered)), { kind: 'duplicate' });
});

test('an execution fact is published in sequence after the acceptance before it', async () => {
  value(await deliver(offer(1)));
  beginLaunch();
  value(root.journal.recordNotStarted(id('ExecutionId', 'execution-1')));
  assert.equal(value(await publishDueObservations(publisherOptions())), 2);
  assert.deepEqual(broker.bodies().map((body) => (body.metadata as Record<string, unknown>).observationType), [
    'execution.assignment.accepted', 'execution.not-started',
  ]);
});
