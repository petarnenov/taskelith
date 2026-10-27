import { err, failure, ok, type Instant, type Result } from '@taskelith/kernel';
import {
  activeAttempt,
  checkOwnership,
  executionsUnderAssignment,
  revokeLaunch,
  type AssignmentExecutions,
  type AssignmentId,
  type AttemptId,
  type ExecutionId,
  type Task,
  type WorkerId,
} from '@taskelith/execution';
import type { OwnershipGeneration, TaskId } from '@taskelith/sdlc';
import {
  createAssignment,
  endAssignment,
  refuseAssignment,
  releaseAfterTerminalFact,
  supersedeAssignment,
  type Assignment,
  type Refusal,
} from '../domain/assignment.js';
import { isCertainEnd } from '../domain/automatic-retry.js';
import { DEFAULT_PROVIDER_CREDENTIAL_CONCURRENCY } from '../domain/capacity-limits.js';
import { reasonOutcome, type CapacityReason } from '../domain/capacity-reasons.js';
import type { ProjectId, ProviderCredentialId, ReservationId, ResourceRequest } from '../domain/capacity-reservation.js';
import { chargedRuns, type TaskLineageLink } from '../domain/delegation-admission.js';
import { decidePlacement, type PlacementSnapshot, type QuotaStanding } from '../domain/placement-decision.js';
import { isSupersessionDue } from '../domain/supersession.js';
import type { CapacityTransaction } from '../ports/capacity-store.js';
import { isEligibleForPlacement, type WorkerPlacementRecord } from '../ports/placement-workers.js';
import { appendWorkerCommand, cancellationPayload, endPayload, offerPayload, type CommandIdentity } from './capacity-commands.js';

// The capacity operations of contract sections 4 and 6, each run inside the
// caller's SERIALIZABLE transaction, such as the one recording a fact.

// One placement of one attempt on one candidate worker; the identities are
// the command's, so a retry of the same placement reuses them.
export interface PlacementRequest extends CommandIdentity {
  readonly assignmentId: AssignmentId;
  readonly reservationId: ReservationId;
  readonly taskId: TaskId;
  readonly attemptId: AttemptId;
  // The ownership the scheduler claimed for this placement; a stale one fails.
  readonly ownershipGeneration: OwnershipGeneration;
  readonly workerId: WorkerId;
  readonly requested: ResourceRequest;
  readonly providerCredentials: readonly ProviderCredentialId[];
  // An automatic retry of an earlier attempt charges the retry allowance.
  readonly automaticRetryOf?: AttemptId;
}

export type PlacementOutcome =
  | { readonly kind: 'placed'; readonly assignment: Assignment }
  | { readonly kind: 'waiting' | 'rejected' | 'standing'; readonly reason: CapacityReason };

export interface ReleaseRequest extends CommandIdentity {
  readonly assignmentId: AssignmentId;
}

export async function placeInTransaction(tx: CapacityTransaction, request: PlacementRequest): Promise<Result<PlacementOutcome>> {
  const task = await tx.tasks.get(request.taskId);
  if (!task.ok && task.error.code !== 'not-found') return task;
  const lineage = await tx.lineage.get(request.taskId);
  const root = lineage && await tx.lineage.get(lineage.rootTaskId);
  if (!task.ok || lineage === undefined || root === undefined) return outcome('attempt-not-reservable');
  const fenced = checkPlacementClaim(task.value, request);
  if (!fenced.ok) return fenced;
  const charged = await tx.ledger.isCharged(request.attemptId);
  const decision = decidePlacement(await readPlacementSnapshot(tx, request, task.value, lineage, root, charged));
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
    ? await appendWorkerCommand(tx, request, 'execution.assignment.end', ended.value, at, endPayload(ended.value, 'cancelled'))
    : await revokeRunningLaunch(tx, ended.value, task, request, at);
  return follow.ok ? ok(ended.value) : follow;
}

// A refusal ends the assignment and releases it, unless an execution under
// it can run; then it keeps capacity and invalidates as a cancellation does.
export async function refuseInTransaction(tx: CapacityTransaction, request: ReleaseRequest, refusal: Refusal): Promise<Result<Assignment>> {
  const loaded = await loadAssignment(tx, request.assignmentId);
  if (!loaded.ok) return loaded;
  const { assignment, task } = loaded.value;
  const at = await tx.now();
  const refused = refuseAssignment(assignment, assignment.generation, refusal, executionsUnderAssignment(task, assignment.id), at);
  if (!refused.ok) return refused;
  const stored = await tx.assignments.replace(refused.value, assignment.generation);
  if (!stored.ok) return stored;
  if (refused.value.reservation.state === 'released') return ok(refused.value);
  const revoked = await revokeRunningLaunch(tx, refused.value, task, request, at);
  return revoked.ok ? ok(refused.value) : revoked;
}

