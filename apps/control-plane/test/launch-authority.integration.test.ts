import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import pg from 'pg';
import { checkMessageSchema } from '@taskelith/contracts';
import { LaunchAuthority, LaunchRevokingFleetRegistry, RunService, TaskService, WorkflowRegistry, admissionIdOf } from '@taskelith/control-plane';
import {
  claimOwnership,
  openAttempt,
  parseLaunchParameters,
  type AssignmentId,
  type AttemptId,
  type LaunchAuthorizationRequest,
  type LaunchOutcome,
  type WorkerId,
} from '@taskelith/execution';
import { fleetToken, fleetWorker, type WorkerPrincipal } from '@taskelith/fleet';
import { ok, type Result } from '@taskelith/kernel';
import { PostgresDatabase, migrate } from '@taskelith/postgres';
import { ResourceAdmissionService, invalidateLaunches, parseResourceRequest, type PlacementRequest } from '@taskelith/scheduling';
import { parseWorkflowDefinition, type TaskId } from '@taskelith/sdlc';
import { CrashPoints, SimulatedCrash, id, integrationEndpoint, value } from '@taskelith/testing';

const POSTGRES = integrationEndpoint('TASKELITH_POSTGRES_URL');
const DIGEST = `sha256:${'ab'.repeat(32)}`;
const SPEC = { artifactId: 'spec', digest: `sha256:${'aa'.repeat(32)}`, nativeReference: 'spec.md' };

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
const definition = value(parseWorkflowDefinition({
  id: 'launch-workflow', version: '1', stages: [
    { id: 'specs', obligations: ['intake', 'specification'], origin: 'native', dependsOn: [] },
    { id: 'apply', obligations: ['implementation', 'review', 'verification', 'closure'], origin: 'native', dependsOn: ['specs'] },
  ],
}));
const workflows = new WorkflowRegistry([{ definition, digest: DIGEST }]);
const BINDING = {
  pluginId: 'openspec', pluginVersion: '0.1.0', upstreamToolVersion: '1.6.0', workflowId: 'launch-workflow', workflowVersion: '1',
  workflowDigest: DIGEST, configurationRevision: 'config-1', policyRevision: 'policy-1',
};
const PARAMETERS = value(parseLaunchParameters({ ttlMilliseconds: 30_000, skewMilliseconds: 5_000 }));
let issued = 0;
function authorityOn(store: PostgresDatabase, parameters = PARAMETERS): LaunchAuthority {
  return new LaunchAuthority(store, { workflows, parameters, newLaunchAuthId: () => `launch-${++issued}` });
}
const authority = authorityOn(database);
const fleet = new LaunchRevokingFleetRegistry(database);
const WORKER = fleetWorker('worker-1', 'journal-1');
const PRINCIPAL: WorkerPrincipal = { workerId: WORKER.workerId, generation: 1 };

interface Placed {
  readonly taskId: TaskId;
  readonly request: LaunchAuthorizationRequest;
}

beforeEach(async () => {
  await sql(url, `TRUNCATE workflow_runs, gates, admissions, tasks, assignments, outbox, inbox, task_lineage, capacity_charges,
    delegations, capacity_quotas, workers, installation, enrollment_tokens, broker_revocations, launch_authorizations,
    launch_rejections, current_revisions`);
  await sql(url, 'INSERT INTO installation (quarantined, recovery_epoch) VALUES (false, 1)');
  value(await fleet.addToken(fleetToken('token-1')));
  value(await fleet.enroll(fleetToken('token-1').hash, WORKER));
  await sql(url, 'UPDATE workers SET reachable = true');
  value(await new RunService(database, workflows).createRun({ runId: 'run-1', projectId: 'project-1', binding: BINDING }));
});

