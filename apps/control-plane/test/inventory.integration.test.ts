import assert from 'node:assert/strict';
import { after, beforeEach, describe, test } from 'node:test';
import pg from 'pg';
import { checkMessageSchema } from '@taskelith/contracts';
import {
  InventoryService,
  ObservationService,
  PlacementService,
  RunService,
  TaskService,
  WorkflowRegistry,
  type ControlPlaneStore,
} from '@taskelith/control-plane';
import {
  requestCancellation,
  type AttemptId,
  type Execution,
  type ExecutionId,
  type Task,
  type WorkerId,
} from '@taskelith/execution';
import { fleetToken, fleetWorker } from '@taskelith/fleet';
import { err, failure, ok, type CorrelationId } from '@taskelith/kernel';
import { InMemoryLogSink, Logger } from '@taskelith/observability';
import { PostgresDatabase, migrate } from '@taskelith/postgres';
import type { Assignment } from '@taskelith/scheduling';
import { parseWorkflowDefinition, type TaskId } from '@taskelith/sdlc';
import { failed, integrationEndpoint, value } from '@taskelith/testing';
import { issueGrant, launchAuthority } from './launch-fixtures.ts';

const POSTGRES = integrationEndpoint('TASKELITH_POSTGRES_URL');
const databaseName = `taskelith_inventory_${process.pid}`;
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
  'inventory_requests', 'inventory_report_parts', 'launch_authorizations', 'broker_revocations',
  'launch_rejections', 'unrecorded_processes', 'placement_rotation', 'placement_outcomes',
];
const WORKER = 'worker-a';
const JOURNAL = 'journal-a';
const NEW_JOURNAL = 'journal-a2';
const AT = '2026-10-25T09:00:00.000Z';
// Placement's clock runs ahead, so that a retry's backoff could pass.
const TIMING = { now: () => Date.now() + 3_600_000, draw: () => 0 };
const tasks = new TaskService(database);
const authority = launchAuthority(database, undefined, new WorkflowRegistry([{ definition, digest: DIGEST }]));
let logs: InMemoryLogSink;
let observations: ObservationService;
let inventory: InventoryService;
let placement: PlacementService;
let observed = 0;
let identities = 0;

function services(store: ControlPlaneStore) {
  const logger = new Logger(logs, { now: () => AT as never });
  const newRequestId = () => `request-${++identities}`;
  return {
    observations: new ObservationService(store, { newConfirmationId: () => `confirmation-${++identities}`, newRequestId, logger }),
    inventory: new InventoryService(store, { newRequestId, logger }),
  };
}

beforeEach(async () => {
  logs = new InMemoryLogSink();
  ({ observations, inventory } = services(database));
  placement = new PlacementService(database, TIMING);
  await sql(`TRUNCATE ${TABLES.join(', ')}`);
  await sql('INSERT INTO installation (quarantined, recovery_epoch) VALUES (false, 1)');
  value(await new RunService(database, new WorkflowRegistry([{ definition, digest: DIGEST }])).createRun({ runId: 'run-1', projectId: 'project-1', binding }));
});

async function enroll(workerId = WORKER, journalId = JOURNAL): Promise<void> {
  const worker = fleetWorker(workerId, journalId, { capacity: { slots: 4, cpuMillicores: 8000, memoryMebibytes: 16384, controls: [] } });
  value(await database.transaction(async (tx) => {
    const added = await tx.fleet.addToken(fleetToken(`token-${workerId}`));
    return added.ok ? tx.fleet.enroll(`token-${workerId}` as never, worker) : added;
  }));
}

interface Sent {
  readonly sequence: number;
  readonly observationId?: string;
  readonly workerId?: string;
  readonly journalId?: string;
  readonly attemptId?: string;
  readonly ownershipGeneration?: number;
}

function observe(type: string, sent: Sent, payload: Record<string, unknown>) {
  const workerId = sent.workerId ?? WORKER;
  const metadata = {
    observationId: sent.observationId ?? `observation-${++observed}`, observationType: type, schemaVersion: 1, protocolVersion: 1,
    occurredAt: AT, correlationId: 'correlation-o', workerId, journalId: sent.journalId ?? JOURNAL, sequence: sent.sequence,
    ...(sent.attemptId === undefined ? {} : { attemptId: sent.attemptId, ownershipGeneration: sent.ownershipGeneration }),
  };
  return observations.apply({ subjectWorkerId: workerId, type, body: { metadata, payload } });
}

function declare(sequence: number, journalId = JOURNAL, slots = 4) {
  return observe('worker.capacity.declared', { sequence, journalId }, {
    capacity: { slots, cpuMillicores: 8000, memoryMebibytes: 16384, enforceableControls: [] }, protocolVersions: { minimum: 1, maximum: 1 },
  });
}

function pressure(sequence: number, extra: Partial<Sent> = {}) {
  return observe('worker.admission-pressure.changed', { sequence, ...extra }, { causes: [] });
}

interface Report {
  readonly reportId: string;
  readonly snapshot: number;
  readonly throughSequence: number;
  readonly assignments?: readonly Placed[];
  readonly executions?: readonly Record<string, unknown>[];
  readonly requestId?: string;
  readonly part?: number;
  readonly parts?: number;
  readonly workerId?: string;
  readonly journalId?: string;
}

