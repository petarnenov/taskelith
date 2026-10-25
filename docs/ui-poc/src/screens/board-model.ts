import type { DecisionState, InboxId } from '../store';
import type { ExecutionView, GateState } from '../ui';
import {
  RUNS,
  WORKFLOWS,
  mergeSteps,
  type GateDef,
  type GateView,
  type Run,
  type StageDef,
} from './board-data';

export interface BoardProgress {
  merged: string[];
  returned: string[];
  mergeFlow: Record<string, number>;
  stopping: string[];
  stopped: string[];
  reconciled: string[];
}

export const NO_PROGRESS: BoardProgress = {
  merged: [],
  returned: [],
  mergeFlow: {},
  stopping: [],
  stopped: [],
  reconciled: [],
};

export interface BoardRun extends Run {
  mergeStep?: number;
  returnedFromMerge?: boolean;
  justArchived?: boolean;
}

type Decisions = Partial<Record<InboxId, DecisionState>>;

export type StageState = 'not-started' | 'in-progress' | 'completed';

export interface GateRow extends GateDef, GateView {}

export interface StageRow extends StageDef {
  state: StageState;
  gates: GateRow[];
  passed: boolean;
}

function withSession(run: BoardRun, session: Partial<ExecutionView>): BoardRun {
  return { ...run, session: { ...run.session, ...session } };
}

function withGate(run: BoardRun, gateId: string, gate: Partial<GateView>): BoardRun {
  return { ...run, gates: { ...run.gates, [gateId]: { ...run.gates?.[gateId], ...gate } } };
}

function afterDecision(run: BoardRun, state: DecisionState | undefined): BoardRun {
  if (!state?.confirmed) return run;
  switch (state.decision) {
    case 'approved':
      return {
        ...withGate(run, 'specs-approval', { state: 'passed', verdict: 'approved by PP' }),
        note: 'Spec approved by you',
      };
    case 'rejected':
      return {
        ...withGate(run, 'specs-approval', { state: 'failed', verdict: 'rejected by PP' }),
        note: 'Rejected · reopens on the reworked revision',
      };
    case 'approve-once':
      return { ...withSession(run, { turn: 'working' }), note: 'Approved once · make verify runs' };
    case 'deny':
      return { ...withSession(run, { turn: 'idle' }), note: 'Denied · waits for instructions' };
  }
}

function merged(run: Run): BoardRun {
  const archive = run.framework === 'OpenSpec' ? 'archive' : 'close';
  return {
    ...run,
    at: archive,
    gates: { [archive + '-record']: { state: 'passed', verdict: 'satisfied' } },
    note: 'Closed · merged ' + run.pr,
    justArchived: true,
  };
}

function returnedToSpecify(run: Run): BoardRun {
  return {
    ...withSession(run, { phase: 'running', turn: 'working', outcome: undefined }),
    at: run.framework === 'OpenSpec' ? 'specs' : 'specify',
    gates: {},
    note: 'Reconciling spec with dev',
    returnedFromMerge: true,
  };
}

function resolvingConflict(run: Run, step: number): BoardRun {
  return {
    ...withSession(run, { phase: 'running', turn: 'working', outcome: undefined }),
    gates: { 'review-approval': { state: 'stale', verdict: 'approved (superseded by the new head)' } },
    note: 'New head: verify and review run again',
    mergeStep: step,
  };
}

function withProgress(run: Run, progress: BoardProgress, decisions: Decisions): BoardRun {
  if (progress.reconciled.includes(run.runId)) {
    return {
      ...withSession(run, { phase: 'ended', outcome: 'operator-resolved', evidence: undefined }),
      note: 'Reconciled by PP · capacity released · a new attempt can be admitted',
      whyNotMoving: undefined,
    };
  }
  if (progress.stopping.includes(run.runId)) return withSession(run, { cancellation: 'requested' });
  if (progress.stopped.includes(run.runId)) {
    return withSession(run, {
      phase: 'ended',
      outcome: 'exited-signal',
      cancelled: true,
      cancellation: undefined,
    });
  }
  if (progress.merged.includes(run.runId)) return merged(run);
  if (progress.returned.includes(run.runId)) return returnedToSpecify(run);
  if (run.runId in progress.mergeFlow) return resolvingConflict(run, progress.mergeFlow[run.runId]);
  return afterDecision(run, run.inboxId ? decisions[run.inboxId] : undefined);
}

export function currentRuns(progress: BoardProgress, decisions: Decisions): BoardRun[] {
  return RUNS.map((run) => withProgress(run, progress, decisions));
}

function stageAt(run: BoardRun): StageDef {
  const stages = WORKFLOWS[run.framework].stages;
  return stages.find((stage) => stage.id === run.at) ?? stages[0];
}

export function columnOf(run: BoardRun): number {
  return stageAt(run).column;
}

function gateRow(gate: GateDef, state: GateState, view: Partial<GateView> | undefined): GateRow {
  return { ...gate, state, generation: 1, ...view };
}

export function stageRows(run: BoardRun): StageRow[] {
  const stages = WORKFLOWS[run.framework].stages;
  const current = stages.findIndex((stage) => stage.id === run.at);
  return stages.map((stage, i): StageRow => {
    if (i < current) {
      const gates = stage.gates.map((gate) => gateRow(gate, 'passed', { verdict: 'recorded' }));
      return { ...stage, state: 'completed', gates, passed: true };
    }
    if (i > current) {
      const gates = stage.gates.map((gate) => gateRow(gate, 'pending', undefined));
      return { ...stage, state: 'not-started', gates, passed: false };
    }
    const gates = stage.gates.map((gate) => gateRow(gate, 'pending', run.gates?.[gate.id]));
    const passed = gates.every((gate) => gate.state === 'passed');
    return { ...stage, state: passed ? 'completed' : 'in-progress', gates, passed };
  });
}

// The card shows the worst gate state of the current stage.
const WORST_FIRST: GateState[] = ['failed', 'blocked', 'stale', 'pending', 'passed'];

export function cardGate(run: BoardRun): GateState {
  const gates = stageRows(run).find((stage) => stage.id === run.at)?.gates ?? [];
  return WORST_FIRST.find((state) => gates.some((gate) => gate.state === state)) ?? 'pending';
}

export function isMergeReady(run: BoardRun): boolean {
  return columnOf(run) === 4 && cardGate(run) === 'passed' && run.mergeStep === undefined;
}

export function mergeStepOf(run: BoardRun) {
  return run.mergeStep === undefined ? undefined : mergeSteps(run)[run.mergeStep];
}

export function admissionKind(stage: StageDef): 'planning' | 'implementation' | undefined {
  if (stage.obligations.includes('implementation')) return 'implementation';
  if (stage.obligations.includes('intake') || stage.obligations.includes('specification')) return 'planning';
  return undefined;
}

export type GroupBy = 'none' | 'framework' | 'harness';

export function laneKey(run: BoardRun, groupBy: GroupBy): string {
  if (groupBy === 'framework') return run.framework;
  if (groupBy === 'harness') return run.harness ? run.harness.split(' · ')[0] : 'Unassigned';
  return 'All runs';
}
