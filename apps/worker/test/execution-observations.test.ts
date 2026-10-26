import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { checkMessageSchema, type MessageSchemas } from '@taskelith/contracts';
import { launchRejection, type AssignmentRefusal, type ExecutionExit, type JournaledCommand, type WorkerJournal } from '@taskelith/execution';
import { ok, type Result } from '@taskelith/kernel';
import type { Publication, PublishOutcome } from '@taskelith/nats';
import { id, value } from '@taskelith/testing';
import { publishDueObservations } from '@taskelith/worker';
import { CLEAN_EXIT, PROCESS, T0, grantFor, intentOf, offer, temporaryJournal } from './launch-fakes.ts';

const SUBJECT = 'taskelith.installation1.workers.worker-1.observations';

let journal: WorkerJournal;
let remove: () => void;
let published: Record<string, unknown>[];

beforeEach(() => {
  const temporary = temporaryJournal();
  journal = temporary.root.journal;
  remove = temporary.remove;
  published = [];
  value(journal.recordCommand(offer()));
});

afterEach(() => remove());

const publish = async (publication: Publication): Promise<Result<PublishOutcome>> => {
  published.push(JSON.parse(new TextDecoder().decode(publication.body)) as Record<string, unknown>);
  return ok('stored');
};

const EXECUTION = id('ExecutionId', 'execution-1');

function authorize(operation: string) {
  const { workerId } = journal.binding;
  const request = { ...intentOf(), workerId, executionId: EXECUTION, operationId: id('OperationId', operation), reportsNotStarted: false };
  value(journal.beginAuthorization(request));
  return request;
}

function launched(): void {
  const request = authorize('operation-1');
  value(journal.recordGrant(grantFor(request)));
  value(journal.recordExecutionRecordWritten(EXECUTION));
}

async function publishedAs(name: keyof MessageSchemas & string): Promise<Record<string, unknown>> {
  value(await publishDueObservations({ journal, publish, observationSubject: SUBJECT, now: () => T0 }));
  const body = published.at(-1);
  const checked = checkMessageSchema(name, body);
  assert.equal(checked.ok, true, checked.ok ? '' : checked.error.join('; '));
  return body ?? {};
}

test('a start is published with the process, the grant, and the attempt it belongs to', async () => {
  launched();
  value(journal.recordStart(EXECUTION, id('LaunchAuthId', 'grant-operation-1'), PROCESS));
  const body = await publishedAs('ExecutionStartedObservation');
  assert.deepEqual(body.payload, {
    executionId: EXECUTION, assignmentId: 'assignment-1', launchAuthId: 'grant-operation-1', recoveryEpoch: 1, process: PROCESS,
  });
  assert.deepEqual([(body.metadata as Record<string, unknown>).attemptId, (body.metadata as Record<string, unknown>).ownershipGeneration], ['attempt-1', 2]);
});

test('an exit is published with its termination evidence, and a spawn failure as spawnFailed', async () => {
  launched();
  value(journal.recordExit(EXECUTION, CLEAN_EXIT));
  const body = await publishedAs('ExecutionExitedObservation');
  assert.deepEqual(body.payload, {
    executionId: EXECUTION, status: { kind: 'code', code: 0 }, startProven: true, spawnFailed: false, terminationEvidence: 'process-group-empty',
  });
});

test('a spawn failure is published with its failure and never-spawned', async () => {
  launched();
  const exit: ExecutionExit = { status: { kind: 'unknown' }, startProven: false, spawnFailure: 'ENOENT', termination: 'never-spawned' };
  value(journal.recordExit(EXECUTION, exit));
  const body = await publishedAs('ExecutionExitedObservation');
  assert.deepEqual(body.payload, {
    executionId: EXECUTION, status: { kind: 'unknown' }, startProven: false, spawnFailed: true, spawnFailure: 'ENOENT',
    terminationEvidence: 'never-spawned',
  });
});

