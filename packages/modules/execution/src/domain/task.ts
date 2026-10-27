import { err, failure, ok, type Instant, type Result } from '@taskelith/kernel';
import {
  FIRST_GENERATION,
  nextGeneration,
  nextOwnershipGeneration,
  type AdmissionId,
  type EvidenceReference,
  type Generation,
  type OwnershipGeneration,
  type TaskAdmission,
  type TaskId,
} from '@taskelith/sdlc';
import {
  attemptPhase,
  outcomeOf,
  owningExecution,
  type Attempt,
  type AttemptOutcome,
  type CancellationReason,
} from './attempt.js';
import {
  isTerminalExecution,
  isUnknownExecution,
  moveExecution,
  withEvidence,
  withRevokedGrants,
  type Execution,
  type ExecutionEvidenceKind,
  type ExitStatus,
} from './execution.js';
import type { AssignmentId, AttemptId, ExecutionId, WorkerId } from './identifiers.js';
import type { RevocationReason } from './launch-rejection.js';

// One task's admission, ownership generation, and attempts, at most one of
// them active; each change raises the generation a repository compares.
export interface Task {
  readonly id: TaskId;
  readonly admissionId: AdmissionId;
  readonly ownershipGeneration: OwnershipGeneration;
  readonly attempts: readonly Attempt[];
  readonly generation: Generation;
  readonly changedAt: Instant;
}

// What an ended attempt feeds its task; facts of different attempts stay
// distinct (invariant 3), and none of them accepts the task's work.
export interface TaskOutcomeFact {
  readonly taskId: TaskId;
  readonly attemptId: AttemptId;
  readonly ownershipGeneration: OwnershipGeneration;
  readonly outcome: AttemptOutcome;
}

export interface AttemptRequest {
  readonly id: AttemptId;
  readonly retryOf?: AttemptId;
}

// A worker's report about one of its executions.
export interface ExecutionReport {
  readonly workerId: WorkerId;
  readonly executionId: ExecutionId;
}

export interface ExitReport extends ExecutionReport {
  readonly status: ExitStatus;
  readonly startProven: boolean;
  readonly spawnFailed: boolean;
}

export interface EvidenceReport extends ExecutionReport {
  readonly kind: ExecutionEvidenceKind;
}

// The check each grant would now fail, and the attempt's cancellation
// reason, which matches the command its writer sends (B8).
export interface LaunchRevocation {
  readonly grants: RevocationReason;
  readonly cancellation: CancellationReason;
}

// What the scheduler reads before it ends an assignment or releases its
// reservation (capacity reservation contract, section 6).
export interface AssignmentExecutions {
  readonly granted: boolean;
  readonly nonTerminal: boolean;
}

// A repeated fact changes nothing and is answered with the recorded one.
export interface ObservationResult {
  readonly effect: 'applied' | 'duplicate';
  readonly task: Task;
}

// What a task needs from placement: its first attempt, or a placement of
// its active attempt, which must be uncancelled and own nothing that runs.
export type PlacementNeed = { readonly kind: 'open-attempt' } | { readonly kind: 'place'; readonly attemptId: AttemptId };

const OPEN_ATTEMPT: PlacementNeed = Object.freeze({ kind: 'open-attempt' });

export function openTask(admission: TaskAdmission, at: Instant): Result<Task> {
  const ownership = dispatchedOwnership(admission);
  if (!ownership.ok) return ownership;
  return ok(Object.freeze({
    id: admission.taskId,
    admissionId: admission.id,
    ownershipGeneration: ownership.value,
    attempts: Object.freeze([]),
    generation: FIRST_GENERATION,
    changedAt: at,
  }));
}

// Binds a re-admission of the task, dispatched at the next ownership
// generation, while no attempt is active.
export function rebindAdmission(task: Task, admission: TaskAdmission, at: Instant): Result<Task> {
  const ownership = dispatchedOwnership(admission);
  if (!ownership.ok) return ownership;
  if (admission.taskId !== task.id) return taskFailure(task, `cannot be bound to admission ${admission.id} of task ${admission.taskId}`);
  const active = activeAttempt(task);
  if (active !== undefined) return taskFailure(task, `cannot be re-admitted while attempt ${active.id} is active`);
  const next = nextOwnershipGeneration(task.ownershipGeneration);
  if (ownership.value !== next) return staleOwnership(task, `needs an admission dispatched at ownership generation ${next}`);
  return ok(changedTask(task, { admissionId: admission.id, ownershipGeneration: next }, at));
}

