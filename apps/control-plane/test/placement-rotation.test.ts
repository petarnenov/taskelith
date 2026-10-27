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
import { InMemoryEvidenceRecords, InMemoryTaskRepository, type WorkerId } from '@taskelith/execution';
import { err, failure, ok, type CorrelationId, type Instant, type Result } from '@taskelith/kernel';
import { InMemoryQuotaSettings, InMemoryTaskLineage, type ProjectId, type WorkerPlacementRecord } from '@taskelith/scheduling';
import {
  InMemoryAdmissionRepository,
  InMemoryCurrentRevisions,
  InMemoryGateRepository,
  InMemoryRunCatalog,
  InMemoryWorkflowRunRepository,
  parseWorkflowDefinition,
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
const AT = '2026-10-25T09:00:00.000Z' as Instant;
const TIMING = { now: () => Date.parse(AT), draw: () => 0 };
const DOWN = err(failure('unavailable', 'the store is down'));
const LOST_COMMIT = err(failure('unavailable', 'the commit outcome is unknown', { outcome: 'unknown' }));
// Two slots, reachable since enrollment, so no observation is needed.
const RECORD: WorkerPlacementRecord = {
  workerId: 'worker-1' as WorkerId, enrolled: true, revoked: false, draining: false, reachable: true, slots: 2,
  cpuMillicores: 4000, memoryMebibytes: 8192, controls: [], protocolVersion: 1,
};

// Shared in-memory stores without rollback, runs `run-a` in `p-a` and
// `run-b` in `p-b`; `outage` counts down to a failure or a lost commit.
async function fixture(projectQuotas: ReadonlyMap<ProjectId, number> = new Map()) {
  const tasks = new InMemoryTaskRepository();
  const lineage = new InMemoryTaskLineage();
  const capacity = inMemoryCapacity(tasks, lineage, [RECORD]);
  const transaction: ControlPlaneTransaction = {
    runs: new InMemoryWorkflowRunRepository(), catalog: new InMemoryRunCatalog(), admissions: new InMemoryAdmissionRepository(),
    gates: new InMemoryGateRepository(), tasks, lineage, ...capacity, quotas: new InMemoryQuotaSettings(projectQuotas),
    evidence: new InMemoryEvidenceRecords(), producers: { heldGenerations: async () => ok([]) },
    fleet: { worker: async () => ok(undefined), replaceJournal: undefined as never },
    revisions: new InMemoryCurrentRevisions(), launches: undefined as never,
    now: async () => AT,
  };
  const outage = { afterTransactions: Infinity, commitsBeforeLoss: Infinity };
  const store: ControlPlaneStore = {
    transaction: async <Value>(work: (tx: ControlPlaneTransaction) => Promise<Result<Value>>) => {
      if (outage.afterTransactions-- <= 0) return DOWN;
      const result = await work(transaction);
      return outage.commitsBeforeLoss-- === 0 ? LOST_COMMIT : result;
    },
    readCommitted: (work) => work(transaction),
  };
  const runs = new RunService(store, new WorkflowRegistry([{ definition, digest: DIGEST }]));
  for (const project of ['a', 'b']) value(await runs.createRun({ runId: `run-${project}`, projectId: `p-${project}`, binding }));
  const taskService = new TaskService(store);
  const submit = async (taskId: string, runId: string) => {
    value(await taskService.submitTask(runId, { taskId, kind: 'planning', stageId: 'specs' }, 'correlation-1' as CorrelationId));
  };
  const placed = () => capacity.assignments.all().map((assignment) => assignment.reservation.scope.taskId);
  return { store, transaction, outage, submit, placed };
}

test('after a restart the rotation continues after the stored cursor', async () => {
  const { store, submit, placed } = await fixture();
  await submit('task-a1', 'run-a');
  assert.equal(value(await new PlacementService(store, TIMING).placeWaiting()).placed, 1);
  await submit('task-a2', 'run-a');
  await submit('task-b1', 'run-b');
  assert.deepEqual(value(await new PlacementService(store, TIMING).placeWaiting()), { waiting: 2, placed: 1 });
  assert.deepEqual(placed(), ['task-a1', 'task-b1'], 'p-a is not served twice in a row');
});

test('a placement stores the cursor in the placing transaction, before an outage stops the pass', async () => {
  const { store, transaction, outage, submit, placed } = await fixture();
  await submit('task-a1', 'run-a');
  await submit('task-a2', 'run-a');
  await submit('task-b1', 'run-b');
  outage.afterTransactions = 1;
  assert.equal(failed(await new PlacementService(store, TIMING).placeWaiting()).code, 'unavailable');
  assert.equal(await transaction.rotation.read(), 'p-a', 'stored although every later transaction failed');
  outage.afterTransactions = Infinity;
  value(await new PlacementService(store, TIMING).placeWaiting());
  assert.deepEqual(placed(), ['task-a1', 'task-b1']);
});

test('a decline-only move does not overwrite a placement whose commit reply was lost', async () => {
  const { store, transaction, outage, submit } = await fixture(new Map([['p-a' as ProjectId, 0]]));
  await submit('task-a1', 'run-a');
  await submit('task-b1', 'run-b');
  outage.commitsBeforeLoss = 1;
  assert.equal(failed(await new PlacementService(store, TIMING).placeWaiting()).code, 'unavailable');
  assert.equal(await transaction.rotation.read(), 'p-b', 'the committed placement keeps its move');
});

test('a pass that an outage stops does not overwrite a placement of the cursor\'s own project', async () => {
  const { store, transaction, outage, submit } = await fixture(new Map([['p-b' as ProjectId, 0]]));
  await submit('task-a0', 'run-a');
  value(await new PlacementService(store, TIMING).placeWaiting());
  await submit('task-a1', 'run-a');
  await submit('task-b1', 'run-b');
  outage.commitsBeforeLoss = 1;
  assert.equal(failed(await new PlacementService(store, TIMING).placeWaiting()).code, 'unavailable');
  assert.equal(await transaction.rotation.read(), 'p-a', 'task-a1 committed after the decline of task-b1');
});
