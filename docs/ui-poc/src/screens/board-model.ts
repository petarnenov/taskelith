import type { InboxDecision, InboxId } from '../store';
import { TASKS, mergeSteps, type Framework, type Task } from './board-data';

export interface BoardProgress {
  merged: string[];
  returned: string[];
  mergeFlow: Record<string, number>;
  stopping: string[];
  stopped: string[];
  migrated: Record<string, Framework>;
}

export const NO_PROGRESS: BoardProgress = {
  merged: [],
  returned: [],
  mergeFlow: {},
  stopping: [],
  stopped: [],
  migrated: {},
};

export interface BoardTask extends Task {
  mergeStep?: number;
  returnedFromMerge?: boolean;
  justArchived?: boolean;
}

type Decisions = Partial<Record<InboxId, InboxDecision>>;

function afterDecision(task: BoardTask, decision: InboxDecision | undefined): BoardTask {
  if (!decision || !task.inboxId) return task;
  if (task.awaitsOwner) {
    return decision === 'changes'
      ? { ...task, awaitsOwner: false, note: 'Changes requested by you · back to the harness' }
      : { ...task, awaitsOwner: false, gate: 'passed', note: 'Spec approved by you' };
  }
  if (decision === 'denied') {
    return { ...task, approval: false, session: 'instructions', note: 'Denied make verify' };
  }
  return { ...task, approval: false, session: 'live', note: 'Approved make verify' };
}

function withProgress(task: Task, progress: BoardProgress, decisions: Decisions): BoardTask {
  const { merged, returned, mergeFlow, stopping, stopped, migrated } = progress;
  const base: BoardTask =
    task.id in migrated
      ? {
          ...task,
          framework: migrated[task.id],
          native: 'migrated · new binding recorded',
          gate: 'stale',
          note: 'Migrated to ' + migrated[task.id] + ' · gates re-run',
        }
      : task;
  if (stopping.includes(task.id)) return { ...base, approval: false, session: 'stopping' };
  if (merged.includes(task.id)) {
    return {
      ...base,
      stage: 5,
      gate: 'passed',
      note: 'Closed · merged ' + task.pr,
      session: 'stopped',
      justArchived: true,
    };
  }
  if (returned.includes(task.id)) {
    return {
      ...base,
      stage: 1,
      gate: 'pending',
      note: 'Reconciling spec with dev',
      session: 'live',
      returnedFromMerge: true,
    };
  }
  if (task.id in mergeFlow) {
    return {
      ...base,
      gate: 'stale',
      note: 'New head: verify and review re-run',
      session: 'live',
      mergeStep: mergeFlow[task.id],
    };
  }
  const decided = afterDecision(base, task.inboxId ? decisions[task.inboxId] : undefined);
  return stopped.includes(task.id) ? { ...decided, approval: false, session: 'stopped' } : decided;
}

export function currentTasks(progress: BoardProgress, decisions: Decisions): BoardTask[] {
  return TASKS.map((task) => withProgress(task, progress, decisions));
}

export function isMergeReady(task: BoardTask): boolean {
  return task.stage === 4 && task.gate === 'passed';
}

export function mergeStepOf(task: BoardTask) {
  return task.mergeStep === undefined ? undefined : mergeSteps(task)[task.mergeStep];
}

export function sessionLog(task: BoardTask, conflictCount: number): string {
  const step = mergeStepOf(task);
  if (step) return '▸ git merge origin/dev\n✗ CONFLICT in ' + conflictCount + ' files\n▸ ' + step.detail;
  if (task.returnedFromMerge)
    return '▸ returned from merge: spec conflict with dev\n▸ reconciling spec with the new contract on dev';
  const logs: Partial<Record<BoardTask['session'], string>> = {
    live: '▸ read openspec/changes/' + task.change + '/tasks.md\n▸ edit 3 files\n▸ run tests: 42 passed',
    approval: '▸ task 4 of 9 complete\n▸ request: run nvm use && make verify\n⏸ waiting for approval',
    instructions: '▸ request denied: nvm use && make verify\n⏸ waiting for instructions',
    idle: '▸ last turn finished\n▸ waiting for the next stage admission',
    stopping: '■ stop requested\n⏸ waiting for the worker to confirm the process ended',
    stopped: '■ session stopped',
    uncertain: '? last event from linux-03 6 min ago\n▸ reconciling ownership · not reassigned',
  };
  return logs[task.session] ?? '';
}

export type GroupBy = 'none' | 'framework' | 'harness';

export function laneKey(task: BoardTask, groupBy: GroupBy): string {
  if (groupBy === 'framework') return task.framework;
  if (groupBy === 'harness') return task.harness ? task.harness.split(' · ')[0] : 'Unassigned';
  return 'All tasks';
}

type VerifyState = 'stale' | 'fresh' | 'running' | 'none';

function verifyStateOf(task: BoardTask, resolving: boolean): VerifyState {
  if (task.gate === 'stale' && resolving) return 'stale';
  if (task.stage >= 4 || (task.stage === 3 && task.gate === 'passed')) return 'fresh';
  if (task.stage === 3) return 'running';
  return 'none';
}

const VERIFY_COLOR: Record<VerifyState, string> = {
  stale: 'orange',
  fresh: 'teal',
  running: 'dimmed',
  none: 'dimmed',
};

function reviewStateOf(task: BoardTask, reviewed: boolean): string {
  if (reviewed) return 'review passed';
  return task.stage === 4 ? 'in review' : 'not reviewed';
}

export function traceFor(task: BoardTask) {
  if (task.stage === 0) return [];
  const resolving = task.mergeStep !== undefined;
  const verifyState = verifyStateOf(task, resolving);
  const reviewed = task.stage === 5 || (isMergeReady(task) && !resolving);
  const review = reviewStateOf(task, reviewed);
  const verify = {
    stale: 'evidence stale (new head)',
    fresh: 'verify fresh',
    running: 'verify running',
    none: 'not verified',
  }[verifyState];
  const color = VERIFY_COLOR[verifyState];
  return ['R1', 'R2'].map((req, i) => ({
    req,
    path: task.stage >= 2 ? 'task ' + (i + 1) + '.1 → attempt #' + (i + 1) : 'tasks not planned yet',
    state: verify + ' · ' + review,
    color,
  }));
}
