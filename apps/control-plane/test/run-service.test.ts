import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryAccessStore, ProjectSetupService } from '@taskelith/access';
import { projectDirectory, RunService, WorkflowRegistry, type ControlPlaneStore, type ControlPlaneTransaction, type ProjectDirectory } from '@taskelith/control-plane';
import { err, failure, ok } from '@taskelith/kernel';
import { InMemoryEvidenceRecords, InMemoryTaskRepository } from '@taskelith/execution';
import { InMemoryTaskLineage } from '@taskelith/scheduling';
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
import { addProjects, EVERY_PROJECT_EXISTS } from './project-fixtures.ts';

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

// One shared set of in-memory stores; the use cases' logic, not atomicity,
// is what these tests check.
function store(): ControlPlaneStore {
  const tasks = new InMemoryTaskRepository();
  const lineage = new InMemoryTaskLineage();
  const transaction: ControlPlaneTransaction = {
    runs: new InMemoryWorkflowRunRepository(), catalog: new InMemoryRunCatalog(), admissions: new InMemoryAdmissionRepository(),
    gates: new InMemoryGateRepository(), tasks, lineage, ...inMemoryCapacity(tasks, lineage),
    evidence: new InMemoryEvidenceRecords(), producers: { heldGenerations: async () => ({ ok: true, value: [] }) },
    fleet: { worker: async () => ({ ok: true, value: undefined }), replaceJournal: undefined as never },
    revisions: new InMemoryCurrentRevisions(),
    // Only the launch authority reads these.
    assignments: undefined as never, installation: undefined as never, launches: undefined as never,
    now: async () => '2026-10-25T09:00:00.000Z' as never,
  };
  return { transaction: (work) => work(transaction), readCommitted: (work) => work(transaction) };
}

test('a stored run answers a repeat after its workflow left the registry', async () => {
  const shared = store();
  const created = value(await new RunService(shared, new WorkflowRegistry([{ definition, digest: DIGEST }]), EVERY_PROJECT_EXISTS).createRun({ runId: 'run-1', projectId: 'p1', binding }));
  const later = new RunService(shared, new WorkflowRegistry([]), EVERY_PROJECT_EXISTS);
  assert.deepEqual(value(await later.createRun({ runId: 'run-1', projectId: 'p1', binding })), created);
  assert.equal(failed(await later.createRun({ runId: 'run-1', projectId: 'p2', binding })).code, 'conflict');
  assert.equal(failed(await later.createRun({ runId: 'run-2', projectId: 'p1', binding })).code, 'precondition-failed');
});

// The projects that exist; any other identifier names none.
function projectsOf(...projectIds: string[]): ProjectDirectory {
  return { exists: async (projectId) => ok(projectIds.includes(projectId)) };
}

test('a run of a project that does not exist is not-found and stores nothing, before the workflow check', async () => {
  const shared = store();
  const registry = new WorkflowRegistry([{ definition, digest: DIGEST }]);
  const missing = failed(await new RunService(shared, registry, projectsOf('p1')).createRun({ runId: 'run-1', projectId: 'p2', binding }));
  assert.deepEqual([missing.code, missing.details], ['not-found', { project: 'p2' }]);
  const unknownWorkflow = await new RunService(shared, new WorkflowRegistry([]), projectsOf()).createRun({ runId: 'run-1', projectId: 'p2', binding });
  assert.equal(failed(unknownWorkflow).code, 'not-found', 'the project is checked first');
  assert.equal(value(await shared.transaction((tx) => tx.catalog.envelope('run-1' as never))), undefined);
  const created = value(await new RunService(shared, registry, projectsOf('p1')).createRun({ runId: 'run-1', projectId: 'p1', binding }));
  assert.equal(created.projectId, 'p1');
});

test('a failed project lookup fails the run and stores nothing', async () => {
  const shared = store();
  const down: ProjectDirectory = { exists: async () => err(failure('unavailable', 'the project store is down')) };
  const runs = new RunService(shared, new WorkflowRegistry([{ definition, digest: DIGEST }]), down);
  assert.equal(failed(await runs.createRun({ runId: 'run-1', projectId: 'p1', binding })).code, 'unavailable');
  assert.equal(value(await shared.transaction((tx) => tx.catalog.envelope('run-1' as never))), undefined);
});

test('the composition\'s project directory answers from the project store', async () => {
  const access = new InMemoryAccessStore();
  await addProjects(access, ['p1'], '2026-10-25T09:00:00.000Z' as never);
  // A read draws no random value and reads no clock.
  const directory = projectDirectory(new ProjectSetupService({ store: access, random: undefined as never, clock: undefined as never }));
  assert.deepEqual([value(await directory.exists('p1')), value(await directory.exists('p2'))], [true, false]);
  const down = projectDirectory({ readProject: async () => err(failure('unavailable', 'down')) });
  assert.equal(failed(await down.exists('p1')).code, 'unavailable');
});