// A release ends the assignment or frees its reservation; `kept` is an
// ended assignment whose execution can still run, so capacity stays held.
export interface ReleaseOutcome {
  readonly outcome: 'released' | 'kept';
  readonly assignment: Assignment;
}

// For the transaction recording an attempt's end or an ended assignment's
// last terminal fact; any other call is `precondition-failed`.
export async function releaseInTransaction(tx: CapacityTransaction, request: ReleaseRequest): Promise<Result<ReleaseOutcome>> {
  const loaded = await loadAssignment(tx, request.assignmentId);
  if (!loaded.ok) return loaded;
  const { assignment, task } = loaded.value;
  const executions = executionsUnderAssignment(task, assignment.id);
  if (isKeptForExecution(assignment, executions)) return ok(releaseOutcome(assignment));
  const at = await tx.now();
  const attemptEnded = assignment.state !== 'ended' && hasEnded(task, assignment.attemptId);
  const released = attemptEnded
    ? endAssignment(assignment, assignment.generation, 'attempt-ended', executions, at)
    : releaseAfterTerminalFact(assignment, assignment.generation, executions, at);
  if (!released.ok) return released;
  const stored = await tx.assignments.replace(released.value, assignment.generation);
  if (!stored.ok) return stored;
  if (!attemptEnded) return ok(releaseOutcome(released.value));
  const ended = await appendWorkerCommand(tx, request, 'execution.assignment.end', released.value, at, endPayload(released.value, 'attempt-ended'));
  return ended.ok ? ok(releaseOutcome(released.value)) : ended;
}

// Bounded supersession (contract section 6) of an assignment without a
// grant: unacknowledged too long, its worker gone, or under long pressure.
export async function supersedeInTransaction(tx: CapacityTransaction, request: ReleaseRequest): Promise<Result<Assignment>> {
  const loaded = await loadAssignment(tx, request.assignmentId);
  if (!loaded.ok) return loaded;
  const { assignment } = loaded.value;
  const at = await tx.now();
  if (!isSupersessionDue(assignment, await tx.workers.get(assignment.workerId), at)) {
    return err(failure('precondition-failed', `assignment ${assignment.id} is within its supersession bounds`, { assignment: assignment.id }));
  }
  return supersede(tx, request, loaded.value, at);
}

// The supersession of an assignment without a grant whatever its bounds,
// as a launch rejection or its worker's revocation requires (item 21d).
export async function supersedeUngrantedInTransaction(tx: CapacityTransaction, request: ReleaseRequest): Promise<Result<Assignment>> {
  const loaded = await loadAssignment(tx, request.assignmentId);
  if (!loaded.ok) return loaded;
  return supersede(tx, request, loaded.value, await tx.now());
}

async function supersede(tx: CapacityTransaction, request: ReleaseRequest, loaded: LoadedAssignment, at: Instant): Promise<Result<Assignment>> {
  const { assignment, task } = loaded;
  const superseded = supersedeAssignment(assignment, assignment.generation, executionsUnderAssignment(task, assignment.id), at);
  if (!superseded.ok) return superseded;
  const stored = await tx.assignments.replace(superseded.value, assignment.generation);
  if (!stored.ok) return stored;
  const ended = await appendWorkerCommand(tx, request, 'execution.assignment.end', superseded.value, at, endPayload(superseded.value, 'superseded'));
  return ended.ok ? ok(superseded.value) : ended;
}

// An unauthorized start (launch authorization section 7) is cancelled by
// its execution only, never another execution of the attempt.
export async function cancelExecutionInTransaction(tx: CapacityTransaction, request: ReleaseRequest, executionId: ExecutionId): Promise<Result<void>> {
  const assignment = await tx.assignments.get(request.assignmentId);
  if (!assignment.ok) return assignment;
  const payload = cancellationPayload('launch-revoked', executionId);
  return appendWorkerCommand(tx, request, 'execution.cancellation.request', assignment.value, await tx.now(), payload);
}

function outcome(reason: CapacityReason): Result<PlacementOutcome> {
  return ok(Object.freeze({ kind: reasonOutcome(reason), reason }));
}

// Everything decidePlacement compares, read inside the transaction.
async function readPlacementSnapshot(
  tx: CapacityTransaction, request: PlacementRequest, task: Task, lineage: TaskLineageLink, root: TaskLineageLink, charged: boolean,
): Promise<PlacementSnapshot> {
  return {
    quarantined: await tx.installation.quarantined(),
    attempt: { reservable: isReservable(task, request.attemptId), holdsReservation: await tx.ledger.heldForAttempt(request.attemptId) },
    worker: await workerStanding(tx, await tx.workers.get(request.workerId)),
    request: request.requested,
    quotas: await quotaStandings(tx, lineage, root),
    credentials: await Promise.all(request.providerCredentials.map(async (credential) => ({
      limit: DEFAULT_PROVIDER_CREDENTIAL_CONCURRENCY, held: await tx.ledger.heldForCredential(credential),
    }))),
    charge: { alreadyCharged: charged, treeAttempts: await tx.ledger.treeAttempts(lineage.rootTaskId), ...await retryStanding(tx, request, task) },
  };
}

