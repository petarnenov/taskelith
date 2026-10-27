import {
  activeAttempt,
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
  NO_CANDIDATE_REASON,
  RotationCursor,
  fairWaitingOrder,
  isRecordedWaitingReason,
  isRejectingReason,
  lacksFleetCapacity,
  placeInTransaction,
  placementBackoff,
  triesNextCandidate,
  type PlacementOutcome,
  type PlacementQueue,
  type PlacementRequest,
  type ProjectId,
  type RecordedWaitingReason,
  type RejectingReason,
  type WaitingPlacement,
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
  readonly #timing: BackoffTiming;
  readonly #tasks: RetrySchedule<TaskId>;
  readonly #passes: RetrySchedule<typeof PASS>;
  // The due time of each task's unplaced retry, fixed by one jitter draw.
  readonly #retries = new Map<TaskId, { readonly attemptId: AttemptId; readonly dueAt: number }>();

  constructor(store: ControlPlaneStore, timing: BackoffTiming) {
    this.#store = store;
    this.#timing = timing;
    this.#tasks = new RetrySchedule(timing);
    this.#passes = new RetrySchedule(timing);
  }

  // After an outage the passes back off; a task declined for its own reason
  // is not read until due, and its backoff ends once placed or not waiting.
  async placeWaiting(): Promise<Result<PlacementPass>> {
    if (!this.#passes.due(PASS)) return ok({ waiting: 0, placed: 0 });
    const pass = await this.#placeDue();
    if (pass.ok) this.#passes.forget(PASS);
    else if (isOutage(pass.error.code)) this.#passes.failed(PASS);
    return pass;
  }

  // Each task in its own transaction, in fair order across projects; one
  // that no candidate accepts rolls back, and the task still waits.
  async #placeDue(): Promise<Result<PlacementPass>> {
    const checked = this.#tasks.pastDue();
    const read = await this.#store.readCommitted(async (tx) => {
      const after = await tx.rotation.read();
      return ok({
        after,
        anyCandidate: (await tx.workers.candidates()).length > 0,
        waiting: await tx.placements.waiting(PLACEMENT_BATCH, this.#tasks.notDue(), after),
        stillWaiting: await stillWaitingAmong(tx.placements, checked),
      });
    });
    if (!read.ok) return read;
    const { after, anyCandidate, waiting, stillWaiting } = read.value;
    this.#forgetUnless(checked, stillWaiting);
    if (!anyCandidate) return ok({ waiting: waiting.length, placed: 0 });
    const { outcome, next, stored } = await this.#offer(fairWaitingOrder(waiting, after), after);
    if (!outcome.ok) return outcome;
    const kept = await this.#storeUnstoredMove(after, next, stored);
    return kept.ok ? ok({ waiting: waiting.length, placed: outcome.value }) : kept;
  }

  // Offers each task until the store fails or the fleet lacks capacity;
  // answers the number placed, or the outage, and the cursor for the next read.
  async #offer(order: readonly WaitingPlacement<TaskId>[], after: ProjectId | undefined): Promise<Offers> {
    const cursor = new RotationCursor(after);
    let stored = after;
    let placed = 0;
    for (const { item: taskId, projectId } of order) {
      const outcome = await this.#store.transaction((tx) => placeMovingCursor(tx, taskId, this.#retryBackoff, projectId));
      if (!outcome.ok && isOutage(outcome.error.code)) return { outcome, next: cursor.next, stored };
      const recorded = await this.#recordWait(taskId, outcome);
      if (!recorded.ok) return { outcome: recorded, next: cursor.next, stored };
      if (outcome.ok && outcome.value.kind === 'placed') {
        stored = projectId;
        cursor.placed(projectId);
        placed++;
      } else if (isFleetCapacityDecline(outcome)) {
        cursor.ranOutOfCapacity();
        break;
      } else {
        cursor.declined(projectId);
      }
      this.#settle(taskId, outcome);
    }
    return { outcome: ok(placed), next: cursor.next, stored };
  }

  // Section 13: a decline-only move of a pass without an outage, which may
  // hide a commit, is stored once, and only over the cursor the pass read.
  async #storeUnstoredMove(
    after: ProjectId | undefined, next: ProjectId | undefined, stored: ProjectId | undefined,
  ): Promise<Result<void>> {
    if (next === undefined || next === stored) return ok(undefined);
    return this.#store.transaction((tx) => tx.rotation.advanceFrom(after, next));
  }

  // Section 13, "Recorded outcome": a waiting reason rolled its placement
  // back, so its record is written in a transaction of its own.
  async #recordWait(taskId: TaskId, outcome: Result<TaskPlacement>): Promise<Result<void>> {
    const reason = outcome.ok ? undefined : outcome.error.details.reason;
    if (!isRecordedWaitingReason(reason)) return ok(undefined);
    return this.#store.transaction((tx) => recordWaiting(tx, taskId, reason));
  }

  // Never given a fleet capacity decline, which keeps the wait. A backing-off
  // retry waits until due, one placed or not waiting has none; others back off.
  #settle(taskId: TaskId, outcome: Result<TaskPlacement>): void {
    if (outcome.ok && outcome.value.kind === 'backing-off') this.#tasks.delayUntil(taskId, outcome.value.dueAt);
    else if (outcome.ok || noLongerWaits(outcome.error)) this.#forget(taskId);
    else this.#tasks.failed(taskId);
  }

  // Capacity reservation section 5: from the retried attempt's end, the
  // retry backs off by `placementBackoff` of its number.
  readonly #retryBackoff: RetryBackoff = (taskId, retry) => {
    const known = this.#retries.get(taskId);
    const dueAt = known?.attemptId === retry.attemptId
      ? known.dueAt
      : retry.retriedEndedAt + placementBackoff(retry.retryNumber, this.#timing.draw());
    this.#retries.set(taskId, { attemptId: retry.attemptId, dueAt });
    return this.#timing.now() < dueAt ? dueAt : undefined;
  };

  #forgetUnless(checked: readonly TaskId[], stillWaiting: readonly TaskId[]): void {
    const waits = new Set(stillWaiting);
    for (const taskId of checked) if (!waits.has(taskId)) this.#forget(taskId);
  }

  #forget(taskId: TaskId): void {
    this.#tasks.forget(taskId);
    this.#retries.delete(taskId);
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

