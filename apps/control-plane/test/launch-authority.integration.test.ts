import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import pg from 'pg';
import { checkMessageSchema } from '@taskelith/contracts';
import { LaunchRevokingFleetRegistry, WorkflowRegistry, type LaunchAuthority } from '@taskelith/control-plane';
import { parseLaunchParameters, type LaunchOutcome, type WorkerId } from '@taskelith/execution';
import { fleetToken, fleetWorker, type WorkerPrincipal } from '@taskelith/fleet';
import type { Result } from '@taskelith/kernel';
import { PostgresDatabase, migrate } from '@taskelith/postgres';
import { invalidateLaunches } from '@taskelith/scheduling';
import { CrashPoints, SimulatedCrash, id, integrationEndpoint, value } from '@taskelith/testing';
import { LAUNCH_WORKFLOWS, createLaunchRun, launchAuthority, placedTask, type Placed } from './launch-fixtures.ts';

const POSTGRES = integrationEndpoint('TASKELITH_POSTGRES_URL');

async function sql<Row extends pg.QueryResultRow>(url: URL, text: string, values: unknown[] = []): Promise<Row[]> {
  const client = new pg.Client({ connectionString: url.href });
  await client.connect();
  try {
    return (await client.query<Row>(text, values)).rows;
  } finally {
    await client.end();
  }
}

