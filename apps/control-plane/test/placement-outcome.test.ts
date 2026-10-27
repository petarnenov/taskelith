import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PlacementService,
  RunService,
  TaskService,
  WorkflowRegistry,
  type ControlPlaneStore,
  type ControlPlaneTransaction,
} from '@taskelith/control-plane';
import {
  InMemoryEvidenceRecords,
  InMemoryTaskRepository,
  activeAttempt,
  requestCancellation,
  type Attempt,
  type AttemptId,
  type ExecutionId,
  type WorkerId,
} from '@taskelith/execution';
import { err, failure, ok, type CorrelationId, type Instant, type Result } from '@taskelith/kernel';
import {
  InMemoryQuotaSettings,
  InMemoryTaskLineage,
  type PlacementOutcomeRecord,
  type PlacementOutcomeRecords,
  type ProjectId,
  type WorkerPlacementRecord,
} from '@taskelith/scheduling';
import {
  InMemoryAdmissionRepository,
  InMemoryCurrentRevisions,
  InMemoryGateRepository,
  InMemoryRunCatalog,
  InMemoryWorkflowRunRepository,
  nextGeneration,
  parseWorkflowDefinition,
  type TaskId,
} from '@taskelith/sdlc';
import { failed, value } from '@taskelith/testing';
import { inMemoryCapacity } from './in-memory-capacity.ts';

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
const START = Date.parse('2026-10-25T09:00:00.000Z');
const DOWN = err(failure('unavailable', 'the store is down'));
// Two slots, reachable since enrollment, so no observation is needed.
const ROOMY: WorkerPlacementRecord = {
  workerId: 'worker-1' as WorkerId, enrolled: true, revoked: false, draining: false, reachable: true, slots: 2,
  cpuMillicores: 4000, memoryMebibytes: 8192, controls: [], protocolVersion: 1,
};
// Below the default attempt request, so no attempt fits on it.
const SMALL: WorkerPlacementRecord = { ...ROOMY, cpuMillicores: 500 };

// Applies one transaction's writes only when it commits, as the database
// does; the other in-memory stores of the fixture do not roll back.
class StagedOutcomes implements PlacementOutcomeRecords {
  readonly #committed: PlacementOutcomeRecords;
  readonly #recordFails: boolean;
  readonly #writes: (() => Promise<Result<void>>)[] = [];

  constructor(committed: PlacementOutcomeRecords, recordFails: boolean) {
    this.#committed = committed;
    this.#recordFails = recordFails;
  }