// Opens the task's next attempt; a second active attempt is never accepted
// (invariant 2), and a retry names an ended attempt of the same task.
export function openAttempt(
  task: Task,
  expectedOwnership: OwnershipGeneration,
  request: AttemptRequest,
  at: Instant,
): Result<Task> {
  const fenced = checkOwnership(task, expectedOwnership);
  if (!fenced.ok) return fenced;
  const active = activeAttempt(task);
  if (active !== undefined) return taskFailure(task, `already has the active attempt ${active.id}`, { attempt: active.id });
  if (task.attempts.some((attempt) => attempt.id === request.id)) {
    return err(failure('conflict', `task ${task.id} already has attempt ${request.id}`, { task: task.id, attempt: request.id }));
  }
  if (request.retryOf !== undefined && !task.attempts.some((attempt) => attempt.id === request.retryOf)) {
    return err(failure('not-found', `task ${task.id} has no attempt ${request.retryOf} to retry`, { task: task.id, attempt: request.retryOf }));
  }
  const attempt: Attempt = Object.freeze({
    id: request.id,
    ...(request.retryOf === undefined ? {} : { retryOf: request.retryOf }),
    executions: Object.freeze([]),
  });
  return ok(changedTask(task, {
    attempts: Object.freeze([...task.attempts, attempt]),
    ownershipGeneration: nextOwnershipGeneration(task.ownershipGeneration),
  }, at));
}

// Advances the ownership for a new placement of the active attempt, which
// its new assignment carries; it needs no execution that can still run.
export function claimOwnership(
  task: Task,
  expectedOwnership: OwnershipGeneration,
  attemptId: AttemptId,
  at: Instant,
): Result<Task> {
  const fenced = checkOwnership(task, expectedOwnership);
  if (!fenced.ok) return fenced;
  const attempt = findActiveAttempt(task, attemptId);
  if (!attempt.ok) return attempt;
  if (attempt.value.cancellation !== undefined) return attemptFailure(attempt.value, 'is cancelled and is not placed again');
  const owning = owningExecution(attempt.value);
  if (owning !== undefined) return attemptFailure(attempt.value, `still owns execution ${owning.id}`, { execution: owning.id });
  return ok(changedTask(task, { ownershipGeneration: nextOwnershipGeneration(task.ownershipGeneration) }, at));
}

// Records that cancellation is requested; the attempt ends as cancelled at
// once only when none of its executions can still run.
export function requestCancellation(task: Task, attemptId: AttemptId, reason: CancellationReason, at: Instant): Result<Task> {
  const attempt = findActiveAttempt(task, attemptId);
  if (!attempt.ok) return attempt;
  if (attempt.value.cancellation !== undefined) return attemptFailure(attempt.value, 'already has a cancellation request');
  return ok(withAttempt(task, settled(task, withCancellation(attempt.value, reason, at), at), at));
}

// Whether a writer that changes a compared value must revoke this attempt's
// launch: it owns an execution that is not terminal, expired or not.
export function isLaunchAffected(task: Task, attemptId: AttemptId): boolean {
  const attempt = task.attempts.find((candidate) => candidate.id === attemptId);
  return attempt !== undefined && owningExecution(attempt) !== undefined;
}

// Revokes every grant of the owning execution and requests cancellation; a
// started process may still run, so the outcome waits for its terminal fact.
export function revokeLaunch(task: Task, attemptId: AttemptId, revocation: LaunchRevocation, at: Instant): Result<Task> {
  const attempt = findActiveAttempt(task, attemptId);
  if (!attempt.ok) return attempt;
  const owning = owningExecution(attempt.value);
  if (owning === undefined) return attemptFailure(attempt.value, 'owns no execution whose launch could be revoked');
  const revoked = withExecution(attempt.value, withRevokedGrants(owning, revocation.grants));
  const cancelled = revoked.cancellation === undefined ? withCancellation(revoked, revocation.cancellation, at) : revoked;
  return ok(withAttempt(task, cancelled, at));
}

// Ends the attempt once no execution of it can run, with the outcome its
// last exit implies.
export function endAttempt(task: Task, attemptId: AttemptId, at: Instant): Result<Task> {
  const attempt = findActiveAttempt(task, attemptId);
  if (!attempt.ok) return attempt;
  const owning = owningExecution(attempt.value);
  if (owning !== undefined) return attemptFailure(attempt.value, `cannot end while execution ${owning.id} is ${owning.state}`);
  return ok(withAttempt(task, Object.freeze({ ...attempt.value, outcome: outcomeOf(attempt.value, task.ownershipGeneration, at) }), at));
}

