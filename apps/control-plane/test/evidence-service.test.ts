import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';
import type { HttpSchemas } from '@taskelith/contracts';
import { EvidenceService, RunService, TaskService, WorkflowRegistry, type ControlPlaneStore, type ControlPlaneTransaction } from '@taskelith/control-plane';
import { ControlPlaneNamespace } from '@taskelith/control-plane-store';
import { LocalEvidenceVolume } from '@taskelith/evidence-volume';
import { InMemoryEvidenceRecords, InMemoryTaskRepository, claimOwnership, endAttempt, openAttempt, type AttemptId, type WorkerId } from '@taskelith/execution';
import { ok, type Instant } from '@taskelith/kernel';
import { InMemoryTaskLineage } from '@taskelith/scheduling';
import {
  InMemoryAdmissionRepository,
  InMemoryCurrentRevisions,
  InMemoryGateRepository,
  InMemoryRunCatalog,
  InMemoryWorkflowRunRepository,
  parseOwnershipGeneration,
  parseWorkflowDefinition,
  type OwnershipGeneration,
  type TaskId,
} from '@taskelith/sdlc';
import { failed, value } from '@taskelith/testing';
import { inMemoryCapacity } from './in-memory-capacity.ts';

const WORKFLOW_DIGEST = `sha256:${'ab'.repeat(32)}`;
const definition = value(parseWorkflowDefinition({
  id: 'wf', version: '1', stages: [
    { id: 'specs', obligations: ['intake', 'specification'], origin: 'native', dependsOn: [] },
    { id: 'apply', obligations: ['implementation', 'review', 'verification', 'closure'], origin: 'native', dependsOn: ['specs'] },
  ],
}));
const binding = {
  pluginId: 'p', pluginVersion: '1', upstreamToolVersion: '1', workflowId: 'wf', workflowVersion: '1', workflowDigest: WORKFLOW_DIGEST,
  configurationRevision: 'c', policyRevision: 'r',
};
const WORKER = 'worker-1' as WorkerId;
const OTHER_WORKER = 'worker-2' as WorkerId;
const PRINCIPAL = { workerId: WORKER, generation: 1 };
const OTHER_PRINCIPAL = { workerId: OTHER_WORKER, generation: 1 };
const ATTEMPT = 'attempt-1' as AttemptId;
const generation = (number: number): OwnershipGeneration => value(parseOwnershipGeneration(number));

let base: string;
afterEach(() => rmSync(base, { recursive: true, force: true }));

interface Fixture {
  readonly service: EvidenceService;
  readonly tasks: TaskService;
  readonly transaction: ControlPlaneTransaction;
  readonly volume: LocalEvidenceVolume;
  readonly held: Map<string, readonly OwnershipGeneration[]>;
  readonly workers: Map<WorkerId, { credentials: { current: { generation: number } }; revokedAt?: Instant }>;
  clock: { now: Instant };
}

