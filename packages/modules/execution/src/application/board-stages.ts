import type { Gate, GateState, Stage, StageId, StageState, WorkflowProgress } from '@taskelith/sdlc';
import type { BoardColumn, StageSummary } from '../ports/board-read-model.js';

// The most urgent gate state first (product ports section 3.3).
export const GATE_URGENCY: readonly GateState[] = Object.freeze(['blocked', 'failed', 'stale', 'pending', 'passed']);

// A run's stages and their states as the board reads them (section 3.2).
export interface StageGraph {
  // A topological order of `dependsOn`, ties in the port's order.
  readonly order: readonly Stage[];
  readonly states: ReadonlyMap<StageId, StageState>;
}

export function stageGraph(progress: WorkflowProgress): StageGraph {
  const states = new Map(progress.stages.map((stage) => [stage.stageId, stage.state] as const));
  return Object.freeze({ order: topologicalOrder(progress.definition.stages), states });
}

// Rules 1 to 5; a Close stage is `review` until its merge (rule 6).
export function columnOf(stage: Stage, graph: StageGraph): BoardColumn {
  const has = (obligation: string) => stage.obligations.includes(obligation as never);
  if (has('implementation')) return 'implement';
  if (has('verification')) return 'verify';
  if (has('review')) return dependsOnImplementation(stage, graph) ? 'review' : 'specify';
  if (has('intake')) return 'propose';
  if (has('specification')) return 'specify';
  return 'review';
}

// The last stage with the `closure` obligation in graph order.
export function closeStage(graph: StageGraph): Stage {
  return graph.order.filter((stage) => stage.obligations.includes('closure')).at(-1) ?? graph.order.at(-1)!;
}

// The first stage not completed, or the Close stage once all are.
export function currentStage(graph: StageGraph): Stage {
  return graph.order.find((stage) => graph.states.get(stage.id) !== 'completed') ?? closeStage(graph);
}

export function stageSummary(stage: Stage, graph: StageGraph): StageSummary {
  return Object.freeze({ stageId: stage.id, origin: stage.origin, state: graph.states.get(stage.id) ?? 'not-started' });
}

export function cardColumn(graph: StageGraph, merged: boolean): BoardColumn {
  if (merged) return 'archived';
  const current = currentStage(graph);
  return current.id === closeStage(graph).id ? 'review' : columnOf(current, graph);
}

// Section 3.4: every pre-merge stage completed and passed at its gates.
export function isMergeReady(graph: StageGraph, gates: readonly Gate[]): boolean {
  const close = closeStage(graph);
  const after = dependentsOf(close.id, graph);
  return graph.order
    .filter((stage) => stage.id !== close.id && !after.has(stage.id))
    .every((stage) => graph.states.get(stage.id) === 'completed' && hasPassedGates(stage.id, gates));
}

export function mostUrgentGate(stageId: StageId, gates: readonly Gate[]): GateState | undefined {
  const states = new Set(gates.filter((gate) => gate.stageId === stageId).map((gate) => gate.state));
  return GATE_URGENCY.find((state) => states.has(state));
}

function hasPassedGates(stageId: StageId, gates: readonly Gate[]): boolean {
  const own = gates.filter((gate) => gate.stageId === stageId);
  return own.length > 0 && own.every((gate) => gate.state === 'passed');
}

function dependsOnImplementation(stage: Stage, graph: StageGraph): boolean {
  const byId = new Map(graph.order.map((each) => [each.id, each] as const));
  const seen = new Set<StageId>();
  const pending = [...stage.dependsOn];
  while (pending.length > 0) {
    const next = byId.get(pending.pop()!);
    if (next === undefined || seen.has(next.id)) continue;
    seen.add(next.id);
    if (next.obligations.includes('implementation')) return true;
    pending.push(...next.dependsOn);
  }
  return false;
}

// The stages that depend on `stageId`, directly or transitively.
function dependentsOf(stageId: StageId, graph: StageGraph): ReadonlySet<StageId> {
  const found = new Set<StageId>();
  for (const stage of graph.order) {
    if (stage.dependsOn.some((dependency) => dependency === stageId || found.has(dependency))) found.add(stage.id);
  }
  return found;
}

function topologicalOrder(stages: readonly Stage[]): readonly Stage[] {
  const placed = new Set<StageId>();
  const order: Stage[] = [];
  while (order.length < stages.length) {
    const next = stages.find((stage) => !placed.has(stage.id) && stage.dependsOn.every((dependency) => placed.has(dependency)));
    if (next === undefined) break;
    placed.add(next.id);
    order.push(next);
  }
  return Object.freeze(order);
}
