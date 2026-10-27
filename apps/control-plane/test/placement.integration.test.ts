import assert from 'node:assert/strict';
import { after, beforeEach, describe, test } from 'node:test';
import pg from 'pg';
import { checkHttpSchema } from '@taskelith/contracts';
import {
  DelegationService,
  PLACEMENT_BATCH,
  PlacementService,
  RunService,
  TaskService,
  WorkflowRegistry,
  type ControlPlaneStore,
  type ControlPlaneTransaction,
  type DelegationRequestBody,
} from '@taskelith/control-plane';
import { openAttempt, type AttemptId, type Task, type WorkerId } from '@taskelith/execution';
import { fleetToken, fleetWorker, type EnrolledWorker } from '@taskelith/fleet';
import type { CorrelationId } from '@taskelith/kernel';
import { PostgresDatabase, migrate, type PostgresTransaction } from '@taskelith/postgres';
import { endAssignment } from '@taskelith/scheduling';
import { parseWorkflowDefinition, type TaskId } from '@taskelith/sdlc';
import { failed, integrationEndpoint, value } from '@taskelith/testing';

const POSTGRES = integrationEndpoint('TASKELITH_POSTGRES_URL');
const databaseName = `taskelith_placement_${process.pid}`;
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
  'workflow_runs', 'gates', 'admissions', 'tasks', 'assignments', 'outbox', 'task_lineage', 'capacity_charges', 'delegations',
  'capacity_quotas', 'workers', 'installation', 'enrollment_tokens', 'delegation_requests', 'current_revisions', 'producer_cursors',
];
const CORRELATION = 'correlation-1' as CorrelationId;
const tasks = new TaskService(database);
const delegations = new DelegationService(database);
// No jitter; each test starts with a service that holds no backoff.
const TIMING = { now: Date.now, draw: () => 0 };
let placement: PlacementService;

beforeEach(async () => {
  placement = new PlacementService(database, TIMING);
  await sql(`TRUNCATE ${TABLES.join(', ')}`);
  await sql('INSERT INTO installation (quarantined, recovery_epoch) VALUES (false, 1)');
  const runs = new RunService(database, new WorkflowRegistry([{ definition, digest: DIGEST }]));
  value(await runs.createRun({ runId: 'run-1', projectId: 'project-1', binding }));
});

// Enrolled and reachable; these tests send no observation, the first
// contact, so it is set here.
async function enroll(workerId: string, capacity: Partial<EnrolledWorker['capacity']> = {}): Promise<void> {
  const worker = fleetWorker(workerId, `journal-${workerId}`, {
    capacity: { slots: 2, cpuMillicores: 4000, memoryMebibytes: 8192, controls: [], ...capacity },
  });
  value(await database.transaction(async (tx) => {
    const added = await tx.fleet.addToken(fleetToken(`token-${workerId}`));
    return added.ok ? tx.fleet.enroll(`token-${workerId}` as never, worker) : added;
  }));
  await sql('UPDATE workers SET reachable = true WHERE worker_id = $1', [workerId]);
}

async function submit(taskId: string, runId = 'run-1'): Promise<void> {
  value(await tasks.submitTask(runId, { taskId, kind: 'planning', stageId: 'specs' }, CORRELATION));
}

async function createSecondRun(): Promise<void> {
  value(await new RunService(database, new WorkflowRegistry([{ definition, digest: DIGEST }])).createRun({ runId: 'run-2', projectId: 'project-2', binding }));
}

// Two slots; task-1 and task-2 wait in project-1, task-3 in project-2.
async function submitTwoProjects(): Promise<void> {
  await enroll('worker-a', { slots: 2 });
  await createSecondRun();
  await submit('task-1');
  await submit('task-2');
  await submit('task-3', 'run-2');
}

// Sets the column the placement queue orders by, independent of the clock.
async function waitingSince(taskId: string, at: string): Promise<void> {
  await sql('UPDATE tasks SET placement_waiting_since = $2 WHERE id = $1', [taskId, at]);
}

async function placedTasks(): Promise<string[]> {
  const rows = await sql<{ task_id: string }>('SELECT task_id FROM assignments ORDER BY task_id');
  return rows.map((row) => row.task_id);
}