// An operator's audited reconciliation of an execution no evidence can
// resolve: it ends the execution with an unknown status and the attempt.
export function resolveByOperator(task: Task, attemptId: AttemptId, evidence: EvidenceReference, at: Instant): Result<Task> {
  const attempt = findActiveAttempt(task, attemptId);
  if (!attempt.ok) return attempt;
  const owning = owningExecution(attempt.value);
  if (owning === undefined) return attemptFailure(attempt.value, 'owns no execution to reconcile; end it instead');
  const exited = moveExecution(withRevokedGrants(owning, 'capacity-not-reserved'), 'exited', {
    status: Object.freeze({ kind: 'unknown' }),
    startProven: owning.start !== undefined,
    spawnFailed: false,
    recordedAt: at,
    operatorEvidence: evidence,
  });
  if (!exited.ok) return exited;
  const resolved = withExecution(attempt.value, exited.value);
  return ok(withAttempt(task, Object.freeze({ ...resolved, outcome: outcomeOf(resolved, task.ownershipGeneration, at) }), at));
}

export function recordExit(task: Task, report: ExitReport, at: Instant): Result<ObservationResult> {
  const located = locateReportedExecution(task, report);
  if (!located.ok) return located;
  const { attempt, execution } = located.value;
  if (execution.state === 'exited') return ok(Object.freeze({ effect: 'duplicate', task }));
  const { status, startProven, spawnFailed } = report;
  const exited = moveExecution(execution, 'exited', { status, startProven, spawnFailed, recordedAt: at });
  if (!exited.ok) return exited;
  return ok(applied(withAttempt(task, settled(task, withExecution(attempt, exited.value), at), at)));
}

// `not-started` follows only the worker's read of a durable seal, so no
// spawn can follow under any grant of the execution.
export function recordNotStarted(task: Task, report: ExecutionReport, at: Instant): Result<ObservationResult> {
  const located = locateReportedExecution(task, report);
  if (!located.ok) return located;
  const { attempt, execution } = located.value;
  if (execution.state === 'not-started') return ok(Object.freeze({ effect: 'duplicate', task }));
  const sealed = moveExecution(execution, 'not-started');
  if (!sealed.ok) return sealed;
  return ok(applied(withAttempt(task, settled(task, withExecution(attempt, sealed.value), at), at)));
}

export function recordExecutionEvidence(task: Task, report: EvidenceReport, at: Instant): Result<ObservationResult> {
  const located = locateReportedExecution(task, report);
  if (!located.ok) return located;
  const { attempt, execution } = located.value;
  if (isTerminalExecution(execution)) {
    return attemptFailure(attempt, `cannot record ${report.kind} for execution ${execution.id}, which is ${execution.state}`);
  }
  const observed = withEvidence(execution, { kind: report.kind, observedAt: at });
  return ok(applied(withAttempt(task, withExecution(attempt, observed), at)));
}

// Whether the attempt's command may be sent again after its worker lost its
// local history: only while no grant was ever recorded for it.
export function canResendAssignment(task: Task, attemptId: AttemptId): boolean {
  const attempt = task.attempts.find((candidate) => candidate.id === attemptId);
  return attempt !== undefined && attempt.outcome === undefined && attempt.executions.length === 0;
}

export function executionsUnderAssignment(task: Task, assignmentId: AssignmentId): AssignmentExecutions {
  const under = task.attempts.flatMap((attempt) => attempt.executions).filter((execution) => execution.assignmentId === assignmentId);
  return Object.freeze({ granted: under.length > 0, nonTerminal: under.some((execution) => !isTerminalExecution(execution)) });
}

export function unknownExecutionCount(task: Task): number {
  return task.attempts.flatMap((attempt) => attempt.executions).filter(isUnknownExecution).length;
}

export function taskOutcomeFact(task: Task, attemptId: AttemptId): Result<TaskOutcomeFact> {
  const attempt = findAttempt(task, attemptId);
  if (!attempt.ok) return attempt;
  if (attempt.value.outcome === undefined) return attemptFailure(attempt.value, 'has not ended');
  return ok(Object.freeze({
    taskId: task.id,
    attemptId,
    ownershipGeneration: attempt.value.outcome.ownershipGeneration,
    outcome: attempt.value.outcome,
  }));
}

// Undefined once every attempt ended: an automatic retry is not placement.
export function placementNeed(task: Task): PlacementNeed | undefined {
  if (task.attempts.length === 0) return OPEN_ATTEMPT;
  const active = activeAttempt(task);
  if (active === undefined || active.cancellation !== undefined || owningExecution(active) !== undefined) return undefined;
  return Object.freeze({ kind: 'place', attemptId: active.id });
}