const databaseName = `taskelith_launch_${process.pid}`;
await sql(POSTGRES, `CREATE DATABASE ${databaseName}`);
const url = new URL(POSTGRES);
url.pathname = `/${databaseName}`;
value(await migrate(url));
const opened: PostgresDatabase[] = [];
after(async () => {
  await Promise.all(opened.map((database) => database.close()));
  await sql(POSTGRES, `DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
});

function open(crashPoints?: CrashPoints): PostgresDatabase {
  const database = new PostgresDatabase(url, crashPoints === undefined ? {} : { crashPoints });
  opened.push(database);
  return database;
}

const database = open();
const workflows = LAUNCH_WORKFLOWS;
function authorityOn(store: PostgresDatabase, parameters?: Parameters<typeof launchAuthority>[1], registry = workflows): LaunchAuthority {
  return launchAuthority(store, parameters, registry);
}
const authority = authorityOn(database);
const fleet = new LaunchRevokingFleetRegistry(database);
const WORKER = fleetWorker('worker-1', 'journal-1');
const PRINCIPAL: WorkerPrincipal = { workerId: WORKER.workerId, generation: 1 };

beforeEach(async () => {
  await sql(url, `TRUNCATE workflow_runs, gates, admissions, tasks, assignments, outbox, inbox, task_lineage, capacity_charges,
    delegations, capacity_quotas, workers, installation, enrollment_tokens, broker_revocations, launch_authorizations,
    launch_rejections, current_revisions, producer_cursors`);
  await sql(url, 'INSERT INTO installation (quarantined, recovery_epoch) VALUES (false, 1)');
  value(await fleet.addToken(fleetToken('token-1')));
  value(await fleet.enroll(fleetToken('token-1').hash, WORKER));
  await sql(url, 'UPDATE workers SET reachable = true');
  await createLaunchRun(database);
});

function placed(task = 'task-1', workerId: WorkerId = WORKER.workerId): Promise<Placed> {
  return placedTask(database, task, workerId);
}

function kindOf(result: Result<LaunchOutcome>): string {
  const outcome = value(result);
  if (outcome.kind === 'rejected') return `rejected:${outcome.rejection.reason}`;
  if (outcome.kind === 'revoked') return `revoked:${outcome.reason}`;
  return outcome.kind;
}

function grantOf(result: Result<LaunchOutcome>) {
  const outcome = value(result);
  assert.equal(outcome.kind, 'granted');
  return (outcome as Extract<LaunchOutcome, { kind: 'granted' }>).grant;
}

async function rows(text: string): Promise<Record<string, unknown>[]> {
  return sql(url, text);
}

test('a launch is granted once, recorded with its values, and its replay never extends it', async () => {
  const { taskId, request } = await placed();
  const grant = grantOf(await authority.authorize(PRINCIPAL, request));
  assert.deepEqual([grant.workerId, grant.executionId, grant.parameters.ttlMilliseconds, grant.state], [WORKER.workerId, request.executionId, 30_000, 'granted']);
  assert.deepEqual(await rows('SELECT task_id, run_id, artifact_ids, live FROM launch_authorizations'), [
    { task_id: taskId, run_id: 'run-1', artifact_ids: ['spec'], live: true },
  ]);
  const replayed = grantOf(await authority.authorize(PRINCIPAL, request));
  assert.deepEqual(replayed, grant, 'the same grant, with the same issue time');
  assert.equal(kindOf(await authority.authorize(PRINCIPAL, { ...request, executionId: id('ExecutionId', 'other') as never })), 'rejected:operation-mismatch');
  assert.equal((await rows('SELECT 1 FROM launch_rejections')).length, 0, 'a mismatch is not recorded');
  assert.equal(grantOf(await authority.authorize(PRINCIPAL, request)).launchAuthId, grant.launchAuthId);
  const other = fleetWorker('worker-2', 'journal-2');
  value(await fleet.addToken(fleetToken('token-2')));
  value(await fleet.enroll(fleetToken('token-2').hash, other));
  const stranger = { workerId: other.workerId, generation: 1 };
  assert.equal(kindOf(await authority.authorize(stranger, request)), 'rejected:assignment-not-active', "another enrolled worker's replay gets nothing");
  assert.equal(grantOf(await authority.authorize(PRINCIPAL, request)).launchAuthId, grant.launchAuthId, "and changes nothing of A's");
  await sql(url, 'UPDATE installation SET quarantined = true');
  assert.equal(kindOf(await authority.authorize(PRINCIPAL, request)), 'rejected:quarantined', 'no grant is handed out in quarantine');
});

test('a grant committed before a lost response is replayed, and one lost before commit is decided anew', async () => {
  const { request } = await placed();
  const crashing = authorityOn(open(new CrashPoints({ point: 'LaunchAuthorizationCommit.after', occurrence: 1, action: 'throw' })));
  await assert.rejects(crashing.authorize(PRINCIPAL, request), SimulatedCrash);
  const committed = await rows('SELECT launch_auth_id FROM launch_authorizations');
  assert.equal(committed.length, 1);
  assert.equal(grantOf(await authority.authorize(PRINCIPAL, request)).launchAuthId, committed[0]!.launch_auth_id);

  const second = await placed('task-2');
  const lost = authorityOn(open(new CrashPoints({ point: 'LaunchAuthorizationCommit.before', occurrence: 1, action: 'throw' })));
  await assert.rejects(lost.authorize(PRINCIPAL, second.request), SimulatedCrash);
  assert.equal((await rows('SELECT 1 FROM launch_authorizations')).length, 1, 'nothing of the lost one committed');
  assert.equal(grantOf(await authority.authorize(PRINCIPAL, second.request)).executionId, second.request.executionId);
});

test('a non-retryable rejection is final for its operation, and a retryable one is not recorded', async () => {
  const { request } = await placed();
  const stale = { ...request, ownershipGeneration: (request.ownershipGeneration + 1) as never };
  assert.equal(kindOf(await authority.authorize(PRINCIPAL, stale)), 'rejected:stale-ownership-generation');
  assert.equal(kindOf(await authority.authorize(PRINCIPAL, stale)), 'rejected:stale-ownership-generation', 'final');
  assert.equal(kindOf(await authority.authorize(PRINCIPAL, request)), 'rejected:operation-mismatch', 'never a grant for that operation');

  await sql(url, 'UPDATE installation SET quarantined = true');
  const fresh = { ...request, operationId: id('OperationId', 'operation-2') as never };
  assert.equal(kindOf(await authority.authorize(PRINCIPAL, fresh)), 'rejected:quarantined');
  assert.equal((await rows('SELECT 1 FROM launch_rejections')).length, 1, 'only the final one');
  await sql(url, 'UPDATE installation SET quarantined = false');
  assert.equal(kindOf(await authority.authorize(PRINCIPAL, fresh)), 'granted');
});

test('each check rejects with its reason in the contract order', async () => {
  const { request } = await placed();
  const op = (name: string) => id('OperationId', name) as never;
  assert.equal(kindOf(await authority.authorize(PRINCIPAL, { ...request, operationId: op('o-epoch'), recoveryEpoch: 2 as never })), 'rejected:stale-recovery-epoch');
  assert.equal(kindOf(await authority.authorize({ ...PRINCIPAL, generation: 2 }, { ...request, operationId: op('o-generation') })), 'rejected:worker-not-authorized');
  assert.equal(kindOf(await authority.authorize(PRINCIPAL, { ...request, operationId: op('o-assignment'), assignmentId: id('AssignmentId', 'unknown') as never })), 'rejected:assignment-not-active');
  assert.equal(kindOf(await authority.authorize(PRINCIPAL, { ...request, operationId: op('o-admission'), admissionGeneration: 9 as never })), 'rejected:admission-not-current');
  await sql(url, `UPDATE current_revisions SET revision = replace(revision, 'aaaa', 'bbbb')`);
  assert.equal(kindOf(await authority.authorize(PRINCIPAL, { ...request, operationId: op('o-artifact') })), 'rejected:artifact-revision-changed');
  assert.equal((await rows('SELECT 1 FROM launch_rejections')).length, 5);
  const several = { ...request, operationId: op('o-several'), recoveryEpoch: 2 as never, assignmentId: id('AssignmentId', 'unknown') as never };
  assert.equal(kindOf(await authority.authorize({ ...PRINCIPAL, generation: 2 }, several)), 'rejected:stale-recovery-epoch', 'the first failed check');
});

test('a missing admission is a rejection, and a missing run or workflow reaches no decision', async () => {
  await sql(url, `INSERT INTO capacity_quotas (scope, scope_id, quota) VALUES ('project', 'project-1', 16), ('run', 'run-1', 16)`);
  await sql(url, 'UPDATE workers SET slots = 8');
  const { request } = await placed();
  const other = await placed('task-other');
  await sql(url, `UPDATE admissions SET run_id = 'run-9' WHERE id = '${other.request.admissionId}'`);
  assert.equal(kindOf(await authority.authorize(PRINCIPAL, other.request)), 'rejected:admission-not-current', 'bound to another run');
  const unknown = await authorityOn(database, undefined, new WorkflowRegistry([])).authorize(PRINCIPAL, request);
  assert.equal(unknown.ok ? 'decided' : unknown.error.code, 'unavailable', 'the run\'s workflow left the registry');
  await sql(url, 'DELETE FROM admissions');
  assert.equal(kindOf(await authority.authorize(PRINCIPAL, request)), 'rejected:admission-not-current');
  const second = await placed('task-2');
  await sql(url, 'DELETE FROM workflow_runs');
  const undecided = await authority.authorize(PRINCIPAL, second.request);
  assert.equal(undecided.ok ? 'decided' : undecided.error.code, 'unavailable');
  assert.equal((await rows(`SELECT 1 FROM launch_rejections WHERE operation_id = '${second.request.operationId}'`)).length, 0);
});

test('concurrent rejections of one operation with other values answer one recorded decision', async () => {
  const { request } = await placed();
  const stale = { ...request, ownershipGeneration: (request.ownershipGeneration + 1) as never };
  const epoch = { ...request, recoveryEpoch: 2 as never };
  // The loser reruns as a replay, or answers `unavailable` and repeats.
  const answer = async (values: typeof request) => {
    const first = await authority.authorize(PRINCIPAL, values);
    return first.ok || first.error.code !== 'unavailable' ? first : authority.authorize(PRINCIPAL, values);
  };
  const kinds = (await Promise.all([answer(stale), answer(epoch)])).map(kindOf).sort();
  assert.ok(kinds.includes('rejected:operation-mismatch'), kinds.join());
  assert.ok(!kinds.includes('granted'));
  assert.equal((await rows('SELECT 1 FROM launch_rejections')).length, 1);
});

test('only an unspawned authorized execution is authorized again, and no other execution while it owns the attempt', async () => {
  const { request } = await placed();
  const first = grantOf(await authority.authorize(PRINCIPAL, request));
  const other = { ...request, operationId: id('OperationId', 'operation-2') as never, executionId: id('ExecutionId', 'execution-2') as never };
  assert.equal(kindOf(await authority.authorize(PRINCIPAL, other)), 'rejected:execution-conflict');
  const again = { ...request, operationId: id('OperationId', 'operation-3') as never, reportsNotStarted: true };
  const second = grantOf(await authority.authorize(PRINCIPAL, again));
  assert.notEqual(second.launchAuthId, first.launchAuthId);
  assert.equal((await rows('SELECT 1 FROM launch_authorizations WHERE live')).length, 2);
});

test('a new execution that reports the sealed owner is granted, and the owner ends not-started in the same commit', async () => {
  const { request } = await placed();
  grantOf(await authority.authorize(PRINCIPAL, request));
  const relaunch = {
    ...request, operationId: id('OperationId', 'operation-2') as never, executionId: id('ExecutionId', 'execution-2') as never,
    reportsNotStartedFor: [{ executionId: request.executionId, operationId: request.operationId }],
  };
  const lost = authorityOn(open(new CrashPoints({ point: 'LaunchAuthorizationCommit.before', occurrence: 1, action: 'throw' })));
  await assert.rejects(lost.authorize(PRINCIPAL, relaunch), SimulatedCrash);
  const live = 'SELECT execution_id, live FROM launch_authorizations ORDER BY execution_id';
  assert.deepEqual(await rows(live), [{ execution_id: request.executionId, live: true }], 'nothing of a lost decision commits');
  const second = grantOf(await authority.authorize(PRINCIPAL, relaunch));
  assert.equal(second.executionId, 'execution-2');
  assert.deepEqual(await rows(live), [
    { execution_id: 'execution-2', live: true },
    { execution_id: request.executionId, live: false },
  ]);
  assert.equal(grantOf(await authority.authorize(PRINCIPAL, relaunch)).launchAuthId, second.launchAuthId, 'a retry replays the grant');
});

test('a relaunch that reports two sealed executions ends both not-started and is granted in one commit', async () => {
  const { taskId, request } = await placed();
  grantOf(await authority.authorize(PRINCIPAL, request));
  const sealed = (execution: string, operation: string) => ({ executionId: id('ExecutionId', execution) as never, operationId: id('OperationId', operation) as never });
  const relaunch = (execution: string, operation: string, reportsNotStartedFor: ReturnType<typeof sealed>[]) => ({
    ...request, operationId: id('OperationId', operation) as never, executionId: id('ExecutionId', execution) as never, reportsNotStartedFor,
  });
  const first = sealed(request.executionId, request.operationId);
  grantOf(await authority.authorize(PRINCIPAL, relaunch('execution-2', 'operation-2', [first])));
  const second = sealed('execution-2', 'operation-2');
  const conflicting = relaunch('execution-3', 'operation-3', [second, sealed('execution-3', 'operation-3')]);
  assert.equal(kindOf(await authority.authorize(PRINCIPAL, conflicting)), 'rejected:execution-conflict');
  const live = 'SELECT execution_id, live FROM launch_authorizations ORDER BY execution_id';
  const beforeThird = [{ execution_id: 'execution-2', live: true }, { execution_id: request.executionId, live: false }];
  assert.deepEqual(await rows(live), beforeThird, 'a conflict in the second entry writes nothing');
  const third = relaunch('execution-3', 'operation-4', [first, second]);
  const lost = authorityOn(open(new CrashPoints({ point: 'LaunchAuthorizationCommit.before', occurrence: 1, action: 'throw' })));
  await assert.rejects(lost.authorize(PRINCIPAL, third), SimulatedCrash);
  assert.deepEqual(await rows(live), beforeThird, 'nothing of a lost decision commits');
  assert.equal(grantOf(await authority.authorize(PRINCIPAL, third)).executionId, 'execution-3');
  const task = value(await database.transaction((tx) => tx.tasks.get(taskId)));
  const states = task.attempts.flatMap(({ executions }) => executions).map(({ id: execution, state }) => [execution, state]);
  assert.deepEqual(states, [[request.executionId, 'not-started'], ['execution-2', 'not-started'], ['execution-3', 'authorized']]);
});

test('a replay after the deadline is expired, and expiry changes nothing stored', async () => {
  const { request } = await placed();
  const short = authorityOn(database, value(parseLaunchParameters({ ttlMilliseconds: 300, skewMilliseconds: 100 })));
  grantOf(await short.authorize(PRINCIPAL, request));
  await new Promise((resolve) => setTimeout(resolve, 400));
  assert.equal(kindOf(await short.authorize(PRINCIPAL, request)), 'expired');
  assert.equal((await rows('SELECT 1 FROM launch_authorizations WHERE live')).length, 1);
});

test('a bulk writer revokes every grant its predicate reads and cancels each attempt once', async () => {
  const launched = [await placed(), await placed('task-2')];
  for (const { request } of launched) grantOf(await authority.authorize(PRINCIPAL, request));
  const correlationId = id('CorrelationId', 'c-policy');
  const invalidate = (predicate: Parameters<typeof invalidateLaunches>[1]['predicate']) =>
    database.transaction((tx) => invalidateLaunches(tx, { predicate, reason: 'policy-revision-changed', correlationId }));
  assert.equal(value(await invalidate({ kind: 'run', runId: id('WorkflowRunId', 'run-1') as never })), 2);
  for (const { request } of launched) assert.equal(kindOf(await authority.authorize(PRINCIPAL, request)), 'revoked:policy-revision-changed');
  assert.equal(value(await invalidate({ kind: 'all' })), 0, 'an empty read revokes nothing');
  const commands = await rows(`SELECT message FROM outbox WHERE event_type = 'execution.cancellation.request'`);
  assert.equal(commands.length, 2);
  for (const command of commands) {
    const wire = JSON.parse(command.message as string).payload;
    assert.deepEqual(wire.payload, { protocolVersion: 1, reason: 'launch-revoked' });
    assert.ok(checkMessageSchema('CancellationCommand', wire).ok);
  }
});

test('every predicate reaches the revocation and the cancellation through the writer helper', async () => {
  const cases: [string, (placed: Placed) => Parameters<typeof invalidateLaunches>[1]['predicate']][] = [
    ['assignment', (launched) => ({ kind: 'assignment', assignmentId: launched.request.assignmentId })],
    ['artifact', () => ({ kind: 'artifact', artifactId: id('ArtifactId', 'spec') as never })],
    ['worker', () => ({ kind: 'worker', workerId: WORKER.workerId })],
  ];
  await sql(url, `INSERT INTO capacity_quotas (scope, scope_id, quota) VALUES ('project', 'project-1', 16), ('run', 'run-1', 16)`);
  await sql(url, 'UPDATE workers SET slots = 8');
  for (const [name, predicateOf] of cases) {
    const launched = await placed(`task-${name}`);
    grantOf(await authority.authorize(PRINCIPAL, launched.request));
    const correlationId = id('CorrelationId', `c-${name}`);
    assert.equal(value(await database.transaction((tx) => invalidateLaunches(tx, { predicate: predicateOf(launched), reason: 'artifact-revision-changed', correlationId }))), 1, name);
    assert.equal(kindOf(await authority.authorize(PRINCIPAL, launched.request)), 'revoked:artifact-revision-changed', name);
  }
  assert.equal((await rows(`SELECT 1 FROM outbox WHERE event_type = 'execution.cancellation.request'`)).length, cases.length);
});

test('a predecessor credential within its grace window authenticates but launches nothing', async () => {
  const { request } = await placed();
  const next = { ...WORKER.credentials.current, generation: 2, controlPlaneHash: 'cp-next' as never, brokerUserKey: 'U-next' };
  value(await fleet.rotate(WORKER.workerId, 1, next, '2100-01-01T00:00:00.000Z' as never, WORKER.enrolledAt));
  assert.equal(kindOf(await authority.authorize(PRINCIPAL, request)), 'rejected:worker-not-authorized');
  const current = { ...request, operationId: id('OperationId', 'operation-2') as never };
  assert.equal(kindOf(await authority.authorize({ ...PRINCIPAL, generation: 2 }, current)), 'granted');
});

test('a grant whose assignment row is gone is still revoked, with no command to address', async () => {
  const { request } = await placed();
  grantOf(await authority.authorize(PRINCIPAL, request));
  await sql(url, 'DELETE FROM assignments');
  const correlationId = id('CorrelationId', 'c-gone');
  assert.equal(value(await database.transaction((tx) => invalidateLaunches(tx, { predicate: { kind: 'all' }, reason: 'quarantined', correlationId }))), 1);
  assert.deepEqual(await rows('SELECT live FROM launch_authorizations'), [{ live: false }]);
  assert.equal((await rows(`SELECT 1 FROM outbox WHERE event_type = 'execution.cancellation.request'`)).length, 0);
});

test('a worker revoked before its first authorization is rejected, and nothing is cancelled', async () => {
  const { request } = await placed();
  value(await fleet.revoke(WORKER.workerId, WORKER.enrolledAt));
  assert.equal(kindOf(await authority.authorize(PRINCIPAL, request)), 'rejected:worker-not-authorized');
  assert.equal((await rows('SELECT 1 FROM launch_rejections')).length, 1);
  assert.equal((await rows(`SELECT 1 FROM outbox WHERE event_type = 'execution.cancellation.request'`)).length, 0);
});

test('a worker revocation revokes its grants, cancels them, and leaves the executions uncertain', async () => {
  const { taskId, request } = await placed();
  grantOf(await authority.authorize(PRINCIPAL, request));
  value(await fleet.revoke(WORKER.workerId, WORKER.enrolledAt));
  assert.deepEqual(await rows('SELECT live FROM launch_authorizations'), [{ live: false }]);
  assert.deepEqual(await rows(`SELECT unknown_executions FROM tasks WHERE id = '${taskId}'`), [{ unknown_executions: 1 }]);
  const commands = await rows(`SELECT message FROM outbox WHERE event_type = 'execution.cancellation.request'`);
  assert.deepEqual(commands.map((command) => JSON.parse(command.message as string).payload.payload.reason), ['launch-revoked']);
  const [task] = await rows(`SELECT record FROM tasks WHERE id = '${taskId}'`);
  assert.equal(JSON.parse(task!.record as string).attempts[0].cancellation.reason, 'launch-revoked');
  assert.equal(kindOf(await authority.authorize(PRINCIPAL, request)), 'rejected:worker-not-authorized', 'a replay re-checks the credential');
  value(await fleet.revoke(WORKER.workerId, WORKER.enrolledAt));
  assert.equal((await rows(`SELECT 1 FROM outbox WHERE event_type = 'execution.cancellation.request'`)).length, 1, 'a repeated revocation reads nothing live');
});

test('a worker whose enrolled journal is retired is rejected, also on a replay, and the rejection is recorded', async () => {
  const { request } = await placed();
  grantOf(await authority.authorize(PRINCIPAL, request));
  await sql(url, `INSERT INTO producer_cursors (worker_id, journal_id, confirmed_through, applied_above, retired_at)
    VALUES ($1, $2, 0, '{}', now())`, [WORKER.workerId, WORKER.journalId]);
  assert.equal(kindOf(await authority.authorize(PRINCIPAL, request)), 'rejected:worker-not-authorized', 'a replay');
  const fresh = { ...request, operationId: id('OperationId', 'operation-2') as never };
  assert.equal(kindOf(await authority.authorize(PRINCIPAL, fresh)), 'rejected:worker-not-authorized');
  assert.equal(kindOf(await authority.authorize(PRINCIPAL, fresh)), 'rejected:worker-not-authorized', 'final');
  assert.deepEqual(await rows('SELECT operation_id FROM launch_rejections'), [{ operation_id: 'operation-2' }]);
});

test('concurrent requests of one operation leave one grant, and a racing revocation is ordered before or after it', async () => {
  const { request } = await placed();
  const answers = await Promise.all([authority.authorize(PRINCIPAL, request), authority.authorize(PRINCIPAL, request)]);
  assert.equal(new Set(answers.map((answer) => grantOf(answer).launchAuthId)).size, 1);

  // Each round races a fresh worker's revocation with its first launch.
  await sql(url, `INSERT INTO capacity_quotas (scope, scope_id, quota) VALUES ('project', 'project-1', 16), ('run', 'run-1', 16)`);
  const outcomes = new Set<string>();
  for (let round = 1; round <= 6; round += 1) {
    const racer = fleetWorker(`racer-${round}`, `racer-journal-${round}`);
    value(await fleet.addToken(fleetToken(`racer-token-${round}`)));
    value(await fleet.enroll(fleetToken(`racer-token-${round}`).hash, racer));
    await sql(url, 'UPDATE workers SET reachable = true WHERE worker_id = $1', [racer.workerId]);
    const { request: raced } = await placed(`race-${round}`, racer.workerId);
    // A later start each round lets the revocation land on either side.
    const delayed = new Promise((resolve) => setTimeout(resolve, (round - 1) * 15));
    const [authorized, revoked] = await Promise.all([
      authority.authorize({ workerId: racer.workerId, generation: 1 }, raced),
      delayed.then(() => fleet.revoke(racer.workerId, racer.enrolledAt)),
    ]);
    value(revoked);
    outcomes.add(kindOf(authorized));
    assert.deepEqual(await rows(`SELECT 1 FROM launch_authorizations WHERE live AND worker_id = '${racer.workerId}'`), [], 'no grant outlives the revocation');
    const cancelled = await rows(`SELECT 1 FROM outbox WHERE event_type = 'execution.cancellation.request' AND message LIKE '%${racer.workerId}%'`);
    assert.equal(cancelled.length, kindOf(authorized) === 'granted' ? 1 : 0, 'a revoked grant is cancelled');
  }
  assert.ok([...outcomes].every((outcome) => ['granted', 'rejected:worker-not-authorized'].includes(outcome)), [...outcomes].join());
});
