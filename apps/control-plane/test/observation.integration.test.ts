import assert from 'node:assert/strict';
import { after, beforeEach, describe, test } from 'node:test';
import pg from 'pg';
import { checkMessageSchema } from '@taskelith/contracts';
import {
  DelegationService,
  HeartbeatService,
  InventoryService,
  LaunchRevokingFleetRegistry,
  ObservationService,
  PlacementService,
  RunService,
  TaskService,
  WorkflowRegistry,
  type ControlPlaneStore,
  type ControlPlaneTransaction,
} from '@taskelith/control-plane';
import {
  openAttempt,
  requestCancellation,
  type AssignmentId,
  type AttemptId,
  type ExecutionId,
  type LaunchGrant,
  type Task,
  type WorkerId,
} from '@taskelith/execution';
import { fleetToken, fleetWorker } from '@taskelith/fleet';
import { MAX_IDENTIFIER_LENGTH, err, failure, ok, type CorrelationId, type EventId, type Instant, type Result } from '@taskelith/kernel';
import { InMemoryLogSink, Logger } from '@taskelith/observability';
import { PostgresDatabase, migrate, type PostgresTransaction } from '@taskelith/postgres';
import { DEFAULT_ATTEMPT_REQUEST, placeInTransaction, type Assignment, type ReservationId } from '@taskelith/scheduling';
import { parseWorkflowDefinition, type TaskId } from '@taskelith/sdlc';
import { failed, integrationEndpoint, value } from '@taskelith/testing';
import { issueGrant, launchAuthority } from './launch-fixtures.ts';

const POSTGRES = integrationEndpoint('TASKELITH_POSTGRES_URL');
const databaseName = `taskelith_observation_${process.pid}`;
const url = new URL(POSTGRES);
url.pathname = `/${databaseName}`;
const admin = new pg.Client({ connectionString: POSTGRES.href });
await admin.connect();
await admin.query(`CREATE DATABASE ${databaseName}`);
value(await migrate(url));
const database = new PostgresDatabase(url);

after(async () => {
  await database.close();
  await admin.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
  await admin.end();
});

async function sql<Row extends pg.QueryResultRow>(text: string, values: unknown[] = []): Promise<Row[]> {
  const client = new pg.Client({ connectionString: url.href });
  await client.connect();
  try {
    return (await client.query<Row>(text, values)).rows;
  } finally {
    await client.end();
  }
}

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
const TABLES = [
  'workflow_runs', 'gates', 'admissions', 'tasks', 'assignments', 'outbox', 'inbox', 'task_lineage', 'capacity_charges', 'delegations',
  'capacity_quotas', 'workers', 'installation', 'enrollment_tokens', 'delegation_requests', 'current_revisions', 'producer_cursors',
  'inventory_requests', 'inventory_report_parts', 'launch_authorizations', 'launch_rejections', 'broker_revocations', 'unrecorded_processes',
];
const CORRELATION = 'correlation-1' as CorrelationId;
const WORKER = 'worker-a';
const JOURNAL = 'journal-a';
// Placement's clock runs ahead by `skew`, so a test can let a retry's
// backoff pass; each test starts without skew.
const clock = { skew: 0 };
const TIMING = { now: () => Date.now() + clock.skew, draw: () => 0 };
const tasks = new TaskService(database);
const authority = launchAuthority(database, undefined, new WorkflowRegistry([{ definition, digest: DIGEST }]));
let logs: InMemoryLogSink;
let service: ObservationService;
let placement: PlacementService;
let observed = 0;
let confirmationIds = 0;

function observationService(store: ControlPlaneStore, logger?: Logger): ObservationService {
  return new ObservationService(store, {
    newConfirmationId: () => `confirmation-${++confirmationIds}`, newRequestId: () => `request-${++confirmationIds}`,
    ...(logger === undefined ? {} : { logger }),
  });
}

beforeEach(async () => {
  logs = new InMemoryLogSink();
  service = observationService(database, new Logger(logs, { now: () => '2026-10-25T09:00:00.000Z' as never }));
  clock.skew = 0;
  placement = new PlacementService(database, TIMING);
  await sql(`TRUNCATE ${TABLES.join(', ')}`);
  await sql('INSERT INTO installation (quarantined, recovery_epoch) VALUES (false, 1)');
  value(await new RunService(database, new WorkflowRegistry([{ definition, digest: DIGEST }])).createRun({ runId: 'run-1', projectId: 'project-1', binding }));
});

// Enrolled and, as enrollment leaves it, not yet reachable.
async function enroll(workerId = WORKER, journalId = JOURNAL, slots = 2): Promise<void> {
  const worker = fleetWorker(workerId, journalId, { capacity: { slots, cpuMillicores: 4000, memoryMebibytes: 8192, controls: [] } });
  value(await database.transaction(async (tx) => {
    const added = await tx.fleet.addToken(fleetToken(`token-${workerId}`));
    return added.ok ? tx.fleet.enroll(`token-${workerId}` as never, worker) : added;
  }));
}

interface Sent {
  readonly sequence: number;
  readonly observationId?: string;
  readonly workerId?: string;
  readonly subjectWorkerId?: string;
  readonly journalId?: string;
  readonly attemptId?: string;
  readonly ownershipGeneration?: number;
}

function observe(type: string, sent: Sent, payload: Record<string, unknown>) {
  const workerId = sent.workerId ?? WORKER;
  const metadata = {
    observationId: sent.observationId ?? `observation-${++observed}`, observationType: type, schemaVersion: 1, protocolVersion: 1,
    occurredAt: '2026-10-25T09:00:00.000Z', correlationId: 'correlation-o', workerId, journalId: sent.journalId ?? JOURNAL,
    sequence: sent.sequence,
    ...(sent.attemptId === undefined ? {} : { attemptId: sent.attemptId, ownershipGeneration: sent.ownershipGeneration }),
  };
  return service.apply({ subjectWorkerId: sent.subjectWorkerId ?? workerId, type, body: { metadata, payload } });
}

const CAPACITY = { slots: 2, cpuMillicores: 4000, memoryMebibytes: 8192, enforceableControls: [] };

function declare(sequence: number, capacity: Partial<typeof CAPACITY> = {}, workerId = WORKER) {
  return observe('worker.capacity.declared', { sequence, workerId }, {
    capacity: { ...CAPACITY, ...capacity }, protocolVersions: { minimum: 1, maximum: 1 },
  });
}

function pressure(sequence: number, causes: string[], observationId?: string) {
  return observe('worker.admission-pressure.changed', { sequence, ...(observationId === undefined ? {} : { observationId }) }, { causes });
}

interface Placed {
  readonly taskId: TaskId;
  readonly attemptId: AttemptId;
  readonly generation: number;
  readonly assignment: Assignment;
}

async function stored(taskId: string): Promise<Task> {
  return value(await database.transaction((tx) => tx.tasks.get(taskId as TaskId)));
}

async function heldAssignment(attemptId: AttemptId): Promise<Assignment> {
  const assignments = await database.transaction(async (tx) => ok(await tx.assignments.listByAttempt(attemptId)));
  const held = value(assignments).find((assignment) => assignment.reservation.state === 'held');
  assert.ok(held, `attempt ${attemptId} holds no reservation`);
  return held;
}

