import assert from 'node:assert/strict';
import test from 'node:test';
import { parseInstant } from '@taskelith/kernel';
import {
  InMemoryTaskRepository,
  claimOwnership,
  endAttempt,
  openAttempt,
  openTask,
  type AssignmentId,
  type AttemptId,
  type AttemptOutcome,
  type ExecutionId,
  type ExitStatus,
  type Task,
  type WorkerId,
} from '@taskelith/execution';
import {
  InMemoryAssignmentRepository,
  InMemoryCapacityLedger,
  InMemoryInstallationGuard,
  InMemoryPlacementWorkers,
  InMemoryQuotaSettings,
  InMemoryTaskLineage,
  ROOT_LINK,
  parseResourceRequest,
  placeInTransaction,
  type CapacityTransaction,
  type PlacementRequest,
  type ReservationId,
} from '@taskelith/scheduling';
import {
  FIRST_OWNERSHIP_GENERATION,
  InMemoryAdmissionRepository,
  InMemoryOutbox,
  admitPlanningTask,
  beginWorkflowProgress,
  parseWorkflowDefinition,
  parseWorkflowRunBinding,
  useAdmission,
  type TaskAdmission,
} from '@taskelith/sdlc';
import { id, value } from '@taskelith/testing';

const AT = value(parseInstant('2026-10-27T10:00:00.000Z'));
const WORKER = id('WorkerId', 'worker-1') as WorkerId;
const EARLIER = id('AttemptId', 'attempt-1') as AttemptId;
const ACTIVE = id('AttemptId', 'attempt-2') as AttemptId;

function usedAdmission(): TaskAdmission {
  const definition = value(parseWorkflowDefinition({
    id: 'retry-workflow', version: '1',
    stages: [
      { id: 'specs', obligations: ['intake', 'specification'], origin: 'native', dependsOn: [] },
      { id: 'apply', obligations: ['implementation', 'review', 'verification', 'closure'], origin: 'native', dependsOn: ['specs'] },
    ],
  }));
  const binding = value(parseWorkflowRunBinding({
    pluginId: 'plugin', pluginVersion: '1.0.0', upstreamToolVersion: '1.0.0', workflowId: 'retry-workflow', workflowVersion: '1',
    workflowDigest: `sha256:${'ee'.repeat(32)}`, configurationRevision: 'config-1', policyRevision: 'policy-1',
  }));
  const run = { binding, progress: beginWorkflowProgress(definition, AT) };
  const admitted = value(admitPlanningTask({ id: 'admission-1', taskId: ROOT_LINK.taskId, stageId: 'specs' }, run, [], AT));
  return value(useAdmission(admitted, admitted.generation, AT, FIRST_OWNERSHIP_GENERATION));
}

// The task after its first attempt exited with the status, set in place of
// a launch, with a second attempt that retries it and owns the placement.
function retriedAfterExit(admission: TaskAdmission, status: ExitStatus): Task {
  const opened = value(openTask(admission, AT));
  const first = value(openAttempt(opened, opened.ownershipGeneration, { id: EARLIER }, AT));
  const ended = value(endAttempt(value(claimOwnership(first, first.ownershipGeneration, EARLIER, AT)), EARLIER, AT));
  const exited = { ...ended.attempts[0]!.outcome!, kind: 'exited', executionId: 'execution-1' as ExecutionId, status, startProven: true };
  const withExit = { ...ended, attempts: [{ ...ended.attempts[0]!, outcome: exited as AttemptOutcome }] };
  const second = value(openAttempt(withExit, withExit.ownershipGeneration, { id: ACTIVE, retryOf: EARLIER }, AT));
  return value(claimOwnership(second, second.ownershipGeneration, ACTIVE, AT));
}

async function transactionWith(task: Task, admission: TaskAdmission): Promise<CapacityTransaction> {
  const tasks = new InMemoryTaskRepository();
  const lineage = new InMemoryTaskLineage();
  const admissions = new InMemoryAdmissionRepository();
  const assignments = new InMemoryAssignmentRepository();
  value(await tasks.add(task));
  value(await lineage.add(ROOT_LINK));
  value(await admissions.add(admission));
  const worker = {
    workerId: WORKER, enrolled: true, revoked: false, draining: false, reachable: true,
    slots: 2, cpuMillicores: 4000, memoryMebibytes: 8192, controls: [], protocolVersion: 1, admitted: true,
  };
  return {
    assignments, admissions, tasks, lineage, outbox: new InMemoryOutbox(),
    workers: new InMemoryPlacementWorkers([worker], () => assignments.all()),
    installation: new InMemoryInstallationGuard(false),
    quotas: new InMemoryQuotaSettings(),
    ledger: new InMemoryCapacityLedger(() => assignments.all(), lineage),
    now: async () => AT,
  };
}

function retryRequest(task: Task): PlacementRequest {
  return {
    assignmentId: id('AssignmentId', 'assignment-1') as AssignmentId,
    reservationId: id('ReservationId', 'reservation-1') as ReservationId,
    commandId: id('EventId', 'offer-1'),
    correlationId: id('CorrelationId', 'correlation-1'),
    taskId: task.id,
    attemptId: ACTIVE,
    ownershipGeneration: task.ownershipGeneration,
    workerId: WORKER,
    requested: value(parseResourceRequest({ cpuMillicores: 1000, memoryMebibytes: 2048, hardControls: [] })),
    providerCredentials: [],
    automaticRetryOf: EARLIER,
  };
}

async function placeRetryAfterExit(status: ExitStatus): Promise<string> {
  const admission = usedAdmission();
  const task = retriedAfterExit(admission, status);
  const placed = value(await placeInTransaction(await transactionWith(task, admission), retryRequest(task)));
  return placed.kind === 'placed' ? 'placed' : `${placed.kind}:${placed.reason}`;
}

test('a retry after a proven exit with a known status is placed', async () => {
  assert.equal(await placeRetryAfterExit({ kind: 'code', code: 1 }), 'placed');
});

// Supervisor identity contract section 6: an unknown status is uncertain.
test('a retry after a proven exit with an unknown status is uncertain', async () => {
  assert.equal(await placeRetryAfterExit({ kind: 'unknown' }), 'rejected:retry-budget-exhausted');
});
