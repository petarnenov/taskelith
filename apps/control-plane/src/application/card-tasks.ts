import {
  PLACEMENT_REJECTING_REASONS,
  PLACEMENT_WAITING_REASONS,
  WORKER_REFUSAL_REASONS,
  activeAttempt,
  isUnknownExecution,
  owningExecution,
  placementNeed,
  type FleetObstacleReason,
  type PlacementObstacle,
  type SessionActivity,
  type SessionActivityState,
  type Task,
  type TaskEnd,
} from '@taskelith/execution';
import { ok, type Instant, type Result } from '@taskelith/kernel';
import { automaticRetryOf, type PlacementOutcomeRecord, type WorkerPlacementRecord } from '@taskelith/scheduling';
import type { BoardReads } from './board-reads.js';

// The most urgent first (product ports section 3.3).
export const ACTIVITY_URGENCY: readonly SessionActivityState[] = Object.freeze([
  'process-uncertain', 'worker-unreachable', 'waiting-for-person', 'working', 'waiting-for-admission', 'stopped', 'none',
]);

// What one task's state needs beyond the task (sections 3.6, 3.8, 3.9).
export interface TaskContext {
  readonly reads: BoardReads;
  readonly asOf: Instant;
  readonly hasOpenItem: boolean;
  workers(): Promise<Result<ReadonlyMap<string, WorkerPlacementRecord>>>;
  fleetObstacle(): Promise<Result<FleetObstacleReason | undefined>>;
}

export interface TaskState {
  readonly session: SessionActivity;
  readonly obstacle?: PlacementObstacle;
  readonly end?: TaskEnd;
}

export async function taskState(task: Task, context: TaskContext): Promise<Result<TaskState>> {
  const record = await context.reads.placementOutcomes.get(task.id);
  const end = taskEnd(task, record);
  const session = await sessionActivity(task, end, context);
  if (!session.ok) return session;
  const obstacle = await obstacleOf(task, record, context);
  if (!obstacle.ok) return obstacle;
  return ok(Object.freeze({
    session: session.value, ...(obstacle.value === undefined ? {} : { obstacle: obstacle.value }), ...(end === undefined ? {} : { end }),
  }));
}

// Section 3.9, kinds in the table's order; a clean exit is no end.
export function taskEnd(task: Task, record: PlacementOutcomeRecord | undefined): TaskEnd | undefined {
  if (activeAttempt(task) !== undefined) return undefined;
  const last = task.attempts.at(-1);
  const outcome = last?.outcome;
  if (last === undefined || outcome === undefined || outcome.ownershipGeneration !== task.ownershipGeneration) return undefined;
  const end = (kind: TaskEnd['kind']): TaskEnd => Object.freeze({ kind, taskId: task.id, attemptId: last.id, outcome });
  if (outcome.cancelled) return end('cancelled');
  if (record?.disposition === 'rejected' && record.attemptId === last.id) return end('rejected');
  if (outcome.kind === 'operator-resolved') return end('uncertain-exit');
  if (outcome.kind === 'exited' && (!outcome.startProven || outcome.status.kind === 'unknown')) return end('uncertain-exit');
  if (outcome.kind === 'exited' && outcome.status.kind === 'code' && outcome.status.code === 0) return undefined;
  return automaticRetryOf(task, last.id) ? undefined : end('retries-exhausted');
}

async function sessionActivity(task: Task, end: TaskEnd | undefined, context: TaskContext): Promise<Result<SessionActivity>> {
  const sessions = await context.reads.timeline.sessions.listByTask(task.id);
  if (!sessions.ok) return sessions;
  if (sessions.value.length === 0) return ok(activity('none'));
  const active = activeAttempt(task);
  if (active?.executions.some(isUnknownExecution)) return ok(activity('process-uncertain'));
  const owning = active === undefined ? undefined : owningExecution(active);
  if (owning !== undefined) {
    const workers = await context.workers();
    if (!workers.ok) return workers;
    const worker = workers.value.get(owning.workerId);
    if (worker?.reachable === false && worker.lastContactAt !== undefined) {
      return ok(Object.freeze({ state: 'worker-unreachable' as const, lastContactAt: worker.lastContactAt }));
    }
  }
  if (context.hasOpenItem) return ok(activity('waiting-for-person'));
  if (active !== undefined) return ok(activity('working'));
  return ok(activity(end === undefined ? 'waiting-for-admission' : 'stopped'));
}