export function activeAttempt(task: Task): Attempt | undefined {
  return task.attempts.find((attempt) => attempt.outcome === undefined);
}

export function findAttempt(task: Task, attemptId: AttemptId): Result<Attempt> {
  const attempt = task.attempts.find((candidate) => candidate.id === attemptId);
  if (attempt === undefined) {
    return err(failure('not-found', `task ${task.id} has no attempt ${attemptId}`, { task: task.id, attempt: attemptId }));
  }
  return ok(attempt);
}

export function locateExecution(task: Task, executionId: ExecutionId): { attempt: Attempt; execution: Execution } | undefined {
  for (const attempt of task.attempts) {
    const execution = attempt.executions.find((candidate) => candidate.id === executionId);
    if (execution !== undefined) return { attempt, execution };
  }
  return undefined;
}

export function withAttempt(task: Task, attempt: Attempt, at: Instant): Task {
  const attempts = task.attempts.map((candidate) => (candidate.id === attempt.id ? attempt : candidate));
  return changedTask(task, { attempts: Object.freeze(attempts) }, at);
}

// Replaces the execution of the same identity, or appends a new one.
export function withExecution(attempt: Attempt, execution: Execution): Attempt {
  const known = attempt.executions.some((candidate) => candidate.id === execution.id);
  const executions = known
    ? attempt.executions.map((candidate) => (candidate.id === execution.id ? execution : candidate))
    : [...attempt.executions, execution];
  return Object.freeze({ ...attempt, executions: Object.freeze(executions) });
}

export function checkOwnership(task: Task, expected: OwnershipGeneration): Result<void> {
  if (task.ownershipGeneration === expected) return ok(undefined);
  return staleOwnership(task, `is at ownership generation ${task.ownershipGeneration}, not ${expected}`);
}

function staleOwnership(task: Task, message: string): Result<never> {
  return err(failure('conflict', `task ${task.id} ${message}`, { task: task.id, reason: 'stale-ownership-generation' }));
}

function dispatchedOwnership(admission: TaskAdmission): Result<OwnershipGeneration> {
  if (admission.state !== 'used' || admission.ownershipGeneration === undefined) {
    return err(failure('precondition-failed', `admission ${admission.id} was not dispatched under an ownership generation`, {
      admission: admission.id,
    }));
  }
  return ok(admission.ownershipGeneration);
}

function findActiveAttempt(task: Task, attemptId: AttemptId): Result<Attempt> {
  const attempt = findAttempt(task, attemptId);
  if (!attempt.ok) return attempt;
  if (attempt.value.outcome !== undefined) return attemptFailure(attempt.value, 'has ended');
  return attempt;
}

function locateReportedExecution(task: Task, report: ExecutionReport): Result<{ attempt: Attempt; execution: Execution }> {
  const located = locateExecution(task, report.executionId);
  if (located === undefined) {
    return err(failure('not-found', `task ${task.id} has no execution ${report.executionId}`, { execution: report.executionId }));
  }
  if (located.execution.workerId !== report.workerId) {
    return err(failure('forbidden', `execution ${report.executionId} belongs to another worker`, {
      execution: report.executionId,
      worker: report.workerId,
    }));
  }
  return ok(located);
}

function withCancellation(attempt: Attempt, reason: CancellationReason, at: Instant): Attempt {
  return Object.freeze({ ...attempt, cancellation: Object.freeze({ reason, requestedAt: at }) });
}

// A cancelled attempt ends as soon as termination is observed: none of its
// executions can still run.
function settled(task: Task, attempt: Attempt, at: Instant): Attempt {
  if (attempt.cancellation === undefined || attemptPhase(attempt) !== 'awaiting-launch') return attempt;
  return Object.freeze({ ...attempt, outcome: outcomeOf(attempt, task.ownershipGeneration, at) });
}

function applied(task: Task): ObservationResult {
  return Object.freeze({ effect: 'applied', task });
}

function attemptFailure(attempt: Attempt, message: string, details: Readonly<Record<string, string>> = {}): Result<never> {
  return err(failure('precondition-failed', `attempt ${attempt.id} ${message}`, { attempt: attempt.id, ...details }));
}

function taskFailure(task: Task, message: string, details: Readonly<Record<string, string>> = {}): Result<never> {
  return err(failure('precondition-failed', `task ${task.id} ${message}`, { task: task.id, ...details }));
}

type TaskChange = Partial<Pick<Task, 'admissionId' | 'ownershipGeneration' | 'attempts'>>;

function changedTask(task: Task, change: TaskChange, at: Instant): Task {
  return Object.freeze({ ...task, ...change, generation: nextGeneration(task.generation), changedAt: at });
}
