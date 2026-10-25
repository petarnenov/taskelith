import assert from 'node:assert/strict';
import { parseIdentifier } from '@taskelith/kernel';
import {
  authorizeLaunch,
  claimOwnership,
  endAttempt,
  openAttempt,
  openTask,
  parseLaunchParameters,
  parseRecoveryEpoch,
  type AssignmentId,
  type AttemptId,
  type Task,
  type WorkerId,
} from '@taskelith/execution';
import type { WorkerPlacementRecord } from '@taskelith/scheduling';
import {
  FIRST_OWNERSHIP_GENERATION,
  admitPlanningTask,
  beginWorkflowProgress,
  parseWorkflowDefinition,
  parseWorkflowRunBinding,
  useAdmission,
  type RunContext,
  type TaskAdmission,
} from '@taskelith/sdlc';
import { value } from '@taskelith/testing';
import { AT } from './fixtures.ts';
import { query } from './test-database.ts';

export async function seedWorker(url: URL, worker: WorkerPlacementRecord): Promise<void> {
  await query(url, `INSERT INTO workers (worker_id, enrolled, revoked, draining, reachable, admission_pressure_since,
    slots, cpu_millicores, memory_mebibytes, controls, protocol_version) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`, [
    worker.workerId, worker.enrolled, worker.revoked, worker.draining, worker.reachable, worker.admissionPressureSince ?? null,
    worker.slots, worker.cpuMillicores, worker.memoryMebibytes, [...worker.controls], worker.protocolVersion ?? null,
  ]);
}

function run(): RunContext {
  const definition = value(parseWorkflowDefinition({
    id: 'capacity-workflow',
    version: '1',
    stages: [
      { id: 'specs', obligations: ['intake', 'specification'], origin: 'native', dependsOn: [] },
      { id: 'apply', obligations: ['implementation', 'review', 'verification', 'closure'], origin: 'native', dependsOn: ['specs'] },
    ],
  }));
  const binding = value(parseWorkflowRunBinding({
    pluginId: 'plugin', pluginVersion: '1.0.0', upstreamToolVersion: '1.0.0', workflowId: 'capacity-workflow', workflowVersion: '1',
    workflowDigest: `sha256:${'ee'.repeat(32)}`, configurationRevision: 'config-1', policyRevision: 'policy-1',
  }));
  return { binding, progress: beginWorkflowProgress(definition, AT) };
}

// The used admission a fixture task names, which every command reads.
export function usedAdmission(taskId: string): TaskAdmission {
  const admitted = value(admitPlanningTask({ id: `admission-${taskId}`, taskId, stageId: 'specs' }, run(), [], AT));
  return value(useAdmission(admitted, admitted.generation, AT, FIRST_OWNERSHIP_GENERATION));
}

// A task whose given attempt is active and owns the task's placement.
export function placedTask(taskId: string, attempt: string): Task {
  const task = value(openTask(usedAdmission(taskId), AT));
  const attemptId = value(parseIdentifier('AttemptId', attempt)) as AttemptId;
  const attempted = value(openAttempt(task, task.ownershipGeneration, { id: attemptId }, AT));
  return value(claimOwnership(attempted, attempted.ownershipGeneration, attemptId, AT));
}

// The task after its first attempt ended unlaunched and a second one took
// over the placement, for an automatic retry.
export function retriedTask(taskId: string, first: string, second: string): Task {
  const placed = placedTask(taskId, first);
  const ended = value(endAttempt(placed, placed.attempts[0]!.id, AT));
  const secondId = value(parseIdentifier('AttemptId', second)) as AttemptId;
  const attempted = value(openAttempt(ended, ended.ownershipGeneration, { id: secondId, retryOf: placed.attempts[0]!.id }, AT));
  return value(claimOwnership(attempted, attempted.ownershipGeneration, secondId, AT));
}

// The task with an execution authorized under the assignment.
export function authorizedUnder(task: Task, assignmentId: AssignmentId, workerId: WorkerId): Task {
  const attempt = task.attempts.at(-1)!;
  const admission = usedAdmission(task.id);
  const recoveryEpoch = value(parseRecoveryEpoch(1));
  const authorization = authorizeLaunch(task, {
    operationId: value(parseIdentifier('OperationId', 'operation-1')), workerId, recoveryEpoch, assignmentId, attemptId: attempt.id,
    ownershipGeneration: task.ownershipGeneration, executionId: value(parseIdentifier('ExecutionId', 'execution-1')),
    admissionId: task.admissionId, admissionGeneration: admission.generation, reportsNotStarted: false,
  }, {
    installation: { recoveryEpoch, quarantined: false },
    workerAuthorized: true,
    assignment: { assignmentId, attemptId: attempt.id, workerId, ownershipGeneration: task.ownershipGeneration, active: true },
    reservation: { state: 'held', attemptId: attempt.id, workerId },
    admission,
    definition: run().progress.definition,
    gates: [],
    currentRevisions: [],
    policyRevision: run().binding.policyRevision,
  }, {
    launchAuthId: value(parseIdentifier('LaunchAuthId', 'launch-1')),
    issuedAt: AT,
    parameters: value(parseLaunchParameters({ ttlMilliseconds: 30_000, skewMilliseconds: 5_000 })),
  });
  assert.ok(authorization.ok, authorization.ok ? '' : JSON.stringify(authorization.error));
  return authorization.value.task;
}