// Submits the task, places it in one pass, and answers its attempt.
async function placed(taskId = 'task-1'): Promise<Placed> {
  value(await tasks.submitTask('run-1', { taskId, kind: 'planning', stageId: 'specs' }, CORRELATION));
  return placeAgain(taskId);
}

async function placeAgain(taskId: string): Promise<Placed> {
  assert.equal(value(await placement.placeWaiting()).placed >= 1, true, 'placed');
  const task = await stored(taskId);
  const attemptId = task.attempts.at(-1)!.id;
  return { taskId: task.id, attemptId, generation: task.ownershipGeneration, assignment: await heldAssignment(attemptId) };
}

// Submits the task and places its first attempt under the given identifier.
async function placedAs(taskId: string, assignmentId: string): Promise<Placed> {
  value(await tasks.submitTask('run-1', { taskId, kind: 'planning', stageId: 'specs' }, CORRELATION));
  const attemptId = `attempt-${taskId}` as AttemptId;
  const outcome = value(await database.transaction(async (tx) => {
    const task = await tx.tasks.get(taskId as TaskId);
    if (!task.ok) return task;
    const opened = openAttempt(task.value, task.value.ownershipGeneration, { id: attemptId }, await tx.now());
    if (!opened.ok) return opened;
    const { ownershipGeneration } = opened.value;
    const replaced = await tx.tasks.replace(opened.value, task.value.generation);
    if (!replaced.ok) return replaced;
    return placeInTransaction(tx, {
      commandId: `offer-${taskId}` as EventId, correlationId: CORRELATION, assignmentId: assignmentId as AssignmentId,
      reservationId: `reservation-${taskId}` as ReservationId, taskId: taskId as TaskId, attemptId, ownershipGeneration,
      workerId: WORKER as WorkerId, requested: DEFAULT_ATTEMPT_REQUEST, providerCredentials: [],
    });
  }));
  assert.equal(outcome.kind, 'placed');
  return { taskId: taskId as TaskId, attemptId, generation: (await stored(taskId)).ownershipGeneration, assignment: await heldAssignment(attemptId) };
}

function accept(sequence: number, at: Placed, generation = at.generation, observationId?: string) {
  const sent = { sequence, attemptId: at.attemptId, ownershipGeneration: generation, ...(observationId === undefined ? {} : { observationId }) };
  return observe('execution.assignment.accepted', sent, {
    commandId: at.assignment.offerCommandId, assignmentId: at.assignment.id,
  });
}

function refuse(sequence: number, at: Placed, reason: string) {
  const pressured = reason === 'worker-admission-pressure';
  return observe('execution.assignment.refused', { sequence, attemptId: at.attemptId, ownershipGeneration: at.generation }, {
    commandId: at.assignment.offerCommandId, assignmentId: at.assignment.id, reason, retryable: pressured,
    ...(pressured ? { pressureCauses: ['disk-floor'] } : {}),
  });
}

// The grant of the attempt's execution, issued by the launch authority.
function grant(at: Placed, executionId = `execution-${at.attemptId}`): Promise<LaunchGrant> {
  const target = { taskId: at.taskId, attemptId: at.attemptId, generation: at.generation, assignmentId: at.assignment.id };
  return issueGrant(authority, database, target, WORKER as WorkerId, executionId);
}

async function launch(at: Placed, executionId?: string): Promise<ExecutionId> {
  return (await grant(at, executionId)).executionId;
}

const PROCESS = { platform: 'linux', bootId: 'boot-1', pid: 42, startTime: 7, processGroupId: 42 };

interface Start {
  readonly executionId: string;
  readonly launchAuthId: string;
  readonly recoveryEpoch?: number;
  readonly workerId?: string;
  readonly journalId?: string;
  readonly generation?: number;
}

function started(sequence: number, at: Placed, start: Start) {
  const { workerId, journalId, generation = at.generation } = start;
  const sent = { sequence, attemptId: at.attemptId, ownershipGeneration: generation, ...(workerId === undefined ? {} : { workerId }),
    ...(journalId === undefined ? {} : { journalId }) };
  return observe('execution.started', sent, {
    executionId: start.executionId, assignmentId: at.assignment.id, launchAuthId: start.launchAuthId, recoveryEpoch: start.recoveryEpoch ?? 1,
    process: PROCESS,
  });
}

function launchRejected(sequence: number, at: Placed, reason: string, generation = at.generation) {
  return observe('execution.launch.rejected', { sequence, attemptId: at.attemptId, ownershipGeneration: generation }, {
    executionId: `execution-${at.attemptId}`, assignmentId: at.assignment.id, operationId: `operation-${sequence}`, reason,
  });
}

function exit(sequence: number, at: Placed, executionId: ExecutionId, code: number, startProven = true) {
  const payload = startProven
    ? { executionId, status: { kind: 'code', code }, startProven: true, spawnFailed: false, terminationEvidence: 'containment-empty' }
    : { executionId, status: { kind: 'unknown' }, startProven: false, spawnFailed: true, spawnFailure: 'spawn failed', terminationEvidence: 'never-spawned' };
  return observe('execution.exited', { sequence, attemptId: at.attemptId, ownershipGeneration: at.generation }, payload);
}

async function cursor(): Promise<{ confirmed_through: string; applied_above: string[] } | undefined> {
  return (await sql<{ confirmed_through: string; applied_above: string[] }>('SELECT confirmed_through, applied_above FROM producer_cursors'))[0];
}

async function messages(eventType: string): Promise<Record<string, unknown>[]> {
  const rows = await sql<{ message: string }>('SELECT message FROM outbox WHERE event_type = $1 ORDER BY position', [eventType]);
  return rows.map((row) => JSON.parse(row.message).payload);
}

async function outboxEvents(): Promise<string[]> {
  return (await sql<{ event_id: string }>('SELECT event_id FROM outbox ORDER BY position')).map((row) => row.event_id);
}

async function confirmations(): Promise<number[]> {
  return (await messages('execution.observations.confirmed')).map((payload) => payload.confirmedThrough as number);
}

async function worker(workerId = WORKER): Promise<Record<string, unknown>> {
  return (await sql(`SELECT reachable, last_contact_at, slots, protocol_version, admission_pressure_since, capacity_refused_since,
    capacity_sequence, pressure_sequence, capacity_refusal_sequence, protocol_sequence FROM workers WHERE worker_id = $1`, [workerId]))[0]!;
}

async function result(taskId: string) {
  return value(await tasks.readTaskResult('run-1', taskId));
}

