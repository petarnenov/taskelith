import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { launchRejection, revokeLaunch, type LaunchPredicate, type LaunchRequest, type WorkerId } from '@taskelith/execution';
import { PostgresDatabase } from '@taskelith/postgres';
import { id, value } from '@taskelith/testing';
import { authorizedUnder, placedTask, usedAdmission } from './capacity-fixtures.ts';
import { AT, assignment } from './fixtures.ts';
import { createMigratedDatabase, query, truncateAll } from './test-database.ts';

const url = await createMigratedDatabase();
const database = new PostgresDatabase(url);
after(() => database.close());

beforeEach(() => truncateAll(url));

// Index rows as the task repository writes them, for the predicate reads.
async function indexRow(launch: string, worker: string, run: string, artifacts: string[], gates: string[], live = true): Promise<void> {
  await query(url, `INSERT INTO launch_authorizations (launch_auth_id, worker_id, operation_id, task_id, attempt_id, assignment_id,
    execution_id, run_id, relied_on_gates, artifact_ids, live) VALUES ($1, $2, $3, 'task-1', 'attempt-1', $4, 'execution-1', $5, $6, $7, $8)`,
  [launch, worker, `${launch}-operation`, `${launch}-assignment`, run, gates, artifacts, live]);
}

async function liveOf(predicate: LaunchPredicate): Promise<string[]> {
  const launches = value(await database.transaction((tx) => tx.launches.liveGrants(predicate)));
  return launches.map((launch) => launch.launchAuthId);
}

test('the task repository indexes each grant with its run, and keeps whether it is live', async () => {
  const offered = assignment('assignment-1');
  const authorized = authorizedUnder(placedTask('task-1', 'attempt-1'), offered.id, offered.workerId);
  value(await database.transaction(async (tx) => {
    const admitted = await tx.admissions.add(usedAdmission('task-1'));
    if (!admitted.ok) return admitted;
    const bound = await tx.catalog.bindAdmission(usedAdmission('task-1').id, id('WorkflowRunId', 'run-1') as never);
    return bound.ok ? tx.tasks.add(authorized) : bound;
  }));
  const grant = authorized.attempts[0]!.executions[0]!.grants[0]!;
  const recorded = value(await database.transaction((tx) => tx.launches.byOperation(grant.workerId, grant.operationId)));
  assert.deepEqual(recorded, {
    launchAuthId: grant.launchAuthId, taskId: authorized.id, attemptId: grant.attemptId, assignmentId: grant.assignmentId,
    executionId: grant.executionId, workerId: grant.workerId,
  });
  assert.deepEqual(value(await database.transaction((tx) => tx.launches.byLaunchAuthId(grant.launchAuthId))), recorded);
  assert.equal(value(await database.transaction((tx) => tx.launches.byOperation(id('WorkerId', 'worker-2') as WorkerId, grant.operationId))), undefined);
  assert.deepEqual(await liveOf({ kind: 'run', runId: id('WorkflowRunId', 'run-1') as never }), [grant.launchAuthId]);

  const revoked = value(revokeLaunch(authorized, grant.attemptId, 'gate-not-passed', AT));
  value(await database.transaction((tx) => tx.tasks.replace(revoked, authorized.generation)));
  assert.deepEqual(await liveOf({ kind: 'all' }), []);
  assert.equal(value(await database.transaction((tx) => tx.launches.byLaunchAuthId(grant.launchAuthId)))?.launchAuthId, grant.launchAuthId);
});

test('each predicate reads only its live grants', async () => {
  await indexRow('launch-a', 'worker-1', 'run-1', ['spec'], ['gate-1']);
  await indexRow('launch-b', 'worker-2', 'run-1', ['design'], []);
  await indexRow('launch-c', 'worker-1', 'run-2', ['spec', 'design'], ['gate-2']);
  await indexRow('launch-d', 'worker-1', 'run-1', ['spec'], ['gate-1'], false);
  assert.deepEqual(await liveOf({ kind: 'worker', workerId: id('WorkerId', 'worker-1') as never }), ['launch-a', 'launch-c']);
  assert.deepEqual(await liveOf({ kind: 'assignment', assignmentId: id('AssignmentId', 'launch-b-assignment') as never }), ['launch-b']);
  assert.deepEqual(await liveOf({ kind: 'run', runId: id('WorkflowRunId', 'run-1') as never }), ['launch-a', 'launch-b']);
  assert.deepEqual(await liveOf({ kind: 'artifact', artifactId: id('ArtifactId', 'design') as never }), ['launch-b', 'launch-c']);
  assert.deepEqual(await liveOf({ kind: 'gate', gateId: id('GateId', 'gate-1') as never }), ['launch-a']);
  assert.deepEqual(await liveOf({ kind: 'all' }), ['launch-a', 'launch-b', 'launch-c']);
  assert.deepEqual(await liveOf({ kind: 'worker', workerId: id('WorkerId', 'worker-9') as never }), []);
});

test('a rejection is recorded once per operation of a worker, with its request', async () => {
  const request = {
    operationId: id('OperationId', 'operation-1'), workerId: id('WorkerId', 'worker-1'), recoveryEpoch: 1, assignmentId: id('AssignmentId', 'a'),
    attemptId: id('AttemptId', 'attempt-1'), ownershipGeneration: 1, executionId: id('ExecutionId', 'e'), admissionId: id('AdmissionId', 'ad'),
    admissionGeneration: 1, reportsNotStarted: false,
  } as unknown as LaunchRequest;
  const rejection = launchRejection('gate-not-passed', 'gate g has not passed');
  value(await database.transaction((tx) => tx.launches.recordRejection({ request, rejection })));
  const again = await database.transaction((tx) => tx.launches.recordRejection({ request, rejection }));
  assert.equal(again.ok ? 'ok' : again.error.code, 'conflict');
  assert.deepEqual(value(await database.transaction((tx) => tx.launches.rejection(request.workerId, request.operationId))), { request, rejection });
  const other = id('WorkerId', 'worker-2') as WorkerId;
  assert.equal(value(await database.transaction((tx) => tx.launches.rejection(other, request.operationId))), undefined);
});