async function stored(taskId: string): Promise<Task> {
  return value(await database.transaction((tx) => tx.tasks.get(taskId as TaskId)));
}

interface AssignmentRow {
  readonly id: string;
  readonly attempt_id: string;
  readonly worker_id: string;
  readonly reservation_state: string;
  readonly record: string;
}

async function assignmentsOf(taskId: string): Promise<AssignmentRow[]> {
  return sql<AssignmentRow>('SELECT id, attempt_id, worker_id, reservation_state, record FROM assignments WHERE task_id = $1 ORDER BY changed_at, id', [taskId]);
}

async function offers(): Promise<{ subject: string; payload: { metadata: Record<string, unknown> } }[]> {
  const rows = await sql<{ message: string }>("SELECT message FROM outbox WHERE event_type = 'execution.assignment.offer' ORDER BY position");
  return rows.map((row) => JSON.parse(row.message));
}

// The workers each placement transaction reads, in order.
function spyingStore(asked: string[]): ControlPlaneStore {
  const spy = (tx: PostgresTransaction): ControlPlaneTransaction => ({
    ...tx,
    now: () => tx.now(),
    workers: {
      get: (workerId) => (asked.push(workerId), tx.workers.get(workerId)),
      eligibleSlots: () => tx.workers.eligibleSlots(),
      candidates: () => tx.workers.candidates(),
    },
  });
  return { transaction: (work) => database.transaction((tx) => work(spy(tx))), readCommitted: (work) => database.readCommitted((tx) => work(spy(tx))) };
}

