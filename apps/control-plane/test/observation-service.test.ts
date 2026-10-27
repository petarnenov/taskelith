import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LaunchAuthority,
  ObservationService,
  PlacementService,
  RunService,
  TaskService,
  WorkflowRegistry,
  type ControlPlaneStore,
  type ControlPlaneTransaction,
} from '@taskelith/control-plane';
import {
  InMemoryEvidenceRecords,
  InMemoryTaskRepository,
  authorizeLaunch,
  parseLaunchParameters,
  parseRecoveryEpoch,
  recordStartObservation,
  type AttemptId,
  type Execution,
  type ExecutionId,
  type LaunchAuthId,
  type LaunchAuthorizationRequest,
  type LaunchGrant,
  type LaunchRecords,
  type RecordedLaunch,
  type RecordedRejection,
  type OperationId,
  type SelfCheckResult,
  type Task,
  type WorkerId,
} from '@taskelith/execution';
import { InMemoryFleetRegistry, fleetToken, fleetWorker, type EnrolledWorker } from '@taskelith/fleet';
import { err, failure, ok, type Instant, type Result } from '@taskelith/kernel';
import { InMemoryLogSink, Logger } from '@taskelith/observability';
import { InMemoryTaskLineage, supersedeInTransaction, type Assignment, type WorkerPlacementRecord } from '@taskelith/scheduling';
import {
  InMemoryAdmissionRepository,
  InMemoryCurrentRevisions,
  InMemoryGateRepository,
  InMemoryOutbox,
  InMemoryRunCatalog,
  InMemoryWorkflowRunRepository,
  parseWorkflowDefinition,
  type TaskId,
} from '@taskelith/sdlc';
import { failed, value } from '@taskelith/testing';
import { inMemoryCapacity } from './in-memory-capacity.ts';

const DIGEST = `sha256:${'ab'.repeat(32)}`;
const definition = value(parseWorkflowDefinition({
  id: 'wf', version: '1', stages: [
    { id: 'specs', obligations: ['intake', 'specification'], origin: 'native', dependsOn: [] },
    { id: 'apply', obligations: ['implementation', 'review', 'verification', 'closure'], origin: 'native', dependsOn: ['specs'] },
  ],
}));
const binding = {
  pluginId: 'p', pluginVersion: '1', upstreamToolVersion: '1', workflowId: 'wf', workflowVersion: '1', workflowDigest: DIGEST,
  configurationRevision: 'c', policyRevision: 'r',
};
const WORKER = 'worker-1' as WorkerId;
const JOURNAL = 'journal-1';
const AT = '2026-10-25T09:00:00.000Z' as Instant;
const RECORD: WorkerPlacementRecord = {
  workerId: WORKER, enrolled: true, revoked: false, draining: false, reachable: false, slots: 2, cpuMillicores: 4000,
  memoryMebibytes: 8192, controls: [], protocolVersion: 1, admitted: true,
};

// One shared set of in-memory stores without rollback, so these tests take
// only paths whose effects the domain accepts; PostgreSQL runs the others.
async function fixture(enrolled: EnrolledWorker = fleetWorker(WORKER, JOURNAL)) {
  const tasks = new InMemoryTaskRepository();
  const lineage = new InMemoryTaskLineage();
  const outbox = new InMemoryOutbox();
  const capacity = inMemoryCapacity(tasks, lineage, [RECORD], outbox);
  const fleet = new InMemoryFleetRegistry(() => AT);
  value(await fleet.addToken(fleetToken('token-1')));
  value(await fleet.enroll(fleetToken('token-1').hash, enrolled));
  const transaction: ControlPlaneTransaction = {
    runs: new InMemoryWorkflowRunRepository(), catalog: new InMemoryRunCatalog(), admissions: new InMemoryAdmissionRepository(),
    gates: new InMemoryGateRepository(), tasks, lineage, ...capacity,
    evidence: new InMemoryEvidenceRecords(), producers: { heldGenerations: async () => ok([]) },
    fleet,
    revisions: new InMemoryCurrentRevisions(), launches: undefined as never,
    now: async () => AT,
  };
  const store: ControlPlaneStore = { transaction: (work) => work(transaction), readCommitted: (work) => work(transaction) };
  value(await new RunService(store, new WorkflowRegistry([{ definition, digest: DIGEST }])).createRun({ runId: 'run-1', projectId: 'project-1', binding }));
  const service = new ObservationService(store, {
    newConfirmationId: () => `confirmation-${++confirmationIds}`, newRequestId: () => `request-${++confirmationIds}`,
  });
  return { store, transaction, outbox, tasks: new TaskService(store), service, workerAdmissions: capacity.workerAdmissions };
}

let observed = 0;
let confirmationIds = 0;