describe('consumption', () => {
  test('a new worker\'s first declaration makes it reachable and eligible, and is confirmed', async () => {
    await enroll();
    assert.equal(value(await declare(1, { slots: 3 })), 'applied');
    const declared = await worker();
    assert.deepEqual([declared.reachable, declared.slots, declared.protocol_version, declared.capacity_sequence], [true, 3, 1, '1']);
    assert.ok(declared.last_contact_at instanceof Date);
    assert.deepEqual(await cursor(), { confirmed_through: '1', applied_above: [] });
    const [confirmation] = await messages('execution.observations.confirmed');
    assert.ok(checkMessageSchema('ObservationsConfirmed', confirmation).ok, JSON.stringify(confirmation));
    assert.deepEqual([confirmation?.workerId, confirmation?.journalId, confirmation?.confirmedThrough], [WORKER, JOURNAL, 1]);
    const [row] = await sql<{ event_id: string }>("SELECT event_id FROM outbox WHERE event_type = 'execution.observations.confirmed'");
    assert.match(row!.event_id, /^o[0-9a-f]{64}$/);
    assert.deepEqual(value(await database.readCommitted(async (tx) => ok(await tx.workers.candidates()))), [WORKER]);
  });

  test('an applied acceptance delivered again is a duplicate that only confirms its prefix again', async () => {
    await enroll();
    value(await declare(1));
    const at = await placed();
    assert.equal(value(await accept(2, at, at.generation, 'accepted-1')), 'applied');
    assert.equal((await heldAssignment(at.attemptId)).state, 'accepted');
    const before = [await sql('SELECT record FROM assignments'), await cursor()];
    const events = await outboxEvents();
    assert.equal(value(await accept(2, at, at.generation, 'accepted-1')), 'duplicate');
    assert.deepEqual([await sql('SELECT record FROM assignments'), await cursor()], before);
    assert.deepEqual(await outboxEvents(), [...events, `confirmation-${confirmationIds}`]);
    assert.equal((await confirmations()).at(-1), 2);
  });

  test('a confirmation lost from the stream is sent again when the worker republishes', async () => {
    await enroll();
    value(await pressure(1, [], 'pressure-1'));
    value(await pressure(3, [], 'pressure-3'));
    // The confirmation through 1 was published, then expired unread.
    await sql('DELETE FROM outbox');
    assert.equal(value(await pressure(1, [], 'pressure-1')), 'duplicate');
    assert.deepEqual([await confirmations(), await outboxEvents()], [[1], [`confirmation-${confirmationIds}`]]);
    assert.equal(value(await pressure(3, [], 'pressure-3')), 'duplicate', 'above the prefix');
    assert.deepEqual([await confirmations(), await cursor()], [[1], { confirmed_through: '1', applied_above: ['3'] }]);
  });

  test('a gap holds the confirmation until it closes', async () => {
    await enroll();
    for (const sequence of [1, 2, 4]) value(await pressure(sequence, []));
    assert.deepEqual(await confirmations(), [1, 2]);
    assert.deepEqual(await cursor(), { confirmed_through: '2', applied_above: ['4'] });
    value(await pressure(3, []));
    assert.deepEqual(await confirmations(), [1, 2, 4]);
  });

  test('an observation whose body names another worker than its subject is not applied', async () => {
    await enroll();
    await enroll('worker-b', 'journal-b');
    const answer = failed(await observe('worker.admission-pressure.changed', { sequence: 1, subjectWorkerId: 'worker-b' }, { causes: [] }));
    assert.deepEqual([answer.code, answer.details.reason], ['precondition-failed', 'not-consumed']);
    assert.deepEqual([(await worker()).reachable, (await worker('worker-b')).reachable], [false, false]);
    assert.deepEqual(await sql('SELECT * FROM inbox'), []);
  });

  test('an observation of a journal seen before, other than the enrolled one, is not applied and not recorded', async () => {
    await enroll();
    await sql("INSERT INTO producer_cursors (worker_id, journal_id, confirmed_through, applied_above) VALUES ($1, 'journal-x', 0, '{}')", [WORKER]);
    assert.equal(failed(await observe('worker.admission-pressure.changed', { sequence: 1, journalId: 'journal-x' }, { causes: [] })).details.reason, 'not-consumed');
    assert.deepEqual([(await worker()).reachable, await cursor()], [false, { confirmed_through: '0', applied_above: [] }]);
    assert.equal(failed(await observe('worker.admission-pressure.changed', { sequence: 1, workerId: 'worker-x' }, { causes: [] })).details.reason, 'not-consumed');
  });

  test('an observation type no effect consumes counts as contact but is not applied or recorded', async () => {
    await enroll();
    const unknown = failed(await observe('execution.unknown', { sequence: 1, attemptId: 'attempt-1', ownershipGeneration: 2 }, {}));
    assert.equal(unknown.details.reason, 'not-consumed');
    assert.equal((await worker()).reachable, true);
    assert.equal(await cursor(), undefined);
    const inventory = failed(await service.apply({ subjectWorkerId: WORKER, type: 'worker.inventory.reported', body: { messageType: 'worker.inventory.reported' } }));
    assert.equal(inventory.details.reason, 'not-consumed');
  });

  test('a new identity at an applied sequence is a rollback, which retires the journal', async () => {
    await enroll();
    value(await pressure(1, []));
    assert.equal(failed(await pressure(1, ['disk-floor'])).details.reason, 'not-consumed');
    assert.deepEqual([(await worker()).admission_pressure_since, (await worker()).reachable, await confirmations()], [null, false, [1]]);
    assert.equal((await sql<{ retired: boolean }>('SELECT retired_at IS NOT NULL AS retired FROM producer_cursors'))[0]?.retired, true);
  });

  test('a store failure while an exit is applied commits nothing, so the message is delivered again', async () => {
    await enroll();
    value(await declare(1));
    const at = await placed();
    const executionId = await launch(at);
    const before = [await stored(at.taskId), await sql('SELECT * FROM inbox'), await cursor(), await sql('SELECT event_id FROM outbox')];
    const failing: ControlPlaneStore = {
      transaction: (work) => database.transaction((tx) => work(withFailingReports(tx))),
      readCommitted: (work) => database.readCommitted((tx) => work(tx)),
    };
    const outcome = await observationService(failing).apply({ subjectWorkerId: WORKER, type: 'execution.exited', body: {
      metadata: {
        observationId: 'exit-1', observationType: 'execution.exited', schemaVersion: 1, protocolVersion: 1, occurredAt: '2026-10-25T09:00:00.000Z',
        correlationId: 'c', workerId: WORKER, journalId: JOURNAL, sequence: 2, attemptId: at.attemptId, ownershipGeneration: at.generation,
      },
      payload: { executionId, status: { kind: 'code', code: 0 }, startProven: true, spawnFailed: false, terminationEvidence: 'containment-empty' },
    } });
    assert.equal(failed(outcome).code, 'unavailable');
    assert.deepEqual([await stored(at.taskId), await sql('SELECT * FROM inbox'), await cursor(), await sql('SELECT event_id FROM outbox')], before);
  });
});

// The reports of the transaction fail as a store that went down would.
function withFailingReports(tx: PostgresTransaction): ControlPlaneTransaction {
  const down = async (): Promise<Result<void>> => err(failure('unavailable', 'the store is down'));
  const reports = { recordContact: (workerId: WorkerId, at: Instant) => tx.reports.recordContact(workerId, at), clearCapacityRefusal: down };
  return { ...tx, now: () => tx.now(), reports: reports as never };
}

