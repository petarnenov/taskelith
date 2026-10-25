import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { parseIdentifier, type Result } from '@taskelith/kernel';
import { endAttempt, recordNotStarted, type AssignmentId, type AttemptId, type Task, type WorkerId } from '@taskelith/execution';
import { PostgresDatabase } from '@taskelith/postgres';
import { releaseInTransaction } from '@taskelith/scheduling';
import {
  DELEGATION_CAPACITY_WAIT_BOUND_MILLISECONDS,
  ROOT_LINK,
  ResourceAdmissionService,
  admitDelegation,
  parseResourceRequest,
  type PlacementOutcome,
  type PlacementRequest,
  type ProjectId,
  type RunId,
  type TaskLineageLink,
} from '@taskelith/scheduling';
import { parseOwnershipGeneration, type TaskId } from '@taskelith/sdlc';
import { CrashPoints, SimulatedCrash } from '@taskelith/testing';
import { authorizedUnder, placedTask, retriedTask, seedWorker } from './capacity-fixtures.ts';
import { AT, assignment } from './fixtures.ts';
import { createMigratedDatabase, query, truncateAll } from './test-database.ts';

const url = await createMigratedDatabase();
const opened: PostgresDatabase[] = [];
after(() => Promise.all(opened.map((database) => database.close())));

function open(crashPoints?: CrashPoints): PostgresDatabase {
  const database = new PostgresDatabase(url, crashPoints === undefined ? {} : { crashPoints });
  opened.push(database);
  return database;
}

const database = open();
const NO_WAIT = { pause: async () => {}, draw: () => 0 };
const service = new ResourceAdmissionService(database, NO_WAIT);

function value<T>(result: Result<T>): T {
  assert.ok(result.ok, result.ok ? '' : result.error.message);
  return result.value;
}

const id = <Kind extends string>(kind: Kind, text: string) => value(parseIdentifier(kind, text));
const WORKER = id('WorkerId', 'worker-1') as WorkerId;
const PROJECT = ROOT_LINK.projectId;
const REQUESTED = value(parseResourceRequest({ cpuMillicores: 1000, memoryMebibytes: 2048, hardControls: [] }));

function worker(workerId: WorkerId, overrides: Record<string, unknown> = {}) {
  return {
    workerId, enrolled: true, revoked: false, draining: false, reachable: true, slots: 2, cpuMillicores: 3500,
    memoryMebibytes: 7680, controls: ['memory-limit' as const], ...overrides,
  };
}

beforeEach(async () => {
  await truncateAll(url);
  await query(url, 'INSERT INTO installation (quarantined) VALUES (false)');
  await seedWorker(url, worker(WORKER));
});

// Stores the task with an active attempt and a root lineage link in run-1.
async function rootTask(task: string, attempt = `${task}-attempt`, runId = ROOT_LINK.runId, stored = placedTask(task, attempt)): Promise<Task> {
  const link: TaskLineageLink = { ...ROOT_LINK, taskId: stored.id, rootTaskId: stored.id, runId };
  value(await database.transaction(async (tx) => {
    const added = await tx.tasks.add(stored);
    return added.ok ? tx.lineage.add(link) : added;
  }));
  return stored;
}

function placement(task: Task, name: string, overrides: Partial<PlacementRequest> = {}): PlacementRequest {
  return {
    assignmentId: id('AssignmentId', `assignment-${name}`) as AssignmentId,
    reservationId: id('ReservationId', `reservation-${name}`),
    commandId: id('EventId', `offer-${name}`),
    correlationId: id('CorrelationId', `correlation-${name}`),
    taskId: task.id,
    attemptId: task.attempts.at(-1)!.id,
    ownershipGeneration: task.ownershipGeneration,
    workerId: WORKER,
    requested: REQUESTED,
    providerCredentials: [],
    ...overrides,
  };
}

function kind(result: Result<PlacementOutcome>): string {
  const outcome = value(result);
  return outcome.kind === 'placed' ? 'placed' : `${outcome.kind}:${outcome.reason}`;
}

