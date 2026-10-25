import assert from 'node:assert/strict';
import { LaunchAuthority, RunService, TaskService, WorkflowRegistry, admissionIdOf } from '@taskelith/control-plane';
import {
  claimOwnership,
  openAttempt,
  parseLaunchParameters,
  type AssignmentId,
  type AttemptId,
  type LaunchAuthorizationRequest,
  type WorkerId,
} from '@taskelith/execution';
import { ok } from '@taskelith/kernel';
import type { PostgresDatabase } from '@taskelith/postgres';
import { ResourceAdmissionService, parseResourceRequest, type PlacementRequest } from '@taskelith/scheduling';
import { parseWorkflowDefinition, type TaskId } from '@taskelith/sdlc';
import { id, value } from '@taskelith/testing';

// A run of a known workflow with one planning task per placement, for the
// tests that need a launchable attempt in PostgreSQL.

const DIGEST = `sha256:${'ab'.repeat(32)}`;
export const SPEC = { artifactId: 'spec', digest: `sha256:${'aa'.repeat(32)}`, nativeReference: 'spec.md' };
const definition = value(parseWorkflowDefinition({
  id: 'launch-workflow', version: '1', stages: [
    { id: 'specs', obligations: ['intake', 'specification'], origin: 'native', dependsOn: [] },
    { id: 'apply', obligations: ['implementation', 'review', 'verification', 'closure'], origin: 'native', dependsOn: ['specs'] },
  ],
}));
export const LAUNCH_WORKFLOWS = new WorkflowRegistry([{ definition, digest: DIGEST }]);
const BINDING = {
  pluginId: 'openspec', pluginVersion: '0.1.0', upstreamToolVersion: '1.6.0', workflowId: 'launch-workflow', workflowVersion: '1',
  workflowDigest: DIGEST, configurationRevision: 'config-1', policyRevision: 'policy-1',
};
const PARAMETERS = value(parseLaunchParameters({ ttlMilliseconds: 30_000, skewMilliseconds: 5_000 }));

export interface Placed {
  readonly taskId: TaskId;
  readonly request: LaunchAuthorizationRequest;
}

let issued = 0;
export function launchAuthority(store: PostgresDatabase, parameters = PARAMETERS, workflows = LAUNCH_WORKFLOWS): LaunchAuthority {
  return new LaunchAuthority(store, { workflows, parameters, newLaunchAuthId: () => `launch-${++issued}` });
}

export async function createLaunchRun(store: PostgresDatabase): Promise<void> {
  value(await new RunService(store, LAUNCH_WORKFLOWS).createRun({ runId: 'run-1', projectId: 'project-1', binding: BINDING }));
}

// A submitted planning task whose first attempt is placed on the worker.
export async function placedTask(store: PostgresDatabase, task: string, workerId: WorkerId): Promise<Placed> {
  const submitted = value(await new TaskService(store).submitTask('run-1', { taskId: task, kind: 'planning', stageId: 'specs', artifacts: [SPEC] }, id('CorrelationId', 'c-1')));
  const taskId = submitted.taskId as TaskId;
  const attemptId = id('AttemptId', `${task}-attempt`) as AttemptId;
  const claimed = value(await store.transaction(async (tx) => {
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
  const outcome = value(await new ResourceAdmissionService(store, { pause: async () => {}, draw: () => 0 }).reserveWithRetry(placement));
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