describe('placement', () => {
  test('a submitted task is placed with its attempt, assignment, and offer in one pass, once', async () => {
    await enroll('worker-a');
    await submit('task-1');
    assert.deepEqual(value(await placement.placeWaiting()), { waiting: 1, placed: 1 });
    const task = await stored('task-1');
    assert.deepEqual([task.attempts.length, task.ownershipGeneration], [1, 2]);
    const [assignment, ...others] = await assignmentsOf('task-1');
    assert.deepEqual([assignment?.attempt_id, assignment?.worker_id, assignment?.reservation_state, others], [task.attempts[0]!.id, 'worker-a', 'held', []]);
    const [offer] = await offers();
    assert.equal(offer?.subject, 'workers.worker-a.commands');
    assert.deepEqual([offer?.payload.metadata.attemptId, offer?.payload.metadata.ownershipGeneration], [task.attempts[0]!.id, 2]);
    assert.deepEqual(value(await placement.placeWaiting()), { waiting: 0, placed: 0 }, 'a placed attempt does not wait');
    assert.equal((await assignmentsOf('task-1')).length, 1);
  });

  test('without capacity nothing is written and the task still waits', async () => {
    await enroll('worker-a', { cpuMillicores: 500 });
    await submit('task-1');
    const before = await stored('task-1');
    assert.deepEqual(value(await placement.placeWaiting()), { waiting: 1, placed: 0 });
    assert.deepEqual(await stored('task-1'), before);
    assert.deepEqual([await assignmentsOf('task-1'), await offers()], [[], []]);
    assert.deepEqual(value(await placement.placeWaiting()), { waiting: 1, placed: 0 }, 'it does not back off');
  });

  test('a slot freed after a fleet capacity decline goes to the next project, not the larger backlog', async () => {
    await enroll('worker-a', { slots: 1 });
    for (let index = 1; index <= 50; index++) await submit(`task-a${String(index).padStart(2, '0')}`);
    await createSecondRun();
    await submit('task-b', 'run-2');
    const clock = { at: Date.now() };
    // A long jitter for the first decline, task-b's; none for the rest.
    const draws = [0.9];
    const timed = new PlacementService(database, { now: () => clock.at, draw: () => draws.shift() ?? 0 });
    assert.deepEqual(value(await timed.placeWaiting()), { waiting: 51, placed: 1 });
    await sql('UPDATE workers SET slots = slots + 1');
    clock.at += 5_000;
    assert.equal(value(await timed.placeWaiting()).placed, 1);
    assert.deepEqual(await placedTasks(), ['task-a01', 'task-b']);
  });

  test('without a candidate no placement transaction is opened', async () => {
    await submit('task-1');
    const asked: string[] = [];
    assert.deepEqual(value(await new PlacementService(spyingStore(asked), TIMING).placeWaiting()), { waiting: 1, placed: 0 });
    assert.deepEqual(asked, []);
  });

  test('a full first candidate passes the attempt to the next one', async () => {
    await enroll('worker-a', { cpuMillicores: 500 });
    await enroll('worker-b');
    await submit('task-1');
    const asked: string[] = [];
    assert.deepEqual(value(await new PlacementService(spyingStore(asked), TIMING).placeWaiting()), { waiting: 1, placed: 1 });
    assert.deepEqual([...new Set(asked)], ['worker-a', 'worker-b']);
    assert.equal((await assignmentsOf('task-1'))[0]?.worker_id, 'worker-b');
  });

  test('an exhausted project quota ends the try at the first candidate', async () => {
    await enroll('worker-a');
    await enroll('worker-b');
    await submit('task-1');
    value(await placement.placeWaiting());
    await sql("INSERT INTO capacity_quotas (scope, scope_id, quota) VALUES ('project', 'project-1', 1)");
    await submit('task-2');
    const asked: string[] = [];
    assert.deepEqual(value(await new PlacementService(spyingStore(asked), TIMING).placeWaiting()), { waiting: 1, placed: 0 });
    assert.deepEqual([...new Set(asked)], ['worker-b'], 'worker-b holds fewer reservations');
    assert.deepEqual([(await stored('task-2')).attempts, await assignmentsOf('task-2')], [[], []]);
  });

  test('a new placement of the active attempt claims the next ownership generation', async () => {
    await enroll('worker-a');
    await submit('task-1');
    value(await placement.placeWaiting());
    const attemptId = (await stored('task-1')).attempts[0]!.id;
    value(await database.transaction(async (tx) => {
      const [held] = await tx.assignments.listByAttempt(attemptId);
      const ended = endAssignment(held!, held!.generation, 'cancelled', { granted: false, nonTerminal: false }, await tx.now());
      return ended.ok ? tx.assignments.replace(ended.value, held!.generation) : ended;
    }));
    assert.deepEqual(value(await placement.placeWaiting()), { waiting: 1, placed: 1 });
    const task = await stored('task-1');
    assert.deepEqual([task.attempts.map((attempt) => attempt.id), task.ownershipGeneration], [[attemptId], 3]);
    const rows = await assignmentsOf('task-1');
    assert.deepEqual(rows.map((row) => [row.attempt_id, row.reservation_state, JSON.parse(row.record).ownershipGeneration]), [
      [attemptId, 'released', 2], [attemptId, 'held', 3],
    ]);
  });

  test('an active attempt never placed is placed at its current ownership generation', async () => {
    await enroll('worker-a');
    await submit('task-1');
    value(await database.transaction(async (tx) => {
      const task = await tx.tasks.get('task-1' as TaskId);
      if (!task.ok) return task;
      const opened = openAttempt(task.value, task.value.ownershipGeneration, { id: 'attempt-own' as AttemptId }, await tx.now());
      return opened.ok ? tx.tasks.replace(opened.value, task.value.generation) : opened;
    }));
    assert.deepEqual(value(await placement.placeWaiting()), { waiting: 1, placed: 1 });
    assert.equal((await stored('task-1')).ownershipGeneration, 2);
    assert.equal((await assignmentsOf('task-1'))[0]?.attempt_id, 'attempt-own');
  });

  test('tasks are placed in fair order across projects', async () => {
    await submitTwoProjects();
    await waitingSince('task-1', '2026-10-25T09:00:00.000Z');
    await waitingSince('task-2', '2026-10-25T09:00:01.000Z');
    await waitingSince('task-3', '2026-10-25T09:00:02.000Z');
    assert.deepEqual(value(await placement.placeWaiting()), { waiting: 3, placed: 2 });
    assert.deepEqual(await placedTasks(), ['task-1', 'task-3'], 'project-2 is served before project-1 again');
  });

  test('within a project the task waiting longest is placed, not the first submitted', async () => {
    await submitTwoProjects();
    await waitingSince('task-1', '2026-10-25T09:00:01.000Z');
    await waitingSince('task-2', '2026-10-25T09:00:00.000Z');
    await waitingSince('task-3', '2026-10-25T09:00:02.000Z');
    assert.deepEqual(value(await placement.placeWaiting()), { waiting: 3, placed: 2 });
    assert.deepEqual(await placedTasks(), ['task-2', 'task-3']);
  });

  test('a full batch of one project\'s older blocked tasks does not hide another project\'s task', async () => {
    await enroll('worker-a', { slots: 4 });
    await submit('task-a0');
    value(await placement.placeWaiting());
    await sql("INSERT INTO capacity_quotas (scope, scope_id, quota) VALUES ('project', 'project-1', 1)");
    for (let index = 1; index <= PLACEMENT_BATCH + 1; index++) await submit(`task-a${index}`);
    await createSecondRun();
    await submit('task-b', 'run-2');
    assert.deepEqual(value(await placement.placeWaiting()), { waiting: PLACEMENT_BATCH, placed: 1 });
    assert.equal((await assignmentsOf('task-b')).length, 1);
  });

  test('a later pass reaches the next project once a full batch of blocked tasks backs off', async () => {
    await enroll('worker-a');
    const runs = new RunService(database, new WorkflowRegistry([{ definition, digest: DIGEST }]));
    const projects = Array.from({ length: PLACEMENT_BATCH + 1 }, (_, index) => String(index + 1).padStart(3, '0'));
    for (const project of projects) {
      value(await runs.createRun({ runId: `run-${project}`, projectId: `project-${project}`, binding }));
      await submit(`task-${project}`, `run-${project}`);
    }
    for (const project of projects.slice(0, PLACEMENT_BATCH)) {
      await sql("INSERT INTO capacity_quotas (scope, scope_id, quota) VALUES ('project', $1, 0)", [`project-${project}`]);
    }
    const clock = { at: Date.now() };
    const advancing = new PlacementService(database, { now: () => clock.at, draw: () => 0 });
    assert.deepEqual(value(await advancing.placeWaiting()), { waiting: PLACEMENT_BATCH, placed: 0 });
    clock.at += 1_000;
    assert.deepEqual(value(await advancing.placeWaiting()), { waiting: 1, placed: 1 });
    const placed = await sql<{ task_id: string }>('SELECT task_id FROM assignments');
    assert.deepEqual(placed.map((row) => row.task_id), [`task-${projects.at(-1)}`]);
  });

  test('each placement reads the candidates again, so two tasks go to two workers', async () => {
    await enroll('worker-a');
    await enroll('worker-b');
    await submit('task-1');
    await submit('task-2');
    assert.deepEqual(value(await placement.placeWaiting()), { waiting: 2, placed: 2 });
    const rows = await sql<{ worker_id: string }>('SELECT worker_id FROM assignments ORDER BY worker_id');
    assert.deepEqual(rows.map((row) => row.worker_id), ['worker-a', 'worker-b']);
  });

  test('two concurrent passes over one task place it once, with one charge and one offer', async () => {
    await enroll('worker-a');
    await submit('task-1');
    const passes = await Promise.all([placement.placeWaiting(), new PlacementService(database, TIMING).placeWaiting()]);
    assert.equal(passes.reduce((sum, pass) => sum + value(pass).placed, 0), 1);
    assert.equal((await assignmentsOf('task-1')).length, 1);
    assert.equal((await sql('SELECT attempt_id FROM capacity_charges')).length, 1);
    assert.equal((await offers()).length, 1);
    assert.equal((await stored('task-1')).ownershipGeneration, 2);
  });

  test('a new placement that no candidate reserves rolls its ownership claim back', async () => {
    await enroll('worker-a');
    await submit('task-1');
    value(await placement.placeWaiting());
    const attemptId = (await stored('task-1')).attempts[0]!.id;
    value(await database.transaction(async (tx) => {
      const [held] = await tx.assignments.listByAttempt(attemptId);
      const ended = endAssignment(held!, held!.generation, 'cancelled', { granted: false, nonTerminal: false }, await tx.now());
      return ended.ok ? tx.assignments.replace(ended.value, held!.generation) : ended;
    }));
    await sql("INSERT INTO capacity_quotas (scope, scope_id, quota) VALUES ('project', 'project-1', 0)");
    const before = await stored('task-1');
    assert.deepEqual(value(await placement.placeWaiting()), { waiting: 1, placed: 0 });
    assert.deepEqual(await stored('task-1'), before);
    assert.equal(before.ownershipGeneration, 2);
    assert.deepEqual((await assignmentsOf('task-1')).map((row) => row.reservation_state), ['released']);
  });
});

