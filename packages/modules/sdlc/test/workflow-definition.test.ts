import assert from 'node:assert/strict';
import test from 'node:test';
import { parseIdentifier } from '@taskelith/kernel';
import { LIFECYCLE_OBLIGATIONS, parseWorkflowDefinition, type StageInput, type WorkflowDefinitionInput } from '@taskelith/sdlc';

// A branching graph in which the platform supplies the review and verification
// stages that the framework has no native operation for.
const STAGES: readonly StageInput[] = [
  { id: 'proposal', obligations: ['intake'], origin: 'native', dependsOn: [] },
  { id: 'specs', obligations: ['specification'], origin: 'native', dependsOn: ['proposal'] },
  { id: 'design', obligations: ['specification'], origin: 'native', dependsOn: ['proposal'] },
  { id: 'apply', obligations: ['implementation'], origin: 'native', dependsOn: ['specs', 'design'] },
  { id: 'verification', obligations: ['verification'], origin: 'platform-managed', dependsOn: ['apply'] },
  { id: 'review', obligations: ['review'], origin: 'platform-managed', dependsOn: ['verification'] },
  { id: 'archive', obligations: ['closure'], origin: 'native', dependsOn: ['review'] },
];

function workflow(stages: readonly StageInput[] = STAGES): WorkflowDefinitionInput {
  return { id: 'example-workflow', version: '2.1.0', stages };
}

function withStage(id: string, change: Partial<StageInput>): StageInput[] {
  return STAGES.map((stage) => (stage.id === id ? { ...stage, ...change } : stage));
}

// The kernel owns identifier messages; these tests check only the field prefix
// this package adds to them.
function identifierMessage(kind: string): string {
  const result = parseIdentifier(kind, '');
  assert.ok(!result.ok);
  return result.error.message;
}

function assertInvalid(input: WorkflowDefinitionInput, message: string, details: Record<string, string>): void {
  const result = parseWorkflowDefinition(input);
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.error.code, 'invalid');
  assert.equal(!result.ok && result.error.message, message);
  assert.deepEqual(!result.ok && result.error.details, details);
}

test('parseWorkflowDefinition accepts a stage graph that covers every obligation', () => {
  const result = parseWorkflowDefinition(workflow());
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.value.id, 'example-workflow');
  assert.equal(result.ok && result.value.version, '2.1.0');
  assert.deepEqual(result.ok && result.value.stages, STAGES);
});

test('parseWorkflowDefinition accepts one stage that combines every obligation', () => {
  const result = parseWorkflowDefinition(workflow([
    { id: 'all', obligations: [...LIFECYCLE_OBLIGATIONS], origin: 'native', dependsOn: [] },
  ]));
  assert.equal(result.ok, true);
});

test('a parsed workflow definition is deeply frozen', () => {
  const result = parseWorkflowDefinition(workflow());
  assert.ok(result.ok);
  const definition = result.value;
  assert.ok(Object.isFrozen(definition));
  assert.ok(Object.isFrozen(definition.stages));
  for (const stage of definition.stages) {
    assert.ok(Object.isFrozen(stage));
    assert.ok(Object.isFrozen(stage.obligations));
    assert.ok(Object.isFrozen(stage.dependsOn));
  }
});

test('parseWorkflowDefinition does not share arrays with its input', () => {
  const dependsOn = ['proposal'];
  const result = parseWorkflowDefinition(workflow(withStage('specs', { dependsOn })));
  dependsOn.push('design');
  assert.deepEqual(result.ok && result.value.stages[1]!.dependsOn, ['proposal']);
});

test('parseWorkflowDefinition rejects an invalid workflow identity or version', () => {
  assertInvalid({ ...workflow(), id: '' }, `id: ${identifierMessage('WorkflowId')}`, { kind: 'WorkflowId', field: 'id' });
  assertInvalid({ ...workflow(), version: 'a b' }, `version: ${identifierMessage('WorkflowVersion')}`, { kind: 'WorkflowVersion', field: 'version' });
});

test('parseWorkflowDefinition rejects a workflow without stages', () => {
  assertInvalid(workflow([]), 'stages: a workflow needs at least one stage', { field: 'stages' });
});

