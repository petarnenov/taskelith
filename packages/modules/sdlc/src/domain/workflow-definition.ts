import { err, failure, ok, parseIdentifier, type Identifier, type Result } from '@taskelith/kernel';
import { fieldFailure } from './field-failure.js';
import {
  LIFECYCLE_OBLIGATIONS,
  parseLifecycleObligation,
  parseStageOrigin,
  type LifecycleObligation,
  type StageOrigin,
} from './lifecycle.js';

export type WorkflowId = Identifier<'WorkflowId'>;
export type WorkflowVersion = Identifier<'WorkflowVersion'>;
export type StageId = Identifier<'StageId'>;

// A stage may combine several obligations. Dependencies are acyclic
// prerequisites; rework loops are transitions back, not dependency edges.
export interface Stage {
  readonly id: StageId;
  readonly obligations: readonly LifecycleObligation[];
  readonly origin: StageOrigin;
  readonly dependsOn: readonly StageId[];
}

// A versioned stage graph resolved from a framework plugin. It is immutable: a
// changed workflow is a new version, never an edit of an existing definition.
export interface WorkflowDefinition {
  readonly id: WorkflowId;
  readonly version: WorkflowVersion;
  readonly stages: readonly Stage[];
}

export interface StageInput {
  readonly id: string;
  readonly obligations: readonly string[];
  readonly origin: string;
  readonly dependsOn: readonly string[];
}

export interface WorkflowDefinitionInput {
  readonly id: string;
  readonly version: string;
  readonly stages: readonly StageInput[];
}

export function parseWorkflowDefinition(input: WorkflowDefinitionInput): Result<WorkflowDefinition> {
  const id = parseIdentifier('WorkflowId', input.id);
  if (!id.ok) return fieldFailure('id', id.error);
  const version = parseIdentifier('WorkflowVersion', input.version);
  if (!version.ok) return fieldFailure('version', version.error);
  const stages = parseStages(input.stages);
  if (!stages.ok) return stages;
  const graph = checkStageGraph(stages.value);
  if (!graph.ok) return graph;
  return ok(Object.freeze({ id: id.value, version: version.value, stages: Object.freeze(stages.value) }));
}

function parseStages(inputs: readonly StageInput[]): Result<Stage[]> {
  if (inputs.length === 0) return err(failure('invalid', 'stages: a workflow needs at least one stage', { field: 'stages' }));
  const stages: Stage[] = [];
  for (const [index, input] of inputs.entries()) {
    const stage = parseStage(input);
    if (!stage.ok) return fieldFailure(`stages[${index}].${stage.error.details.field}`, stage.error);
    stages.push(stage.value);
  }
  return ok(stages);
}

function parseStage(input: StageInput): Result<Stage> {
  const id = parseIdentifier('StageId', input.id);
  if (!id.ok) return stageFieldFailure('id', id.error.message, id.error.details);
  const obligations = parseObligations(input.obligations);
  if (!obligations.ok) return obligations;
  const origin = parseStageOrigin(input.origin);
  if (!origin.ok) return stageFieldFailure('origin', origin.error.message, origin.error.details);
  const dependsOn = parseDependencies(id.value, input.dependsOn);
  if (!dependsOn.ok) return dependsOn;
  return ok(Object.freeze({
    id: id.value,
    obligations: Object.freeze(obligations.value),
    origin: origin.value,
    dependsOn: Object.freeze(dependsOn.value),
  }));
}

function parseObligations(texts: readonly string[]): Result<LifecycleObligation[]> {
  if (texts.length === 0) return stageFieldFailure('obligations', 'a stage must cover at least one obligation');
  const obligations: LifecycleObligation[] = [];
  for (const text of texts) {
    const obligation = parseLifecycleObligation(text);
    if (!obligation.ok) return stageFieldFailure('obligations', obligation.error.message, obligation.error.details);
    if (obligations.includes(obligation.value)) return stageFieldFailure('obligations', `obligation ${text} is listed twice`);
    obligations.push(obligation.value);
  }
  return ok(obligations);
}

function parseDependencies(stage: StageId, texts: readonly string[]): Result<StageId[]> {
  const dependencies: StageId[] = [];
  for (const text of texts) {
    const dependency = parseIdentifier('StageId', text);
    if (!dependency.ok) return stageFieldFailure('dependsOn', dependency.error.message, dependency.error.details);
    if (dependency.value === stage) return stageFieldFailure('dependsOn', 'a stage cannot depend on itself');
    if (dependencies.includes(dependency.value)) return stageFieldFailure('dependsOn', `dependency ${text} is listed twice`);
    dependencies.push(dependency.value);
  }
  return ok(dependencies);
}

// The caller prefixes the stage position; the message here names only the
// field within the stage.
function stageFieldFailure(
  field: keyof StageInput,
  message: string,
  details: Readonly<Record<string, string>> = {},
): Result<never> {
  return err(failure('invalid', message, { ...details, field }));
}

function checkStageGraph(stages: readonly Stage[]): Result<void> {
  const byId = new Map<StageId, Stage>();
  for (const stage of stages) {
    if (byId.has(stage.id)) return graphFailure(`stage ${stage.id} is defined twice`, { stage: stage.id });
    byId.set(stage.id, stage);
  }
  for (const stage of stages) {
    const unknown = stage.dependsOn.find((dependency) => !byId.has(dependency));
    if (unknown !== undefined) {
      return graphFailure(`stage ${stage.id} depends on unknown stage ${unknown}`, { stage: stage.id, dependency: unknown });
    }
  }
  const cycle = findDependencyCycle(stages, byId);
  if (cycle !== undefined) return graphFailure(`stages form a dependency cycle: ${cycle.join(' -> ')}`, { stage: cycle[0]! });
  const uncovered = LIFECYCLE_OBLIGATIONS.filter((obligation) => !stages.some((stage) => stage.obligations.includes(obligation)));
  if (uncovered.length > 0) {
    return graphFailure(`no stage covers the obligations ${uncovered.join(', ')}`, { obligations: uncovered.join(',') });
  }
  return ok(undefined);
}

function graphFailure(message: string, details: Record<string, string>): Result<never> {
  return err(failure('invalid', `stages: ${message}`, { field: 'stages', ...details }));
}

// Iterative depth-first search, so a long chain cannot exhaust the call stack;
// returns the first cycle, starting and ending with the same stage.
function findDependencyCycle(stages: readonly Stage[], byId: ReadonlyMap<StageId, Stage>): StageId[] | undefined {
  const finished = new Set<StageId>();
  for (const root of stages) {
    if (finished.has(root.id)) continue;
    const path: { readonly stage: Stage; nextDependency: number }[] = [{ stage: root, nextDependency: 0 }];
    const onPath = new Set<StageId>([root.id]);
    while (path.length > 0) {
      const frame = path[path.length - 1]!;
      const dependency = frame.stage.dependsOn[frame.nextDependency];
      if (dependency === undefined) {
        path.pop();
        onPath.delete(frame.stage.id);
        finished.add(frame.stage.id);
        continue;
      }
      frame.nextDependency += 1;
      if (onPath.has(dependency)) {
        const ids = path.map((entry) => entry.stage.id);
        return [...ids.slice(ids.indexOf(dependency)), dependency];
      }
      if (!finished.has(dependency)) {
        path.push({ stage: byId.get(dependency)!, nextDependency: 0 });
        onPath.add(dependency);
      }
    }
  }
  return undefined;
}