// In-memory records and a real volume; a task with attempt-1 opened at
// ownership generation 2 and claimed at 3, held by worker-1 at both.
async function fixture(): Promise<Fixture> {
  base = mkdtempSync(join(tmpdir(), 'taskelith-evidence-service-'));
  const dataRoot = join(base, 'root');
  value(ControlPlaneNamespace.open({ dataRoot, ownerUid: process.getuid!() }));
  const volume = value(LocalEvidenceVolume.open({ dataRoot, ownerUid: process.getuid!() }));
  const held = new Map<string, readonly OwnershipGeneration[]>([[`${WORKER}/${ATTEMPT}`, [generation(2), generation(3)]]]);
  const clock = { now: '2026-10-25T09:00:00.000Z' as Instant };
  const workers: Fixture['workers'] = new Map([WORKER, OTHER_WORKER].map((id) => [id, { credentials: { current: { generation: 1 } } }]));
  const taskStore = new InMemoryTaskRepository();
  const lineage = new InMemoryTaskLineage();
  const transaction: ControlPlaneTransaction = {
    runs: new InMemoryWorkflowRunRepository(), catalog: new InMemoryRunCatalog(), admissions: new InMemoryAdmissionRepository(),
    gates: new InMemoryGateRepository(), tasks: taskStore, lineage, ...inMemoryCapacity(taskStore, lineage),
    evidence: new InMemoryEvidenceRecords(),
    producers: { heldGenerations: async (workerId, attemptId) => ok(held.get(`${workerId}/${attemptId}`) ?? []) },
    fleet: { worker: async (workerId) => ok(workers.get(workerId) as never), replaceJournal: undefined as never },
    revisions: new InMemoryCurrentRevisions(),
    // Only the launch authority reads these.
    assignments: undefined as never, installation: undefined as never, launches: undefined as never,
    now: async () => clock.now,
  };
  const store: ControlPlaneStore = { transaction: (work) => work(transaction), readCommitted: (work) => work(transaction) };
  value(await new RunService(store, new WorkflowRegistry([{ definition, digest: WORKFLOW_DIGEST }])).createRun({ runId: 'run-1', projectId: 'project-1', binding }));
  const tasks = new TaskService(store);
  value(await tasks.submitTask('run-1', { taskId: 'task-1', kind: 'planning', stageId: 'specs' }, 'corr-1' as never));
  const opened = value(await transaction.tasks.get('task-1' as TaskId));
  const attempted = value(openAttempt(opened, opened.ownershipGeneration, { id: ATTEMPT }, clock.now));
  value(await transaction.tasks.replace(attempted, opened.generation));
  const claimed = value(claimOwnership(attempted, attempted.ownershipGeneration, ATTEMPT, clock.now));
  value(await transaction.tasks.replace(claimed, attempted.generation));
  return { service: new EvidenceService(store, volume), tasks, transaction, volume, held, workers, clock };
}

function digestOf(content: Buffer): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}

function publication(content: Buffer, overrides: Partial<HttpSchemas['EvidencePublication']> = {}): HttpSchemas['EvidencePublication'] {
  return {
    evidenceId: 'evidence-1', projectId: 'project-1', runId: 'run-1', taskId: 'task-1', attemptId: ATTEMPT, ownershipGeneration: 3,
    kind: 'execution-log', inputArtifacts: [], codeRevision: 'c0ffee', validator: { name: 'runner', version: '1.0.0' }, outcome: 'exited-0',
    contentDigest: digestOf(content), contentType: 'text/plain', sizeBytes: content.length, capturedAt: '2026-10-25T08:59:00.000Z',
    ...overrides,
  };
}

function contentPath(volume: LocalEvidenceVolume, content: Buffer): string {
  const hex = digestOf(content).slice('sha256:'.length);
  return join(volume.directory, 'sha256', hex.slice(0, 2), hex);
}

test('a held producer publishes once, a retry returns the record, and the task result lists it', async () => {
  const { service, tasks, transaction } = await fixture();
  const content = Buffer.from('build passed');
  const first = value(await service.publish(PRINCIPAL, publication(content), content));
  assert.equal(first.created, true);
  assert.deepEqual([first.record.ownershipCurrent, first.record.producer, first.record.publishedAt], [true, { kind: 'worker', workerId: WORKER }, '2026-10-25T09:00:00.000Z']);
  const again = value(await service.publish(PRINCIPAL, publication(content), content));
  assert.deepEqual(again, { record: first.record, created: false });
  const other = Buffer.from('other');
  assert.equal(failed(await service.publish(PRINCIPAL, publication(other), other)).code, 'conflict');
  assert.equal(failed(await service.publish(OTHER_PRINCIPAL, publication(content), content)).code, 'conflict');
  assert.deepEqual(value(await service.read('evidence-1')), first.record);
  const task = value(await transaction.tasks.get('task-1' as TaskId));
  value(await transaction.tasks.replace(value(endAttempt(task, ATTEMPT, '2026-10-25T09:01:00.000Z' as Instant)), task.generation));
  const result = value(await tasks.readTaskResult('run-1', 'task-1'));
  assert.deepEqual(result.state === 'ended' ? result.evidence : [], [first.record]);
});

test('evidence of an earlier held generation is stored with ownershipCurrent false', async () => {
  const { service } = await fixture();
  const content = Buffer.from('earlier');
  const stored = value(await service.publish(PRINCIPAL, publication(content, { ownershipGeneration: 2 }), content));
  assert.equal(stored.record.ownershipCurrent, false);
});