describe('delegation', () => {
  const PRINCIPAL = { workerId: 'worker-a' as WorkerId, generation: 1 };

  async function placedParent(slots = 2): Promise<{ attemptId: AttemptId; generation: number }> {
    await enroll('worker-a', { slots });
    await submit('task-1');
    value(await placement.placeWaiting());
    const task = await stored('task-1');
    return { attemptId: task.attempts[0]!.id, generation: task.ownershipGeneration };
  }

  function request(parent: { attemptId: string; generation: number }, overrides: Partial<DelegationRequestBody> = {}): DelegationRequestBody {
    return {
      delegationId: 'delegation-1', attemptId: parent.attemptId, ownershipGeneration: parent.generation, runId: 'run-1',
      child: { taskId: 'task-child', kind: 'planning', stageId: 'specs' }, ...overrides,
    };
  }

  test('the worker that holds the attempt delegates an admitted child, and a repeat returns it', async () => {
    const parent = await placedParent();
    const answer = value(await delegations.requestDelegation(PRINCIPAL, request(parent), CORRELATION));
    assert.ok(checkHttpSchema('DelegationOutcome', answer).ok, JSON.stringify(answer));
    assert.deepEqual([answer.state, 'parentTaskId' in answer && [answer.parentTaskId, answer.rootTaskId, answer.depth]], ['admitted', ['task-1', 'task-1', 1]]);
    const [link] = await sql('SELECT parent_task_id, root_task_id, depth FROM task_lineage WHERE task_id = $1', ['task-child']);
    assert.deepEqual(link, { parent_task_id: 'task-1', root_task_id: 'task-1', depth: 1 });
    assert.equal((await stored('task-child')).attempts.length, 0);
    const events = await sql<{ message: string }>("SELECT message FROM outbox WHERE event_type = 'sdlc.admission.used'");
    assert.equal(events.length, 2, 'the parent and the child');
    assert.deepEqual(value(await delegations.requestDelegation(PRINCIPAL, request(parent), CORRELATION)), answer);
    // A decided delegation is answered as stored once the parent lets go.
    await sql(`UPDATE assignments SET reservation_state = 'released',
      record = jsonb_set(record::jsonb, '{reservation,state}', '"released"')::text`);
    assert.deepEqual(value(await delegations.requestDelegation(PRINCIPAL, request(parent), CORRELATION)), answer);
  });

  test('a repeat with another child is a conflict, and another worker is forbidden; neither stores anything', async () => {
    const parent = await placedParent();
    value(await delegations.requestDelegation(PRINCIPAL, request(parent), CORRELATION));
    const other = request(parent, { child: { taskId: 'task-other', kind: 'planning', stageId: 'specs' } });
    assert.equal(failed(await delegations.requestDelegation(PRINCIPAL, other, CORRELATION)).code, 'conflict');
    await enroll('worker-b');
    const stranger = { workerId: 'worker-b' as WorkerId, generation: 1 };
    const refused = failed(await delegations.requestDelegation(stranger, request(parent, { delegationId: 'delegation-2' }), CORRELATION));
    assert.equal(refused.code, 'forbidden');
    assert.deepEqual(await sql('SELECT id FROM delegation_requests'), [{ id: 'delegation-1' }]);
    assert.deepEqual(await sql("SELECT id FROM tasks WHERE id = 'task-other'"), []);
    const stale = failed(await delegations.requestDelegation({ ...PRINCIPAL, generation: 2 }, request(parent), CORRELATION));
    assert.deepEqual([stale.code, stale.details.reason], ['forbidden', 'worker-not-authorized']);
  });

  test('a delegation that would leave no free unit waits, and a repeat decides again from the stored start', async () => {
    const parent = await placedParent(1);
    const waiting = value(await delegations.requestDelegation(PRINCIPAL, request(parent), CORRELATION));
    assert.deepEqual(waiting, { state: 'awaiting-capacity', delegationId: 'delegation-1' });
    assert.deepEqual(await sql("SELECT id FROM tasks WHERE id = 'task-child'"), []);
    assert.deepEqual(value(await delegations.requestDelegation(PRINCIPAL, request(parent), CORRELATION)), waiting);
    const [row] = await sql<{ record: string }>('SELECT record FROM delegation_requests');
    const backdated = { ...JSON.parse(row!.record), waitingSince: '2020-01-01T00:00:00.000Z' };
    await sql('UPDATE delegation_requests SET record = $1', [JSON.stringify(backdated)]);
    const rejected = { state: 'rejected', delegationId: 'delegation-1', reason: 'delegation-awaiting-capacity' };
    assert.deepEqual(value(await delegations.requestDelegation(PRINCIPAL, request(parent), CORRELATION)), rejected);
    await enroll('worker-b');
    assert.deepEqual(value(await delegations.requestDelegation(PRINCIPAL, request(parent), CORRELATION)), rejected, 'a rejection is final');
  });

  test('a waiting delegation is admitted once a free unit exists', async () => {
    const parent = await placedParent(1);
    assert.equal(value(await delegations.requestDelegation(PRINCIPAL, request(parent), CORRELATION)).state, 'awaiting-capacity');
    await enroll('worker-b');
    assert.equal(value(await delegations.requestDelegation(PRINCIPAL, request(parent), CORRELATION)).state, 'admitted');
    const [row] = await sql<{ state: string; generation: string }>('SELECT state, generation FROM delegation_requests');
    assert.deepEqual([row?.state, Number(row?.generation)], ['admitted', 2]);
  });

  for (const [slots, capacity] of [[2, 'free'], [1, 'not free']] as const) {
    test(`a child identity already taken is a conflict while capacity is ${capacity}`, async () => {
      const parent = await placedParent(slots);
      await submit('task-taken');
      const taken = request(parent, { child: { taskId: 'task-taken', kind: 'planning', stageId: 'specs' } });
      assert.equal(failed(await delegations.requestDelegation(PRINCIPAL, taken, CORRELATION)).code, 'conflict');
      assert.deepEqual(await sql('SELECT id FROM delegation_requests'), []);
    });
  }

  test('an admitted child with artifacts seeds the current revisions of its run', async () => {
    const parent = await placedParent();
    const artifact = { artifactId: 'spec', digest: `sha256:${'cd'.repeat(32)}`, nativeReference: 'spec.md' };
    const child = { taskId: 'task-child', kind: 'planning' as const, stageId: 'specs', artifacts: [artifact] };
    assert.equal(value(await delegations.requestDelegation(PRINCIPAL, request(parent, { child }), CORRELATION)).state, 'admitted');
    const rows = await sql<{ run_id: string; artifact_id: string; revision: string }>('SELECT run_id, artifact_id, revision FROM current_revisions');
    assert.deepEqual(rows.map((row) => [row.run_id, row.artifact_id, JSON.parse(row.revision)]), [['run-1', 'spec', artifact]]);
  });

  test('a child of an unknown run, of another project, or refused by SDLC admission stores nothing', async () => {
    const parent = await placedParent();
    assert.equal(failed(await delegations.requestDelegation(PRINCIPAL, request(parent, { runId: 'run-9' }), CORRELATION)).code, 'not-found');
    await createSecondRun();
    assert.equal(failed(await delegations.requestDelegation(PRINCIPAL, request(parent, { runId: 'run-2' }), CORRELATION)).code, 'precondition-failed');
    const gated = request(parent, { child: { taskId: 'task-child', kind: 'implementation', stageId: 'apply', workItem: { id: 'w', nativeReference: 'r' } } });
    assert.equal(failed(await delegations.requestDelegation(PRINCIPAL, gated, CORRELATION)).code, 'precondition-failed');
    assert.deepEqual(await sql('SELECT id FROM delegation_requests'), []);
  });
});