function message(type: string, sequence: number, payload: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  const metadata = {
    observationId: `observation-${++observed}`, observationType: type, schemaVersion: 1, protocolVersion: 1, occurredAt: AT,
    correlationId: 'correlation-1', workerId: WORKER, journalId: JOURNAL, sequence, ...extra,
  };
  return { subjectWorkerId: WORKER as string, type, body: { metadata, payload } };
}

const DECLARATION = {
  capacity: { slots: 2, cpuMillicores: 4000, memoryMebibytes: 8192, enforceableControls: [] }, protocolVersions: { minimum: 1, maximum: 1 },
};

function confirmed(outbox: InMemoryOutbox): unknown[] {
  return outbox.messages.filter((sent) => sent.metadata.eventType === 'execution.observations.confirmed').map((sent) => sent.payload['confirmedThrough']);
}

test('a declaration makes the worker reachable and is confirmed; a repeat is a duplicate', async () => {
  const { service, transaction, outbox } = await fixture();
  const declared = message('worker.capacity.declared', 1, DECLARATION);
  assert.equal(value(await service.apply(declared)), 'applied');
  assert.equal(value(await service.apply(declared)), 'duplicate');
  const worker = await transaction.workers.get(WORKER);
  assert.deepEqual([worker?.reachable, worker?.lastContactAt], [true, AT]);
  assert.deepEqual(confirmed(outbox), [1, 1]);
  assert.deepEqual(await transaction.cursors.get(WORKER, JOURNAL as never), { workerId: WORKER, journalId: JOURNAL, confirmedThrough: 1, appliedAbove: [] });
});

test('a duplicate within the confirmed prefix confirms it again under a new identity, one above it does not', async () => {
  const { service, transaction, outbox } = await fixture();
  const first = message('worker.capacity.declared', 1, DECLARATION);
  const third = message('worker.admission-pressure.changed', 3, { causes: [] });
  value(await service.apply(first));
  value(await service.apply(third));
  const cursor = await transaction.cursors.get(WORKER, JOURNAL as never);
  assert.equal(value(await service.apply(first)), 'duplicate');
  assert.equal(value(await service.apply(third)), 'duplicate');
  assert.deepEqual(confirmed(outbox), [1, 1]);
  const [original, again] = outbox.messages.map((sent) => sent.metadata.eventId);
  assert.match(original!, /^o[0-9a-f]{64}$/);
  assert.equal(again, `confirmation-${confirmationIds}`);
  assert.deepEqual(await transaction.cursors.get(WORKER, JOURNAL as never), cursor);
});

test('a duplicate makes a worker that lost contact reachable again', async () => {
  const { service, transaction } = await fixture();
  const declared = message('worker.capacity.declared', 1, DECLARATION);
  value(await service.apply(declared));
  assert.deepEqual(value(await transaction.reports.markContactLost('2026-10-25T10:00:00.000Z' as Instant, 10)), [WORKER]);
  assert.equal(value(await service.apply(declared)), 'duplicate');
  assert.equal((await transaction.workers.get(WORKER))?.reachable, true);
});

test('a known identity at a new journal\'s next sequence advances its cursor without its effect', async () => {
  const { service, transaction, outbox } = await fixture();
  value(await service.apply(message('worker.capacity.declared', 1, DECLARATION)));
  value(await service.apply(message('worker.admission-pressure.changed', 2, { causes: [] }, { observationId: 'pressure-x' })));
  value(await service.apply(message('worker.admission-pressure.changed', 1, { causes: ['disk-floor'] }, { journalId: 'journal-2' })));
  const again = message('worker.admission-pressure.changed', 2, { causes: [] }, { observationId: 'pressure-x', journalId: 'journal-2' });
  assert.equal(value(await service.apply(again)), 'duplicate');
  assert.deepEqual(await transaction.workers.candidates(), [], 'its effect is not applied again');
  assert.deepEqual(await transaction.cursors.get(WORKER, 'journal-2' as never), {
    workerId: WORKER, journalId: 'journal-2', confirmedThrough: 2, appliedAbove: [],
  });
  assert.deepEqual(confirmed(outbox), [1, 2, 1, 2]);
  assert.equal(value(await service.apply(again)), 'duplicate');
  assert.deepEqual(confirmed(outbox), [1, 2, 1, 2, 2], 'a true repeat confirms the prefix again');
});

