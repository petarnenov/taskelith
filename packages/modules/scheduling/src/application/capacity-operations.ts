import { err, failure, ok, type Instant, type Result } from '@taskelith/kernel';
import { activeAttempt, executionsUnderAssignment, revokeLaunch, type AssignmentId, type AttemptId, type Task, type WorkerId } from '@taskelith/execution';
import type { TaskId } from '@taskelith/sdlc';
import { createAssignment, endAssignment, releaseAfterTerminalFact, supersedeAssignment, type Assignment } from '../domain/assignment.js';
import {
  ADMISSION_PRESSURE_SUPERSESSION_BOUND_MILLISECONDS,
  DEFAULT_PROVIDER_CREDENTIAL_CONCURRENCY,
  UNACKNOWLEDGED_SUPERSESSION_BOUND_MILLISECONDS,
} from '../domain/capacity-limits.js';
import { isWaitingReason, type CapacityReason } from '../domain/capacity-reasons.js';
import type { ProjectId, ProviderCredentialId, ReservationId, ResourceRequest } from '../domain/capacity-reservation.js';
import { chargedRuns, type TaskLineageLink } from '../domain/delegation-admission.js';
import { decidePlacement, type QuotaStanding } from '../domain/placement-decision.js';
import type { CapacityTransaction } from '../ports/capacity-store.js';
import { isEligibleForPlacement, type WorkerPlacementRecord } from '../ports/placement-workers.js';
import { appendWorkerCommand, cancelPayload, endedPayload, offeredPayload, type CommandIdentity } from './capacity-commands.js';

// The capacity operations of contract sections 4 and 6, each run inside the
// caller's SERIALIZABLE transaction, such as the one recording a fact.

// One placement of one attempt on one candidate worker; the identities are
// the command's, so a retry of the same placement reuses them.
export interface PlacementRequest extends CommandIdentity {
  readonly assignmentId: AssignmentId;
  readonly reservationId: ReservationId;
  readonly taskId: TaskId;
  readonly attemptId: AttemptId;
  readonly workerId: WorkerId;
  readonly requested: ResourceRequest;
  readonly providerCredentials: readonly ProviderCredentialId[];
  // An automatic retry of an earlier attempt charges the retry allowance.
  readonly automaticRetryOf?: AttemptId;
}

export type PlacementOutcome =
  | { readonly kind: 'placed'; readonly assignment: Assignment }
  | { readonly kind: 'waiting' | 'rejected'; readonly reason: CapacityReason };

export interface ReleaseRequest extends CommandIdentity {
  readonly assignmentId: AssignmentId;
}

export async function placeInTransaction(tx: CapacityTransaction, request: PlacementRequest): Promise<Result<PlacementOutcome>> {
  const task = await tx.tasks.get(request.taskId);
  if (!task.ok && task.error.code !== 'not-found') return task;
  const lineage = await tx.lineage.get(request.taskId);
  const root = lineage && await tx.lineage.get(lineage.rootTaskId);
  if (!task.ok || lineage === undefined || root === undefined) return outcome('attempt-not-reservable');
  const charged = await tx.ledger.isCharged(request.attemptId);
  const decision = decidePlacement({
    quarantined: await tx.installation.quarantined(),
    attempt: { reservable: isReservable(task.value, request.attemptId), holdsReservation: await tx.ledger.heldForAttempt(request.attemptId) },
    worker: await workerStanding(tx, await tx.workers.get(request.workerId)),
    request: request.requested,
    quotas: await quotaStandings(tx, lineage, root),
    credentials: await Promise.all(request.providerCredentials.map(async (credential) => ({
      limit: DEFAULT_PROVIDER_CREDENTIAL_CONCURRENCY, held: await tx.ledger.heldForCredential(credential),
    }))),
    charge: {
      alreadyCharged: charged,
      treeAttempts: await tx.ledger.treeAttempts(lineage.rootTaskId),
      ...(request.automaticRetryOf === undefined ? {} : {
        retry: {
          uncertain: !(await isSafeToRetry(tx, task.value, request.automaticRetryOf)),
          automaticRetriesUsed: await tx.ledger.automaticRetries(request.taskId),
        },
      }),
    },
  });
  if (!decision.fits) return outcome(decision.reason);
  return insertPlacement(tx, request, task.value, lineage, charged);
}

// D-B: without an execution that can run, the assignment ends, releases,
// and tells the worker; otherwise the end revokes that execution's launch.
export async function cancelInTransaction(tx: CapacityTransaction, request: ReleaseRequest): Promise<Result<Assignment>> {
  const loaded = await loadAssignment(tx, request.assignmentId);
  if (!loaded.ok) return loaded;
  const { assignment, task } = loaded.value;
  const at = await tx.now();
  const ended = endAssignment(assignment, assignment.generation, 'cancelled', executionsUnderAssignment(task, assignment.id), at);
  if (!ended.ok) return ended;
  const stored = await tx.assignments.replace(ended.value, assignment.generation);
  if (!stored.ok) return stored;
  const follow = ended.value.reservation.state === 'released'
    ? await appendWorkerCommand(tx, request, 'scheduling.assignment.ended', assignment.workerId, at, endedPayload(ended.value))
    : await revokeRunningLaunch(tx, ended.value, task, request, at);
  return follow.ok ? ok(ended.value) : follow;
}