test('a spawn failure is published as DisplayText: control characters replaced, at most 1024 characters', async () => {
  launched();
  const spawnFailure = `spawn\u0000failed\n${'x'.repeat(2000)}`;
  value(journal.recordExit(EXECUTION, { status: { kind: 'unknown' }, startProven: false, spawnFailure, termination: 'never-spawned' }));
  const payload = (await publishedAs('ExecutionExitedObservation')).payload as Record<string, string>;
  assert.equal(payload.spawnFailure?.length, 1024);
  assert.ok(payload.spawnFailure?.startsWith('spawn failed x'));
});

for (const termination of ['boot-changed', 'namespace-ended'] as const) {
  test(`an exit proven by ${termination} on recovery is published with that evidence`, async () => {
    launched();
    value(journal.recordExit(EXECUTION, { status: { kind: 'unknown' }, startProven: true, termination }));
    assert.deepEqual((await publishedAs('ExecutionExitedObservation')).payload, {
      executionId: EXECUTION, status: { kind: 'unknown' }, startProven: true, spawnFailed: false, terminationEvidence: termination,
    });
  });
}

test('uncertain and not-started are published about their execution', async () => {
  launched();
  value(journal.recordUncertain(EXECUTION));
  assert.deepEqual((await publishedAs('ExecutionUncertainObservation')).payload, { executionId: EXECUTION });
  value(journal.recordNotStarted(EXECUTION));
  assert.deepEqual((await publishedAs('ExecutionNotStartedObservation')).payload, { executionId: EXECUTION });
});

test('an unproven termination is published with its survivors, even with none listable', async () => {
  launched();
  value(journal.recordTerminationUnproven(EXECUTION, []));
  const body = await publishedAs('TerminationUnprovenObservation');
  assert.deepEqual(body.payload, { executionId: EXECUTION, survivors: [] });
});

test('a final launch rejection is published with its operation and reason', async () => {
  authorize('operation-1');
  value(journal.recordLaunchRejection(id('OperationId', 'operation-1'), launchRejection('gate-not-passed', 'gate')));
  assert.deepEqual((await publishedAs('LaunchRejectedObservation')).payload, {
    executionId: EXECUTION, assignmentId: 'assignment-1', operationId: 'operation-1', reason: 'gate-not-passed',
  });
});

function refusedOffer(number: number, refusal: AssignmentRefusal): JournaledCommand {
  const { commandId, digest, correlationId } = offer(number);
  const { assignmentId, attemptId, ownershipGeneration } = intentOf(number);
  const rejection = { kind: 'assignment-refused' as const, assignment: { assignmentId, attemptId, ownershipGeneration }, ...refusal };
  return { commandId, digest, correlationId, outcome: 'rejected', kind: 'execution.assignment.offer', rejection };
}

test('a refusal for admission pressure is retryable and names its causes', async () => {
  value(journal.recordCommand(refusedOffer(2, { reason: 'worker-admission-pressure', pressureCauses: ['disk-floor', 'journal-backlog'] })));
  const body = await publishedAs('AssignmentRefusedObservation');
  assert.deepEqual(body.payload, {
    commandId: offer(2).commandId, assignmentId: 'assignment-2', reason: 'worker-admission-pressure', retryable: true,
    pressureCauses: ['disk-floor', 'journal-backlog'],
  });
});

test('any other refusal is final and names no causes', async () => {
  value(journal.recordCommand(refusedOffer(2, { reason: 'worker-slots-exhausted' })));
  const body = await publishedAs('AssignmentRefusedObservation');
  assert.deepEqual(body.payload, { commandId: offer(2).commandId, assignmentId: 'assignment-2', reason: 'worker-slots-exhausted', retryable: false });
});

test('a pressure change is published with its causes, and an empty list clears it', async () => {
  value(journal.recordAdmissionPressure(['unmeasurable-limit']));
  assert.deepEqual((await publishedAs('AdmissionPressureChangedObservation')).payload, { causes: ['unmeasurable-limit'] });
  value(journal.recordAdmissionPressure([]));
  const cleared = await publishedAs('AdmissionPressureChangedObservation');
  assert.deepEqual(cleared.payload, { causes: [] });
  assert.equal((cleared.metadata as Record<string, unknown>).attemptId, undefined);
});
