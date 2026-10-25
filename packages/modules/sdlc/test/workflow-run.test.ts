import assert from 'node:assert/strict';
import test from 'node:test';
import { parseInstant } from '@taskelith/kernel';
import { beginWorkflowRun, parseWorkflowDefinition, parseWorkflowRunBinding } from '@taskelith/sdlc';

const AT = (() => {
  const result = parseInstant('2026-10-25T09:00:00.000Z');
  assert.ok(result.ok);
  return result.value;
})();

const DEFINITION = (() => {
  const result = parseWorkflowDefinition({
    id: 'flow',
    version: '2',
    stages: [
      { id: 'specs', obligations: ['intake', 'specification'], origin: 'native', dependsOn: [] },
      { id: 'apply', obligations: ['implementation', 'review', 'verification', 'closure'], origin: 'native', dependsOn: ['specs'] },
    ],
  });
  assert.ok(result.ok);
  return result.value;
})();

function binding(workflowId: string, workflowVersion: string) {
  const result = parseWorkflowRunBinding({
    pluginId: 'plugin', pluginVersion: '1.0.0', upstreamToolVersion: '1.0.0', workflowId, workflowVersion,
    workflowDigest: `sha256:${'ab'.repeat(32)}`, configurationRevision: 'config-1', policyRevision: 'policy-1',
  });
  assert.ok(result.ok);
  return result.value;
}

test('a workflow run begins with its binding and fresh progress', () => {
  const result = beginWorkflowRun({ id: 'run-1', binding: binding('flow', '2'), definition: DEFINITION }, AT);
  assert.ok(result.ok);
  assert.equal(result.value.id, 'run-1');
  assert.equal(result.value.progress.generation, 1);
  assert.deepEqual(result.value.progress.stages.map((stage) => stage.state), ['not-started', 'not-started']);
  assert.ok(Object.isFrozen(result.value));
});

test('a run rejects an invalid identifier and a binding to another workflow', () => {
  const invalid = beginWorkflowRun({ id: 'has space', binding: binding('flow', '2'), definition: DEFINITION }, AT);
  assert.equal(!invalid.ok && invalid.error.details.field, 'id');
  for (const other of [binding('other', '2'), binding('flow', '3')]) {
    const result = beginWorkflowRun({ id: 'run-1', binding: other, definition: DEFINITION }, AT);
    assert.equal(!result.ok && result.error.code, 'invalid');
  }
});