// A submitted planning task whose first attempt is placed on the worker.
async function placed(task = 'task-1', workerId: WorkerId = WORKER.workerId): Promise<Placed> {
  const submitted = value(await new TaskService(database).submitTask('run-1', { taskId: task, kind: 'planning', stageId: 'specs', artifacts: [SPEC] }, id('CorrelationId', 'c-1')));
  const taskId = submitted.taskId as TaskId;
  const attemptId = id('AttemptId', `${task}-attempt`) as AttemptId;
  const claimed = value(await database.transaction(async (tx) => {
    const stored = await tx.tasks.get(taskId);
    if (!stored.ok) return stored;
    const at = await tx.now();
    const attempted = openAttempt(stored.value, stored.value.ownershipGeneration, { id: attemptId }, at);
    if (!attempted.ok) return attempted;
    const opened = await tx.tasks.replace(attempted.value, stored.value.generation);
    if (!opened.ok) return opened;
    const owned = claimOwnership(attempted.value, attempted.value.ownershipGeneration, attemptId, at);
    if (!owned.ok) return owned;
    const replaced = await tx.tasks.replace(owned.value, attempted.value.generation);
    return replaced.ok ? ok(owned.value) : replaced;
  }));
  const assignmentId = id('AssignmentId', `${task}-assignment`) as AssignmentId;
  const placement: PlacementRequest = {
    assignmentId, reservationId: id('ReservationId', `${task}-reservation`), commandId: id('EventId', `${task}-offer`),
    correlationId: id('CorrelationId', 'c-1'), taskId, attemptId, ownershipGeneration: claimed.ownershipGeneration,
    workerId, requested: value(parseResourceRequest({ cpuMillicores: 500, memoryMebibytes: 512, hardControls: [] })),
    providerCredentials: [],
  };
  const outcome = value(await new ResourceAdmissionService(database, { pause: async () => {}, draw: () => 0 }).reserveWithRetry(placement));
  assert.equal(outcome.kind, 'placed');
  return {
    taskId,
    request: {
      operationId: id('OperationId', `${task}-operation-1`), recoveryEpoch: 1 as never, assignmentId, attemptId,
      ownershipGeneration: claimed.ownershipGeneration, executionId: id('ExecutionId', `${task}-execution-1`),
      admissionId: id('AdmissionId', admissionIdOf('run-1', task)), admissionGeneration: submitted.admission.generation as never,
      reportsNotStarted: false,
    } as LaunchAuthorizationRequest,
  };
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
  const stranger = { workerId: id('WorkerId', 'worker-2') as WorkerId, generation: 1 };
  assert.equal(kindOf(await authority.authorize(stranger, request)), 'rejected:worker-not-authorized', "another worker's replay gets nothing");
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

test('a replay after the deadline is expired, and expiry changes nothing stored', async () => {
  const { request } = await placed();
  const short = authorityOn(database, value(parseLaunchParameters({ ttlMilliseconds: 300, skewMilliseconds: 100 })));
  grantOf(await short.authorize(PRINCIPAL, request));
  await new Promise((resolve) => setTimeout(resolve, 400));
  assert.equal(kindOf(await short.authorize(PRINCIPAL, request)), 'expired');
  assert.equal((await rows('SELECT 1 FROM launch_authorizations WHERE live')).length, 1);
});

test('an invalidating writer revokes the grants its predicate reads and cancels each attempt once', async () => {
  const { request } = await placed();
  await placed('task-2');
  grantOf(await authority.authorize(PRINCIPAL, request));
  const correlationId = id('CorrelationId', 'c-policy');
  const cancelled = value(await database.transaction((tx) => invalidateLaunches(tx, { predicate: { kind: 'run', runId: id('WorkflowRunId', 'run-1') as never }, reason: 'policy-revision-changed', correlationId })));
  assert.equal(cancelled, 1);
  assert.equal(kindOf(await authority.authorize(PRINCIPAL, request)), 'revoked:policy-revision-changed');
  const again = value(await database.transaction((tx) => invalidateLaunches(tx, { predicate: { kind: 'all' }, reason: 'quarantined', correlationId })));
  assert.equal(again, 0, 'an empty read revokes nothing');
  const commands = await rows(`SELECT message FROM outbox WHERE event_type = 'execution.cancellation.request'`);
  assert.equal(commands.length, 1);
  const wire = JSON.parse(commands[0]!.message as string).payload;
  assert.deepEqual(wire.payload, { protocolVersion: 1, reason: 'launch-revoked' });
  assert.ok(checkMessageSchema('CancellationCommand', wire).ok, JSON.stringify(checkMessageSchema('CancellationCommand', wire)));
});

test('a worker revocation revokes its grants, cancels them, and leaves the executions uncertain', async () => {
  const { taskId, request } = await placed();
  grantOf(await authority.authorize(PRINCIPAL, request));
  value(await fleet.revoke(WORKER.workerId, WORKER.enrolledAt));
  assert.deepEqual(await rows('SELECT live FROM launch_authorizations'), [{ live: false }]);
  assert.deepEqual(await rows(`SELECT unknown_executions FROM tasks WHERE id = '${taskId}'`), [{ unknown_executions: 1 }]);
  assert.equal((await rows(`SELECT 1 FROM outbox WHERE event_type = 'execution.cancellation.request'`)).length, 1);
  assert.equal(kindOf(await authority.authorize(PRINCIPAL, request)), 'rejected:worker-not-authorized', 'a replay re-checks the credential');
  value(await fleet.revoke(WORKER.workerId, WORKER.enrolledAt));
  assert.equal((await rows(`SELECT 1 FROM outbox WHERE event_type = 'execution.cancellation.request'`)).length, 1, 'a repeated revocation reads nothing live');
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