interface Offers {
  // The number of tasks placed, or the outage that stopped the pass.
  readonly outcome: Result<number>;
  readonly next: ProjectId | undefined;
  // The cursor as the pass's placement transactions left it stored.
  readonly stored: ProjectId | undefined;
}

const PASS = 'pass';
const NOT_WAITING = 'not-waiting';
const SCHEDULER = 'scheduler';

// What a placement transaction committed: an assignment, the end of an
// attempt that a rejecting reason refused, or nothing while a retry waits.
type TaskPlacement =
  | { readonly kind: 'placed' | 'ended' }
  | { readonly kind: 'backing-off'; readonly dueAt: number };

const PLACED: TaskPlacement = Object.freeze({ kind: 'placed' });
const ENDED: TaskPlacement = Object.freeze({ kind: 'ended' });

// An active attempt that retries an ended one and was never placed.
interface UnplacedRetry {
  readonly attemptId: AttemptId;
  readonly retriedEndedAt: number;
  // The task's attempts that retry another, this one included.
  readonly retryNumber: number;
}

// The retry's due time in epoch milliseconds while it still backs off.
type RetryBackoff = (taskId: TaskId, retry: UnplacedRetry) => number | undefined;

// Capacity reservation section 13: a placement moves the cursor to its
// project in its own transaction, so a crash after the commit keeps it.
async function placeMovingCursor(
  tx: ControlPlaneTransaction, taskId: TaskId, retryBackoff: RetryBackoff, projectId: ProjectId,
): Promise<Result<TaskPlacement>> {
  const placement = await placeTask(tx, taskId, retryBackoff);
  if (!placement.ok || placement.value.kind !== 'placed') return placement;
  const moved = await tx.rotation.advance(projectId);
  return moved.ok ? placement : moved;
}