test('a journal replaced between finding a rollback and retiring it keeps the new incarnation reachable', async () => {
  const logs = new InMemoryLogSink();
  const { service: plain, store, transaction } = await fixture();
  const service = new ObservationService(store, { newConfirmationId: () => 'confirmation-y', newRequestId: () => 'request-y', logger: new Logger(logs, { now: () => AT }) });
  value(await service.apply(message('worker.capacity.declared', 1, DECLARATION)));
  const open = store.transaction;
  let opened = 0;
  (store as { transaction: ControlPlaneStore['transaction'] }).transaction = async (work) => {
    opened++;
    if (opened === 2) value(await plain.apply(message('worker.capacity.declared', 1, DECLARATION, { journalId: 'journal-2' })));
    return open(work);
  };
  assert.equal(failed(await service.apply(message('worker.capacity.declared', 1, DECLARATION))).details.reason, 'not-consumed');
  assert.equal(opened, 3, 'the rollback, the replacement, and the retirement');
  assert.equal((await transaction.workers.get(WORKER))?.reachable, true);
  assert.equal(value(await transaction.fleet.worker(WORKER))?.journalId, 'journal-2');
  assert.equal((await transaction.cursors.listByWorker(WORKER)).find(({ cursor }) => cursor.journalId === JOURNAL)?.retiredAt, AT);
  assert.deepEqual(logs.records.filter((record) => record.event === 'execution.journal.retired'), []);
});

type Fixture = Awaited<ReturnType<typeof fixture>>;

interface PlacedAttempt {
  readonly attemptId: AttemptId;
  readonly generation: number;
  readonly assignment: Assignment;
}

async function lastAttempt({ transaction }: Fixture, taskId = 'task-1'): Promise<PlacedAttempt> {
  const task = value(await transaction.tasks.get(taskId as TaskId));
  const attemptId = task.attempts.at(-1)!.id;
  const [assignment] = await transaction.assignments.listByAttempt(attemptId);
  return { attemptId, generation: task.ownershipGeneration, assignment: assignment! };
}

// Seeds an authorized execution of the attempt, as item 21d's launch will,
// and applies its exit after a proven start.
async function exitWith({ transaction, service }: Fixture, placed: PlacedAttempt, exit: { sequence: number; code: number }) {
  const executionId = `execution-${exit.sequence}` as ExecutionId;
  const execution: Execution = {
    id: executionId, assignmentId: placed.assignment.id, workerId: WORKER, state: 'authorized', grants: [], evidence: [], unauthorizedStarts: [],
  };
  const task = value(await transaction.tasks.get(placed.assignment.reservation.scope.taskId));
  const attempts = task.attempts.map((each) => (each.id === placed.attemptId ? { ...each, executions: [execution] } : each));
  value(await transaction.tasks.replace({ ...task, attempts, generation: (task.generation + 1) as never }, task.generation));
  const attemptOf = { attemptId: placed.attemptId, ownershipGeneration: placed.generation };
  return service.apply(message('execution.exited', exit.sequence, {
    executionId, recoveryEpoch: 1, status: { kind: 'code', code: exit.code }, startProven: true, spawnFailed: false, terminationEvidence: 'containment-empty',
  }, attemptOf));
}

function submit({ tasks }: Fixture, taskId: string) {
  return tasks.submitTask('run-1', { taskId, kind: 'planning', stageId: 'specs' }, 'c' as never);
}

test('a placed attempt is accepted, retried after a failed exit, and ends with a clean one', async () => {
  const placedFixture = await fixture();
  const { store, service, outbox, tasks } = placedFixture;
  value(await service.apply(message('worker.capacity.declared', 1, DECLARATION)));
  value(await submit(placedFixture, 'task-1'));
  // Past every retry's backoff from the attempts' end at AT.
  const placement = new PlacementService(store, { now: () => Date.parse(AT) + 60_000, draw: () => 0 });
  assert.equal(value(await placement.placeWaiting()).placed, 1);
  const first = await lastAttempt(placedFixture);
  assert.equal(value(await service.apply(message('execution.assignment.accepted', 2, {
    commandId: first.assignment.offerCommandId, assignmentId: first.assignment.id,
  }, { attemptId: first.attemptId, ownershipGeneration: first.generation }))), 'applied');
  assert.equal(value(await exitWith(placedFixture, first, { sequence: 3, code: 1 })), 'applied');
  const failed = value(await tasks.readTaskResult('run-1', 'task-1'));
  assert.deepEqual([failed.state, failed.state === 'ended' && failed.attemptId], ['ended', first.attemptId]);
  assert.equal(value(await placement.placeWaiting()).placed, 1);
  const retry = await lastAttempt(placedFixture);
  assert.equal(retry.assignment.reservation.retryOf, first.attemptId);
  assert.equal(value(await exitWith(placedFixture, retry, { sequence: 4, code: 0 })), 'applied');
  const result = value(await tasks.readTaskResult('run-1', 'task-1'));
  assert.deepEqual([result.state, result.state === 'ended' && result.attemptId], ['ended', retry.attemptId]);
  const ends = outbox.messages.filter((sent) => sent.metadata.eventType === 'execution.assignment.end');
  assert.equal(ends.length, 2);
  assert.deepEqual(confirmed(outbox), [1, 2, 3, 4]);
});