async function counts(): Promise<{ held: number; assignments: number; charges: number; outbox: number }> {
  const [row] = await query<{ held: number; assignments: number; charges: number; outbox: number }>(url, `SELECT
    (SELECT count(*)::int FROM assignments WHERE reservation_state = 'held') AS held,
    (SELECT count(*)::int FROM assignments) AS assignments,
    (SELECT count(*)::int FROM capacity_charges) AS charges,
    (SELECT count(*)::int FROM outbox) AS outbox`);
  return row!;
}

async function eventTypes(): Promise<string[]> {
  return (await query<{ event_type: string }>(url, 'SELECT event_type FROM outbox ORDER BY position')).map((row) => row.event_type);
}

test('a placement writes the held reservation, its assignment, the charge, and the command together', async () => {
  const task = await rootTask('task-1');
  const placed = value(await service.reserve(placement(task, 'a')));
  assert.equal(placed.kind, 'placed');
  assert.ok(placed.kind === 'placed' && placed.assignment.reservation.state === 'held' && placed.assignment.state === 'offered');
  assert.deepEqual(await counts(), { held: 1, assignments: 1, charges: 1, outbox: 1 });
  assert.deepEqual(await eventTypes(), ['scheduling.assignment.offered']);
  assert.equal(kind(await service.reserve(placement(task, 'b'))), 'rejected:attempt-already-reserved');
});

test('two replicas placing the same attempt leave one assignment and one held reservation', async () => {
  const task = await rootTask('task-1');
  const results = await Promise.all([service.reserve(placement(task, 'a')), service.reserve(placement(task, 'b'))]);
  assert.deepEqual(results.map(kind).sort(), ['placed', 'rejected:attempt-already-reserved']);
  assert.deepEqual(await counts(), { held: 1, assignments: 1, charges: 1, outbox: 1 });
});

test('two replicas racing for the last worker slot place exactly one attempt', async () => {
  await query(url, 'UPDATE workers SET slots = 1');
  const [first, second] = [await rootTask('task-1'), await rootTask('task-2')];
  const results = await Promise.all([service.reserve(placement(first, 'a')), service.reserve(placement(second, 'b'))]);
  assert.deepEqual(results.map(kind).sort(), ['placed', 'waiting:worker-capacity-exhausted']);
  assert.deepEqual(await counts(), { held: 1, assignments: 1, charges: 1, outbox: 1 });
});

test('two replicas racing for the last project unit place exactly one attempt', async () => {
  const other = id('WorkerId', 'worker-2') as WorkerId;
  await seedWorker(url, worker(other));
  await query(url, "INSERT INTO capacity_quotas (scope, scope_id, quota) VALUES ('project', $1, 1)", [PROJECT]);
  const [first, second] = [await rootTask('task-1'), await rootTask('task-2', 'task-2-attempt', id('RunId', 'run-2') as RunId)];
  const results = await Promise.all([
    service.reserve(placement(first, 'a')),
    service.reserve(placement(second, 'b', { workerId: other })),
  ]);
  assert.deepEqual(results.map(kind).sort(), ['placed', 'waiting:project-quota-exhausted']);
  assert.deepEqual(await counts(), { held: 1, assignments: 1, charges: 1, outbox: 1 });
});

test('an exhausted run quota makes the next attempt of the run wait', async () => {
  await query(url, "INSERT INTO capacity_quotas (scope, scope_id, quota) VALUES ('run', $1, 1)", [ROOT_LINK.runId]);
  const [first, second] = [await rootTask('task-1'), await rootTask('task-2')];
  assert.equal(kind(await service.reserve(placement(first, 'a'))), 'placed');
  assert.equal(kind(await service.reserve(placement(second, 'b'))), 'waiting:run-quota-exhausted');
});

