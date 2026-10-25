import assert from 'node:assert/strict';
import { after, beforeEach, describe, test } from 'node:test';
import pg from 'pg';
import { checkMessageSchema } from '@taskelith/contracts';
import {
  DelegationService,
  ObservationService,
  PlacementService,
  RunService,
  TaskService,
  WorkflowRegistry,
  type ControlPlaneStore,
  type ControlPlaneTransaction,
} from '@taskelith/control-plane';
import { openAttempt, requestCancellation, type AttemptId, type Execution, type ExecutionId, type Task, type WorkerId } from '@taskelith/execution';
import { fleetToken, fleetWorker } from '@taskelith/fleet';
import { err, failure, ok, type CorrelationId, type Instant, type Result } from '@taskelith/kernel';
import { InMemoryLogSink, Logger } from '@taskelith/observability';
import { PostgresDatabase, migrate, type PostgresTransaction } from '@taskelith/postgres';
import type { Assignment } from '@taskelith/scheduling';
import { parseWorkflowDefinition, type TaskId } from '@taskelith/sdlc';
import { failed, integrationEndpoint, value } from '@taskelith/testing';

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
];
const CORRELATION = 'correlation-1' as CorrelationId;
const WORKER = 'worker-a';
const JOURNAL = 'journal-a';
const TIMING = { now: Date.now, draw: () => 0 };
const tasks = new TaskService(database);
let logs: InMemoryLogSink;
let service: ObservationService;
let placement: PlacementService;
let observed = 0;