test('an automatic retry waits for its backoff from the retried attempt\'s end, while other tasks are placed', async () => {
  const placedFixture = await fixture();
  const { store, service } = placedFixture;
  value(await service.apply(message('worker.capacity.declared', 1, DECLARATION)));
  value(await submit(placedFixture, 'task-1'));
  // A draw of one half: the first retry's backoff is 7.5 s.
  const clock = { at: Date.parse(AT) };
  const placement = new PlacementService(store, { now: () => clock.at, draw: () => 0.5 });
  value(await placement.placeWaiting());
  const first = await lastAttempt(placedFixture);
  value(await exitWith(placedFixture, first, { sequence: 2, code: 1 }));
  value(await submit(placedFixture, 'task-2'));
  clock.at = Date.parse(AT) + 7_499;
  assert.deepEqual(value(await placement.placeWaiting()), { waiting: 2, placed: 1 }, 'only the other task');
  assert.deepEqual(value(await placement.placeWaiting()), { waiting: 0, placed: 0 }, 'the retry is not read before due');
  clock.at = Date.parse(AT) + 7_500;
  assert.deepEqual(value(await placement.placeWaiting()), { waiting: 1, placed: 1 });
  assert.equal((await lastAttempt(placedFixture)).assignment.reservation.retryOf, first.attemptId);
});

test('admission pressure makes the worker ineligible until it clears', async () => {
  const { service, transaction } = await fixture();
  value(await service.apply(message('worker.capacity.declared', 1, DECLARATION)));
  value(await service.apply(message('worker.admission-pressure.changed', 2, { causes: ['disk-floor'] })));
  assert.deepEqual(await transaction.workers.candidates(), []);
  value(await service.apply(message('worker.admission-pressure.changed', 3, { causes: [] })));
  assert.deepEqual(await transaction.workers.candidates(), [WORKER]);
});

const PASSED = { checkId: 'linux-containment', outcome: 'passed', details: [] };
const FAILED = { checkId: 'linux-containment', outcome: 'failed', details: ['cgroup v2 is not mounted'] };
const notApplicable = (reason: string) => ({ checkId: 'linux-containment', outcome: 'not-applicable', details: [reason] });

async function admissionOf({ workerAdmissions }: Fixture): Promise<[string | undefined, readonly SelfCheckResult[] | undefined]> {
  const [entry] = value(await workerAdmissions.workers()).workers;
  return [entry?.admission, entry?.results];
}

test('a failed self-check makes the worker ineligible, and a later passing report admits it again', async () => {
  const admitted = await fixture();
  const { service, transaction } = admitted;
  value(await service.apply(message('worker.capacity.declared', 1, DECLARATION)));
  assert.equal(value(await service.apply(message('worker.self-check.reported', 2, { results: [FAILED] }))), 'applied');
  assert.deepEqual(await transaction.workers.candidates(), []);
  assert.deepEqual(await admissionOf(admitted), ['self-check-failed', [FAILED]]);
  value(await service.apply(message('worker.self-check.reported', 3, { results: [PASSED] })));
  assert.deepEqual(await transaction.workers.candidates(), [WORKER]);
  assert.deepEqual(await admissionOf(admitted), ['admitted', [PASSED]]);
});

test('a new journal incarnation awaits its own self-check before placement', async () => {
  const admitted = await fixture();
  const { service, transaction } = admitted;
  value(await service.apply(message('worker.capacity.declared', 1, DECLARATION)));
  value(await service.apply(message('worker.self-check.reported', 2, { results: [PASSED] })));
  value(await service.apply(message('worker.capacity.declared', 1, DECLARATION, { journalId: 'journal-2' })));
  assert.deepEqual(await transaction.workers.candidates(), []);
  assert.deepEqual(await admissionOf(admitted), ['awaiting-self-check', []]);
  value(await service.apply(message('worker.self-check.reported', 2, { results: [PASSED] }, { journalId: 'journal-2' })));
  assert.deepEqual(await transaction.workers.candidates(), [WORKER]);
});

test('the control plane admits a macOS worker without the check, and refutes a Linux worker\'s claim', async () => {
  const linux = await fixture();
  value(await linux.service.apply(message('worker.self-check.reported', 1, { results: [notApplicable('platform-not-covered')] })));
  const [state, results] = await admissionOf(linux);
  assert.equal(state, 'self-check-failed');
  assert.match(results?.[0]?.details[0] ?? '', /^not-applicable without a recognised reason/);
  const macos = await fixture(fleetWorker(WORKER, JOURNAL, { host: { platform: 'darwin', architecture: 'arm64', hostname: 'mac-1' } }));
  value(await macos.service.apply(message('worker.self-check.reported', 1, { results: [notApplicable('platform-not-covered')] })));
  assert.deepEqual(await admissionOf(macos), ['admitted', [notApplicable('platform-not-covered')]]);
});