describe('acceptance and refusal', () => {
  test('a late acceptance at an earlier generation is rejected, logged, and still confirmed', async () => {
    await enroll();
    value(await declare(1));
    const first = await placed();
    assert.equal(value(await refuse(2, first, 'resource-ceiling-exceeded')), 'applied');
    const refused = value(await database.transaction((tx) => tx.assignments.get(first.assignment.id)));
    assert.deepEqual([refused.state, refused.end?.refusal, refused.reservation.state], ['ended', 'resource-ceiling-exceeded', 'released']);
    const second = await placeAgain('task-1');
    assert.equal(second.generation, first.generation + 1);
    assert.equal(value(await accept(3, first)), 'rejected');
    assert.equal((await heldAssignment(second.attemptId)).state, 'offered');
    assert.deepEqual(await confirmations(), [1, 2, 3]);
    const [record] = logs.records.filter((entry) => entry.event === 'execution.observation.rejected');
    assert.deepEqual([record?.fields.reason, record?.fields.type], ['stale-ownership-generation', 'execution.assignment.accepted']);
    assert.equal(value(await accept(4, second, second.generation)), 'applied');
  });

  test('a refusal for slots makes the worker ineligible until its next declaration', async () => {
    await enroll();
    value(await declare(1));
    const at = await placed();
    value(await refuse(2, at, 'worker-slots-exhausted'));
    const refused = value(await database.transaction((tx) => tx.assignments.get(at.assignment.id)));
    assert.deepEqual([refused.end?.refusal, refused.reservation.state], ['worker-slots-exhausted', 'released']);
    assert.ok((await worker()).capacity_refused_since instanceof Date);
    assert.deepEqual(value(await new PlacementService(database, TIMING).placeWaiting()), { waiting: 1, placed: 0 });
    value(await declare(3));
    assert.equal((await worker()).capacity_refused_since, null);
    assert.deepEqual(value(await new PlacementService(database, TIMING).placeWaiting()), { waiting: 1, placed: 1 });
  });

  test('a refusal under admission pressure records the pressure', async () => {
    await enroll();
    value(await declare(1));
    const at = await placed();
    value(await refuse(2, at, 'worker-admission-pressure'));
    const pressured = await worker();
    assert.ok(pressured.admission_pressure_since instanceof Date);
    assert.equal(pressured.pressure_sequence, '2');
  });

  test('a rejected offer for its protocol refuses the assignment and leaves the worker without a version', async () => {
    await enroll();
    value(await declare(1));
    const at = await placed();
    assert.equal(value(await observe('execution.command.rejected', { sequence: 2 }, {
      commandId: at.assignment.offerCommandId, commandType: 'execution.assignment.offer', reason: 'protocol-not-supported',
      supportedProtocolVersions: { minimum: 2, maximum: 3 },
    })), 'applied');
    const refused = value(await database.transaction((tx) => tx.assignments.get(at.assignment.id)));
    assert.deepEqual([refused.end?.refusal, refused.reservation.state], ['protocol-not-supported', 'released']);
    assert.equal((await worker()).protocol_version, null);
    assert.deepEqual(value(await database.readCommitted(async (tx) => ok(await tx.workers.candidates()))), []);
    const other = await observe('execution.command.rejected', { sequence: 3 }, {
      commandId: 'command-x', commandType: 'execution.assignment.end', reason: 'addressed-to-another-worker', supportedProtocolVersions: { minimum: 1, maximum: 1 },
    });
    assert.equal(value(other), 'rejected');
  });
});

describe('refusal after a grant', () => {
  async function refusedAfterGrant(refusal: (at: Placed) => Promise<Result<unknown>>) {
    await enroll();
    value(await declare(1));
    const at = await placed();
    value(await accept(2, at));
    const executionId = await launch(at, 'execution-granted');
    assert.equal(value(await refusal(at)), 'applied');
    return { at, executionId };
  }

  test('a refusal of an assignment whose execution is authorized revokes the grant and keeps the reservation', async () => {
    const { at, executionId } = await refusedAfterGrant((placedAt) => refuse(3, placedAt, 'resource-ceiling-exceeded'));
    const refused = value(await database.transaction((tx) => tx.assignments.get(at.assignment.id)));
    assert.deepEqual([refused.state, refused.end?.refusal, refused.reservation.state], ['ended', 'resource-ceiling-exceeded', 'held']);
    const attempt = (await stored(at.taskId)).attempts[0]!;
    assert.deepEqual(attempt.executions[0]!.grants.map((grant) => grant.state === 'revoked' && grant.revokedFor), ['attempt-not-launchable']);
    assert.equal(attempt.cancellation?.reason, 'assignment-ended', 'as its command says');
    assert.deepEqual(await sql('SELECT live FROM launch_authorizations'), [{ live: false }]);
    const [cancellation] = await messages('execution.cancellation.request');
    assert.equal((cancellation as { payload: { reason: string } }).payload.reason, 'assignment-ended');
    value(await observe('execution.not-started', { sequence: 4, attemptId: at.attemptId, ownershipGeneration: at.generation }, { executionId }));
    const released = value(await database.transaction((tx) => tx.assignments.get(at.assignment.id)));
    assert.equal(released.reservation.state, 'released');
    assert.deepEqual((await stored(at.taskId)).attempts.map((each) => each.outcome?.kind), ['not-started']);
  });

  test('a refusal after an earlier cancellation keeps that cancellation and still sends assignment-ended', async () => {
    const { at } = await refusedAfterGrant(async (placedAt) => {
      value(await database.transaction(async (tx) => {
        const task = await tx.tasks.get(placedAt.taskId);
        if (!task.ok) return task;
        const cancelled = requestCancellation(task.value, placedAt.attemptId, 'requested', await tx.now());
        return cancelled.ok ? tx.tasks.replace(cancelled.value, task.value.generation) : cancelled;
      }));
      return refuse(3, placedAt, 'resource-ceiling-exceeded');
    });
    assert.equal((await stored(at.taskId)).attempts[0]!.cancellation?.reason, 'requested', 'the first request wins');
    const [cancellation] = await messages('execution.cancellation.request');
    assert.equal((cancellation as { payload: { reason: string } }).payload.reason, 'assignment-ended');
  });

  test('a protocol rejection of an offer whose execution is authorized revokes the grant the same way', async () => {
    const { at } = await refusedAfterGrant((placedAt) => observe('execution.command.rejected', { sequence: 3 }, {
      commandId: placedAt.assignment.offerCommandId, commandType: 'execution.assignment.offer', reason: 'protocol-not-supported',
      supportedProtocolVersions: { minimum: 1, maximum: 1 },
    }));
    const refused = value(await database.transaction((tx) => tx.assignments.get(at.assignment.id)));
    assert.deepEqual([refused.end?.refusal, refused.reservation.state], ['protocol-not-supported', 'held']);
    assert.deepEqual(await sql('SELECT live FROM launch_authorizations'), [{ live: false }]);
    assert.equal((await messages('execution.cancellation.request')).length, 1);
  });
});

