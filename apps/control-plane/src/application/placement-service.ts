import { createHash } from 'node:crypto';
import {
  claimOwnership,
  openAttempt,
  placementNeed,
  type AttemptId,
  type Task,
  type WorkerId,
} from '@taskelith/execution';
import { err, failure, ok, type Identifier, type Instant, type Result } from '@taskelith/kernel';
import {
  DEFAULT_ATTEMPT_REQUEST,
  fairPlacementOrder,
  placeInTransaction,
  triesNextCandidate,
  type Assignment,
  type CapacityReason,
  type PlacementRequest,
} from '@taskelith/scheduling';
import type { TaskId } from '@taskelith/sdlc';
import type { ControlPlaneStore, ControlPlaneTransaction } from './control-plane-store.js';
import { RetrySchedule, type BackoffTiming } from './retry-schedule.js';

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

  constructor(store: ControlPlaneStore, timing: BackoffTiming) {
    this.#store = store;
    this.#tasks = new RetrySchedule(timing);
    this.#passes = new RetrySchedule(timing);
  }

  // A pass that backs off after an outage reads nothing. A task that is not
  // placed backs off on its own, and one placed or no longer read is reset.
  async placeWaiting(): Promise<Result<PlacementPass>> {
    if (!this.#passes.due(PASS)) return ok({ waiting: 0, placed: 0 });
    const pass = await this.#placeDue();
    if (pass.ok) this.#passes.succeeded(PASS);
    else if (isOutage(pass.error.code)) this.#passes.failed(PASS);
    return pass;
  }

  // Each task in its own transaction, in fair order across projects; one
  // that no candidate accepts rolls back and keeps waiting unchanged.
  async #placeDue(): Promise<Result<PlacementPass>> {
    const read = await this.#store.readCommitted(async (tx) => ok({
      anyCandidate: (await tx.workers.candidates()).length > 0,
      waiting: await tx.placements.waiting(PLACEMENT_BATCH),
    }));
    if (!read.ok) return read;
    const { anyCandidate, waiting } = read.value;
    this.#tasks.retainOnly(waiting.map((entry) => entry.item));
    const due = fairPlacementOrder(waiting).filter((taskId) => this.#tasks.due(taskId));
    let placed = 0;
    for (const taskId of due) {
      const outcome = anyCandidate ? await this.#store.transaction((tx) => placeTask(tx, taskId)) : NO_CANDIDATE;
      if (outcome.ok) {
        this.#tasks.succeeded(taskId);
        placed++;
      } else if (isOutage(outcome.error.code)) return outcome;
      else this.#tasks.failed(taskId);
    }
    return ok({ waiting: waiting.length, placed });
  }
}

const PASS = 'pass';
const NO_CANDIDATE: Result<never> = err(failure('precondition-failed', 'no candidate worker exists', { reason: 'no-candidate' }));

// Reads the candidates in the task's transaction, so that each placement,
// and each rerun of it, sees the reservations held before it.
async function placeTask(tx: ControlPlaneTransaction, taskId: TaskId): Promise<Result<Assignment>> {
  const task = await tx.tasks.get(taskId);
  if (!task.ok) return task;
  const claimed = await claimPlacement(tx, task.value);
  if (!claimed.ok) return claimed;
  return reserveOnCandidate(tx, claimed.value, await tx.workers.candidates());
}

// Opens the first attempt, or claims the ownership when the active attempt
// was placed at the current one, so each placement has its own generation.
async function claimPlacement(tx: ControlPlaneTransaction, task: Task): Promise<Result<Task>> {
  const need = placementNeed(task);
  if (need === undefined) return err(failure('precondition-failed', `task ${task.id} does not wait for placement`, { task: task.id }));
  const at = await tx.now();
  const next = need.kind === 'open-attempt'
    ? openAttempt(task, task.ownershipGeneration, { id: attemptIdOf(task) }, at)
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
// and any other one ends the try, as no candidate would accept it.
async function reserveOnCandidate(tx: ControlPlaneTransaction, task: Task, candidates: readonly WorkerId[]): Promise<Result<Assignment>> {
  const request = placementRequest(task);
  let reason: CapacityReason | undefined;
  for (const workerId of candidates) {
    const placed = await placeInTransaction(tx, { ...request, workerId });
    if (!placed.ok) return placed;
    if (placed.value.kind === 'placed') return ok(placed.value.assignment);
    reason = placed.value.reason;
    if (!triesNextCandidate(reason)) break;
  }
  return err(failure('precondition-failed', `no candidate accepted task ${task.id}`, { task: task.id, reason: reason ?? 'no-candidate' }));
}

function placementRequest(task: Task): Omit<PlacementRequest, 'workerId'> {
  const number = task.attempts.length;
  const attemptId = task.attempts[number - 1]!.id;
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
  };
}

function attemptIdOf(task: Task): AttemptId {
  return derivedId('t', task.id, task.attempts.length + 1, task.ownershipGeneration);
}

// A one-letter prefix and the SHA-256 of the task, the attempt number, and
// the ownership generation, so that a rerun transaction reuses them.
function derivedId<Kind extends string>(prefix: string, taskId: TaskId, attemptNumber: number, generation: number): Identifier<Kind> {
  return `${prefix}${createHash('sha256').update(JSON.stringify([taskId, attemptNumber, generation])).digest('hex')}` as Identifier<Kind>;
}

// A pass stops when the store fails; a task that is not placed does not.
function isOutage(code: string): boolean {
  return code === 'unavailable' || code === 'internal';
}