test('a report naming a check twice, alike or not, never leaves the worker admitted', async () => {
  const admitted = await fixture();
  const { service, transaction } = admitted;
  const repeated = { checkId: 'linux-containment', outcome: 'failed', details: ['the check was reported more than once'] };
  value(await service.apply(message('worker.capacity.declared', 1, DECLARATION)));
  value(await service.apply(message('worker.self-check.reported', 2, { results: [PASSED] })));
  for (const [index, results] of [[PASSED, PASSED], [PASSED, FAILED]].entries()) {
    assert.equal(value(await service.apply(message('worker.self-check.reported', index + 3, { results }))), 'applied');
    assert.deepEqual(await admissionOf(admitted), ['self-check-failed', [repeated]]);
    assert.deepEqual(await transaction.workers.candidates(), []);
  }
});

test('an offer refused after a failed self-check releases its assignment for another worker', async () => {
  const placedFixture = await fixture();
  const { store, service } = placedFixture;
  value(await service.apply(message('worker.capacity.declared', 1, DECLARATION)));
  value(await submit(placedFixture, 'task-1'));
  value(await new PlacementService(store, { now: () => Date.parse(AT), draw: () => 0 }).placeWaiting());
  const placed = await lastAttempt(placedFixture);
  assert.equal(value(await service.apply(message('execution.assignment.refused', 2, {
    commandId: placed.assignment.offerCommandId, assignmentId: placed.assignment.id, reason: 'worker-self-check-failed', retryable: false,
  }, { attemptId: placed.attemptId, ownershipGeneration: placed.generation }))), 'applied');
  const [refused] = await placedFixture.transaction.assignments.listByAttempt(placed.attemptId);
  assert.deepEqual([refused?.end?.reason, refused?.end?.reason === 'refused' && refused.end.refusal], ['refused', 'worker-self-check-failed']);
});

test('a failed self-check frees an accepted assignment that holds no grant', async () => {
  const placedFixture = await fixture();
  const { store, service, outbox } = placedFixture;
  value(await service.apply(message('worker.capacity.declared', 1, DECLARATION)));
  value(await submit(placedFixture, 'task-1'));
  value(await new PlacementService(store, { now: () => Date.parse(AT), draw: () => 0 }).placeWaiting());
  const placed = await lastAttempt(placedFixture);
  value(await service.apply(message('execution.assignment.accepted', 2, {
    commandId: placed.assignment.offerCommandId, assignmentId: placed.assignment.id,
  }, { attemptId: placed.attemptId, ownershipGeneration: placed.generation })));
  value(await service.apply(message('worker.self-check.reported', 3, { results: [FAILED] })));
  const [freed] = await placedFixture.transaction.assignments.listByAttempt(placed.attemptId);
  assert.deepEqual([freed?.end?.reason, freed?.reservation.state], ['superseded', 'released']);
  const ends = outbox.messages.filter((sent) => sent.metadata.eventType === 'execution.assignment.end');
  assert.deepEqual(ends.map((sent) => (sent.payload['payload'] as { assignmentId?: string }).assignmentId), [placed.assignment.id]);
  assert.deepEqual(await placedFixture.transaction.assignments.listUnfinishedByWorker(WORKER), []);
});

test('a late failed report below the fence neither changes admission nor frees an assignment', async () => {
  const placedFixture = await fixture();
  const { store, service, outbox } = placedFixture;
  value(await service.apply(message('worker.capacity.declared', 1, DECLARATION)));
  value(await service.apply(message('worker.self-check.reported', 4, { results: [PASSED] })));
  value(await submit(placedFixture, 'task-1'));
  value(await new PlacementService(store, { now: () => Date.parse(AT), draw: () => 0 }).placeWaiting());
  const placed = await lastAttempt(placedFixture);
  value(await service.apply(message('execution.assignment.accepted', 5, {
    commandId: placed.assignment.offerCommandId, assignmentId: placed.assignment.id,
  }, { attemptId: placed.attemptId, ownershipGeneration: placed.generation })));
  assert.equal(value(await service.apply(message('worker.self-check.reported', 2, { results: [FAILED] }))), 'applied');
  assert.deepEqual(await admissionOf(placedFixture), ['admitted', [PASSED]]);
  const unfinished = await placedFixture.transaction.assignments.listUnfinishedByWorker(WORKER);
  assert.deepEqual(unfinished.map((assignment) => assignment.id), [placed.assignment.id]);
  assert.equal(outbox.messages.filter((sent) => sent.metadata.eventType === 'execution.assignment.end').length, 0);
});