describe('outcomes', () => {
  test('a clean exit ends the attempt, releases, tells the worker, and opens no retry', async () => {
    await enroll();
    value(await declare(1));
    const at = await placed();
    value(await accept(2, at));
    const executionId = await launch(at);
    await sql('UPDATE workers SET capacity_refused_since = now()');
    assert.equal(value(await exit(3, at, executionId, 0)), 'applied');
    const task = await stored(at.taskId);
    assert.deepEqual([task.attempts.length, task.attempts[0]!.outcome?.kind], [1, 'exited']);
    const released = value(await database.transaction((tx) => tx.assignments.get(at.assignment.id)));
    assert.deepEqual([released.end?.reason, released.reservation.state], ['attempt-ended', 'released']);
    const [end] = await messages('execution.assignment.end');
    assert.deepEqual((end as { payload: unknown }).payload, { protocolVersion: 1, assignmentId: at.assignment.id, reason: 'attempt-ended' });
    assert.equal((await worker()).capacity_refused_since, null);
    const answer = await result(at.taskId);
    assert.equal(answer.state, 'ended');
    assert.deepEqual(answer.state === 'ended' && answer.outcome.kind === 'exited' && answer.outcome.status, { kind: 'code', code: 0 });
    assert.equal(value(await exit(4, at, executionId, 0)), 'applied', 'a repeated fact under a new identity changes nothing');
    assert.deepEqual(await confirmations(), [1, 2, 3, 4]);
  });

  test('a failed exit opens an automatic retry, placed as one after its backoff, until the retries are spent', async () => {
    await enroll();
    value(await declare(1));
    let at = await placed();
    let sequence = 2;
    for (let retry = 0; retry < 2; retry++) {
      value(await exit(sequence++, at, await launch(at), 1));
      const task = await stored(at.taskId);
      assert.deepEqual([task.attempts.length, task.attempts.at(-1)!.retryOf], [retry + 2, at.attemptId]);
      const answer = await result(at.taskId);
      assert.deepEqual([answer.state, answer.state === 'ended' && answer.attemptId], ['ended', at.attemptId], 'the last ended attempt');
      clock.skew = 0;
      assert.deepEqual(value(await placement.placeWaiting()), { waiting: 1, placed: 0 }, 'within its backoff');
      clock.skew = 60_000;
      const earlier = at.attemptId;
      at = await placeAgain(at.taskId);
      assert.equal(at.assignment.reservation.retryOf, earlier);
    }
    const charges = await sql<{ automatic_retry: boolean }>('SELECT automatic_retry FROM capacity_charges ORDER BY automatic_retry');
    assert.deepEqual(charges.map((charge) => charge.automatic_retry), [false, true, true]);
    value(await exit(sequence, at, await launch(at), 1));
    const task = await stored(at.taskId);
    assert.equal(task.attempts.length, 3, 'no third retry');
    const answer = await result(at.taskId);
    assert.deepEqual([answer.state, answer.state === 'ended' && answer.attemptId], ['ended', at.attemptId]);
  });

  test('a failed spawn without a proven start opens no retry', async () => {
    await enroll();
    value(await declare(1));
    const at = await placed();
    value(await exit(2, at, await launch(at), 1, false));
    const task = await stored(at.taskId);
    assert.deepEqual([task.attempts.length, task.attempts[0]!.outcome?.kind], [1, 'exited']);
  });

  test('a not-started without cancellation keeps the attempt and its reservation; with one it ends both', async () => {
    await enroll();
    value(await declare(1));
    const at = await placed();
    const executionId = await launch(at);
    const notStarted = (sequence: number, observationId?: string) => observe('execution.not-started', {
      sequence, attemptId: at.attemptId, ownershipGeneration: at.generation, ...(observationId === undefined ? {} : { observationId }),
    }, { executionId });
    value(await notStarted(2));
    assert.equal((await stored(at.taskId)).attempts[0]!.outcome, undefined);
    assert.equal((await heldAssignment(at.attemptId)).state, 'offered');
    const second = await launch(at, 'execution-second');
    value(await database.transaction(async (tx) => {
      const task = await tx.tasks.get(at.taskId);
      if (!task.ok) return task;
      const cancelled = requestCancellation(task.value, at.attemptId, 'requested', await tx.now());
      return cancelled.ok ? tx.tasks.replace(cancelled.value, task.value.generation) : cancelled;
    }));
    value(await observe('execution.not-started', { sequence: 3, attemptId: at.attemptId, ownershipGeneration: at.generation }, { executionId: second }));
    const ended = (await stored(at.taskId)).attempts[0]!.outcome;
    assert.deepEqual([ended?.kind, ended?.cancelled], ['not-started', true]);
    assert.equal(value(await database.transaction((tx) => tx.assignments.get(at.assignment.id))).reservation.state, 'released');
    assert.equal((await stored(at.taskId)).attempts.length, 1, 'a cancelled attempt is not retried');
  });

  test('a delegated child\'s clean exit closes its delegation, so its parent no longer waits', async () => {
    await enroll(WORKER, JOURNAL, 3);
    value(await declare(1, { slots: 3 }));
    const parent = await placed('task-parent');
    const delegated = value(await new DelegationService(database).requestDelegation({ workerId: WORKER as WorkerId, generation: 1 }, {
      delegationId: 'delegation-1', attemptId: parent.attemptId, ownershipGeneration: parent.generation, runId: 'run-1',
      child: { taskId: 'task-child', kind: 'planning', stageId: 'specs' },
    }, CORRELATION));
    assert.equal(delegated.state, 'admitted');
    const isWaiting = async () => value(await database.transaction(async (tx) => ok(await tx.ledger.isWaitingParent(parent.attemptId))));
    assert.equal(await isWaiting(), true);
    const child = await placeAgain('task-child');
    value(await exit(2, child, await launch(child), 0));
    assert.equal(await isWaiting(), false);
    const [row] = await sql<{ closed_at: Date | null }>('SELECT closed_at FROM delegations');
    assert.ok(row?.closed_at instanceof Date);
  });

  test('an exit at another generation, of an unknown attempt, or of another attempt\'s execution is rejected', async () => {
    await enroll();
    value(await declare(1));
    const at = await placed();
    const executionId = await launch(at);
    assert.equal(value(await exit(2, { ...at, generation: at.generation + 1 }, executionId, 0)), 'rejected');
    assert.equal(value(await exit(3, { ...at, attemptId: 'attempt-x' as AttemptId }, executionId, 0)), 'rejected');
    assert.equal(value(await exit(4, at, 'execution-x' as ExecutionId, 0)), 'rejected');
    assert.equal((await stored(at.taskId)).attempts[0]!.outcome, undefined);
    assert.deepEqual(await confirmations(), [1, 2, 3, 4]);
  });
});

describe('placement after outcomes', () => {
  test('a placement rejected with retry-budget-exhausted ends its attempt not-started', async () => {
    await enroll();
    value(await declare(1));
    const at = await placed();
    value(await exit(2, at, await launch(at), 1, false));
    const retryId = 'attempt-retry' as AttemptId;
    value(await database.transaction(async (tx) => {
      const task = await tx.tasks.get(at.taskId);
      if (!task.ok) return task;
      const retry = openAttempt(task.value, task.value.ownershipGeneration, { id: retryId, retryOf: at.attemptId }, await tx.now());
      return retry.ok ? tx.tasks.replace(retry.value, task.value.generation) : retry;
    }));
    const failed = await result(at.taskId);
    assert.deepEqual([failed.state, failed.state === 'ended' && failed.attemptId], ['ended', at.attemptId]);
    clock.skew = 60_000;
    assert.deepEqual(value(await placement.placeWaiting()), { waiting: 1, placed: 0 });
    const task = await stored(at.taskId);
    assert.deepEqual([task.attempts.length, task.attempts[1]!.outcome?.kind], [2, 'not-started']);
    const answer = await result(at.taskId);
    assert.deepEqual([answer.state, answer.state === 'ended' && answer.attemptId], ['ended', retryId]);
    assert.deepEqual(value(await placement.placeWaiting()), { waiting: 0, placed: 0 }, 'the task no longer waits');
  });
});