test('quarantine, ineligible workers, and unenforceable controls make the attempt wait', async () => {
  const task = await rootTask('task-1');
  await query(url, 'UPDATE workers SET draining = true');
  assert.equal(kind(await service.reserve(placement(task, 'a'))), 'waiting:worker-not-eligible');
  await query(url, 'UPDATE workers SET draining = false');
  const disk = value(parseResourceRequest({ cpuMillicores: 1000, memoryMebibytes: 1024, hardControls: ['disk-limit'] }));
  assert.equal(kind(await service.reserve(placement(task, 'b', { requested: disk }))), 'waiting:control-not-enforceable');
  await query(url, 'UPDATE installation SET quarantined = true');
  assert.equal(kind(await service.reserve(placement(task, 'c'))), 'waiting:quarantined');
  await query(url, 'DELETE FROM installation');
  assert.equal(kind(await service.reserve(placement(task, 'd'))), 'waiting:quarantined');
  assert.deepEqual(await counts(), { held: 0, assignments: 0, charges: 0, outbox: 0 });
});

test('the ninth attempt of a tree is rejected, and so is a retry the attempt does not make', async () => {
  const task = await rootTask('task-1');
  for (let index = 0; index < 8; index++) {
    await query(url, 'INSERT INTO capacity_charges (attempt_id, task_id, root_task_id, automatic_retry) VALUES ($1, $2, $2, false)', [`old-${index}`, task.id]);
  }
  assert.equal(kind(await service.reserve(placement(task, 'a'))), 'rejected:delegation-budget-exhausted');
  await query(url, 'DELETE FROM capacity_charges');
  const itself = await service.reserve(placement(task, 'b', { automaticRetryOf: task.attempts.at(-1)!.id }));
  assert.equal(!itself.ok && itself.error.code, 'precondition-failed');
  assert.equal(kind(await service.reserve(placement(task, 'c', { taskId: id('TaskId', 'task-unknown') as TaskId }))), 'rejected:attempt-not-reservable');
});

test('an automatic retry needs a certain, released earlier attempt and stays within two retries', async () => {
  const task = await rootTask('task-1', 'unused', ROOT_LINK.runId, retriedTask('task-1', 'attempt-1', 'attempt-2'));
  const retry = (name: string) => placement(task, name, { automaticRetryOf: id('AttemptId', 'attempt-1') as AttemptId });
  await query(url, 'INSERT INTO capacity_charges (attempt_id, task_id, root_task_id, automatic_retry) VALUES ($1, $2, $2, true), ($3, $2, $2, true)',
    ['retry-old-1', task.id, 'retry-old-2']);
  assert.equal(kind(await service.reserve(retry('a'))), 'rejected:retry-budget-exhausted');
  await query(url, "DELETE FROM capacity_charges WHERE attempt_id = 'retry-old-2'");
  const unrelated = await service.reserve(placement(task, 'b', { automaticRetryOf: id('AttemptId', 'attempt-9') as AttemptId }));
  assert.equal(!unrelated.ok && unrelated.error.code, 'precondition-failed');
  // An earlier attempt that still holds its reservation is not yet safe.
  value(await database.transaction((tx) => tx.assignments.add(assignment('assignment-earlier', 'attempt-1'))));
  assert.equal(kind(await service.reserve(retry('d'))), 'rejected:retry-budget-exhausted');
  await query(url, "DELETE FROM assignments WHERE id = 'assignment-earlier'");
  assert.equal(kind(await service.reserve(retry('c'))), 'placed');
  assert.deepEqual((await query<{ count: number }>(url, 'SELECT count(*)::int AS count FROM capacity_charges WHERE automatic_retry'))[0], { count: 2 });
});

test('a provider credential at its concurrency limit makes the attempt wait', async () => {
  const credential = id('ProviderCredentialId', 'credential-1');
  const others = await Promise.all(['task-2', 'task-3', 'task-4', 'task-5'].map((name) => rootTask(name)));
  const workers = ['worker-2', 'worker-3'].map((name) => id('WorkerId', name) as WorkerId);
  for (const extra of workers) await seedWorker(url, worker(extra));
  await query(url, "INSERT INTO capacity_quotas (scope, scope_id, quota) VALUES ('project', $1, 10), ('run', $2, 10)", [PROJECT, ROOT_LINK.runId]);
  for (const [index, other] of others.entries()) {
    const target = [WORKER, ...workers][Math.floor(index / 2)]!;
    assert.equal(kind(await service.reserve(placement(other, `credential-${index}`, { workerId: target, providerCredentials: [credential] }))), 'placed');
  }
  const task = await rootTask('task-1');
  assert.equal(kind(await service.reserve(placement(task, 'a', { workerId: workers[1]!, providerCredentials: [credential] }))), 'waiting:provider-concurrency-exhausted');
});

