import assert from 'node:assert/strict';
import test from 'node:test';
import { RunService, WorkflowRegistry, type ControlPlaneStore, type ControlPlaneTransaction } from '@taskelith/control-plane';
import { InMemoryEvidenceRecords, InMemoryTaskRepository } from '@taskelith/execution';
import { InMemoryTaskLineage } from '@taskelith/scheduling';
import {
  InMemoryAdmissionRepository,
  InMemoryGateRepository,
  InMemoryOutbox,
  InMemoryRunCatalog,
  InMemoryWorkflowRunRepository,
  parseWorkflowDefinition,
} from '@taskelith/sdlc';
import { failed, value } from '@taskelith/testing';

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
  const transaction: ControlPlaneTransaction = {
    runs: new InMemoryWorkflowRunRepository(), catalog: new InMemoryRunCatalog(), admissions: new InMemoryAdmissionRepository(),
    gates: new InMemoryGateRepository(), tasks: new InMemoryTaskRepository(), lineage: new InMemoryTaskLineage(), outbox: new InMemoryOutbox(),
    evidence: new InMemoryEvidenceRecords(), producers: { heldGenerations: async () => ({ ok: true, value: [] }) },
    now: async () => '2026-10-25T09:00:00.000Z' as never,
  };
  return { transaction: (work) => work(transaction) };
}

test('a stored run answers a repeat after its workflow left the registry', async () => {
  const shared = store();
  const created = value(await new RunService(shared, new WorkflowRegistry([{ definition, digest: DIGEST }])).createRun({ runId: 'run-1', projectId: 'p1', binding }));
  const later = new RunService(shared, new WorkflowRegistry([]));
  assert.deepEqual(value(await later.createRun({ runId: 'run-1', projectId: 'p1', binding })), created);
  assert.equal(failed(await later.createRun({ runId: 'run-1', projectId: 'p2', binding })).code, 'conflict');
  assert.equal(failed(await later.createRun({ runId: 'run-2', projectId: 'p1', binding })).code, 'precondition-failed');
});
