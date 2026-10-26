import assert from 'node:assert/strict';
import test from 'node:test';
import {
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
  type AttemptId,
  type Execution,
  type ExecutionId,
  type WorkerId,
} from '@taskelith/execution';
import { InMemoryFleetRegistry, fleetToken, fleetWorker, type EnrolledWorker } from '@taskelith/fleet';
import { err, failure, ok, type Instant, type Result } from '@taskelith/kernel';
import { InMemoryLogSink, Logger } from '@taskelith/observability';
import { InMemoryTaskLineage, type Assignment, type WorkerPlacementRecord } from '@taskelith/scheduling';
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
  memoryMebibytes: 8192, controls: [], protocolVersion: 1,
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
  return { store, transaction, outbox, tasks: new TaskService(store), service };
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
