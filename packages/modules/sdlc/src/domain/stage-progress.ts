import { err, failure, ok, type Instant, type Result } from '@taskelith/kernel';
import type { Gate } from './gate.js';
import { FIRST_GENERATION, checkGeneration, nextGeneration, type Generation } from './generation.js';
import type { Stage, StageId, WorkflowDefinition } from './workflow-definition.js';

export const STAGE_STATES = Object.freeze(['not-started', 'in-progress', 'completed'] as const);

export type StageState = (typeof STAGE_STATES)[number];

// The only allowed stage transitions; every other one is rejected. Starting a
// completed stage again is how a rework loop returns to it.
export const STAGE_TRANSITIONS: Readonly<Record<StageState, readonly StageState[]>> = Object.freeze({
  'not-started': Object.freeze(['in-progress'] as const),
  'in-progress': Object.freeze(['completed'] as const),
  completed: Object.freeze(['in-progress'] as const),
});

export interface StageProgress {
  readonly stageId: StageId;
  readonly state: StageState;
  readonly changedAt: Instant;
}

// The stages of one workflow run and how far each has come. Whether a stage's
// work is accepted is decided by its gates, which the transitions read; a
// completed stage records only that the stage was finished.
export interface WorkflowProgress {
  readonly definition: WorkflowDefinition;
  readonly generation: Generation;
  readonly stages: readonly StageProgress[];
}

export function beginWorkflowProgress(definition: WorkflowDefinition, at: Instant): WorkflowProgress {
  const stages = definition.stages.map((stage) => Object.freeze({ stageId: stage.id, state: 'not-started' as const, changedAt: at }));
  return Object.freeze({ definition, generation: FIRST_GENERATION, stages: Object.freeze(stages) });
}

// A stage has passed when it has at least one gate and all of its gates have
// passed; a stage without a gate has no validated outcome.
export function hasStagePassed(stageId: StageId, gates: readonly Gate[]): boolean {
  const own = gates.filter((gate) => gate.stageId === stageId);
  return own.length > 0 && own.every((gate) => gate.state === 'passed');
}

// Starts a stage, or starts a completed stage again, once every stage it
// depends on has passed.
export function startStage(
  progress: WorkflowProgress,
  expectedGeneration: Generation,
  stageId: StageId,
  gates: readonly Gate[],
  at: Instant,
): Result<WorkflowProgress> {
  const allowed = checkTransition(progress, expectedGeneration, stageId, 'in-progress');
  if (!allowed.ok) return allowed;
  const unmet = allowed.value.dependsOn.filter((dependency) => !hasStagePassed(dependency, gates));
  if (unmet.length > 0) {
    return stageFailure(stageId, `cannot start before the stages ${unmet.join(', ')} have passed`, { dependencies: unmet.join(',') });
  }
  return ok(changedProgress(progress, stageId, 'in-progress', at));
}

export function completeStage(
  progress: WorkflowProgress,
  expectedGeneration: Generation,
  stageId: StageId,
  gates: readonly Gate[],
  at: Instant,
): Result<WorkflowProgress> {
  const allowed = checkTransition(progress, expectedGeneration, stageId, 'completed');
  if (!allowed.ok) return allowed;
  if (!hasStagePassed(stageId, gates)) return stageFailure(stageId, 'cannot complete before it has gates and all of them have passed');
  return ok(changedProgress(progress, stageId, 'completed', at));
}

function checkTransition(
  progress: WorkflowProgress,
  expectedGeneration: Generation,
  stageId: StageId,
  to: StageState,
): Result<Stage> {
  const generation = checkGeneration(`workflow ${progress.definition.id} progress`, progress.generation, expectedGeneration);
  if (!generation.ok) return generation;
  const stage = progress.definition.stages.find((candidate) => candidate.id === stageId);
  if (stage === undefined) {
    return err(failure('not-found', `workflow ${progress.definition.id} has no stage ${stageId}`, { stage: stageId }));
  }
  const from = stateOf(progress, stageId);
  if (!STAGE_TRANSITIONS[from].includes(to)) {
    return stageFailure(stageId, `cannot change from ${from} to ${to}`, { from, to });
  }
  return ok(stage);
}

// Stage progress has exactly one entry per stage of its definition.
function stateOf(progress: WorkflowProgress, stageId: StageId): StageState {
  return progress.stages.find((stage) => stage.stageId === stageId)!.state;
}

function stageFailure(stageId: StageId, message: string, details: Readonly<Record<string, string>> = {}): Result<never> {
  return err(failure('precondition-failed', `stage ${stageId} ${message}`, { stage: stageId, ...details }));
}

function changedProgress(progress: WorkflowProgress, stageId: StageId, state: StageState, at: Instant): WorkflowProgress {
  const stages = progress.stages.map((stage) => (stage.stageId === stageId ? Object.freeze({ stageId, state, changedAt: at }) : stage));
  return Object.freeze({ definition: progress.definition, generation: nextGeneration(progress.generation), stages: Object.freeze(stages) });
}