// Authorizes and starts an execution under the placed attempt, as the
// launch authority and the worker's start report would.
async function startedUnder({ transaction }: Fixture, placed: PlacedAttempt): Promise<ExecutionId> {
  const task = value(await transaction.tasks.get(placed.assignment.reservation.scope.taskId));
  const admission = value(await transaction.admissions.get(task.admissionId));
  const recoveryEpoch = value(parseRecoveryEpoch(1));
  const installation = { recoveryEpoch, quarantined: false };
  const executionId = 'execution-running' as ExecutionId;
  const launchAuthId = 'launch-running' as LaunchAuthId;
  const scope = { assignmentId: placed.assignment.id, attemptId: placed.attemptId, workerId: WORKER, ownershipGeneration: task.ownershipGeneration };
  const authorization = authorizeLaunch(task, {
    ...scope, operationId: 'operation-running' as OperationId, recoveryEpoch, executionId,
    admissionId: task.admissionId, admissionGeneration: admission.generation, reportsNotStarted: false,
  }, {
    installation, workerAuthorized: true, assignment: { ...scope, active: true },
    reservation: { state: 'held', attemptId: placed.attemptId, workerId: WORKER },
    admission, definition, gates: [], currentRevisions: [], policyRevision: binding.policyRevision as never,
  }, { launchAuthId, issuedAt: AT, parameters: value(parseLaunchParameters({ ttlMilliseconds: 30_000, skewMilliseconds: 5_000 })) });
  assert.ok(authorization.ok);
  const { task: authorized, grant } = authorization.value;
  const started = value(recordStartObservation(authorized, { workerId: WORKER, launchAuthId, executionId, recoveryEpoch }, { installation, grant }, AT));
  assert.equal(started.decision, 'started');
  // Two domain steps, one stored write.
  value(await transaction.tasks.replace({ ...started.task, generation: (task.generation + 1) as never }, task.generation));
  return executionId;
}

function executionOf(task: Task, executionId: ExecutionId): Execution | undefined {
  return task.attempts.flatMap((attempt) => attempt.executions).find((execution) => execution.id === executionId);
}

test('a running execution keeps its ownership, reservation, and grant through a failed self-check and ends normally', async () => {
  const placedFixture = await fixture();
  const { store, service, tasks, transaction, outbox } = placedFixture;
  value(await service.apply(message('worker.capacity.declared', 1, DECLARATION)));
  value(await submit(placedFixture, 'task-1'));
  value(await new PlacementService(store, { now: () => Date.parse(AT), draw: () => 0 }).placeWaiting());
  const placed = await lastAttempt(placedFixture);
  value(await service.apply(message('execution.assignment.accepted', 2, {
    commandId: placed.assignment.offerCommandId, assignmentId: placed.assignment.id,
  }, { attemptId: placed.attemptId, ownershipGeneration: placed.generation })));
  const executionId = await startedUnder(placedFixture, placed);
  const commandsBefore = outbox.messages.length;
  value(await service.apply(message('worker.self-check.reported', 3, { results: [FAILED] })));

  const task = value(await transaction.tasks.get(placed.assignment.reservation.scope.taskId));
  const execution = executionOf(task, executionId);
  assert.deepEqual([task.ownershipGeneration, task.attempts.at(-1)?.id], [placed.generation, placed.attemptId], 'ownership');
  assert.deepEqual([execution?.state, execution?.grants.map((grant) => grant.state)], ['started', ['granted']], 'grant');
  const kept = (await lastAttempt(placedFixture)).assignment;
  assert.deepEqual([kept.end, kept.reservation.state], [undefined, 'held'], 'assignment and reservation');
  const sent = outbox.messages.slice(commandsBefore).map((each) => each.metadata.eventType);
  assert.deepEqual(sent.filter((type) => type !== 'execution.observations.confirmed'), [], 'no cancellation or assignment end');
  const request = { assignmentId: placed.assignment.id, commandId: 'supersede-1' as never, correlationId: 'correlation-1' as never };
  assert.equal(failed(await supersedeInTransaction(transaction, request)).code, 'precondition-failed', 'not superseded');

  assert.equal(value(await service.apply(message('execution.exited', 4, {
    executionId, recoveryEpoch: 1, status: { kind: 'code', code: 0 }, startProven: true, spawnFailed: false, terminationEvidence: 'containment-empty',
  }, { attemptId: placed.attemptId, ownershipGeneration: placed.generation }))), 'applied');
  const result = value(await tasks.readTaskResult('run-1', 'task-1'));
  assert.deepEqual([result.state, result.state === 'ended' && result.attemptId], ['ended', placed.attemptId]);
});