  async record(outcome: PlacementOutcomeRecord): Promise<Result<void>> {
    if (this.#recordFails) return DOWN;
    this.#writes.push(() => this.#committed.record(outcome));
    return ok(undefined);
  }

  async remove(taskId: TaskId): Promise<Result<void>> {
    this.#writes.push(() => this.#committed.remove(taskId));
    return ok(undefined);
  }

  get(taskId: TaskId): Promise<PlacementOutcomeRecord | undefined> {
    return this.#committed.get(taskId);
  }

  list(taskIds: readonly TaskId[]): Promise<readonly PlacementOutcomeRecord[]> {
    return this.#committed.list(taskIds);
  }

  async commit(): Promise<void> {
    for (const write of this.#writes) value(await write());
  }
}

// Runs `run-a` in `p-a` and `run-b` in `p-b` over one worker; `hooks` runs
// before each transaction and can fail the writes of records.
async function fixture(worker: WorkerPlacementRecord = ROOMY) {
  const clock = { at: START };
  const now = async () => new Date(clock.at).toISOString() as Instant;
  const projectQuotas = new Map<ProjectId, number>();
  const tasks = new InMemoryTaskRepository();
  const lineage = new InMemoryTaskLineage();
  const capacity = inMemoryCapacity(tasks, lineage, [worker]);
  const transaction: ControlPlaneTransaction = {
    runs: new InMemoryWorkflowRunRepository(), catalog: new InMemoryRunCatalog(), admissions: new InMemoryAdmissionRepository(),
    gates: new InMemoryGateRepository(), tasks, lineage, ...capacity, quotas: new InMemoryQuotaSettings(projectQuotas),
    evidence: new InMemoryEvidenceRecords(), producers: { heldGenerations: async () => ok([]) },
    fleet: { worker: async () => ok(undefined), replaceJournal: undefined as never },
    revisions: new InMemoryCurrentRevisions(), launches: undefined as never, now,
  };
  const hooks = { beforeTransaction: async () => {}, recordFails: false };
  const store: ControlPlaneStore = {
    transaction: async <Value>(work: (tx: ControlPlaneTransaction) => Promise<Result<Value>>) => {
      await hooks.beforeTransaction();
      const staged = new StagedOutcomes(capacity.placementOutcomes, hooks.recordFails);
      const result = await work({ ...transaction, placementOutcomes: staged });
      if (result.ok) await staged.commit();
      return result;
    },
    readCommitted: (work) => work(transaction),
  };
  const runs = new RunService(store, new WorkflowRegistry([{ definition, digest: DIGEST }]));
  for (const project of ['a', 'b']) value(await runs.createRun({ runId: `run-${project}`, projectId: `p-${project}`, binding }));
  const taskService = new TaskService(store);
  const submit = async (taskId: string, runId = 'run-a') => {
    value(await taskService.submitTask(runId, { taskId, kind: 'planning', stageId: 'specs' }, 'correlation-1' as CorrelationId));
    return taskId as TaskId;
  };
  const placement = new PlacementService(store, { now: () => clock.at, draw: () => 0 });
  const placed = () => capacity.assignments.all().map((assignment) => assignment.reservation.scope.taskId);
  const outcomeOf = (taskId: TaskId) => capacity.placementOutcomes.get(taskId);
  return { clock, now, projectQuotas, tasks, workers: capacity.workers, hooks, submit, placement, placed, outcomeOf };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;

// The record a waiting try writes for the task's active attempt.
async function waitingRecord({ tasks }: Fixture, taskId: TaskId, reason: string, recordedAt: number) {
  const attemptId = activeAttempt(value(await tasks.get(taskId)))?.id;
  return {
    taskId, ...(attemptId === undefined ? {} : { attemptId }), disposition: 'waiting', reason, source: 'scheduler',
    recordedAt: new Date(recordedAt).toISOString(),
  };
}

test('a waiting reason is recorded although its placement transaction rolls back', async () => {
  const context = await fixture(SMALL);
  const taskId = await context.submit('task-1');
  assert.deepEqual(value(await context.placement.placeWaiting()), { waiting: 1, placed: 0 });
  assert.deepEqual(await context.outcomeOf(taskId), await waitingRecord(context, taskId, 'worker-capacity-exhausted', START));
});

test('a later decline replaces the task\'s record, and its placement removes it', async () => {
  const context = await fixture();
  const taskId = await context.submit('task-1');
  context.projectQuotas.set('p-a' as ProjectId, 0);
  value(await context.placement.placeWaiting());
  assert.deepEqual(await context.outcomeOf(taskId), await waitingRecord(context, taskId, 'project-quota-exhausted', START));
  context.projectQuotas.delete('p-a' as ProjectId);
  context.workers.replace(SMALL);
  context.clock.at = START + 60_000;
  value(await context.placement.placeWaiting());
  assert.deepEqual(await context.outcomeOf(taskId), await waitingRecord(context, taskId, 'worker-capacity-exhausted', START + 60_000));
  context.workers.replace(ROOMY);
  assert.deepEqual(value(await context.placement.placeWaiting()), { waiting: 1, placed: 1 });
  assert.equal(await context.outcomeOf(taskId), undefined);
});

test('a rejecting reason is recorded with the ended attempt', async () => {
  const context = await fixture();
  const taskId = await context.submit('task-1');
  const task = value(await context.tasks.get(taskId));
  const endedAt = await context.now();
  // An exit of unknown status is uncertain, so its retry is rejected.
  const uncertain: Attempt = {
    id: 'attempt-1' as AttemptId, executions: [], outcome: {
      kind: 'exited', executionId: 'execution-1' as ExecutionId, status: { kind: 'unknown' }, startProven: true,
      cancelled: false, ownershipGeneration: task.ownershipGeneration, endedAt,
    },
  };
  const retry: Attempt = { id: 'attempt-2' as AttemptId, retryOf: uncertain.id, executions: [] };
  value(await context.tasks.replace({ ...task, attempts: [uncertain, retry], generation: nextGeneration(task.generation) }, task.generation));
  context.clock.at = START + 60_000;
  assert.deepEqual(value(await context.placement.placeWaiting()), { waiting: 1, placed: 0 });
  assert.equal(value(await context.tasks.get(taskId)).attempts[1]!.outcome?.kind, 'not-started');
  assert.deepEqual(await context.outcomeOf(taskId), {
    taskId, attemptId: retry.id, disposition: 'rejected', reason: 'retry-budget-exhausted', source: 'scheduler',
    recordedAt: new Date(START + 60_000).toISOString(),
  });
});

test('a task that stops waiting before its waiting record is written gets none', async () => {
  const context = await fixture(SMALL);
  const taskId = await context.submit('task-1');
  let transactions = 0;
  context.hooks.beforeTransaction = async () => {
    if (++transactions !== 2) return;
    const task = value(await context.tasks.get(taskId));
    const cancelled = value(requestCancellation(task, activeAttempt(task)!.id, 'requested', await context.now()));
    value(await context.tasks.replace(cancelled, task.generation));
  };
  value(await context.placement.placeWaiting());
  assert.equal(transactions, 2, 'the waiting record had its own transaction');
  assert.equal(await context.outcomeOf(taskId), undefined);
});

test('a failed write of a waiting record stops the pass', async () => {
  const context = await fixture();
  context.projectQuotas.set('p-a' as ProjectId, 0);
  const declined = await context.submit('task-a1', 'run-a');
  await context.submit('task-b1', 'run-b');
  context.hooks.recordFails = true;
  assert.equal(failed(await context.placement.placeWaiting()).code, 'unavailable');
  assert.deepEqual([context.placed(), await context.outcomeOf(declined)], [[], undefined], 'task-b1 is not offered');
});