test('cancelling an assignment without a grant ends it, releases, and tells the worker; a new placement charges nothing', async () => {
  const task = await rootTask('task-1');
  const placed = value(await service.reserve(placement(task, 'a')));
  assert.ok(placed.kind === 'placed');
  const cancel = { assignmentId: placed.assignment.id, commandId: id('EventId', 'end-a'), correlationId: id('CorrelationId', 'correlation-a') };
  const ended = value(await service.cancelAssignment(cancel));
  assert.deepEqual([ended.state, ended.end?.reason, ended.reservation.state], ['ended', 'cancelled', 'released']);
  assert.equal(ended.reservation.state === 'released' && ended.reservation.releasedBy, 'cancelled');
  assert.deepEqual(await eventTypes(), ['scheduling.assignment.offered', 'scheduling.assignment.ended']);
  assert.equal(kind(await service.reserve(placement(task, 'b'))), 'placed');
  assert.deepEqual(await counts(), { held: 1, assignments: 2, charges: 1, outbox: 3 });
  const again = await service.cancelAssignment(cancel);
  assert.equal(!again.ok && again.error.code, 'precondition-failed');
});

test('cancelling an assignment with a running execution keeps the reservation until its terminal fact', async () => {
  const task = await rootTask('task-1');
  const placed = value(await service.reserve(placement(task, 'a')));
  assert.ok(placed.kind === 'placed');
  const authorized = authorizedUnder(task, placed.assignment.id, WORKER);
  value(await database.transaction((tx) => tx.tasks.replace(authorized, task.generation)));
  const request = { assignmentId: placed.assignment.id, commandId: id('EventId', 'cancel-a'), correlationId: id('CorrelationId', 'correlation-a') };
  const ended = value(await service.cancelAssignment(request));
  assert.deepEqual([ended.state, ended.reservation.state], ['ended', 'held']);
  assert.deepEqual(await eventTypes(), ['scheduling.assignment.offered', 'execution.attempt.cancel']);
  const early = await service.releaseAfterTerminalFact({ ...request, commandId: id('EventId', 'release-early') });
  assert.equal(!early.ok && early.error.code, 'precondition-failed');
  const cancelled = value(await database.transaction((tx) => tx.tasks.get(task.id)));
  const attempt = cancelled.attempts.at(-1)!;
  assert.equal(attempt.cancellation?.reason, 'launch-revoked');
  assert.deepEqual(attempt.executions[0]!.grants.map((grant) => grant.state === 'revoked' && grant.revokedFor), ['attempt-not-launchable']);
  // The terminal fact and the release commit in one transaction (item 21).
  const released = value(await database.transaction(async (tx) => {
    const sealed = recordNotStarted(cancelled, { workerId: WORKER, executionId: id('ExecutionId', 'execution-1') }, AT);
    if (!sealed.ok) return sealed;
    const stored = await tx.tasks.replace(sealed.value.task, cancelled.generation);
    return stored.ok ? releaseInTransaction(tx, { ...request, commandId: id('EventId', 'release-a') }) : stored;
  }));
  assert.equal(released.reservation.state === 'released' && released.reservation.releasedBy, 'execution-terminal');
  assert.deepEqual(await counts(), { held: 0, assignments: 1, charges: 1, outbox: 2 });
});

test('an assignment without a grant is superseded once its worker is gone, never before its bounds', async () => {
  const task = await rootTask('task-1');
  const placed = value(await service.reserve(placement(task, 'a')));
  assert.ok(placed.kind === 'placed');
  const request = { assignmentId: placed.assignment.id, commandId: id('EventId', 'supersede-a'), correlationId: id('CorrelationId', 'correlation-a') };
  const early = await service.supersede(request);
  assert.equal(!early.ok && early.error.code, 'precondition-failed');
  await query(url, 'UPDATE workers SET reachable = false');
  const superseded = value(await service.supersede(request));
  assert.deepEqual([superseded.end?.reason, superseded.reservation.state], ['superseded', 'released']);
  assert.deepEqual(await eventTypes(), ['scheduling.assignment.offered', 'scheduling.assignment.ended']);
});

