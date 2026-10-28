import assert from 'node:assert/strict';
import test from 'node:test';
import { parseIdentifier, parseInstant, type Instant } from '@taskelith/kernel';
import {
  STAGE_STATES,
  STAGE_TRANSITIONS,
  beginWorkflowProgress,
  completeStage,
  hasStagePassed,
  markGateStale,
  openGate,
  parseArtifactRevision,
  parseGeneration,
  parseSemanticApproval,
  parseWorkflowDefinition,
  recordGateEvidence,
  startStage,
  type Gate,
  type Generation,
  type StageId,
  type WorkflowDefinition,
  type WorkflowProgress,
} from '@taskelith/sdlc';

function instant(text: string): Instant {
  const result = parseInstant(text);
  assert.ok(result.ok);
  return result.value;
}

function generation(value: number): Generation {
  const result = parseGeneration(value);
  assert.ok(result.ok);
  return result.value;
}

function stageId(text: string): StageId {
  const result = parseIdentifier('StageId', text);
  assert.ok(result.ok);
  return result.value;
}

const BEGUN_AT = instant('2026-10-24T09:00:00.000Z');
const LATER = instant('2026-10-24T10:00:00.000Z');

function definition(): WorkflowDefinition {
  const result = parseWorkflowDefinition({
    id: 'example-workflow',
    version: '1',
    stages: [
      { id: 'proposal', obligations: ['intake'], origin: 'native', dependsOn: [] },
      { id: 'specs', obligations: ['specification'], origin: 'native', dependsOn: ['proposal'] },
      { id: 'design', obligations: ['specification'], origin: 'native', dependsOn: ['proposal'] },
      { id: 'apply', obligations: ['implementation', 'review', 'verification', 'closure'], origin: 'native', dependsOn: ['specs', 'design'] },
    ],
  });
  assert.ok(result.ok);
  return result.value;
}

const REVISION = (() => {
  const result = parseArtifactRevision({ artifactId: 'spec', digest: `sha256:${'aa'.repeat(32)}`, nativeReference: 'spec.md' });
  assert.ok(result.ok);
  return result.value;
})();

function gate(stage: string, id = `${stage}-approval`): Gate {
  const result = openGate({ id, stageId: stage, requiredEvidence: 'semantic-approval', subject: [REVISION] }, BEGUN_AT);
  assert.ok(result.ok);
  return result.value;
}

function passed(stage: string, id?: string): Gate {
  const pending = gate(stage, id);
  const evidence = parseSemanticApproval({ approver: 'reviewer-1', verdict: 'approved', subject: [REVISION], recordedAt: LATER, reference: 'review',
    gateId: pending.id, gateGeneration: pending.generation,
  });
  assert.ok(evidence.ok);
  const result = recordGateEvidence(pending, pending.generation, evidence.value, LATER);
  assert.ok(result.ok);
  return result.value;
}

function progressed(result: ReturnType<typeof startStage>): WorkflowProgress {
  assert.ok(result.ok, !result.ok ? result.error.message : '');
  return result.value;
}

function stateOf(progress: WorkflowProgress, stage: string): string | undefined {
  return progress.stages.find((entry) => entry.stageId === stage)?.state;
}

test('beginWorkflowProgress starts every stage as not started at the first generation', () => {
  const progress = beginWorkflowProgress(definition(), BEGUN_AT);
  assert.equal(progress.generation, 1);
  assert.deepEqual(progress.stages.map((stage) => [stage.stageId, stage.state, stage.changedAt]), [
    ['proposal', 'not-started', BEGUN_AT],
    ['specs', 'not-started', BEGUN_AT],
    ['design', 'not-started', BEGUN_AT],
    ['apply', 'not-started', BEGUN_AT],
  ]);
  assert.ok(Object.isFrozen(progress) && Object.isFrozen(progress.stages) && progress.stages.every(Object.isFrozen));
});

test('the stage transition table allows exactly the documented transitions', () => {
  assert.deepEqual(STAGE_TRANSITIONS, { 'not-started': ['in-progress'], 'in-progress': ['completed'], completed: ['in-progress'] });
  assert.ok(Object.isFrozen(STAGE_TRANSITIONS));
  for (const state of STAGE_STATES) assert.ok(Object.isFrozen(STAGE_TRANSITIONS[state]));
});

test('a stage without dependencies starts, and the generation increments', () => {
  const progress = progressed(startStage(beginWorkflowProgress(definition(), BEGUN_AT), generation(1), stageId('proposal'), [], LATER));
  assert.equal(progress.generation, 2);
  assert.equal(stateOf(progress, 'proposal'), 'in-progress');
  assert.equal(progress.stages[0]!.changedAt, LATER);
  assert.equal(stateOf(progress, 'specs'), 'not-started');
});

test('a stage starts only when every dependency stage has passed all its gates', () => {
  const begun = beginWorkflowProgress(definition(), BEGUN_AT);
  const unmet = [
    { gates: [], missing: 'specs, design' },
    { gates: [passed('specs')], missing: 'design' },
    { gates: [passed('specs'), passed('design'), gate('design', 'design-validation')], missing: 'design' },
  ];
  for (const { gates, missing } of unmet) {
    const result = startStage(begun, generation(1), stageId('apply'), gates, LATER);
    assert.equal(!result.ok && result.error.code, 'precondition-failed');
    assert.equal(!result.ok && result.error.message, `stage apply cannot start before the stages ${missing} have passed`);
    assert.deepEqual(!result.ok && result.error.details, { stage: 'apply', dependencies: missing.replace(', ', ',') });
  }
  const started = progressed(startStage(begun, generation(1), stageId('apply'), [passed('specs'), passed('design')], LATER));
  assert.equal(stateOf(started, 'apply'), 'in-progress');
});