beforeEach(async () => {
  logs = new InMemoryLogSink();
  service = new ObservationService(database, new Logger(logs, { now: () => '2026-10-25T09:00:00.000Z' as never }));
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

function pressure(sequence: number, causes: string[]) {
  return observe('worker.admission-pressure.changed', { sequence }, { causes });
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

// Tests seed the grant's execution until item 21d wires launch authority.
async function seedExecution(at: Placed, executionId = `execution-${at.attemptId.slice(0, 8)}`): Promise<ExecutionId> {
  const execution: Execution = {
    id: executionId as ExecutionId, assignmentId: at.assignment.id, workerId: WORKER as WorkerId, state: 'authorized',
    grants: [], evidence: [], unauthorizedStarts: [],
  };
  value(await database.transaction(async (tx) => {
    const task = await tx.tasks.get(at.taskId);
    if (!task.ok) return task;
    const attempts = task.value.attempts.map((attempt) => (attempt.id === at.attemptId ? { ...attempt, executions: [...attempt.executions, execution] } : attempt));
    return tx.tasks.replace({ ...task.value, attempts, generation: (task.value.generation + 1) as never }, task.value.generation);
  }));
  return execution.id;
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

async function confirmations(): Promise<number[]> {
  return (await messages('execution.observations.confirmed')).map((payload) => payload.confirmedThrough as number);
}

async function worker(workerId = WORKER): Promise<Record<string, unknown>> {
  return (await sql(`SELECT reachable, last_contact_at, slots, protocol_version, admission_pressure_since, capacity_refused_since,
    capacity_sequence, pressure_sequence FROM workers WHERE worker_id = $1`, [workerId]))[0]!;
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

  test('an applied acceptance delivered again is a duplicate that changes nothing', async () => {
    await enroll();
    value(await declare(1));
    const at = await placed();
    assert.equal(value(await accept(2, at, at.generation, 'accepted-1')), 'applied');
    assert.equal((await heldAssignment(at.attemptId)).state, 'accepted');
    const before = [await sql('SELECT record FROM assignments'), await cursor(), await sql('SELECT event_id FROM outbox')];
    assert.equal(value(await accept(2, at, at.generation, 'accepted-1')), 'duplicate');
    assert.deepEqual([await sql('SELECT record FROM assignments'), await cursor(), await sql('SELECT event_id FROM outbox')], before);
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

  test('an observation of a journal other than the enrolled one is not applied and not recorded', async () => {
    await enroll();
    assert.equal(failed(await observe('worker.admission-pressure.changed', { sequence: 1, journalId: 'journal-x' }, { causes: [] })).details.reason, 'not-consumed');
    assert.deepEqual([(await worker()).reachable, await cursor()], [false, undefined]);
    assert.equal(failed(await observe('worker.admission-pressure.changed', { sequence: 1, workerId: 'worker-x' }, { causes: [] })).details.reason, 'not-consumed');
  });

  test('a start before item 21d counts as contact but is not applied or recorded', async () => {
    await enroll();
    const started = failed(await observe('execution.started', { sequence: 1, attemptId: 'attempt-1', ownershipGeneration: 2 }, {}));
    assert.equal(started.details.reason, 'not-consumed');
    assert.equal((await worker()).reachable, true);
    assert.equal(await cursor(), undefined);
    const inventory = failed(await service.apply({ subjectWorkerId: WORKER, type: 'worker.inventory.reported', body: { messageType: 'worker.inventory.reported' } }));
    assert.equal(inventory.details.reason, 'not-consumed');
  });

  test('a new identity at an applied sequence is a rollback, left to item 21c', async () => {
    await enroll();
    value(await pressure(1, []));
    assert.equal(failed(await pressure(1, ['disk-floor'])).details.reason, 'not-consumed');
    assert.deepEqual([(await worker()).admission_pressure_since, await confirmations()], [null, [1]]);
  });

  test('a store failure while an exit is applied commits nothing, so the message is delivered again', async () => {
    await enroll();
    value(await declare(1));
    const at = await placed();
    const executionId = await seedExecution(at);
    const before = [await stored(at.taskId), await sql('SELECT * FROM inbox'), await cursor(), await sql('SELECT event_id FROM outbox')];
    const failing: ControlPlaneStore = {
      transaction: (work) => database.transaction((tx) => work(withFailingReports(tx))),
      readCommitted: (work) => database.readCommitted((tx) => work(tx)),
    };
    const outcome = await new ObservationService(failing).apply({ subjectWorkerId: WORKER, type: 'execution.exited', body: {
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

describe('outcomes', () => {
  test('a clean exit ends the attempt, releases, tells the worker, and opens no retry', async () => {
    await enroll();
    value(await declare(1));
    const at = await placed();
    value(await accept(2, at));
    const executionId = await seedExecution(at);
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

  test('a failed exit opens an automatic retry, placed as one, until the retries are spent', async () => {
    await enroll();
    value(await declare(1));
    let at = await placed();
    let sequence = 2;
    for (let retry = 0; retry < 2; retry++) {
      value(await exit(sequence++, at, await seedExecution(at), 1));
      const task = await stored(at.taskId);
      assert.deepEqual([task.attempts.length, task.attempts.at(-1)!.retryOf], [retry + 2, at.attemptId]);
      assert.equal((await result(at.taskId)).state, 'pending', 'a retry is active');
      const earlier = at.attemptId;
      at = await placeAgain(at.taskId);
      assert.equal(at.assignment.reservation.retryOf, earlier);
    }
    const charges = await sql<{ automatic_retry: boolean }>('SELECT automatic_retry FROM capacity_charges ORDER BY automatic_retry');
    assert.deepEqual(charges.map((charge) => charge.automatic_retry), [false, true, true]);
    value(await exit(sequence, at, await seedExecution(at), 1));
    const task = await stored(at.taskId);
    assert.equal(task.attempts.length, 3, 'no third retry');
    const answer = await result(at.taskId);
    assert.deepEqual([answer.state, answer.state === 'ended' && answer.attemptId], ['ended', at.attemptId]);
  });

  test('a failed spawn without a proven start opens no retry', async () => {
    await enroll();
    value(await declare(1));
    const at = await placed();
    value(await exit(2, at, await seedExecution(at), 1, false));
    const task = await stored(at.taskId);
    assert.deepEqual([task.attempts.length, task.attempts[0]!.outcome?.kind], [1, 'exited']);
  });

  test('a not-started without cancellation keeps the attempt and its reservation; with one it ends both', async () => {
    await enroll();
    value(await declare(1));
    const at = await placed();
    const executionId = await seedExecution(at);
    const notStarted = (sequence: number, observationId?: string) => observe('execution.not-started', {
      sequence, attemptId: at.attemptId, ownershipGeneration: at.generation, ...(observationId === undefined ? {} : { observationId }),
    }, { executionId });
    value(await notStarted(2));
    assert.equal((await stored(at.taskId)).attempts[0]!.outcome, undefined);
    assert.equal((await heldAssignment(at.attemptId)).state, 'offered');
    const second = await seedExecution(at, 'execution-second');
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
    value(await exit(2, child, await seedExecution(child), 0));
    assert.equal(await isWaiting(), false);
    const [row] = await sql<{ closed_at: Date | null }>('SELECT closed_at FROM delegations');
    assert.ok(row?.closed_at instanceof Date);
  });

  test('an exit at another generation, of an unknown attempt, or of another attempt\'s execution is rejected', async () => {
    await enroll();
    value(await declare(1));
    const at = await placed();
    const executionId = await seedExecution(at);
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
    value(await exit(2, at, await seedExecution(at), 1, false));
    const retryId = 'attempt-retry' as AttemptId;
    value(await database.transaction(async (tx) => {
      const task = await tx.tasks.get(at.taskId);
      if (!task.ok) return task;
      const retry = openAttempt(task.value, task.value.ownershipGeneration, { id: retryId, retryOf: at.attemptId }, await tx.now());
      return retry.ok ? tx.tasks.replace(retry.value, task.value.generation) : retry;
    }));
    assert.equal((await result(at.taskId)).state, 'pending');
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