describe('capacity and pressure', () => {
  test('an older declaration after a newer one changes nothing and is still confirmed', async () => {
    await enroll();
    value(await declare(5, { slots: 5 }));
    value(await declare(3, { slots: 1 }));
    assert.equal((await worker()).slots, 5);
    for (const sequence of [1, 2, 4]) value(await pressure(sequence, []));
    assert.deepEqual(await cursor(), { confirmed_through: '5', applied_above: [] });
  });

  test('a refusal for slots older than a newer declaration does not mark the worker', async () => {
    await enroll();
    value(await declare(1));
    const at = await placed();
    value(await declare(3));
    value(await refuse(2, at, 'worker-slots-exhausted'));
    const reported = await worker();
    assert.deepEqual([reported.capacity_refused_since, reported.capacity_refusal_sequence], [null, '3']);
  });

  test('a declaration older than a refusal for capacity applies its values but keeps the mark', async () => {
    await enroll();
    value(await declare(1));
    const at = await placed();
    value(await refuse(3, at, 'worker-capacity-exhausted'));
    value(await declare(2, { slots: 4 }));
    const reported = await worker();
    assert.equal(reported.slots, 4);
    assert.ok(reported.capacity_refused_since instanceof Date);
  });

  test('a terminal fact older than a refusal for slots keeps the mark', async () => {
    await enroll();
    value(await declare(1));
    const first = await placed('task-1');
    const second = await placed('task-2');
    const executionId = await launch(first);
    value(await refuse(3, second, 'worker-slots-exhausted'));
    value(await exit(2, first, executionId, 0));
    assert.ok((await worker()).capacity_refused_since instanceof Date);
    assert.equal(value(await database.transaction((tx) => tx.assignments.get(first.assignment.id))).reservation.state, 'released');
  });

  test('a protocol rejection older than a newer declaration keeps the declared version', async () => {
    await enroll();
    value(await declare(1));
    const at = await placed();
    value(await declare(3));
    value(await observe('execution.command.rejected', { sequence: 2 }, {
      commandId: at.assignment.offerCommandId, commandType: 'execution.assignment.offer', reason: 'protocol-not-supported',
      supportedProtocolVersions: { minimum: 2, maximum: 3 },
    }));
    const refused = value(await database.transaction((tx) => tx.assignments.get(at.assignment.id)));
    assert.deepEqual([refused.end?.refusal, refused.reservation.state], ['protocol-not-supported', 'released']);
    assert.deepEqual([(await worker()).protocol_version, (await worker()).protocol_sequence], [1, '3']);
  });

  test('a declaration older than a protocol rejection keeps the worker without a version', async () => {
    await enroll();
    value(await declare(1));
    const at = await placed();
    value(await observe('execution.command.rejected', { sequence: 3 }, {
      commandId: at.assignment.offerCommandId, commandType: 'execution.assignment.offer', reason: 'protocol-not-supported',
      supportedProtocolVersions: { minimum: 2, maximum: 3 },
    }));
    value(await declare(2));
    assert.deepEqual([(await worker()).protocol_version, (await worker()).capacity_sequence], [null, '2']);
  });

  test('pressure keeps its start while it lasts and clears with no cause', async () => {
    await enroll();
    value(await declare(1));
    value(await pressure(2, ['disk-floor']));
    const since = (await worker()).admission_pressure_since;
    value(await pressure(3, ['disk-floor', 'event-loop-lag']));
    assert.deepEqual((await worker()).admission_pressure_since, since);
    assert.deepEqual(value(await database.readCommitted(async (tx) => ok(await tx.workers.candidates()))), []);
    value(await pressure(4, []));
    assert.equal((await worker()).admission_pressure_since, null);
  });
});

function startEvidence(): unknown[] {
  return logs.records.filter((record) => record.event === 'execution.start.evidence').map((record) => record.fields.decision);
}

describe('starts', () => {
  test('a start under the grant the authority issued moves the execution to started; a repeat changes nothing', async () => {
    await enroll();
    value(await declare(1));
    const at = await placed();
    value(await accept(2, at));
    const issued = await grant(at);
    assert.equal(value(await started(3, at, issued)), 'applied');
    const execution = (await stored(at.taskId)).attempts[0]!.executions[0]!;
    assert.deepEqual([execution.state, execution.start?.kind, execution.start?.launchAuthId], ['started', 'current', issued.launchAuthId]);
    const before = await stored(at.taskId);
    assert.equal(value(await started(4, at, issued)), 'applied', 'the recorded fact again');
    assert.deepEqual(await stored(at.taskId), before);
    assert.deepEqual(await confirmations(), [1, 2, 3, 4]);
    assert.deepEqual([await messages('execution.cancellation.request'), startEvidence()], [[], []]);
  });

  test('a start under a grant the authority never issued cancels that execution only', async () => {
    await enroll();
    value(await declare(1));
    const at = await placed();
    const issued = await grant(at);
    const before = await stored(at.taskId);
    assert.equal(value(await started(2, at, { executionId: 'execution-rogue', launchAuthId: 'launch-unknown' })), 'applied');
    assert.deepEqual(await stored(at.taskId), before, 'no execution of the attempt changes');
    const [cancellation] = await messages('execution.cancellation.request');
    assert.ok(checkMessageSchema('CancellationCommand', cancellation).ok, JSON.stringify(cancellation));
    assert.deepEqual((cancellation as { payload: unknown }).payload, { protocolVersion: 1, reason: 'launch-revoked', executionId: 'execution-rogue' });
    assert.deepEqual(startEvidence(), ['unauthorized-start']);
    assert.equal(issued.state, 'granted');
  });

  test('a start of a held execution under an unknown grant keeps the evidence and cancels it', async () => {
    await enroll();
    value(await declare(1));
    const at = await placed();
    const issued = await grant(at);
    assert.equal(value(await started(2, at, { executionId: issued.executionId, launchAuthId: 'launch-unknown' })), 'applied');
    const execution = (await stored(at.taskId)).attempts[0]!.executions[0]!;
    assert.deepEqual([execution.state, execution.unauthorizedStarts.map((start) => start.launchAuthId)], ['authorized', ['launch-unknown']]);
    assert.equal(((await messages('execution.cancellation.request'))[0] as { payload: { executionId: string } }).payload.executionId, issued.executionId);
  });

  test('a start under another worker\'s grant writes nothing to its execution and is kept as evidence', async () => {
    await enroll();
    value(await declare(1));
    const at = await placed();
    const issued = await grant(at);
    await enroll('worker-b', 'journal-b');
    const before = await stored(at.taskId);
    assert.equal(value(await started(1, at, { ...issued, workerId: 'worker-b', journalId: 'journal-b' })), 'applied');
    assert.deepEqual(await stored(at.taskId), before);
    assert.deepEqual([startEvidence(), await messages('execution.cancellation.request')], [['foreign'], []]);
  });

  test('a start at another recovery epoch is kept as evidence, and one at another generation is rejected', async () => {
    await enroll();
    value(await declare(1));
    const at = await placed();
    const issued = await grant(at);
    const before = await stored(at.taskId);
    assert.equal(value(await started(2, at, { ...issued, recoveryEpoch: 2 })), 'applied');
    assert.equal(value(await started(3, at, { ...issued, generation: at.generation + 1 })), 'rejected');
    assert.deepEqual(await stored(at.taskId), before);
    assert.deepEqual([startEvidence(), await messages('execution.cancellation.request')], [['quarantine-evidence'], []]);
  });
});