test('a stage completes only when it has gates and all of them have passed', () => {
  const started = progressed(startStage(beginWorkflowProgress(definition(), BEGUN_AT), generation(1), stageId('proposal'), [], LATER));
  for (const gates of [[], [gate('proposal')], [passed('proposal'), gate('proposal', 'proposal-validation')], [passed('specs')]]) {
    const result = completeStage(started, generation(2), stageId('proposal'), gates, LATER);
    assert.equal(!result.ok && result.error.code, 'precondition-failed');
    assert.equal(!result.ok && result.error.message, 'stage proposal cannot complete before it has gates and all of them have passed');
  }
  const completed = progressed(completeStage(started, generation(2), stageId('proposal'), [passed('proposal')], LATER));
  assert.equal(stateOf(completed, 'proposal'), 'completed');
  assert.equal(completed.generation, 3);
});

test('a rework loop starts a completed stage again', () => {
  let progress = beginWorkflowProgress(definition(), BEGUN_AT);
  progress = progressed(startStage(progress, progress.generation, stageId('proposal'), [], LATER));
  progress = progressed(completeStage(progress, progress.generation, stageId('proposal'), [passed('proposal')], LATER));
  progress = progressed(startStage(progress, progress.generation, stageId('proposal'), [], LATER));
  assert.equal(stateOf(progress, 'proposal'), 'in-progress');
});

test('every stage transition outside the table is rejected', () => {
  const begun = beginWorkflowProgress(definition(), BEGUN_AT);
  const notStarted = completeStage(begun, generation(1), stageId('proposal'), [passed('proposal')], LATER);
  assert.equal(!notStarted.ok && notStarted.error.code, 'precondition-failed');
  assert.deepEqual(!notStarted.ok && notStarted.error.details, { stage: 'proposal', from: 'not-started', to: 'completed' });
  const started = progressed(startStage(begun, generation(1), stageId('proposal'), [], LATER));
  const again = startStage(started, generation(2), stageId('proposal'), [], LATER);
  assert.equal(!again.ok && again.error.message, 'stage proposal cannot change from in-progress to in-progress');
  assert.deepEqual(!again.ok && again.error.details, { stage: 'proposal', from: 'in-progress', to: 'in-progress' });
  const completed = progressed(completeStage(started, generation(2), stageId('proposal'), [passed('proposal')], LATER));
  const twice = completeStage(completed, generation(3), stageId('proposal'), [passed('proposal')], LATER);
  assert.deepEqual(!twice.ok && twice.error.details, { stage: 'proposal', from: 'completed', to: 'completed' });
});

test('a writer with an outdated progress generation is rejected', () => {
  const started = progressed(startStage(beginWorkflowProgress(definition(), BEGUN_AT), generation(1), stageId('proposal'), [], LATER));
  for (const result of [
    startStage(started, generation(1), stageId('specs'), [passed('proposal')], LATER),
    completeStage(started, generation(1), stageId('proposal'), [passed('proposal')], LATER),
  ]) {
    assert.equal(!result.ok && result.error.code, 'conflict');
    assert.equal(!result.ok && result.error.message, 'workflow example-workflow progress is at generation 2, not the expected generation 1');
  }
});

test('a transition of an unknown stage is not found', () => {
  const result = startStage(beginWorkflowProgress(definition(), BEGUN_AT), generation(1), stageId('archive'), [], LATER);
  assert.equal(!result.ok && result.error.code, 'not-found');
  assert.deepEqual(!result.ok && result.error.details, { stage: 'archive' });
});

test('hasStagePassed reads only the gates of the given stage', () => {
  assert.equal(hasStagePassed(stageId('specs'), [passed('specs'), gate('design')]), true);
  assert.equal(hasStagePassed(stageId('specs'), [gate('design')]), false);
});

test('a completed dependency whose gate became stale does not let a dependent stage start', () => {
  let progress = beginWorkflowProgress(definition(), BEGUN_AT);
  progress = progressed(startStage(progress, progress.generation, stageId('proposal'), [], LATER));
  const proposalGate = passed('proposal');
  progress = progressed(completeStage(progress, progress.generation, stageId('proposal'), [proposalGate], LATER));
  const newRevision = parseArtifactRevision({ artifactId: 'spec', digest: `sha256:${'bb'.repeat(32)}`, nativeReference: 'spec.md' });
  assert.ok(newRevision.ok);
  const stale = markGateStale(proposalGate, proposalGate.generation, newRevision.value, LATER);
  assert.ok(stale.ok);
  const result = startStage(progress, progress.generation, stageId('specs'), [stale.value], LATER);
  assert.equal(!result.ok && result.error.code, 'precondition-failed');
  assert.deepEqual(!result.ok && result.error.details, { stage: 'specs', dependencies: 'proposal' });
});