test('a granted assignment is not superseded', async () => {
  const task = await rootTask('task-1');
  const placed = value(await service.reserve(placement(task, 'a')));
  assert.ok(placed.kind === 'placed');
  value(await database.transaction((tx) => tx.tasks.replace(authorizedUnder(task, placed.assignment.id, WORKER), task.generation)));
  await query(url, 'UPDATE workers SET revoked = true');
  const refused = await service.supersede({ assignmentId: placed.assignment.id, commandId: id('EventId', 's'), correlationId: id('CorrelationId', 'c') });
  assert.equal(!refused.ok && refused.error.code, 'precondition-failed');
  assert.deepEqual(await counts(), { held: 1, assignments: 1, charges: 1, outbox: 1 });
});

test('a crash before the placement commits leaves no reservation, assignment, charge, or command', async () => {
  const task = await rootTask('task-1');
  const crashing = new ResourceAdmissionService(open(new CrashPoints({ point: 'OutboxCommit.before', occurrence: 1, action: 'throw' })), NO_WAIT);
  await assert.rejects(crashing.reserve(placement(task, 'a')), SimulatedCrash);
  assert.deepEqual(await counts(), { held: 0, assignments: 0, charges: 0, outbox: 0 });
});

// Owner decisions D-A and D-C at task creation, in the creator's transaction.
test('delegations are admitted, fail closed on chains, and wait for a free unit up to the bound', async () => {
  const parent = await rootTask('task-root', 'attempt-root');
  const unreserved = await database.transaction((tx) => admitDelegation(tx, {
    parentTaskId: parent.id, parentAttemptId: parent.attempts.at(-1)!.id as AttemptId,
    childTaskId: id('TaskId', 'task-early') as TaskId, childRunId: ROOT_LINK.runId, waitingSince: AT,
  }));
  assert.equal(!unreserved.ok && unreserved.error.code, 'precondition-failed');
  assert.equal(kind(await service.reserve(placement(parent, 'root'))), 'placed');
  // Waits are measured on the database clock, so they start from its now.
  const now = value(await database.transaction(async (tx) => ({ ok: true, value: await tx.now() })));
  const delegate = (child: string, overrides: Partial<Parameters<typeof admitDelegation>[1]> = {}) => database.transaction((tx) =>
    admitDelegation(tx, {
      parentTaskId: parent.id, parentAttemptId: parent.attempts.at(-1)!.id as AttemptId,
      childTaskId: id('TaskId', child) as TaskId, childRunId: id('RunId', 'run-child') as RunId, waitingSince: now, ...overrides,
    }));
  const admitted = value(await delegate('task-child'));
  assert.equal(admitted.outcome, 'admitted');
  const child = value(await database.transaction(async (tx) => ({ ok: true, value: await tx.lineage.get(id('TaskId', 'task-child') as TaskId) })));
  assert.deepEqual(child, { taskId: 'task-child', parentTaskId: parent.id, rootTaskId: parent.id, depth: 1, projectId: PROJECT, runId: 'run-child' });
  assert.equal(value(await delegate('task-same-run', { childRunId: ROOT_LINK.runId })).outcome, 'admitted');
  await query(url, "INSERT INTO capacity_quotas (scope, scope_id, quota) VALUES ('project', $1, 1)", [PROJECT]);
  assert.deepEqual(value(await delegate('task-chain')), { outcome: 'rejected', reason: 'delegation-chain-exceeds-quota' });
  // With room in the quotas, the waiting parent holds the fleet's only slot.
  await query(url, "UPDATE capacity_quotas SET quota = 2 WHERE scope = 'project'");
  assert.equal(value(await delegate('task-room')).outcome, 'admitted');
  await query(url, 'UPDATE workers SET slots = 1');
  assert.deepEqual(value(await delegate('task-waiting')), { outcome: 'waiting', reason: 'delegation-awaiting-capacity' });
  const longAgo = new Date(Date.parse(now) - DELEGATION_CAPACITY_WAIT_BOUND_MILLISECONDS).toISOString() as typeof now;
  assert.deepEqual(value(await delegate('task-late', { waitingSince: longAgo })), { outcome: 'rejected', reason: 'delegation-awaiting-capacity' });
  const unknown = await delegate('task-orphan', { parentTaskId: id('TaskId', 'task-none') as TaskId });
  assert.equal(!unknown.ok && unknown.error.code, 'not-found');
  const foreign = await delegate('task-foreign', { parentAttemptId: id('AttemptId', 'attempt-other') as AttemptId });
  assert.equal(!foreign.ok && foreign.error.code, 'precondition-failed');
  assert.deepEqual(value(await delegate('task-child')).outcome, 'waiting');
});