function activity(state: Exclude<SessionActivityState, 'worker-unreachable'>): SessionActivity {
  return Object.freeze({ state });
}

type Observed = PlacementObstacle & { readonly rank: number };

// Section 3.8: the rejection, or for a task waiting for placement the
// fleet's obstacle, else the most recent observation, the scheduler's on a tie.
async function obstacleOf(task: Task, record: PlacementOutcomeRecord | undefined, context: TaskContext): Promise<Result<PlacementObstacle | undefined>> {
  const active = activeAttempt(task);
  if (active === undefined && task.attempts.length > 0) return ok(rejectionOf(task, record));
  if (placementNeed(task) === undefined) return ok(undefined);
  if (active !== undefined && await context.reads.fleet.heldForAttempt(active.id)) return ok(undefined);
  const attempt = active === undefined ? {} : { attemptId: active.id };
  const fleet = await context.fleetObstacle();
  if (!fleet.ok) return fleet;
  if (fleet.value !== undefined) {
    return ok(Object.freeze({ source: 'fleet', disposition: 'waiting', reason: fleet.value, taskId: task.id, ...attempt, observedAt: context.asOf }));
  }
  const observed: Observed[] = [];
  if (active !== undefined) {
    const assignments = await context.reads.assignments.listByAttempt(active.id);
    const retried = task.attempts.find((attempt) => attempt.id === active.retryOf)?.outcome;
    if (retried !== undefined && assignments.length === 0) {
      const retryNumber = task.attempts.filter((attempt) => attempt.retryOf !== undefined).length;
      observed.push({ source: 'automatic-retry', disposition: 'waiting', reason: 'retry-backoff', retryNumber, taskId: task.id, ...attempt, observedAt: retried.endedAt, rank: 0 });
    }
    const end = assignments.at(-1)?.end;
    if (end?.refusal !== undefined && (WORKER_REFUSAL_REASONS as readonly string[]).includes(end.refusal)) {
      observed.push({ source: 'worker', disposition: 'waiting', reason: end.refusal as never, taskId: task.id, ...attempt, observedAt: end.endedAt, rank: 0 });
    }
  }
  if (record?.disposition === 'waiting' && record.attemptId === active?.id && (PLACEMENT_WAITING_REASONS as readonly string[]).includes(record.reason)) {
    observed.push({ source: 'scheduler', disposition: 'waiting', reason: record.reason as never, taskId: task.id, ...attempt, observedAt: record.recordedAt, rank: 1 });
  }
  const latest = observed.sort((left, right) => Date.parse(right.observedAt) - Date.parse(left.observedAt) || right.rank - left.rank)[0];
  if (latest === undefined) return ok(undefined);
  const { rank: _rank, ...obstacle } = latest;
  return ok(Object.freeze(obstacle) as PlacementObstacle);
}

function rejectionOf(task: Task, record: PlacementOutcomeRecord | undefined): PlacementObstacle | undefined {
  const last = task.attempts.at(-1)!;
  const outcome = last.outcome;
  if (outcome?.kind !== 'not-started' || outcome.ownershipGeneration !== task.ownershipGeneration) return undefined;
  if (record?.disposition !== 'rejected' || record.attemptId !== last.id) return undefined;
  if (!(PLACEMENT_REJECTING_REASONS as readonly string[]).includes(record.reason)) return undefined;
  return Object.freeze({
    source: 'scheduler', disposition: 'rejected', reason: record.reason as never, taskId: task.id, attemptId: last.id, observedAt: record.recordedAt,
  });
}
