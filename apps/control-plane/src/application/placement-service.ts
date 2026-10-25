import {
  claimOwnership,
  endAttempt,
  openAttempt,
  placementNeed,
  type AttemptId,
  type Task,
  type WorkerId,
} from '@taskelith/execution';
import { err, failure, ok, type Failure, type Instant, type Result } from '@taskelith/kernel';
import {
  DEFAULT_ATTEMPT_REQUEST,
  fairPlacementOrder,
  placeInTransaction,
  triesNextCandidate,
  type PlacementOutcome,
  type PlacementQueue,
  type PlacementRequest,
  type ProjectId,
} from '@taskelith/scheduling';
import type { TaskId } from '@taskelith/sdlc';
import { derivedId, nextAttemptIdOf } from './attempt-identities.js';
import type { ControlPlaneStore, ControlPlaneTransaction } from './control-plane-store.js';
import { RetrySchedule, type BackoffTiming } from './retry-schedule.js';
import { closeDelegationOf } from './task-ending.js';

// Provisional (docs/operational-targets.md): the waiting tasks one pass reads.
export const PLACEMENT_BATCH = 100;

export interface PlacementPass {
  readonly waiting: number;
  readonly placed: number;
}

// Item 16, coordinator decision Q1: opens or claims the attempt of each
// waiting task and reserves it on the first candidate that accepts it.
export class PlacementService {
  readonly #store: ControlPlaneStore;
  readonly #tasks: RetrySchedule<TaskId>;
  readonly #passes: RetrySchedule<typeof PASS>;
  // The last project read; the next read starts after it.
  #after: ProjectId | undefined;

  constructor(store: ControlPlaneStore, timing: BackoffTiming) {
    this.#store = store;
    this.#tasks = new RetrySchedule(timing);
    this.#passes = new RetrySchedule(timing);
  }

  // A pass that backs off after an outage reads nothing. A task not placed
  // is not read until due; its backoff ends once it is placed or not waiting.
  async placeWaiting(): Promise<Result<PlacementPass>> {
    if (!this.#passes.due(PASS)) return ok({ waiting: 0, placed: 0 });
    const pass = await this.#placeDue();
    if (pass.ok) this.#passes.forget(PASS);
    else if (isOutage(pass.error.code)) this.#passes.failed(PASS);
    return pass;
  }

  // Each task in its own transaction, in fair order across projects; one
  // that no candidate accepts rolls back and keeps waiting unchanged.
  async #placeDue(): Promise<Result<PlacementPass>> {
    const checked = this.#tasks.pastDue();
    const read = await this.#store.readCommitted(async (tx) => ok({
      anyCandidate: (await tx.workers.candidates()).length > 0,
      waiting: await tx.placements.waiting(PLACEMENT_BATCH, this.#tasks.notDue(), this.#after),
      stillWaiting: await stillWaitingAmong(tx.placements, checked),
    }));
    if (!read.ok) return read;
    const { anyCandidate, waiting, stillWaiting } = read.value;
    this.#forgetUnless(checked, stillWaiting);
    this.#after = waiting.at(-1)?.projectId ?? this.#after;
    let placed = 0;
    for (const taskId of fairPlacementOrder(waiting)) {
      const outcome = anyCandidate ? await this.#store.transaction((tx) => placeTask(tx, taskId)) : NO_CANDIDATE;
      if (!outcome.ok && isOutage(outcome.error.code)) return outcome;
      if (outcome.ok && outcome.value === 'placed') placed++;
      if (outcome.ok || noLongerWaits(outcome.error)) this.#tasks.forget(taskId);
      else this.#tasks.failed(taskId);
    }
    return ok({ waiting: waiting.length, placed });
  }

  #forgetUnless(checked: readonly TaskId[], stillWaiting: readonly TaskId[]): void {
    const waits = new Set(stillWaiting);
    for (const taskId of checked) if (!waits.has(taskId)) this.#tasks.forget(taskId);
  }
}

// In batches, so that the backoff of many tasks never makes one huge query.
async function stillWaitingAmong(queue: PlacementQueue, taskIds: readonly TaskId[]): Promise<readonly TaskId[]> {
  const waiting: TaskId[] = [];
  for (let start = 0; start < taskIds.length; start += PLACEMENT_BATCH) {
    waiting.push(...await queue.stillWaiting(taskIds.slice(start, start + PLACEMENT_BATCH)));
  }
  return waiting;
}

const PASS = 'pass';
const NOT_WAITING = 'not-waiting';
const NO_CANDIDATE: Result<never> = err(failure('precondition-failed', 'no candidate worker exists', { reason: 'no-candidate' }));