function rejectionLogs(): unknown[] {
  return logs.records.filter((record) => record.event === 'execution.launch.rejected').map((record) => [record.fields.reason, record.fields.assignmentId]);
}

describe('launch rejections', () => {
  test('a rejection that releases supersedes the assignment, so its attempt is placed again', async () => {
    await enroll();
    value(await declare(1));
    const at = await placed();
    value(await accept(2, at));
    assert.equal(value(await launchRejected(3, at, 'capacity-not-reserved')), 'applied');
    const superseded = value(await database.transaction((tx) => tx.assignments.get(at.assignment.id)));
    assert.deepEqual([superseded.end?.reason, superseded.reservation.state], ['superseded', 'released']);
    const [end] = await messages('execution.assignment.end');
    assert.deepEqual((end as { payload: unknown }).payload, { protocolVersion: 1, assignmentId: at.assignment.id, reason: 'superseded' });
    assert.equal(value(await launchRejected(4, at, 'gate-not-passed')), 'applied', 'an ended assignment is not released again');
    assert.equal((await messages('execution.assignment.end')).length, 1);
    assert.deepEqual(rejectionLogs(), [['capacity-not-reserved', at.assignment.id], ['gate-not-passed', at.assignment.id]]);
    clock.skew = 60_000;
    const again = await placeAgain(at.taskId);
    assert.equal(again.attemptId, at.attemptId);
    assert.notEqual(again.assignment.id, at.assignment.id);
  });

  test('a stale recovery epoch releases and requests the inventory; an execution conflict only requests it', async () => {
    await enroll();
    value(await declare(1));
    const first = await placed('task-1');
    const second = await placed('task-2');
    assert.equal(value(await launchRejected(2, first, 'execution-conflict')), 'applied');
    assert.equal(value(await database.transaction((tx) => tx.assignments.get(first.assignment.id))).state, 'offered');
    assert.equal(value(await launchRejected(3, second, 'stale-recovery-epoch')), 'applied');
    assert.equal(value(await database.transaction((tx) => tx.assignments.get(second.assignment.id))).end?.reason, 'superseded');
    const requests = await messages('worker.inventory.requested');
    assert.deepEqual(requests.map((request) => request.workerId), [WORKER, WORKER]);
  });

  test('a rejection the current owner decides is only recorded, and a stale one that releases is rejected', async () => {
    await enroll();
    value(await declare(1));
    const at = await placed();
    const before = value(await database.transaction((tx) => tx.assignments.get(at.assignment.id)));
    for (const [sequence, reason] of ['assignment-not-active', 'stale-ownership-generation', 'attempt-not-launchable', 'operation-mismatch'].entries()) {
      assert.equal(value(await launchRejected(sequence + 2, at, reason)), 'applied', reason);
    }
    assert.equal(value(await launchRejected(6, at, 'worker-not-authorized', at.generation + 1)), 'rejected');
    assert.deepEqual(value(await database.transaction((tx) => tx.assignments.get(at.assignment.id))), before);
    assert.deepEqual(rejectionLogs().map((logged) => (logged as unknown[])[0]), ['assignment-not-active', 'stale-ownership-generation', 'attempt-not-launchable', 'operation-mismatch']);
    assert.deepEqual([await messages('execution.assignment.end'), await messages('worker.inventory.requested')], [[], []]);
  });

  test('a stale execution conflict is rejected before it logs or requests an inventory', async () => {
    await enroll();
    value(await declare(1));
    const at = await placed();
    assert.equal(value(await launchRejected(2, at, 'execution-conflict', at.generation + 1)), 'rejected');
    assert.equal(value(await launchRejected(3, at, 'assignment-not-active', at.generation + 1)), 'rejected');
    assert.deepEqual([rejectionLogs(), await messages('worker.inventory.requested')], [[], []]);
  });
});

async function queue() {
  return value(await database.transaction(async (tx) => ok({
    worker: await tx.reconciliation.unknownExecutionsOfWorker(WORKER as WorkerId),
    task: await tx.reconciliation.unknownExecutionsOfTask('task-1' as TaskId),
    processes: await tx.reconciliation.unrecordedProcessesOfWorker(WORKER as WorkerId),
  })));
}