test('parseWorkflowDefinition rejects invalid stage fields and names the stage position', () => {
  assertInvalid(workflow(withStage('specs', { id: 'has space' })), `stages[1].id: ${identifierMessage('StageId')}`, { kind: 'StageId', field: 'stages[1].id' });
  assertInvalid(workflow(withStage('specs', { obligations: [] })), 'stages[1].obligations: a stage must cover at least one obligation', { field: 'stages[1].obligations' });
  assertInvalid(workflow(withStage('specs', { obligations: ['planning'] })), 'stages[1].obligations: LifecycleObligation must be one of intake, specification, implementation, review, verification, closure', { field: 'stages[1].obligations' });
  assertInvalid(workflow(withStage('specs', { obligations: ['specification', 'specification'] })), 'stages[1].obligations: obligation specification is listed twice', { field: 'stages[1].obligations' });
  assertInvalid(workflow(withStage('specs', { origin: 'external' })), 'stages[1].origin: StageOrigin must be one of native, platform-managed', { field: 'stages[1].origin' });
  assertInvalid(workflow(withStage('specs', { dependsOn: [''] })), `stages[1].dependsOn: ${identifierMessage('StageId')}`, { kind: 'StageId', field: 'stages[1].dependsOn' });
  assertInvalid(workflow(withStage('specs', { dependsOn: ['specs'] })), 'stages[1].dependsOn: a stage cannot depend on itself', { field: 'stages[1].dependsOn' });
  assertInvalid(workflow(withStage('specs', { dependsOn: ['proposal', 'proposal'] })), 'stages[1].dependsOn: dependency proposal is listed twice', { field: 'stages[1].dependsOn' });
});

test('parseWorkflowDefinition rejects a stage defined twice', () => {
  assertInvalid(workflow([...STAGES, STAGES[0]!]), 'stages: stage proposal is defined twice', { field: 'stages', stage: 'proposal' });
});

test('parseWorkflowDefinition rejects a dependency on an unknown stage', () => {
  assertInvalid(workflow(withStage('apply', { dependsOn: ['specs', 'tasks'] })), 'stages: stage apply depends on unknown stage tasks', { field: 'stages', stage: 'apply', dependency: 'tasks' });
});

test('parseWorkflowDefinition rejects a dependency cycle and names its stages', () => {
  assertInvalid(workflow(withStage('proposal', { dependsOn: ['review'] })), 'stages: stages form a dependency cycle: proposal -> review -> verification -> apply -> specs -> proposal', { field: 'stages', stage: 'proposal' });
});

test('parseWorkflowDefinition finds a cycle reached only through an acyclic part of the graph', () => {
  const stages: StageInput[] = [
    { id: 'start', obligations: [...LIFECYCLE_OBLIGATIONS], origin: 'native', dependsOn: [] },
    { id: 'shared', obligations: ['review'], origin: 'native', dependsOn: ['start'] },
    { id: 'first', obligations: ['review'], origin: 'native', dependsOn: ['shared'] },
    { id: 'loop-a', obligations: ['review'], origin: 'native', dependsOn: ['shared', 'loop-b'] },
    { id: 'loop-b', obligations: ['review'], origin: 'native', dependsOn: ['loop-a'] },
  ];
  assertInvalid(workflow(stages), 'stages: stages form a dependency cycle: loop-a -> loop-b -> loop-a', { field: 'stages', stage: 'loop-a' });
});

test('parseWorkflowDefinition rejects a workflow that leaves obligations uncovered', () => {
  const stages = STAGES.filter((stage) => stage.id !== 'review' && stage.id !== 'archive');
  assertInvalid(workflow(stages), 'stages: no stage covers the obligations review, closure', { field: 'stages', obligations: 'review,closure' });
});

function chain(length: number): StageInput[] {
  return Array.from({ length }, (_, index) => ({
    id: `stage-${index}`,
    obligations: index === 0 ? [...LIFECYCLE_OBLIGATIONS] : ['review'],
    origin: 'native',
    dependsOn: index === 0 ? [] : [`stage-${index - 1}`],
  }));
}

test('parseWorkflowDefinition accepts a long dependency chain without exhausting the stack', () => {
  assert.equal(parseWorkflowDefinition(workflow(chain(20_000))).ok, true);
});

test('parseWorkflowDefinition reports a cycle closed at the end of a long chain', () => {
  const stages = chain(20_000);
  stages[0] = { ...stages[0]!, dependsOn: ['stage-19999'] };
  const result = parseWorkflowDefinition(workflow(stages));
  assert.equal(!result.ok && result.error.code, 'invalid');
  assert.equal(!result.ok && result.error.details.stage, 'stage-0');
});

test('parseWorkflowDefinition accepts stages listed before their dependencies', () => {
  assert.equal(parseWorkflowDefinition(workflow([...STAGES].reverse())).ok, true);
});