// Launch records over the in-memory tasks, which keep every grant.
function taskLaunches(tasks: InMemoryTaskRepository): LaunchRecords {
  const rejections: RecordedRejection[] = [];
  const recorded = (task: Task, grant: LaunchGrant): RecordedLaunch => ({
    launchAuthId: grant.launchAuthId, taskId: task.id, attemptId: grant.attemptId, assignmentId: grant.assignmentId,
    executionId: grant.executionId, workerId: grant.workerId,
  });
  const grants = () => tasks.all().flatMap((task) => task.attempts.flatMap((attempt) => attempt.executions)
    .flatMap((execution) => execution.grants.map((grant) => recorded(task, grant))));
  return {
    byOperation: async (workerId, operationId) => ok(tasks.all().flatMap((task) => task.attempts.flatMap((attempt) => attempt.executions)
      .flatMap((execution) => execution.grants).filter((grant) => grant.workerId === workerId && grant.operationId === operationId)
      .map((grant) => recorded(task, grant)))[0]),
    byLaunchAuthId: async (launchAuthId) => ok(grants().find((grant) => grant.launchAuthId === launchAuthId)),
    liveGrants: async () => ok([]),
    rejection: async (workerId, operationId) => ok(rejections.find(({ request }) => request.workerId === workerId && request.operationId === operationId)),
    recordRejection: async (rejection) => { rejections.push(rejection); return ok(undefined); },
  };
}

test('only an admitted worker gets a new launch grant, and a recorded grant is still replayed', async () => {
  const placedFixture = await fixture();
  const { store, service, transaction } = placedFixture;
  (transaction as { launches: LaunchRecords }).launches = taskLaunches(transaction.tasks as InMemoryTaskRepository);
  let issued = 0;
  const authority = new LaunchAuthority(store, {
    workflows: new WorkflowRegistry([{ definition, digest: DIGEST }]), newLaunchAuthId: () => `launch-${++issued}`,
    parameters: value(parseLaunchParameters({ ttlMilliseconds: 600_000, skewMilliseconds: 5_000 })),
  });
  value(await service.apply(message('worker.capacity.declared', 1, DECLARATION)));
  value(await service.apply(message('worker.self-check.reported', 2, { results: [PASSED] })));
  value(await submit(placedFixture, 'task-1'));
  value(await new PlacementService(store, { now: () => Date.parse(AT), draw: () => 0 }).placeWaiting());
  const placed = await lastAttempt(placedFixture);
  const task = value(await transaction.tasks.get(placed.assignment.reservation.scope.taskId));
  const admission = value(await transaction.admissions.get(task.admissionId));
  const request = (operation: string, execution: string): LaunchAuthorizationRequest => ({
    operationId: operation as OperationId, recoveryEpoch: value(parseRecoveryEpoch(1)), assignmentId: placed.assignment.id,
    attemptId: placed.attemptId, ownershipGeneration: task.ownershipGeneration, executionId: execution as ExecutionId,
    admissionId: task.admissionId, admissionGeneration: admission.generation, reportsNotStarted: false,
  });
  const principal = { workerId: WORKER, generation: 1 };
  assert.equal(value(await authority.authorize(principal, request('operation-1', 'execution-1'))).kind, 'granted');

  value(await service.apply(message('worker.self-check.reported', 3, { results: [FAILED] })));
  const refused = value(await authority.authorize(principal, request('operation-2', 'execution-2')));
  assert.deepEqual(refused.kind === 'rejected' && [refused.rejection.reason, refused.rejection.retryable], ['worker-not-authorized', false]);
  const replayed = value(await authority.authorize(principal, request('operation-1', 'execution-1')));
  assert.deepEqual([replayed.kind, replayed.kind === 'granted' && replayed.grant.launchAuthId], ['granted', 'launch-1']);
});

test('what no effect consumes, or cannot authenticate, is not consumed', async () => {
  const { service, transaction } = await fixture(fleetWorker(WORKER, JOURNAL, { revokedAt: AT }));
  const reason = async (answer: Promise<Result<unknown>>) => failed(await answer).details.reason;
  assert.equal(await reason(service.apply({ subjectWorkerId: WORKER, type: 'worker.inventory.reported', body: {} })), 'not-consumed');
  assert.equal(await reason(service.apply(message('execution.unknown', 1, {}))), 'not-consumed');
  assert.equal(await reason(service.apply(message('worker.capacity.declared', 1, DECLARATION, { journalId: 'journal-2' }))), 'not-consumed');
  assert.equal(value(await transaction.fleet.worker(WORKER))?.journalId, JOURNAL, 'a revoked worker never replaces its journal');
  assert.equal((await transaction.workers.get(WORKER))?.reachable, false, 'a revoked worker makes no contact');
  assert.equal(failed(await service.apply(message('worker.capacity.declared', 0, DECLARATION))).code, 'invalid');
  assert.equal(failed(await service.apply(message('worker.capacity.declared', 1, DECLARATION, { observationId: 'bad id' }))).code, 'invalid');
  assert.equal(failed(await service.apply(message('worker.capacity.declared', 1, DECLARATION, { correlationId: 'bad id' }))).code, 'invalid');
});