test('a fourth level of delegation is rejected at creation', async () => {
  const root = await rootTask('task-root');
  const deepest = placedTask('task-c', 'attempt-c');
  value(await database.transaction((tx) => tx.tasks.add(deepest)));
  const links: TaskLineageLink[] = ['a', 'b', 'c'].map((name, index) => ({
    ...ROOT_LINK, taskId: id('TaskId', `task-${name}`) as TaskId, parentTaskId: index === 0 ? root.id : id('TaskId', `task-${'abc'[index - 1]}`) as TaskId,
    rootTaskId: root.id, depth: index + 1, projectId: PROJECT as ProjectId,
  }));
  for (const link of links) value(await database.transaction((tx) => tx.lineage.add(link)));
  await query(url, "INSERT INTO capacity_quotas (scope, scope_id, quota) VALUES ('project', $1, 10)", [PROJECT]);
  assert.equal(kind(await service.reserve(placement(deepest, 'c'))), 'placed');
  const decision = value(await database.transaction((tx) => admitDelegation(tx, {
    parentTaskId: links[2]!.taskId, parentAttemptId: id('AttemptId', 'attempt-c') as AttemptId,
    childTaskId: id('TaskId', 'task-d') as TaskId, childRunId: ROOT_LINK.runId, waitingSince: AT,
  })));
  assert.deepEqual(decision, { outcome: 'rejected', reason: 'delegation-depth-exceeded' });
});

test('releases of an unknown assignment are not found and write nothing', async () => {
  const request = { assignmentId: id('AssignmentId', 'assignment-x') as AssignmentId, commandId: id('EventId', 'x'), correlationId: id('CorrelationId', 'x') };
  for (const release of [service.cancelAssignment(request), service.releaseAfterTerminalFact(request), service.supersede(request)]) {
    const result = await release;
    assert.equal(!result.ok && result.error.code, 'not-found');
  }
  assert.deepEqual(await counts(), { held: 0, assignments: 0, charges: 0, outbox: 0 });
});

test('a placement under a stale ownership generation fails and writes nothing', async () => {
  const task = await rootTask('task-1');
  const stale = await service.reserve(placement(task, 'a', { ownershipGeneration: value(parseOwnershipGeneration(task.ownershipGeneration + 1)) }));
  assert.equal(!stale.ok && stale.error.code, 'conflict');
  assert.deepEqual(await counts(), { held: 0, assignments: 0, charges: 0, outbox: 0 });
});

test('the transaction recording an attempt\'s end also ends its active assignment and releases', async () => {
  const task = await rootTask('task-1');
  const placed = value(await service.reserve(placement(task, 'a')));
  assert.ok(placed.kind === 'placed');
  const request = { assignmentId: placed.assignment.id, commandId: id('EventId', 'end-a'), correlationId: id('CorrelationId', 'correlation-a') };
  const released = value(await database.transaction(async (tx) => {
    const ended = endAttempt(task, task.attempts.at(-1)!.id, AT);
    if (!ended.ok) return ended;
    const stored = await tx.tasks.replace(ended.value, task.generation);
    return stored.ok ? releaseInTransaction(tx, request) : stored;
  }));
  assert.deepEqual([released.end?.reason, released.reservation.state], ['attempt-ended', 'released']);
  assert.deepEqual(await eventTypes(), ['scheduling.assignment.offered', 'scheduling.assignment.ended']);
  const active = await service.releaseAfterTerminalFact(request);
  assert.equal(!active.ok && active.error.code, 'precondition-failed');
});
