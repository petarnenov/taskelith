import { err, failure, ok, parseEventMetadata, type CorrelationId, type EventId, type Instant, type Result } from '@taskelith/kernel';
import {
  activeAttempt,
  executionsUnderAssignment,
  requestCancellation,
  type AssignmentId,
  type AttemptId,
  type Task,
  type WorkerId,
} from '@taskelith/execution';
import type { JsonObject, TaskId } from '@taskelith/sdlc';
import {
  createAssignment,
  endAssignment,
  releaseAfterTerminalFact,
  supersedeAssignment,
  type Assignment,
} from '../domain/assignment.js';
import {
  ADMISSION_PRESSURE_SUPERSESSION_BOUND_MILLISECONDS,
  PLACEMENT_RETRY_ATTEMPTS,
  UNACKNOWLEDGED_SUPERSESSION_BOUND_MILLISECONDS,
} from '../domain/capacity-limits.js';
import type { CapacityReason } from '../domain/capacity-reasons.js';
import { isWaitingReason } from '../domain/capacity-reasons.js';
import type { ProviderCredentialId, ReservationId, ResourceRequest, RunId } from '../domain/capacity-reservation.js';
import { placementBackoff } from '../domain/placement-backoff.js';
import { decidePlacement, type QuotaStanding } from '../domain/placement-decision.js';
import type { CapacityStore, CapacityTransaction } from '../ports/capacity-store.js';
import { isEligibleForPlacement, type WorkerPlacementRecord } from '../ports/placement-workers.js';

// One placement of one attempt on one candidate worker; the identities are
// the command's, so a retry of the same placement reuses them.
export interface PlacementRequest {
  readonly assignmentId: AssignmentId;
  readonly reservationId: ReservationId;
  readonly commandId: EventId;
  readonly correlationId: CorrelationId;
  readonly taskId: TaskId;
  readonly attemptId: AttemptId;
  readonly workerId: WorkerId;
  readonly requested: ResourceRequest;
  readonly providerCredentials: readonly ProviderCredentialId[];
  // An automatic retry of an earlier attempt charges the retry allowance.
  readonly automaticRetryOf?: AttemptId;
}

type Decided = Exclude<PlacementOutcome, { kind: 'placed' }> | { readonly kind: 'fits'; readonly task: Task; readonly at: Instant };

export type PlacementOutcome =
  | { readonly kind: 'placed'; readonly assignment: Assignment }
  | { readonly kind: 'waiting' | 'rejected'; readonly reason: CapacityReason };

// Each release and end writes an event identity derived from its command.
export interface ReleaseRequest {
  readonly assignmentId: AssignmentId;
  readonly commandId: EventId;
  readonly correlationId: CorrelationId;
}

// The scheduler side of the capacity reservation contract: each operation
// is one SERIALIZABLE transaction of the store, retried on a lost race.
export class ResourceAdmissionService {
  readonly #store: CapacityStore;

  constructor(store: CapacityStore) {
    this.#store = store;
  }