test('an unauthorized producer, a forged size or digest, or an invalid record stores nothing', async () => {
  const { service, held, volume } = await fixture();
  const content = Buffer.from('claimed');
  held.set(`${OTHER_WORKER}/${ATTEMPT}`, [generation(1)]);
  const refusals = [
    await service.publish(OTHER_PRINCIPAL, publication(content), content),
    await service.publish(PRINCIPAL, publication(content, { taskId: 'task-9' }), content),
    await service.publish(PRINCIPAL, publication(content, { projectId: 'project-2' }), content),
  ];
  for (const refusal of refusals) assert.deepEqual([failed(refusal).code, failed(refusal).details.reason], ['forbidden', 'producer-not-authorized']);
  assert.equal(failed(await volume.read(digestOf(content) as never)).code, 'not-found', 'no content of a refused producer');
  assert.equal(failed(await service.publish(PRINCIPAL, publication(content, { sizeBytes: 3 }), content)).details.field, 'sizeBytes');
  assert.equal(failed(await service.publish(PRINCIPAL, publication(content), Buffer.from('swapped'))).code, 'invalid');
  assert.equal(failed(await service.publish(PRINCIPAL, publication(content, { evidenceId: '' }), content)).details.field, 'evidenceId');
  assert.equal(failed(await service.read('evidence-1')).code, 'not-found');
});

test('content that is corrupt or missing is not downloaded, and a retry repairs it', async () => {
  const { service, volume } = await fixture();
  const content = Buffer.from('accepted');
  value(await service.publish(PRINCIPAL, publication(content), content));
  assert.equal(Buffer.from(value(await service.download('evidence-1')).content).toString(), 'accepted');
  writeFileSync(contentPath(volume, content), 'tampered');
  assert.equal(failed(await service.download('evidence-1')).details.reason, 'evidence-corrupt');
  value(await service.publish(PRINCIPAL, publication(content), content));
  assert.equal(Buffer.from(value(await service.download('evidence-1')).content).toString(), 'accepted');
  rmSync(contentPath(volume, content));
  const missing = failed(await service.download('evidence-1'));
  assert.deepEqual([missing.code, missing.details.reason], ['internal', 'evidence-missing']);
  assert.equal(failed(await service.download('evidence-9')).code, 'not-found');
  assert.equal(failed(await service.download('has space')).code, 'invalid');
});

test('a record is retired only after its retention, and its content once unreferenced', async () => {
  const { service, volume, clock } = await fixture();
  const content = Buffer.from('shared');
  value(await service.publish(PRINCIPAL, publication(content), content));
  value(await service.publish(PRINCIPAL, publication(content, { evidenceId: 'evidence-2' }), content));
  assert.equal(failed(await service.retire('evidence-1')).details.reason, 'retention-not-elapsed');
  clock.now = '2027-10-25T09:00:00.000Z' as Instant;
  value(await service.retire('evidence-1'));
  assert.equal(failed(await service.read('evidence-1')).code, 'not-found');
  assert.ok(value(await volume.read(digestOf(content) as never)), 'evidence-2 still refers to the content');
  value(await service.retire('evidence-2'));
  assert.equal(failed(await volume.read(digestOf(content) as never)).code, 'not-found');
  assert.equal(failed(await service.retire('evidence-2')).code, 'not-found');
});

test('a worker revoked or rotated past its generation since its bearer check stores nothing', async () => {
  const { service, workers } = await fixture();
  const content = Buffer.from('late');
  workers.set(WORKER, { credentials: { current: { generation: 1 } }, revokedAt: '2026-10-25T08:00:00.000Z' as Instant });
  const revoked = failed(await service.publish(PRINCIPAL, publication(content), content));
  assert.deepEqual([revoked.code, revoked.details.reason], ['forbidden', 'worker-not-authorized']);
  workers.set(WORKER, { credentials: { current: { generation: 2 } } });
  assert.equal(failed(await service.publish(PRINCIPAL, publication(content), content)).details.reason, 'worker-not-authorized');
  workers.delete(WORKER);
  assert.equal(failed(await service.publish(PRINCIPAL, publication(content), content)).details.reason, 'worker-not-authorized');
  assert.equal(failed(await service.read('evidence-1')).code, 'not-found');
});