// Releases an ended assignment once nothing under it can run, in the
// transaction that records the execution's terminal fact.
export async function releaseInTransaction(tx: CapacityTransaction, request: ReleaseRequest): Promise<Result<Assignment>> {
  const loaded = await loadAssignment(tx, request.assignmentId);
  if (!loaded.ok) return loaded;
  const { assignment, task } = loaded.value;
  const released = releaseAfterTerminalFact(assignment, assignment.generation, executionsUnderAssignment(task, assignment.id), await tx.now());
  if (!released.ok) return released;
  const stored = await tx.assignments.replace(released.value, assignment.generation);
  return stored.ok ? ok(released.value) : stored;
}

// Bounded supersession (contract section 6) of an assignment without a
// grant: unacknowledged too long, its worker gone, or under long pressure.
export async function supersedeInTransaction(tx: CapacityTransaction, request: ReleaseRequest): Promise<Result<Assignment>> {
  const loaded = await loadAssignment(tx, request.assignmentId);
  if (!loaded.ok) return loaded;
  const { assignment, task } = loaded.value;
  const at = await tx.now();
  if (!supersessionDue(assignment, await tx.workers.get(assignment.workerId), at)) {
    return err(failure('precondition-failed', `assignment ${assignment.id} is within its supersession bounds`, { assignment: assignment.id }));
  }
  const superseded = supersedeAssignment(assignment, assignment.generation, executionsUnderAssignment(task, assignment.id), at);
  if (!superseded.ok) return superseded;
  const stored = await tx.assignments.replace(superseded.value, assignment.generation);
  if (!stored.ok) return stored;
  const ended = await appendWorkerCommand(tx, request, 'scheduling.assignment.ended', assignment.workerId, at, endedPayload(superseded.value));
  return ended.ok ? ok(superseded.value) : ended;
}

function outcome(reason: CapacityReason): Result<PlacementOutcome> {
  return ok(Object.freeze({ kind: isWaitingReason(reason) ? 'waiting' : 'rejected', reason }));
}

// Inserts the reservation with its assignment, the charge of a first
// reservation, and the assignment command: all of them or none.
async function insertPlacement(
  tx: CapacityTransaction, request: PlacementRequest, task: Task, lineage: TaskLineageLink, charged: boolean,
): Promise<Result<PlacementOutcome>> {
  const at = await tx.now();
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
  // A concurrent placement of the attempt that won the held-reservation
  // index leaves this one where a serial order would: already reserved.
  const added = await tx.assignments.add(assignment);
  if (!added.ok) return added.error.code === 'conflict' ? outcome('attempt-already-reserved') : added;
  if (!charged) {
    const charge = await tx.ledger.recordCharge({
      attemptId: request.attemptId, taskId: request.taskId, rootTaskId: lineage.rootTaskId, automaticRetry: request.automaticRetryOf !== undefined,
    });
    if (!charge.ok) return charge;
  }
  const command = await appendWorkerCommand(tx, request, 'scheduling.assignment.offered', assignment.workerId, at, offeredPayload(assignment));
  return command.ok ? ok(Object.freeze({ kind: 'placed', assignment })) : command;
}

function isReservable(task: Task, attemptId: AttemptId): boolean {
  const attempt = activeAttempt(task);
  return attempt !== undefined && attempt.id === attemptId && attempt.cancellation === undefined;
}

// Contract section 5: an automatic retry follows only an earlier attempt of
// the task that ended without uncertainty and released its reservation.
async function isSafeToRetry(tx: CapacityTransaction, task: Task, earlier: AttemptId): Promise<boolean> {
  const outcome = task.attempts.find((attempt) => attempt.id === earlier)?.outcome;
  const certain = outcome?.kind === 'not-started' || (outcome?.kind === 'exited' && outcome.startProven);
  return certain && !(await tx.ledger.heldForAttempt(earlier));
}

async function workerStanding(tx: CapacityTransaction, worker: WorkerPlacementRecord | undefined) {
  if (worker === undefined) return undefined;
  const { slots, cpuMillicores, memoryMebibytes, controls } = worker;
  return { eligible: isEligibleForPlacement(worker), controls, slots, cpuMillicores, memoryMebibytes, held: await tx.ledger.heldOnWorker(worker.workerId) };
}

async function quotaStandings(tx: CapacityTransaction, lineage: TaskLineageLink, root: TaskLineageLink): Promise<readonly QuotaStanding[]> {
  const projectId: ProjectId = lineage.projectId;
  const project: QuotaStanding = { kind: 'project', limit: await tx.quotas.projectQuota(projectId), held: await tx.ledger.heldInProject(projectId) };
  const runs = await Promise.all(chargedRuns(lineage.runId, root.runId).map(async (runId): Promise<QuotaStanding> => ({
    kind: 'run', limit: await tx.quotas.runQuota(runId), held: await tx.ledger.heldInRun(runId),
  })));
  return [project, ...runs];
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

// A cancellation is an invalidating writer (launch authorization section 5):
// it revokes the running execution's grants and sends its cancellation.
async function revokeRunningLaunch(tx: CapacityTransaction, assignment: Assignment, task: Task, request: ReleaseRequest, at: Instant): Promise<Result<void>> {
  const revoked = revokeLaunch(task, assignment.attemptId, 'attempt-not-launchable', at);
  if (!revoked.ok) return revoked;
  const stored = await tx.tasks.replace(revoked.value, task.generation);
  if (!stored.ok) return stored;
  return appendWorkerCommand(tx, request, 'execution.attempt.cancel', assignment.workerId, at, cancelPayload(assignment));
}