  reserve(request: PlacementRequest): Promise<Result<PlacementOutcome>> {
    return this.#store.transaction(async (tx) => {
      const decided = await this.#decide(tx, request);
      if (!decided.ok) return decided;
      if (decided.value.kind !== 'fits') return ok(decided.value);
      return this.#place(tx, request, decided.value.task, decided.value.at);
    });
  }

  // Retries a placement that failed for a transient reason (`unavailable`),
  // waiting the bounded backoff between attempts; `draw` returns [0, 1).
  async reserveWithRetry(request: PlacementRequest, pause: (milliseconds: number) => Promise<void>, draw: () => number): Promise<Result<PlacementOutcome>> {
    for (let attempt = 1; ; attempt++) {
      const outcome = await this.reserve(request);
      if (outcome.ok || outcome.error.code !== 'unavailable' || attempt >= PLACEMENT_RETRY_ATTEMPTS) return outcome;
      await pause(placementBackoff(attempt, draw()));
    }
  }

  // Owner decision D-B: without an execution that can run, the assignment
  // ends and releases; otherwise the end cancels that execution.
  cancelAssignment(request: ReleaseRequest): Promise<Result<Assignment>> {
    return this.#store.transaction(async (tx) => {
      const loaded = await loadAssignment(tx, request.assignmentId);
      if (!loaded.ok) return loaded;
      const { assignment, task } = loaded.value;
      const at = await tx.now();
      const ended = endAssignment(assignment, assignment.generation, 'cancelled', executionsUnderAssignment(task, assignment.id), at);
      if (!ended.ok) return ended;
      const stored = await tx.assignments.replace(ended.value, assignment.generation);
      if (!stored.ok) return stored;
      const follow = ended.value.reservation.state === 'released'
        ? await releaseFollowUps(tx, ended.value, request, at)
        : await cancelExecution(tx, ended.value, task, request, at);
      return follow.ok ? ok(ended.value) : follow;
    });
  }

  // Called by the transaction that records an execution's terminal fact.
  releaseAfterTerminalFact(request: ReleaseRequest): Promise<Result<Assignment>> {
    return this.#store.transaction(async (tx) => {
      const loaded = await loadAssignment(tx, request.assignmentId);
      if (!loaded.ok) return loaded;
      const { assignment, task } = loaded.value;
      const at = await tx.now();
      const released = releaseAfterTerminalFact(assignment, assignment.generation, executionsUnderAssignment(task, assignment.id), at);
      if (!released.ok) return released;
      const stored = await tx.assignments.replace(released.value, assignment.generation);
      if (!stored.ok) return stored;
      return ok(released.value);
    });
  }

  // Bounded supersession (contract section 6) of an assignment without a
  // grant: unacknowledged too long, its worker gone, or under long pressure.
  supersede(request: ReleaseRequest): Promise<Result<Assignment>> {
    return this.#store.transaction(async (tx) => {
      const loaded = await loadAssignment(tx, request.assignmentId);
      if (!loaded.ok) return loaded;
      const { assignment, task } = loaded.value;
      const at = await tx.now();
      const due = supersessionDue(assignment, await tx.workers.get(assignment.workerId), at);
      if (!due) return err(failure('precondition-failed', `assignment ${assignment.id} is within its supersession bounds`, { assignment: assignment.id }));
      const superseded = supersedeAssignment(assignment, assignment.generation, executionsUnderAssignment(task, assignment.id), at);
      if (!superseded.ok) return superseded;
      const stored = await tx.assignments.replace(superseded.value, assignment.generation);
      if (!stored.ok) return stored;
      const follow = await releaseFollowUps(tx, superseded.value, request, at);
      return follow.ok ? ok(superseded.value) : follow;
    });
  }

  async #decide(tx: CapacityTransaction, request: PlacementRequest): Promise<Result<Decided>> {
    const task = await tx.tasks.get(request.taskId);
    const lineage = await tx.lineage.get(request.taskId);
    if (!task.ok || lineage === undefined) return ok(Object.freeze({ kind: 'rejected', reason: 'attempt-not-reservable' }));
    const worker = await tx.workers.get(request.workerId);
    const charged = await tx.ledger.isCharged(request.attemptId);
    const decision = decidePlacement({
      quarantined: await tx.installation.quarantined(),
      attempt: { reservable: isReservable(task.value, request.attemptId), holdsReservation: await tx.ledger.heldForAttempt(request.attemptId) },
      worker: worker && {
        eligible: isEligibleForPlacement(worker),
        controls: worker.controls,
        slots: worker.slots,
        cpuMillicores: worker.cpuMillicores,
        memoryMebibytes: worker.memoryMebibytes,
        held: await tx.ledger.heldOnWorker(worker.workerId),
      },
      request: request.requested,
      quotas: await quotaStandings(tx, lineage.projectId, chargedRuns(lineage.runId, await rootRun(tx, lineage.rootTaskId, lineage.runId))),
      charge: {
        alreadyCharged: charged,
        treeAttempts: await tx.ledger.treeAttempts(lineage.rootTaskId),
        ...(request.automaticRetryOf === undefined ? {} : {
          retry: { uncertain: !hasEnded(task.value, request.automaticRetryOf), automaticRetriesUsed: await tx.ledger.automaticRetries(request.taskId) },
        }),
      },
    });
    if (!decision.fits) {
      return ok(Object.freeze({ kind: isWaitingReason(decision.reason) ? 'waiting' : 'rejected', reason: decision.reason }));
    }
    return ok({ kind: 'fits', task: task.value, at: await tx.now() });
  }

  // Inserts the reservation with its assignment, the charge of a first
  // reservation, and the assignment command: all of them or none.
  async #place(tx: CapacityTransaction, request: PlacementRequest, task: Task, at: Instant): Promise<Result<PlacementOutcome>> {
    const lineage = (await tx.lineage.get(request.taskId))!;
    const assignment = createAssignment({
      id: request.assignmentId,
      attemptId: request.attemptId,
      workerId: request.workerId,
      ownershipGeneration: task.ownershipGeneration,
      reservation: {
        id: request.reservationId,
        scope: { projectId: lineage.projectId, runId: lineage.runId, taskId: request.taskId, rootTaskId: lineage.rootTaskId },
        requested: request.requested,
        providerCredentials: request.providerCredentials,
        ...(request.automaticRetryOf === undefined ? {} : { retryOf: request.automaticRetryOf }),
      },
    }, at);
    const added = await tx.assignments.add(assignment);
    if (!added.ok) return added;
    if (!(await tx.ledger.isCharged(request.attemptId))) {
      const charged = await tx.ledger.recordCharge({
        attemptId: request.attemptId, taskId: request.taskId, rootTaskId: lineage.rootTaskId, automaticRetry: request.automaticRetryOf !== undefined,
      });
      if (!charged.ok) return charged;
    }
    const command = await appendCommand(tx, request, 'scheduling.assignment.offered', assignment.workerId, at, assignmentPayload(assignment));
    return command.ok ? ok(Object.freeze({ kind: 'placed', assignment })) : command;
  }
}