describe('a revoked worker', () => {
  const fleet = new LaunchRevokingFleetRegistry(database);
  const revoke = (workerId = WORKER) => fleet.revoke(workerId as WorkerId, '2026-10-25T09:00:00.000Z' as Instant);

  test('keeps a started execution uncertain with its reservation, until its in-flight exit settles it', async () => {
    await enroll();
    value(await declare(1));
    const at = await placed();
    value(await accept(2, at));
    const issued = await grant(at);
    value(await started(3, at, issued));
    value(await revoke());
    const kept = value(await database.transaction((tx) => tx.assignments.get(at.assignment.id)));
    assert.deepEqual([kept.state, kept.reservation.state], ['accepted', 'held']);
    const waiting = await queue();
    assert.deepEqual([waiting.worker, waiting.task].map((listed) => listed.map(({ execution }) => [execution.id, execution.state])), [
      [[issued.executionId, 'started']], [[issued.executionId, 'started']],
    ]);
    const contact = (await worker()).last_contact_at;
    assert.equal(value(await exit(4, at, issued.executionId, 0)), 'applied');
    const attempt = (await stored(at.taskId)).attempts[0]!;
    assert.deepEqual([attempt.executions[0]!.state, attempt.outcome?.kind, attempt.outcome?.cancelled], ['exited', 'exited', true]);
    assert.equal(value(await database.transaction((tx) => tx.assignments.get(at.assignment.id))).reservation.state, 'released');
    assert.deepEqual((await queue()).worker, []);
    assert.deepEqual((await worker()).last_contact_at, contact, 'no contact is recorded');
    assert.deepEqual(value(await database.readCommitted(async (tx) => ok(await tx.workers.candidates()))), []);
    const [observed] = logs.records.filter((record) => record.event === 'execution.revoked-worker.observation');
    assert.deepEqual([observed?.correlation.workerId, observed?.fields.journalId, observed?.fields.type, observed?.fields.sequence], [
      WORKER, JOURNAL, 'execution.exited', 4,
    ]);
  });

  test('gets no new work, and its new journal, heartbeat, and inventory report are refused', async () => {
    await enroll();
    value(await declare(1));
    value(await revoke());
    const contact = (await worker()).last_contact_at;
    assert.equal(value(await declare(2, { slots: 5 })), 'rejected');
    assert.equal(value(await pressure(3, ['disk-floor'])), 'rejected');
    assert.deepEqual([(await worker()).slots, (await worker()).admission_pressure_since], [2, null]);
    assert.deepEqual(await confirmations(), [1, 2, 3]);
    const refused = logs.records.filter((record) => record.event === 'execution.observation.rejected').map((record) => record.fields.reason);
    assert.deepEqual(refused, ['worker-revoked', 'worker-revoked']);
    const replaced = failed(await observe('worker.admission-pressure.changed', { sequence: 1, journalId: 'journal-new' }, { causes: [] }));
    assert.equal(replaced.details.reason, 'not-consumed');
    assert.equal(value(await database.transaction((tx) => tx.fleet.worker(WORKER as WorkerId)))?.journalId, JOURNAL);
    const heartbeat = await new HeartbeatService(database).record({ subjectWorkerId: WORKER, body: { workerId: WORKER, journalId: JOURNAL } });
    assert.equal(failed(heartbeat).code, 'forbidden');
    const inventory = new InventoryService(database, { newRequestId: () => 'request-revoked' });
    const reported = await inventory.apply({ subjectWorkerId: WORKER, type: 'worker.inventory.reported', body: {
      messageType: 'worker.inventory.reported', schemaVersion: 1, protocolVersion: 1, reportId: 'report-1', snapshot: 1, part: 1, parts: 1,
      reportedAt: '2026-10-25T09:00:00.000Z', workerId: WORKER, journalId: JOURNAL, throughSequence: 3, assignments: [], executions: [],
    } });
    assert.equal(failed(reported).details.reason, 'not-consumed');
    assert.deepEqual((await worker()).last_contact_at, contact, 'no contact is recorded');
  });

  test('frees an accepted assignment without a grant, so its attempt is placed on another worker', async () => {
    await enroll();
    value(await declare(1));
    const at = await placed();
    value(await accept(2, at));
    await enroll('worker-b', 'journal-b');
    value(await observe('worker.capacity.declared', { sequence: 1, workerId: 'worker-b', journalId: 'journal-b' }, {
      capacity: CAPACITY, protocolVersions: { minimum: 1, maximum: 1 },
    }));
    value(await revoke());
    const superseded = value(await database.transaction((tx) => tx.assignments.get(at.assignment.id)));
    assert.deepEqual([superseded.end?.reason, superseded.reservation.state], ['superseded', 'released']);
    value(await revoke());
    assert.equal((await messages('execution.assignment.end')).length, 1, 'a repeated revocation frees nothing again');
    const again = await placeAgain(at.taskId);
    assert.deepEqual([again.attemptId, again.assignment.workerId], [at.attemptId, 'worker-b']);
  });

  test('keeps an authorized execution uncertain with its reservation', async () => {
    await enroll();
    value(await declare(1));
    const at = await placed();
    await launch(at);
    value(await revoke());
    const kept = await heldAssignment(at.attemptId);
    assert.deepEqual([kept.state, kept.end], ['offered', undefined]);
    assert.equal((await stored(at.taskId)).attempts[0]!.outcome, undefined);
    assert.deepEqual(await messages('execution.assignment.end'), []);
  });

  test('ends the attempt of an assignment that held a grant whose executions are terminal, once, and retries it', async () => {
    await enroll();
    value(await declare(1));
    const at = await placed();
    const executionId = await launch(at);
    value(await observe('execution.not-started', { sequence: 2, attemptId: at.attemptId, ownershipGeneration: at.generation }, { executionId }));
    value(await revoke());
    const [first, retry] = (await stored(at.taskId)).attempts;
    assert.deepEqual([first?.outcome?.kind, first?.outcome?.cancelled], ['not-started', false]);
    assert.deepEqual([retry?.retryOf, retry?.outcome], [at.attemptId, undefined], 'an automatic retry opens');
    const ended = value(await database.transaction((tx) => tx.assignments.get(at.assignment.id)));
    assert.deepEqual([ended.state, ended.end?.reason, ended.reservation.state], ['ended', 'attempt-ended', 'released']);
    value(await revoke());
    const ends = await messages('execution.assignment.end');
    assert.deepEqual(ends.map((end) => (end as { payload: unknown }).payload), [
      { protocolVersion: 1, assignmentId: at.assignment.id, reason: 'attempt-ended' },
    ]);
  });

  test('closes a delegated child\'s delegation when its ended attempt has no retry left', async () => {
    await enroll(WORKER, JOURNAL, 3);
    value(await declare(1, { slots: 3 }));
    const parent = await placed('task-parent');
    value(await new DelegationService(database).requestDelegation({ workerId: WORKER as WorkerId, generation: 1 }, {
      delegationId: 'delegation-1', attemptId: parent.attemptId, ownershipGeneration: parent.generation, runId: 'run-1',
      child: { taskId: 'task-child', kind: 'planning', stageId: 'specs' },
    }, CORRELATION));
    let child = await placeAgain('task-child');
    let sequence = 2;
    for (let retry = 0; retry < 2; retry++) {
      value(await exit(sequence++, child, await launch(child), 1));
      clock.skew += 60_000;
      child = await placeAgain('task-child');
    }
    const executionId = await launch(child);
    value(await observe('execution.not-started', { sequence, attemptId: child.attemptId, ownershipGeneration: child.generation }, { executionId }));
    value(await revoke());
    const attempts = (await stored('task-child')).attempts;
    assert.deepEqual([attempts.length, attempts.at(-1)?.outcome?.kind], [3, 'not-started'], 'no third retry');
    assert.equal(value(await database.transaction(async (tx) => ok(await tx.ledger.isWaitingParent(parent.attemptId)))), false);
    const [row] = await sql<{ closed_at: Date | null }>('SELECT closed_at FROM delegations');
    assert.ok(row?.closed_at instanceof Date);
  });

  test('frees assignments whose identifiers have the maximum length', async () => {
    await enroll();
    value(await declare(1));
    const ungranted = await placedAs('task-1', 's'.repeat(MAX_IDENTIFIER_LENGTH));
    const granted = await placedAs('task-2', 'g'.repeat(MAX_IDENTIFIER_LENGTH));
    const executionId = await launch(granted);
    value(await observe('execution.not-started', { sequence: 2, attemptId: granted.attemptId, ownershipGeneration: granted.generation }, {
      executionId,
    }));
    value(await revoke());
    const reasons = await Promise.all([ungranted, granted].map(async ({ assignment }) => {
      const ended = value(await database.transaction((tx) => tx.assignments.get(assignment.id)));
      return [ended.end?.reason, ended.reservation.state];
    }));
    assert.deepEqual(reasons, [['superseded', 'released'], ['attempt-ended', 'released']]);
  });
});

describe('reconciliation queue', () => {
  test('lists each unrecorded process a worker reports, once', async () => {
    await enroll();
    const processes = [PROCESS, { ...PROCESS, pid: 43 }];
    const unrecorded = { sequence: 1, observationId: 'unrecorded-1' };
    assert.equal(value(await observe('execution.unrecorded-process', unrecorded, { containment: 'cgroup taskelith/x', processes })), 'applied');
    assert.equal(value(await observe('execution.unrecorded-process', unrecorded, { containment: 'cgroup taskelith/x', processes })), 'duplicate');
    const listed = (await queue()).processes;
    assert.deepEqual(listed.map(({ journalId, observationId, containment, processCount }) => [journalId, observationId, containment, processCount]), [
      [JOURNAL, 'unrecorded-1', 'cgroup taskelith/x', 2],
    ]);
  });
});