async function retryStanding(tx: CapacityTransaction, request: PlacementRequest, task: Task): Promise<Pick<PlacementSnapshot['charge'], 'retry'>> {
  if (request.automaticRetryOf === undefined) return {};
  const uncertain = !(await isSafeToRetry(tx, task, request.automaticRetryOf));
  return { retry: { uncertain, automaticRetriesUsed: await tx.ledger.automaticRetries(request.taskId) } };
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
    offerCommandId: request.commandId,
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
  if (!added.ok) return added.error.details.attempt === undefined ? added : outcome('attempt-already-reserved');
  if (!charged) {
    const charge = await tx.ledger.recordCharge({
      attemptId: request.attemptId, taskId: request.taskId, rootTaskId: lineage.rootTaskId, automaticRetry: request.automaticRetryOf !== undefined,
    });
    if (!charge.ok) return charge;
  }
  const command = await appendWorkerCommand(tx, request, 'execution.assignment.offer', assignment, at, offerPayload(assignment));
  return command.ok ? ok(Object.freeze({ kind: 'placed', assignment })) : command;
}

// The placement names the ownership the task holds, and an automatic retry
// names the earlier attempt the active one retries.
function checkPlacementClaim(task: Task, request: PlacementRequest): Result<void> {
  const fenced = checkOwnership(task, request.ownershipGeneration);
  if (!fenced.ok) return fenced;
  const retryOf = task.attempts.find((attempt) => attempt.id === request.attemptId)?.retryOf;
  if (request.automaticRetryOf === undefined || request.automaticRetryOf === retryOf) return ok(undefined);
  return err(failure('precondition-failed', `attempt ${request.attemptId} does not retry ${request.automaticRetryOf}`, {
    attempt: request.attemptId, retryOf: request.automaticRetryOf,
  }));
}

function isKeptForExecution(assignment: Assignment, executions: AssignmentExecutions): boolean {
  return assignment.state === 'ended' && assignment.reservation.state === 'held' && executions.nonTerminal;
}

function releaseOutcome(assignment: Assignment): ReleaseOutcome {
  return Object.freeze({ outcome: assignment.reservation.state === 'released' ? 'released' : 'kept', assignment });
}

function hasEnded(task: Task, attemptId: AttemptId): boolean {
  return task.attempts.some((attempt) => attempt.id === attemptId && attempt.outcome !== undefined);
}

function isReservable(task: Task, attemptId: AttemptId): boolean {
  const attempt = activeAttempt(task);
  return attempt !== undefined && attempt.id === attemptId && attempt.cancellation === undefined;
}

// Contract section 5: an automatic retry follows only an earlier attempt of
// the task that ended without uncertainty and released its reservation.
async function isSafeToRetry(tx: CapacityTransaction, task: Task, earlier: AttemptId): Promise<boolean> {
  const earlierOutcome = task.attempts.find((attempt) => attempt.id === earlier)?.outcome;
  const certain = earlierOutcome !== undefined && isCertainEnd(earlierOutcome);
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

interface LoadedAssignment {
  readonly assignment: Assignment;
  readonly task: Task;
}

async function loadAssignment(tx: CapacityTransaction, assignmentId: AssignmentId): Promise<Result<LoadedAssignment>> {
  const assignment = await tx.assignments.get(assignmentId);
  if (!assignment.ok) return assignment;
  const task = await tx.tasks.get(assignment.value.reservation.scope.taskId);
  if (!task.ok) return task;
  return ok({ assignment: assignment.value, task: task.value });
}

// A cancellation or refusal invalidates (launch authorization section 5):
// it revokes the execution's grants and sends its cancellation.
async function revokeRunningLaunch(tx: CapacityTransaction, assignment: Assignment, task: Task, request: ReleaseRequest, at: Instant): Promise<Result<void>> {
  const revoked = revokeLaunch(task, assignment.attemptId, { grants: 'attempt-not-launchable', cancellation: 'assignment-ended' }, at);
  if (!revoked.ok) return revoked;
  const stored = await tx.tasks.replace(revoked.value, task.generation);
  if (!stored.ok) return stored;
  return appendWorkerCommand(tx, request, 'execution.cancellation.request', assignment, at, cancellationPayload('assignment-ended'));
}