test('an unrecorded process is recorded once for the reconciliation queue', async () => {
  const { service, transaction } = await fixture();
  const unrecorded = message('execution.unrecorded-process', 1, { containment: 'cgroup x', recoveryEpoch: 1, processes: [{ pid: 7, startedAt: AT }] });
  assert.equal(value(await service.apply(unrecorded)), 'applied');
  assert.equal(value(await service.apply(unrecorded)), 'duplicate');
  const recorded = await transaction.reconciliation.unrecordedProcessesOfWorker(WORKER);
  assert.deepEqual(recorded.map(({ journalId, containment, processCount, recordedAt }) => [journalId, containment, processCount, recordedAt]), [
    [JOURNAL, 'cgroup x', 1, AT],
  ]);
});

// Each transaction answers from a script, as a store that rolled back.
function scriptedStore(answers: Result<unknown>[]): ControlPlaneStore & { opened: number } {
  const store = {
    opened: 0,
    transaction: async () => {
      store.opened++;
      return answers.shift()!;
    },
    readCommitted: async () => err(failure('internal', 'not read')),
  };
  return store as never;
}

test('a refused effect is recorded again without it and logged; an outage is returned for redelivery', async () => {
  const stale = err(failure('conflict', 'stale', { reason: 'stale-ownership-generation' }));
  const store = scriptedStore([stale, ok('rejected'), err(failure('unavailable', 'down')), err(failure('unavailable', 'down'))]);
  const logs = new InMemoryLogSink();
  const service = new ObservationService(store, { newConfirmationId: () => 'confirmation-x', newRequestId: () => 'request-x', logger: new Logger(logs, { now: () => AT }) });
  const accepted = message('execution.assignment.accepted', 1, { commandId: 'c', assignmentId: 's' }, { attemptId: 'a', ownershipGeneration: 2 });
  assert.equal(value(await service.apply(accepted)), 'rejected');
  assert.deepEqual(logs.records.map((record) => [record.event, record.fields.reason, record.correlation.observationId]), [
    ['execution.observation.rejected', 'stale-ownership-generation', accepted.body.metadata.observationId],
  ]);
  assert.equal(failed(await service.apply(accepted)).code, 'unavailable');
  assert.equal(failed(await service.apply(message('execution.started', 2, {}))).code, 'unavailable', 'contact failed');
  assert.equal(store.opened, 4);
});

// The first transaction refuses as a rolled-back store would; the others run.
function refusingOnce(store: ControlPlaneStore, refusal: Result<never>): ControlPlaneStore {
  let refused = false;
  return {
    ...store,
    transaction: (work) => {
      if (refused) return store.transaction(work);
      refused = true;
      return Promise.resolve(refusal);
    },
  };
}

const REFUSED_EVIDENCE = [
  ['execution.launch.rejected', 'stale-ownership-generation', 'worker-1', true],
  ['execution.exited', 'stale-ownership-generation', 'worker-1', true],
  ['execution.launch.rejected', 'stale-ownership-generation', 'worker-2', false],
  ['execution.exited', 'stale-ownership-generation', 'worker-2', false],
  ['execution.assignment.accepted', 'stale-ownership-generation', 'worker-1', false],
  ['execution.launch.rejected', undefined, 'worker-1', false],
] as const;

for (const [type, reason, holder, clears] of REFUSED_EVIDENCE) {
  const refused = `${type} for ${reason ?? 'another reason'} of ${holder}'s assignment`;
  test(`a rejected ${refused} ${clears ? 'clears' : 'keeps'} the capacity refusal`, async () => {
    const placedFixture = await fixture();
    const { store, transaction, service } = placedFixture;
    value(await service.apply(message('worker.capacity.declared', 1, DECLARATION)));
    value(await submit(placedFixture, 'task-1'));
    value(await new PlacementService(store, { now: () => Date.parse(AT), draw: () => 0 }).placeWaiting());
    const { attemptId, assignment } = await lastAttempt(placedFixture);
    if (holder !== WORKER) value(await transaction.assignments.replace({ ...assignment, workerId: holder as WorkerId, generation: (assignment.generation + 1) as never }, assignment.generation));
    value(await transaction.reports.markCapacityRefused(WORKER, 2 as never, AT));
    assert.deepEqual(await transaction.workers.candidates(), []);
    const refusal = err(failure('conflict', 'refused', reason === undefined ? {} : { reason }));
    const refusing = new ObservationService(refusingOnce(store, refusal), { newConfirmationId: () => 'confirmation-r', newRequestId: () => 'request-r' });
    const payload = { assignmentId: assignment.id, executionId: 'execution-r', recoveryEpoch: 1 };
    assert.equal(value(await refusing.apply(message(type, 3, payload, { attemptId, ownershipGeneration: 1 }))), 'rejected');
    assert.deepEqual(await transaction.workers.candidates(), clears ? [WORKER] : []);
  });
}