// What a placement transaction committed: an assignment, or the end of an
// attempt that a rejecting reason refused.
type TaskPlacement = 'placed' | 'ended';

// Reads the candidates in the task's transaction, so that each placement,
// and each rerun of it, sees the reservations held before it.
async function placeTask(tx: ControlPlaneTransaction, taskId: TaskId): Promise<Result<TaskPlacement>> {
  const task = await tx.tasks.get(taskId);
  if (!task.ok) return task;
  const claimed = await claimPlacement(tx, task.value);
  if (!claimed.ok) return claimed;
  const reserved = await reserveOnCandidate(tx, claimed.value, await tx.workers.candidates());
  if (!reserved.ok) return reserved;
  const last = reserved.value;
  if (last?.kind === 'placed') return ok('placed');
  if (last?.kind === 'rejected') return endRejectedAttempt(tx, claimed.value);
  const reason = last?.reason ?? 'no-candidate';
  return err(failure('precondition-failed', `no candidate accepted task ${taskId}`, { task: taskId, reason }));
}

// Opens the first attempt, or claims the ownership when the active attempt
// was placed at the current one, so each placement has its own generation.
async function claimPlacement(tx: ControlPlaneTransaction, task: Task): Promise<Result<Task>> {
  const need = placementNeed(task);
  if (need === undefined) return err(failure('precondition-failed', `task ${task.id} does not wait for placement`, { task: task.id, reason: NOT_WAITING }));
  const at = await tx.now();
  const next = need.kind === 'open-attempt'
    ? openAttempt(task, task.ownershipGeneration, { id: nextAttemptIdOf(task) }, at)
    : await claimPlacedAttempt(tx, task, need.attemptId, at);
  if (!next.ok || next.value === task) return next;
  const stored = await tx.tasks.replace(next.value, task.generation);
  return stored.ok ? next : stored;
}

async function claimPlacedAttempt(tx: ControlPlaneTransaction, task: Task, attemptId: AttemptId, at: Instant): Promise<Result<Task>> {
  const assignments = await tx.assignments.listByAttempt(attemptId);
  const placed = assignments.some((assignment) => assignment.ownershipGeneration === task.ownershipGeneration);
  return placed ? claimOwnership(task, task.ownershipGeneration, attemptId, at) : ok(task);
}

// Contract section 5: a reason about one worker tries the next candidate,
// and any other one ends the try; the last outcome, none without candidates.
async function reserveOnCandidate(
  tx: ControlPlaneTransaction, task: Task, candidates: readonly WorkerId[],
): Promise<Result<PlacementOutcome | undefined>> {
  const request = placementRequest(task);
  let last: PlacementOutcome | undefined;
  for (const workerId of candidates) {
    const placed = await placeInTransaction(tx, { ...request, workerId });
    if (!placed.ok) return placed;
    last = placed.value;
    if (last.kind === 'placed' || !triesNextCandidate(last.reason)) break;
  }
  return ok(last);
}

// The attempt owns no execution, so it ends `not-started`; the task's
// delegation closes, and no retry follows (capacity contract section 11).
async function endRejectedAttempt(tx: ControlPlaneTransaction, task: Task): Promise<Result<TaskPlacement>> {
  const at = await tx.now();
  const ended = endAttempt(task, task.attempts.at(-1)!.id, at);
  if (!ended.ok) return ended;
  const stored = await tx.tasks.replace(ended.value, task.generation);
  if (!stored.ok) return stored;
  const closed = await closeDelegationOf(tx, task.id, at);
  return closed.ok ? ok('ended') : closed;
}

// A retry attempt is placed as an automatic retry of the one it retries.
function placementRequest(task: Task): Omit<PlacementRequest, 'workerId'> {
  const number = task.attempts.length;
  const { id: attemptId, retryOf } = task.attempts[number - 1]!;
  const derived = <Kind extends string>(prefix: string) => derivedId<Kind>(prefix, task.id, number, task.ownershipGeneration);
  return {
    commandId: derived('c'),
    correlationId: derived('c'),
    assignmentId: derived('s'),
    reservationId: derived('r'),
    taskId: task.id,
    attemptId,
    ownershipGeneration: task.ownershipGeneration,
    requested: DEFAULT_ATTEMPT_REQUEST,
    providerCredentials: [],
    ...(retryOf === undefined ? {} : { automaticRetryOf: retryOf }),
  };
}

function noLongerWaits(error: Failure): boolean {
  return error.details.reason === NOT_WAITING;
}

// A pass stops when the store fails; a task that is not placed does not.
function isOutage(code: string): boolean {
  return code === 'unavailable' || code === 'internal';
}
