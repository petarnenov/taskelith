import assert from 'node:assert/strict';
import test from 'node:test';
import { parseWorkflowRunBinding, type WorkflowRunBindingInput } from '@taskelith/sdlc';

const BINDING: WorkflowRunBindingInput = {
  pluginId: 'sdlc-example',
  pluginVersion: '0.1.0',
  upstreamToolVersion: '5.0.2',
  workflowId: 'example-workflow',
  workflowVersion: '2.1.0',
  workflowDigest: `sha256:${'ab'.repeat(32)}`,
  configurationRevision: 'config-7',
  policyRevision: 'policy-3',
};

test('parseWorkflowRunBinding records every binding field', () => {
  assert.deepEqual(parseWorkflowRunBinding(BINDING), { ok: true, value: BINDING });
});

test('a parsed workflow run binding is frozen', () => {
  const result = parseWorkflowRunBinding(BINDING);
  assert.ok(result.ok && Object.isFrozen(result.value));
});

test('parseWorkflowRunBinding names the invalid field', () => {
  for (const field of Object.keys(BINDING) as (keyof WorkflowRunBindingInput)[]) {
    const result = parseWorkflowRunBinding({ ...BINDING, [field]: '' });
    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.error.code, 'invalid');
    assert.equal(!result.ok && result.error.details.field, field);
    assert.ok(!result.ok && result.error.message.startsWith(`${field}: `));
  }
});