function isReservable(task: Task, attemptId: AttemptId): boolean {
  const attempt = activeAttempt(task);
  return attempt !== undefined && attempt.id === attemptId && attempt.cancellation === undefined;
}

function hasEnded(task: Task, attemptId: AttemptId): boolean {
  return task.attempts.some((attempt) => attempt.id === attemptId && attempt.outcome !== undefined);
}

async function rootRun(tx: CapacityTransaction, rootTaskId: TaskId, fallback: RunId): Promise<RunId> {
  return (await tx.lineage.get(rootTaskId))?.runId ?? fallback;
}

function chargedRuns(runId: RunId, rootRunId: RunId): readonly RunId[] {
  return runId === rootRunId ? [runId] : [runId, rootRunId];
}

async function quotaStandings(tx: CapacityTransaction, projectId: Parameters<CapacityTransaction['quotas']['projectQuota']>[0], runs: readonly RunId[]): Promise<readonly QuotaStanding[]> {
  const project: QuotaStanding = { kind: 'project', limit: await tx.quotas.projectQuota(projectId), held: await tx.ledger.heldInProject(projectId) };
  const runStandings = await Promise.all(runs.map(async (runId): Promise<QuotaStanding> => ({
    kind: 'run', limit: await tx.quotas.runQuota(runId), held: await tx.ledger.heldInRun(runId),
  })));
  return [project, ...runStandings];
}

async function loadAssignment(tx: CapacityTransaction, assignmentId: AssignmentId): Promise<Result<{ assignment: Assignment; task: Task }>> {
  const assignment = await tx.assignments.get(assignmentId);
  if (!assignment.ok) return assignment;
  const task = await tx.tasks.get(assignment.value.reservation.scope.taskId);
  if (!task.ok) return task;
  return ok({ assignment: assignment.value, task: task.value });
}

function supersessionDue(assignment: Assignment, worker: WorkerPlacementRecord | undefined, at: Instant): boolean {
  if (worker === undefined || worker.revoked || worker.draining || !worker.reachable) return true;
  const unacknowledged = assignment.state === 'offered'
    && elapsed(assignment.reservation.createdAt, at) >= UNACKNOWLEDGED_SUPERSESSION_BOUND_MILLISECONDS;
  const pressured = worker.admissionPressureSince !== undefined
    && elapsed(worker.admissionPressureSince, at) >= ADMISSION_PRESSURE_SUPERSESSION_BOUND_MILLISECONDS;
  return unacknowledged || pressured;
}

function elapsed(from: Instant, to: Instant): number {
  return Date.parse(to) - Date.parse(from);
}

// Tells the worker its assignment ended. The release itself followed the
// invalidating read by assignment (launch authorization section 5).
async function releaseFollowUps(tx: CapacityTransaction, assignment: Assignment, request: ReleaseRequest, at: Instant): Promise<Result<void>> {
  const ended = await appendCommand(tx, request, 'scheduling.assignment.ended', assignment.workerId, at, {
    assignmentId: assignment.id, attemptId: assignment.attemptId, reason: assignment.end?.reason ?? 'released',
  });
  return ended;
}

// The end of an assignment with a running execution is that execution's
// cancellation; the reservation stays held until its terminal fact.
async function cancelExecution(tx: CapacityTransaction, assignment: Assignment, task: Task, request: ReleaseRequest, at: Instant): Promise<Result<void>> {
  const attempt = task.attempts.find((candidate) => candidate.id === assignment.attemptId);
  if (attempt !== undefined && attempt.cancellation === undefined && attempt.outcome === undefined) {
    const cancelled = requestCancellation(task, assignment.attemptId, 'assignment-ended', at);
    if (!cancelled.ok) return cancelled;
    const stored = await tx.tasks.replace(cancelled.value, task.generation);
    if (!stored.ok) return stored;
  }
  return appendCommand(tx, request, 'execution.attempt.cancel', assignment.workerId, at, { attemptId: assignment.attemptId, reason: 'assignment-ended' });
}

// Payloads are provisional until item 8 defines the wire schemas.
function assignmentPayload(assignment: Assignment): JsonObject {
  const { requested } = assignment.reservation;
  return {
    provisional: true,
    assignmentId: assignment.id,
    attemptId: assignment.attemptId,
    ownershipGeneration: assignment.ownershipGeneration,
    requested: { cpuMillicores: requested.cpuMillicores, memoryMebibytes: requested.memoryMebibytes, hardControls: [...requested.hardControls] },
  };
}

async function appendCommand(
  tx: CapacityTransaction,
  request: { readonly commandId: EventId; readonly correlationId: CorrelationId },
  eventType: string,
  workerId: WorkerId,
  at: Instant,
  payload: JsonObject,
): Promise<Result<void>> {
  const metadata = parseEventMetadata({ eventId: request.commandId, eventType, schemaVersion: 1, occurredAt: at, correlationId: request.correlationId });
  if (!metadata.ok) return metadata;
  return tx.outbox.append({ metadata: metadata.value, subject: `workers.${workerId}.commands`, payload });
}