// Reads the candidates in the task's transaction, so that each placement,
// and each rerun of it, sees the reservations held before it.
async function placeTask(tx: ControlPlaneTransaction, taskId: TaskId, retryBackoff: RetryBackoff): Promise<Result<TaskPlacement>> {
  const task = await tx.tasks.get(taskId);
  if (!task.ok) return task;
  const retry = await unplacedRetryOf(tx, task.value);
  const dueAt = retry && retryBackoff(task.value.id, retry);
  if (dueAt !== undefined) return ok({ kind: 'backing-off', dueAt });
  const claimed = await claimPlacement(tx, task.value);
  if (!claimed.ok) return claimed;
  const reserved = await reserveOnCandidate(tx, claimed.value, await tx.workers.candidates());
  if (!reserved.ok) return reserved;
  const last = reserved.value;
  if (last?.kind === 'placed') return removeOutcome(tx, taskId);
  if (last !== undefined && isRejectingReason(last.reason)) return endRejectedAttempt(tx, claimed.value, last.reason);
  const reason = last?.reason ?? NO_CANDIDATE_REASON;
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
// delegation closes, no retry follows, and the reason is recorded (§11).
async function endRejectedAttempt(tx: ControlPlaneTransaction, task: Task, reason: RejectingReason): Promise<Result<TaskPlacement>> {
  const at = await tx.now();
  const attemptId = task.attempts.at(-1)!.id;
  const ended = endAttempt(task, attemptId, at);
  if (!ended.ok) return ended;
  const stored = await tx.tasks.replace(ended.value, task.generation);
  if (!stored.ok) return stored;
  const closed = await closeDelegationOf(tx, task.id, at);
  if (!closed.ok) return closed;
  const recorded = await tx.placementOutcomes.record({
    taskId: task.id, attemptId, disposition: 'rejected', reason, source: SCHEDULER, recordedAt: at,
  });
  return recorded.ok ? ok(ENDED) : recorded;
}

// A placed task has no outcome record (section 13, "Recorded outcome").
async function removeOutcome(tx: ControlPlaneTransaction, taskId: TaskId): Promise<Result<TaskPlacement>> {
  const removed = await tx.placementOutcomes.remove(taskId);
  return removed.ok ? ok(PLACED) : removed;
}

// Only while the task still waits, so that a placement committed since its
// rollback, which ends the wait, is never covered by an older reason.
async function recordWaiting(tx: ControlPlaneTransaction, taskId: TaskId, reason: RecordedWaitingReason): Promise<Result<void>> {
  const [waiting] = await tx.placements.stillWaiting([taskId]);
  if (waiting === undefined) return ok(undefined);
  const task = await tx.tasks.get(taskId);
  if (!task.ok) return task;
  const attemptId = activeAttempt(task.value)?.id;
  return tx.placementOutcomes.record({
    taskId, ...(attemptId === undefined ? {} : { attemptId }), disposition: 'waiting', reason, source: SCHEDULER, recordedAt: await tx.now(),
  });
}

async function unplacedRetryOf(tx: ControlPlaneTransaction, task: Task): Promise<UnplacedRetry | undefined> {
  const attempt = activeAttempt(task);
  const retried = task.attempts.find(({ id }) => id === attempt?.retryOf)?.outcome;
  if (attempt === undefined || retried === undefined) return undefined;
  if ((await tx.assignments.listByAttempt(attempt.id)).length > 0) return undefined;
  const retryNumber = task.attempts.filter(({ retryOf }) => retryOf !== undefined).length;
  return { attemptId: attempt.id, retriedEndedAt: Date.parse(retried.endedAt), retryNumber };
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

// Contract section 5: a failure for a fleet reason; the task keeps its wait,
// so the next pass that reads it offers it in the rotation.
function isFleetCapacityDecline(outcome: Result<TaskPlacement>): boolean {
  return !outcome.ok && lacksFleetCapacity(outcome.error.details.reason);
}

function noLongerWaits(error: Failure): boolean {
  return error.details.reason === NOT_WAITING;
}

// A store failure, which stops the pass and backs off the next passes.
function isOutage(code: string): boolean {
  return code === 'unavailable' || code === 'internal';
}