function inventoryBody(report: Report): Record<string, unknown> {
  return {
    messageType: 'worker.inventory.reported', schemaVersion: 1, protocolVersion: 1, reportId: report.reportId, snapshot: report.snapshot,
    part: report.part ?? 1, parts: report.parts ?? 1, reportedAt: AT, workerId: report.workerId ?? WORKER, journalId: report.journalId ?? JOURNAL,
    throughSequence: report.throughSequence, ...(report.requestId === undefined ? {} : { requestId: report.requestId }),
    assignments: (report.assignments ?? []).map((at) => ({
      commandId: at.assignment.offerCommandId, assignmentId: at.assignment.id, attemptId: at.attemptId, ownershipGeneration: at.generation,
      state: 'accepted',
    })),
    executions: report.executions ?? [],
  };
}

function report(fields: Report) {
  const body = inventoryBody(fields);
  assert.ok(checkMessageSchema('InventoryReported', body).ok, JSON.stringify(body));
  return inventory.apply({ subjectWorkerId: fields.workerId ?? WORKER, type: 'worker.inventory.reported', body });
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

async function assignmentOf(at: Placed): Promise<Assignment> {
  return value(await database.transaction((tx) => tx.assignments.get(at.assignment.id)));
}

async function placed(taskId: string): Promise<Placed> {
  value(await tasks.submitTask('run-1', { taskId, kind: 'planning', stageId: 'specs' }, 'correlation-1' as CorrelationId));
  assert.equal(value(await placement.placeWaiting()).placed, 1, 'placed');
  const task = await stored(taskId);
  const attemptId = task.attempts.at(-1)!.id;
  const [assignment] = value(await database.transaction(async (tx) => ok(await tx.assignments.listByAttempt(attemptId))));
  return { taskId: task.id, attemptId, generation: task.ownershipGeneration, assignment: assignment! };
}

function attemptOf(at: Placed) {
  return { attemptId: at.attemptId, ownershipGeneration: at.generation };
}

function accept(sequence: number, at: Placed, journalId = JOURNAL) {
  return observe('execution.assignment.accepted', { sequence, journalId, ...attemptOf(at) }, {
    commandId: at.assignment.offerCommandId, assignmentId: at.assignment.id,
  });
}

function refuse(sequence: number, at: Placed, reason: string) {
  return observe('execution.assignment.refused', { sequence, ...attemptOf(at) }, {
    commandId: at.assignment.offerCommandId, assignmentId: at.assignment.id, reason, retryable: false,
  });
}

// The execution of the attempt, granted by the launch authority.
async function launch(at: Placed): Promise<ExecutionId> {
  const target = { taskId: at.taskId, attemptId: at.attemptId, generation: at.generation, assignmentId: at.assignment.id };
  return (await issueGrant(authority, database, target, WORKER as WorkerId, `execution-${at.taskId}`)).executionId;
}

function executionOf(task: Task): Execution {
  return task.attempts[0]!.executions[0]!;
}

interface OutboxRow {
  readonly event_id: string;
  readonly message: string;
}

async function outbox(eventType: string): Promise<OutboxRow[]> {
  return sql<OutboxRow>('SELECT event_id, message FROM outbox WHERE event_type = $1 ORDER BY position', [eventType]);
}

async function offersOf(at: Placed): Promise<OutboxRow[]> {
  return (await outbox('execution.assignment.offer')).filter((row) => JSON.parse(row.message).payload.payload.assignmentId === at.assignment.id);
}

async function requests(): Promise<Record<string, unknown>[]> {
  return (await outbox('worker.inventory.requested')).map((row) => JSON.parse(row.message).payload);
}

async function currentRequest(workerId = WORKER): Promise<{ request_id: string; bound: string } | undefined> {
  return (await sql<{ request_id: string; bound: string }>('SELECT request_id, bound FROM inventory_requests WHERE worker_id = $1', [workerId]))[0];
}

async function workerRow(workerId = WORKER): Promise<{ reachable: boolean; last_contact_at: Date | null; journal_id: string }> {
  return (await sql<{ reachable: boolean; last_contact_at: Date | null; journal_id: string }>(
    'SELECT reachable, last_contact_at, journal_id FROM workers WHERE worker_id = $1', [workerId]))[0]!;
}

async function enrolledJournal(workerId = WORKER): Promise<string> {
  return value(await database.transaction((tx) => tx.fleet.worker(workerId as WorkerId)))!.journalId;
}

async function retired(journalId = JOURNAL): Promise<boolean> {
  const rows = await sql<{ retired: boolean }>('SELECT retired_at IS NOT NULL AS retired FROM producer_cursors WHERE journal_id = $1', [journalId]);
  return rows[0]?.retired ?? false;
}

async function pendingParts(): Promise<string[]> {
  return (await sql<{ id: string }>("SELECT report_id || '.' || part AS id FROM inventory_report_parts ORDER BY report_id, part")).map((row) => row.id);
}

function warnings(event: string): Record<string, unknown>[] {
  return logs.records.filter((record) => record.event === event).map((record) => ({ ...record.correlation, ...record.fields }));
}

const MAX_ANSWERS = 20;

// The worker answers each request in the outbox in order from `first`, with
// a rising snapshot; returns the position of the first one left unanswered.
async function answerInTurn(fields: Pick<Report, 'throughSequence'>, first = 0): Promise<number> {
  let answered = first;
  for (; answered < MAX_ANSWERS; answered += 1) {
    const request = (await requests())[answered];
    if (request === undefined) break;
    const snapshot = answered + 1;
    value(await report({ ...fields, reportId: `answer-${snapshot}`, snapshot, requestId: String(request.requestId) }));
  }
  return answered;
}

// A reachable worker with a capacity, so that placement offers it work.
async function readyWorker(): Promise<void> {
  await enroll();
  value(await declare(1));
}

describe('inventory requests', () => {
  test('a newly enrolled worker\'s unsolicited report makes it reachable and requests inventory once, with its bound', async () => {
    await enroll();
    assert.equal(value(await report({ reportId: 'report-1', snapshot: 1, throughSequence: 0 })), 'applied');
    assert.equal((await workerRow()).reachable, true);
    assert.deepEqual(await outbox('execution.observations.confirmed'), []);
    const [request, ...more] = await requests();
    assert.deepEqual(more, []);
    assert.ok(checkMessageSchema('InventoryRequested', request).ok, JSON.stringify(request));
    assert.deepEqual([request?.workerId, request?.requestId], [WORKER, (await currentRequest())?.request_id]);
    const [row] = await outbox('worker.inventory.requested');
    assert.equal(row?.event_id, `i${request?.requestId}`);
    assert.deepEqual(JSON.parse((await currentRequest())!.bound), [{ journalId: JOURNAL, sequence: 0, assignmentIds: [] }]);
  });

  test('a repeated part is a duplicate that changes nothing', async () => {
    await enroll();
    const part = { reportId: 'report-1', snapshot: 1, throughSequence: 0, parts: 2 };
    value(await report(part));
    const before = [await sql('SELECT * FROM inventory_report_parts'), await requests(), await sql('SELECT * FROM inbox')];
    assert.equal(value(await report(part)), 'duplicate');
    assert.deepEqual([await sql('SELECT * FROM inventory_report_parts'), await requests(), await sql('SELECT * FROM inbox')], before);
  });

  test('a revoked worker\'s report is not applied, records no contact, and requests nothing', async () => {
    await enroll();
    value(await database.transaction(async (tx) => tx.fleet.revoke(WORKER as WorkerId, AT as never)));
    assert.equal(failed(await report({ reportId: 'report-1', snapshot: 1, throughSequence: 0 })).details.reason, 'not-consumed');
    assert.deepEqual([(await workerRow()).last_contact_at, await requests(), await pendingParts()], [null, [], []]);
  });

  test('the bound keeps the sequence applied when the request was sent', async () => {
    await enroll();
    for (let sequence = 1; sequence <= 9; sequence += 1) value(await pressure(sequence));
    assert.deepEqual(await inventory.requestAll([WORKER as WorkerId]), { sent: 1, failed: 0 });
    value(await pressure(10));
    assert.deepEqual(JSON.parse((await currentRequest())!.bound), [{ journalId: JOURNAL, sequence: 9, assignmentIds: [] }]);
  });

  test('only the newer of two requests is current, and a snapshot answering the first is not fresh', async () => {
    await enroll();
    for (let sequence = 1; sequence <= 9; sequence += 1) value(await pressure(sequence));
    await inventory.requestAll([WORKER as WorkerId]);
    const first = (await currentRequest())!.request_id;
    await inventory.requestAll([WORKER as WorkerId]);
    const second = (await currentRequest())!.request_id;
    assert.notEqual(first, second);
    value(await report({ reportId: 'report-1', snapshot: 1, throughSequence: 6, requestId: first }));
    assert.equal(await retired(), false, 'a snapshot that is not fresh proves no rollback');
    assert.equal((await requests()).length, 2, 'it answers a request, so it requests nothing more');
  });

  test('two outstanding requests answered in turn settle without a further request', async () => {
    await enroll();
    await inventory.requestAll([WORKER as WorkerId]);
    await inventory.requestAll([WORKER as WorkerId]);
    assert.equal(await answerInTurn({ throughSequence: 0 }), 2);
    assert.equal((await requests()).length, 2);
  });

  test('at start one failed request is logged, the other worker\'s is sent, and the summary counts both', async () => {
    await enroll();
    await enroll('worker-b', 'journal-b');
    const failing: ControlPlaneStore = {
      transaction: (work) => database.transaction((tx) => work({
        ...tx, now: () => tx.now(),
        inventoryRequests: {
          current: (workerId) => tx.inventoryRequests.current(workerId),
          save: async (request) => (request.workerId === 'worker-b' ? err(failure('unavailable', 'the store is down')) : tx.inventoryRequests.save(request)),
        },
      })),
      readCommitted: (work) => database.readCommitted(work),
    };
    const summary = await services(failing).inventory.requestAll(['worker-a', 'worker-b'] as WorkerId[]);
    assert.deepEqual(summary, { sent: 1, failed: 1 });
    assert.deepEqual((await requests()).map((request) => request.workerId), [WORKER]);
    assert.equal(await currentRequest('worker-b'), undefined);
    assert.deepEqual(warnings('execution.inventory-request.failed').map(({ workerId, code }) => [workerId, code]), [['worker-b', 'unavailable']]);
    assert.deepEqual(logs.records.filter((record) => record.event === 'execution.inventory-requests.sent').map((record) => record.fields), [{ sent: 1, failed: 1 }]);
  });
});

describe('pending snapshots and their rollback check', () => {
  test('a snapshot ahead of its observations waits and is applied with the observation that completes it', async () => {
    await readyWorker();
    const at = await placed('task-1');
    for (let sequence = 2; sequence <= 4; sequence += 1) value(await pressure(sequence));
    value(await report({ reportId: 'report-1', snapshot: 1, throughSequence: 5, parts: 2 }));
    value(await report({ reportId: 'report-1', snapshot: 1, throughSequence: 5, parts: 2, part: 2 }));
    assert.deepEqual([await pendingParts(), (await offersOf(at)).length], [['report-1.1', 'report-1.2'], 1]);
    value(await pressure(5));
    assert.deepEqual([await pendingParts(), (await offersOf(at)).length], [[], 2], 'applied: the omitted offer is sent again');
  });

  test('two requests from an unsolicited snapshot applied later settle once answered in turn', async () => {
    await readyWorker();
    await placed('task-1');
    for (let sequence = 2; sequence <= 4; sequence += 1) value(await pressure(sequence));
    value(await report({ reportId: 'report-1', snapshot: 1, throughSequence: 5 }));
    value(await pressure(5));
    assert.equal((await requests()).length, 2, 'one at receipt, one when applied');
    assert.equal(await answerInTurn({ throughSequence: 5 }), 2);
    assert.equal((await requests()).length, 2);
  });

  test('a delayed snapshot after a later one from the same journal is discarded and never applied', async () => {
    await readyWorker();
    const at = await placed('task-1');
    value(await report({ reportId: 'report-4', snapshot: 4, throughSequence: 9, parts: 2, assignments: [at] }));
    value(await report({ reportId: 'report-3', snapshot: 3, throughSequence: 1 }));
    assert.deepEqual([await pendingParts(), (await offersOf(at)).length], [['report-4.1'], 1]);
  });

  test('a report whose parts disagree is deleted without effect and logged', async () => {
    await readyWorker();
    const at = await placed('task-1');
    value(await report({ reportId: 'report-1', snapshot: 1, throughSequence: 1, parts: 2 }));
    assert.equal(value(await report({ reportId: 'report-1', snapshot: 1, throughSequence: 1, parts: 3, part: 2 })), 'applied');
    assert.deepEqual([await pendingParts(), (await offersOf(at)).length], [[], 1]);
    assert.deepEqual(warnings('execution.inventory.refused'), [
      { workerId: WORKER, journalId: JOURNAL, reportId: 'report-1', reason: 'inconsistent-parts' },
    ]);
  });

  test('a refused report leaves the highest snapshot alone, so a later fresh snapshot handles its omission', async () => {
    await readyWorker();
    const at = await placed('task-1');
    await inventory.requestAll([WORKER as WorkerId]);
    const requestId = (await currentRequest())!.request_id;
    value(await report({ reportId: 'report-1', snapshot: 100, throughSequence: 1, parts: 2, requestId }));
    value(await report({ reportId: 'report-1', snapshot: 1, throughSequence: 1, parts: 2, part: 2, requestId }));
    assert.equal(warnings('execution.inventory.refused').length, 1);
    const [cursor] = await sql<{ reported_snapshot: string }>('SELECT reported_snapshot FROM producer_cursors WHERE journal_id = $1', [JOURNAL]);
    assert.equal(Number(cursor?.reported_snapshot ?? 0), 0);
    value(await report({ reportId: 'report-2', snapshot: 2, throughSequence: 1, requestId }));
    assert.deepEqual([await pendingParts(), (await offersOf(at)).length, await retired()], [[], 2, false], 'applied: the offer is sent again');
  });

  test('several incomplete answers to one request keep only the newest', async () => {
    await enroll();
    await inventory.requestAll([WORKER as WorkerId]);
    const requestId = (await currentRequest())!.request_id;
    for (let snapshot = 1; snapshot <= 5; snapshot += 1) {
      value(await report({ reportId: `report-${snapshot}`, snapshot, throughSequence: 0, parts: 2, requestId }));
    }
    assert.deepEqual(await pendingParts(), ['report-5.1']);
  });

  test('incomplete answers to repeated requests keep only the current one and the newest that is not fresh', async () => {
    await enroll();
    for (let snapshot = 1; snapshot <= 10; snapshot += 1) {
      await inventory.requestAll([WORKER as WorkerId]);
      const requestId = (await currentRequest())!.request_id;
      value(await report({ reportId: `report-${snapshot}`, snapshot, throughSequence: 0, parts: 2, requestId }));
    }
    assert.deepEqual(await pendingParts(), ['report-10.1']);
    await inventory.requestAll([WORKER as WorkerId]);
    assert.deepEqual(await pendingParts(), ['report-10.1'], 'no longer fresh, but the newest');
    value(await report({ reportId: 'report-11', snapshot: 11, throughSequence: 0, parts: 2 }));
    assert.deepEqual(await pendingParts(), ['report-11.1']);
  });

  test('a fresh snapshot below its bound retires the journal and is not applied', async () => {
    await readyWorker();
    const at = await placed('task-1');
    for (let sequence = 2; sequence <= 9; sequence += 1) value(await pressure(sequence));
    await inventory.requestAll([WORKER as WorkerId]);
    value(await report({ reportId: 'report-1', snapshot: 5, throughSequence: 6, requestId: (await currentRequest())!.request_id }));
    assert.deepEqual([await retired(), (await workerRow()).reachable, (await offersOf(at)).length], [true, false, 1]);
    assert.deepEqual(warnings('execution.journal.retired'), [{ workerId: WORKER, journalId: JOURNAL, cause: 'snapshot-rollback' }]);
    assert.equal((await assignmentOf(at)).reservation.state, 'held');
  });

  test('a fresh snapshot with a rolled-back counter that omits a bound assignment retires the journal and replaces nothing', async () => {
    await readyWorker();
    const at = await placed('task-1');
    value(await accept(2, at));
    value(await report({ reportId: 'report-7', snapshot: 7, throughSequence: 2, assignments: [at] }));
    await inventory.requestAll([WORKER as WorkerId]);
    value(await report({ reportId: 'report-2', snapshot: 2, throughSequence: 2, requestId: (await currentRequest())!.request_id }));
    assert.equal(await retired(), true);
    const [cursor] = await sql<{ reported_snapshot: string }>('SELECT reported_snapshot FROM producer_cursors WHERE journal_id = $1', [JOURNAL]);
    assert.equal(cursor?.reported_snapshot, '7');
    assert.deepEqual(await pendingParts(), []);
  });

  test('a snapshot without the current request below the bound proves nothing', async () => {
    await readyWorker();
    for (let sequence = 2; sequence <= 9; sequence += 1) value(await pressure(sequence));
    await inventory.requestAll([WORKER as WorkerId]);
    value(await report({ reportId: 'report-1', snapshot: 1, throughSequence: 3 }));
    assert.deepEqual([await retired(), (await workerRow()).reachable], [false, true]);
  });

  test('a snapshot does not change the state it reports for an execution', async () => {
    await readyWorker();
    const at = await placed('task-1');
    value(await accept(2, at));
    const executionId = await launch(at);
    value(await report({
      reportId: 'report-1', snapshot: 1, throughSequence: 2, assignments: [at],
      executions: [{ executionId, assignmentId: at.assignment.id, state: 'exited', uncertain: true }],
    }));
    assert.deepEqual([executionOf(await stored(at.taskId)).state, executionOf(await stored(at.taskId)).evidence], ['authorized', []]);
  });
});

describe('omitted assignments and re-sent offers', () => {
  test('a restored journal that lost an acknowledged offer gets the stored offer again, byte for byte (worker journal line 218)', async () => {
    await readyWorker();
    const at = await placed('task-1');
    value(await accept(2, at));
    assert.deepEqual((await assignmentOf(at)).acceptance, { journalId: JOURNAL, sequence: 2 });
    value(await report({ reportId: 'report-1', snapshot: 1, throughSequence: 2 }));
    const [original, resent, ...more] = await offersOf(at);
    assert.deepEqual(more, []);
    assert.equal(original?.event_id, at.assignment.offerCommandId);
    assert.match(resent!.event_id, /^r[0-9a-f]{64}$/);
    const payload = (row: OutboxRow) => JSON.stringify(JSON.parse(row.message).payload);
    assert.equal(payload(resent!), payload(original!));
    const command = JSON.parse(resent!.message).payload.metadata as { commandId: string; issuedAt: string };
    assert.deepEqual([command.commandId, command.issuedAt], [at.assignment.offerCommandId, JSON.parse(original!.message).payload.metadata.issuedAt]);
    assert.ok(checkMessageSchema('AssignmentOfferCommand', JSON.parse(resent!.message).payload).ok);
    assert.equal((await assignmentOf(at)).state, 'accepted');
  });

  test('an omitted assignment whose execution holds a grant records lost local history, keeps its state, and is not retried', async () => {
    await readyWorker();
    const at = await placed('task-1');
    value(await accept(2, at));
    await launch(at);
    value(await report({ reportId: 'report-1', snapshot: 1, throughSequence: 2 }));
    const task = await stored(at.taskId);
    assert.deepEqual([executionOf(task).state, executionOf(task).evidence.map(({ kind }) => kind)], ['authorized', ['local-history-lost']]);
    assert.deepEqual([task.attempts.length, task.attempts[0]!.outcome], [1, undefined]);
    assert.equal((await assignmentOf(at)).reservation.state, 'held');
    assert.equal((await offersOf(at)).length, 1, 'never re-sent once granted');
    value(await report({ reportId: 'report-2', snapshot: 2, throughSequence: 2 }));
    assert.equal(executionOf(await stored(at.taskId)).evidence.length, 1, 'recorded once');
    assert.equal(value(await placement.placeWaiting()).placed, 0, 'no retry is placed');
  });

  test('an unsolicited snapshot that omits an offer never accepted re-sends it, requests inventory, and changes no execution', async () => {
    await readyWorker();
    const at = await placed('task-1');
    const before = await stored(at.taskId);
    value(await report({ reportId: 'report-1', snapshot: 1, throughSequence: 1 }));
    assert.equal((await offersOf(at)).length, 2);
    assert.equal((await requests()).length, 1);
    assert.deepEqual(await stored(at.taskId), before);
  });

  test('an answer to a superseded request that omits an offer never accepted re-sends it and requests nothing', async () => {
    await readyWorker();
    const at = await placed('task-1');
    await inventory.requestAll([WORKER as WorkerId]);
    await inventory.requestAll([WORKER as WorkerId]);
    const [first] = await requests();
    value(await report({ reportId: 'report-1', snapshot: 1, throughSequence: 1, requestId: String(first!.requestId) }));
    assert.equal((await offersOf(at)).length, 2);
    assert.equal((await requests()).length, 2);
  });

  test('two outstanding requests settle while every answer omits an active offer never accepted', async () => {
    await readyWorker();
    const at = await placed('task-1');
    await inventory.requestAll([WORKER as WorkerId]);
    await inventory.requestAll([WORKER as WorkerId]);
    assert.equal(await answerInTurn({ throughSequence: 1 }), 2);
    assert.equal((await requests()).length, 2);
    assert.equal((await offersOf(at)).length, 3, 'each answer re-sends the offer');
  });

  test('two outstanding requests settle once the worker refuses the re-sent offer', async () => {
    await readyWorker();
    const at = await placed('task-1');
    await inventory.requestAll([WORKER as WorkerId]);
    await inventory.requestAll([WORKER as WorkerId]);
    const [first] = await requests();
    value(await report({ reportId: 'answer-1', snapshot: 1, throughSequence: 1, requestId: String(first!.requestId) }));
    assert.equal(value(await refuse(2, at, 'resource-ceiling-exceeded')), 'applied');
    assert.equal((await assignmentOf(at)).state, 'ended');
    assert.equal(await answerInTurn({ throughSequence: 2 }, 1), 2);
    assert.equal((await requests()).length, 2);
    assert.equal((await offersOf(at)).length, 2, 'only the first answer re-sends the offer');
  });

  test('a fresh snapshot that omits an acceptance above it only re-sends the offer', async () => {
    await readyWorker();
    const at = await placed('task-1');
    await inventory.requestAll([WORKER as WorkerId]);
    value(await accept(2, at));
    value(await report({ reportId: 'report-1', snapshot: 1, throughSequence: 1, requestId: (await currentRequest())!.request_id }));
    assert.deepEqual([(await offersOf(at)).length, (await requests()).length, await retired()], [2, 1, false]);
  });

  test('a fresh snapshot that omits an undelivered offer re-sends it and requests nothing more', async () => {
    await readyWorker();
    const at = await placed('task-1');
    await inventory.requestAll([WORKER as WorkerId]);
    value(await report({ reportId: 'report-1', snapshot: 1, throughSequence: 1, requestId: (await currentRequest())!.request_id }));
    assert.deepEqual([(await offersOf(at)).length, (await requests()).length], [2, 1]);
  });

  test('two snapshots each re-send the same offer under their own identity', async () => {
    await readyWorker();
    const at = await placed('task-1');
    value(await report({ reportId: 'report-1', snapshot: 1, throughSequence: 1 }));
    value(await report({ reportId: 'report-2', snapshot: 2, throughSequence: 1 }));
    const rows = await offersOf(at);
    assert.equal(new Set(rows.map((row) => row.event_id)).size, 3);
    assert.equal(new Set(rows.map((row) => JSON.stringify(JSON.parse(row.message).payload))).size, 1);
  });

  test('an assignment whose offer left the outbox is not re-sent, which is logged', async () => {
    await readyWorker();
    const at = await placed('task-1');
    await sql('DELETE FROM outbox WHERE event_id = $1', [at.assignment.offerCommandId]);
    value(await report({ reportId: 'report-1', snapshot: 1, throughSequence: 1 }));
    assert.deepEqual(await offersOf(at), []);
    assert.deepEqual(warnings('execution.offer.not-resent'), [{ workerId: WORKER, assignmentId: at.assignment.id, reason: 'offer-not-stored' }]);
  });
});

describe('journal incarnations', () => {
  test('a new incarnation replaces a missing journal and reconciles every unfinished assignment (worker journal line 217)', async () => {
    await readyWorker();
    const ungranted = await placed('task-1');
    const granted = await placed('task-2');
    value(await accept(2, ungranted));
    value(await accept(3, granted));
    await launch(granted);
    assert.equal(value(await declare(1, NEW_JOURNAL)), 'applied');
    assert.deepEqual([await enrolledJournal(), (await workerRow()).journal_id, await retired(JOURNAL)], [NEW_JOURNAL, NEW_JOURNAL, true]);
    assert.deepEqual(warnings('execution.journal.replaced'), [{ workerId: WORKER, previousJournalId: JOURNAL, journalId: NEW_JOURNAL }]);
    assert.equal((await offersOf(ungranted)).length, 2);
    assert.equal((await offersOf(granted)).length, 1);
    const task = await stored(granted.taskId);
    assert.deepEqual([executionOf(task).state, executionOf(task).evidence.map(({ kind }) => kind)], ['authorized', ['local-history-lost']]);
    assert.deepEqual([(await assignmentOf(granted)).reservation.state, (await workerRow()).reachable], ['held', true]);
  });

  test('an acceptance derived again under a new incarnation fills its sequence, so a snapshot through it applies', async () => {
    await readyWorker();
    const at = await placed('task-1');
    const acceptance = (journalId: string, sequence: number) => observe('execution.assignment.accepted', {
      sequence, journalId, observationId: 'acceptance-1', ...attemptOf(at),
    }, { commandId: at.assignment.offerCommandId, assignmentId: at.assignment.id });
    value(await acceptance(JOURNAL, 2));
    value(await declare(1, NEW_JOURNAL));
    assert.equal((await offersOf(at)).length, 2, 'the offer is sent again');
    assert.equal(value(await acceptance(NEW_JOURNAL, 2)), 'duplicate');
    value(await pressure(3, { journalId: NEW_JOURNAL }));
    const [cursor] = await sql<{ confirmed_through: string; applied_above: unknown }>(
      'SELECT confirmed_through, applied_above FROM producer_cursors WHERE journal_id = $1', [NEW_JOURNAL]);
    assert.deepEqual([Number(cursor!.confirmed_through), cursor!.applied_above], [3, []]);
    const confirmed = (await outbox('execution.observations.confirmed')).map((row) => JSON.parse(row.message).payload);
    assert.deepEqual(confirmed.filter((payload) => payload.journalId === NEW_JOURNAL).map((payload) => payload.confirmedThrough), [1, 2, 3]);
    value(await report({ reportId: 'report-1', snapshot: 1, throughSequence: 3, journalId: NEW_JOURNAL }));
    assert.deepEqual([await pendingParts(), (await offersOf(at)).length], [[], 3], 'applied: the omitted offer is sent again');
    assert.equal(value(await acceptance(NEW_JOURNAL, 2)), 'duplicate');
    assert.equal((await outbox('execution.observations.confirmed')).length, confirmed.length + 1, 'a true repeat confirms again');
  });

  test('the first declaration of a new incarnation applies below the previous journal\'s fences', async () => {
    await readyWorker();
    value(await declare(3));
    value(await pressure(4));
    assert.equal(value(await declare(1, NEW_JOURNAL, 2)), 'applied');
    const [row] = await sql<{ slots: number; capacity_sequence: string; pressure_sequence: string }>(
      'SELECT slots, capacity_sequence, pressure_sequence FROM workers WHERE worker_id = $1', [WORKER]);
    assert.deepEqual([row!.slots, Number(row!.capacity_sequence), Number(row!.pressure_sequence)], [2, 1, 0]);
  });

  test('an inventory report of a new incarnation replaces the journal too', async () => {
    await readyWorker();
    const at = await placed('task-1');
    value(await report({ reportId: 'report-1', snapshot: 1, throughSequence: 0, journalId: NEW_JOURNAL, assignments: [at] }));
    assert.deepEqual([await enrolledJournal(), (await offersOf(at)).length], [NEW_JOURNAL, 2]);
  });

  test('a previously seen journal is refused and changes nothing', async () => {
    await readyWorker();
    value(await declare(1, NEW_JOURNAL));
    const contact = (await workerRow()).last_contact_at;
    const before = await sql('SELECT * FROM producer_cursors ORDER BY journal_id');
    assert.equal(failed(await pressure(2, { journalId: JOURNAL })).details.reason, 'not-consumed');
    assert.equal(failed(await report({ reportId: 'report-1', snapshot: 1, throughSequence: 1 })).details.reason, 'not-consumed');
    assert.deepEqual([await enrolledJournal(), (await workerRow()).last_contact_at, await sql('SELECT * FROM producer_cursors ORDER BY journal_id')],
      [NEW_JOURNAL, contact, before]);
    assert.deepEqual(warnings('execution.journal.refused'), [
      { workerId: WORKER, journalId: JOURNAL }, { workerId: WORKER, journalId: JOURNAL },
    ]);
  });

  test('a revoked worker\'s unseen journal is refused and does not replace the enrolled one', async () => {
    await enroll();
    value(await database.transaction(async (tx) => tx.fleet.revoke(WORKER as WorkerId, AT as never)));
    assert.equal(failed(await declare(1, NEW_JOURNAL)).details.reason, 'not-consumed');
    assert.deepEqual([await enrolledJournal(), (await workerRow()).last_contact_at, await sql('SELECT * FROM producer_cursors')], [JOURNAL, null, []]);
  });

  test('a journal that another worker holds is refused, and neither worker\'s journal changes', async () => {
    await enroll();
    await enroll('worker-b', 'journal-b');
    assert.equal(failed(await declare(1, 'journal-b')).details.reason, 'not-consumed');
    assert.deepEqual([await enrolledJournal(), await enrolledJournal('worker-b'), (await workerRow()).last_contact_at], [JOURNAL, 'journal-b', null]);
    assert.deepEqual(warnings('execution.journal.replaced'), []);
  });
});

describe('journal retirement after a rollback', () => {
  test('a rollback that repeats a sequence retires the journal; the worker gets no new work and keeps its reservations', async () => {
    await readyWorker();
    const at = await placed('task-1');
    value(await pressure(2, { observationId: 'pressure-2' }));
    assert.equal(failed(await pressure(2)).details.reason, 'not-consumed');
    assert.deepEqual([await retired(), (await workerRow()).reachable], [true, false]);
    assert.deepEqual(warnings('execution.journal.retired'), [{ workerId: WORKER, journalId: JOURNAL, cause: 'sequence-rollback' }]);
    assert.equal((await assignmentOf(at)).reservation.state, 'held');
    value(await tasks.submitTask('run-1', { taskId: 'task-2', kind: 'planning', stageId: 'specs' }, 'correlation-1' as CorrelationId));
    assert.equal(value(await placement.placeWaiting()).placed, 0);
  });

  test('a later observation or report of a retired journal is refused, and the worker stays unreachable', async () => {
    await readyWorker();
    value(await pressure(2, { observationId: 'pressure-2' }));
    failed(await pressure(2));
    assert.equal(failed(await pressure(3)).details.reason, 'not-consumed');
    assert.equal(failed(await report({ reportId: 'report-1', snapshot: 1, throughSequence: 3 })).details.reason, 'not-consumed');
    assert.equal((await workerRow()).reachable, false);
    assert.equal(value(await declare(1, NEW_JOURNAL)), 'applied', 'a new incarnation replaces it');
    assert.equal((await workerRow()).reachable, true);
  });
});

describe('execution evidence observations', () => {
  test('an uncertain execution stays authorized with its evidence, and its attempt cannot end until a terminal fact', async () => {
    await readyWorker();
    const at = await placed('task-1');
    const executionId = await launch(at);
    assert.equal(value(await observe('execution.uncertain', { sequence: 2, ...attemptOf(at) }, { executionId, recoveryEpoch: 1 })), 'applied');
    const task = await stored(at.taskId);
    assert.deepEqual([executionOf(task).state, executionOf(task).evidence.map(({ kind }) => kind), task.attempts[0]!.outcome], [
      'authorized', ['uncertain'], undefined,
    ]);
  });

  test('an unproven termination after an exit is rejected without effect and confirmed', async () => {
    await readyWorker();
    const at = await placed('task-1');
    const executionId = await launch(at);
    value(await observe('execution.exited', { sequence: 2, ...attemptOf(at) }, {
      executionId, recoveryEpoch: 1, status: { kind: 'code', code: 0 }, startProven: true, spawnFailed: false, terminationEvidence: 'containment-empty',
    }));
    const before = await stored(at.taskId);
    assert.equal(value(await observe('execution.termination-unproven', { sequence: 3, ...attemptOf(at) }, { executionId, recoveryEpoch: 1, survivors: [] })), 'rejected');
    assert.deepEqual(await stored(at.taskId), before);
    const confirmed = (await outbox('execution.observations.confirmed')).map((row) => JSON.parse(row.message).payload.confirmedThrough);
    assert.equal(confirmed.at(-1), 3);
  });

  test('a cancellation not applied keeps the request pending, and the later exit ends the attempt as cancelled', async () => {
    await readyWorker();
    const at = await placed('task-1');
    const executionId = await launch(at);
    value(await database.transaction(async (tx) => {
      const task = await tx.tasks.get(at.taskId);
      if (!task.ok) return task;
      const cancelled = requestCancellation(task.value, at.attemptId, 'requested', await tx.now());
      return cancelled.ok ? tx.tasks.replace(cancelled.value, task.value.generation) : cancelled;
    }));
    const commandId = 'cancellation-1';
    assert.equal(value(await observe('execution.cancellation.not-applied', { sequence: 2, ...attemptOf(at) }, {
      commandId, executionId, recoveryEpoch: 1, reason: 'adopting-supervisor',
    })), 'applied');
    const pending = await stored(at.taskId);
    assert.deepEqual([executionOf(pending).state, pending.attempts[0]!.cancellation?.reason], ['authorized', 'requested']);
    value(await observe('execution.exited', { sequence: 3, ...attemptOf(at) }, {
      executionId, recoveryEpoch: 1, status: { kind: 'signal', signal: 'SIGKILL' }, startProven: true, spawnFailed: false, terminationEvidence: 'containment-empty',
    }));
    const ended = (await stored(at.taskId)).attempts[0]!.outcome;
    assert.deepEqual([ended?.kind, ended?.cancelled], ['exited', true]);
  });

  test('an unrecorded process changes nothing, is confirmed, and is logged as a warning', async () => {
    await readyWorker();
    const at = await placed('task-1');
    const before = [await stored(at.taskId), await assignmentOf(at)];
    assert.equal(value(await observe('execution.unrecorded-process', { sequence: 2 }, {
      containment: 'taskelith-orphan-1', recoveryEpoch: 1, processes: [{ platform: 'linux', bootId: 'boot-1', pid: 4242, startTime: 1234, processGroupId: 4242 }],
    })), 'applied');
    assert.deepEqual([await stored(at.taskId), await assignmentOf(at)], before);
    const confirmed = (await outbox('execution.observations.confirmed')).map((row) => JSON.parse(row.message).payload.confirmedThrough);
    assert.equal(confirmed.at(-1), 2);
    assert.deepEqual(warnings('execution.unrecorded-process').map(({ workerId, containment, processCount }) => [workerId, containment, processCount]), [
      [WORKER, 'taskelith-orphan-1', 1],
    ]);
  });
});
