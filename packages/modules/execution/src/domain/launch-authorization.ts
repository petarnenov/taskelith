import { err, ok, type Instant, type Result } from '@taskelith/kernel';
import {
  isSameArtifactRevision,
  type AdmissionId,
  type ArtifactRevision,
  type Gate,
  type Generation,
  type OwnershipGeneration,
  type PolicyRevision,
  type TaskAdmission,
  type WorkflowDefinition,
} from '@taskelith/sdlc';
import { attemptPhase, owningExecution, type Attempt } from './attempt.js';
import { authorizedExecution, isTerminalExecution, moveExecution, withGrant, type Execution } from './execution.js';
import type {
  AssignmentId,
  AttemptId,
  ExecutionId,
  InstallationState,
  LaunchAuthId,
  OperationId,
  RecoveryEpoch,
  WorkerId,
} from './identifiers.js';
import { isGrantExpired, type LaunchGrant, type LaunchParameters } from './launch-grant.js';
import { launchRejection, type LaunchRejection, type RevocationReason } from './launch-rejection.js';
import { locateExecution, withAttempt, withExecution, type Task } from './task.js';

// The immutable values a worker expects; the worker identity is the
// authenticated principal, never a request field.
export interface LaunchRequest {
  readonly operationId: OperationId;
  readonly workerId: WorkerId;
  readonly recoveryEpoch: RecoveryEpoch;
  readonly assignmentId: AssignmentId;
  readonly attemptId: AttemptId;
  readonly ownershipGeneration: OwnershipGeneration;
  readonly executionId: ExecutionId;
  readonly admissionId: AdmissionId;
  readonly admissionGeneration: Generation;
  // From the supervisor's launch record; lets an execution be re-authorized.
  readonly reportsNotStarted: boolean;
  // An earlier execution of the attempt that the worker sealed (section 4).
  readonly reportsNotStartedFor?: SealedExecution;
}

// A sealed execution and an operation the worker journaled for it.
export interface SealedExecution {
  readonly executionId: ExecutionId;
  readonly operationId: OperationId;
}

// The scheduler's assignment and reservation as the authority reads them.
export interface LaunchAssignment {
  readonly assignmentId: AssignmentId;
  readonly attemptId: AttemptId;
  readonly workerId: WorkerId;
  readonly ownershipGeneration: OwnershipGeneration;
  readonly active: boolean;
}

export interface LaunchReservation {
  readonly state: 'held' | 'released';
  readonly attemptId: AttemptId;
  readonly workerId: WorkerId;
}

// The current values, all read in the authorization transaction.
export interface LaunchContext {
  readonly installation: InstallationState;
  readonly workerAuthorized: boolean;
  readonly assignment?: LaunchAssignment;
  readonly reservation?: LaunchReservation;
  readonly admission?: TaskAdmission;
  readonly definition: WorkflowDefinition;
  readonly gates: readonly Gate[];
  readonly currentRevisions: readonly ArtifactRevision[];
  readonly policyRevision: PolicyRevision;
}

// What the authority adds to a grant: its identity, the database time, and
// the protocol parameters.
export interface GrantIssue {
  readonly launchAuthId: LaunchAuthId;
  readonly issuedAt: Instant;
  readonly parameters: LaunchParameters;
}

export interface LaunchAuthorization {
  readonly task: Task;
  readonly grant: LaunchGrant;
}

type Check = LaunchRejection | undefined;

// The linearization point of a launch: the first failed check rejects it
// with its reason, and otherwise the grant applies the ownership rule.
export function authorizeLaunch(
  task: Task,
  request: LaunchRequest,
  context: LaunchContext,
  issue: GrantIssue,
): Result<LaunchAuthorization, LaunchRejection> {
  const failed = checkInstallation(request, context) ?? checkAssignment(task, request, context);
  if (failed !== undefined) return err(failed);
  const attempt = task.attempts.find((candidate) => candidate.id === request.attemptId);
  if (attempt === undefined || attemptPhase(attempt) === 'ended' || attempt.cancellation !== undefined) {
    return err(launchRejection('attempt-not-launchable', `attempt ${request.attemptId} is cancelled or ended`));
  }
  const admission = checkAdmission(task, request, context);
  if (!admission.ok) return admission;
  const reliedOn = reliedOnGates(admission.value, context);
  if (!reliedOn.ok) return reliedOn;
  const inputs = checkInputs(admission.value, context) ?? checkReservation(request, context);
  if (inputs !== undefined) return err(inputs);
  const grant = newGrant(request, admission.value, reliedOn.value, issue);
  const sealed = recordReportedSeal(task, attempt, request);
  if (!sealed.ok) return sealed;
  const owned = applyOwnershipRule(task, sealed.value, request, grant);
  if (!owned.ok) return owned;
  return ok(Object.freeze({ task: withAttempt(task, owned.value, issue.issuedAt), grant }));
}

// The answer to a launch request, fresh or replayed (contract section 6).
export type LaunchOutcome =
  | { readonly kind: 'granted'; readonly grant: LaunchGrant }
  | { readonly kind: 'revoked'; readonly reason: RevocationReason }
  | { readonly kind: 'expired' }
  | { readonly kind: 'rejected'; readonly rejection: LaunchRejection };

export type ReplayOutcome = LaunchOutcome;

// A transport retry of a granted operation runs no new authorization and
// never extends the worker's deadline (contract section 6).
export function replayLaunchOperation(
  task: Task,
  recorded: LaunchGrant,
  request: LaunchRequest,
  context: Pick<LaunchContext, 'installation' | 'workerAuthorized'>,
  now: Instant,
): ReplayOutcome {
  const rejected = checkSameOperation(recorded, request) ?? checkInstallation(request, context);
  if (rejected !== undefined) return Object.freeze({ kind: 'rejected', rejection: rejected });
  if (recorded.state === 'revoked') return Object.freeze({ kind: 'revoked', reason: recorded.revokedFor });
  if (isGrantExpired(recorded, now)) return Object.freeze({ kind: 'expired' });
  const execution = locateExecution(task, recorded.executionId)?.execution;
  if (execution === undefined || isTerminalExecution(execution)) {
    const rejection = launchRejection('execution-conflict', `execution ${recorded.executionId} has ended`);
    return Object.freeze({ kind: 'rejected', rejection });
  }
  return Object.freeze({ kind: 'granted', grant: recorded });
}

// The installation and worker checks, which come before every other one;
// the authority runs them before it reads the rest of the context.
export function checkLaunchPreconditions(
  request: LaunchRequest,
  context: Pick<LaunchContext, 'installation' | 'workerAuthorized'>,
): LaunchRejection | undefined {
  return checkInstallation(request, context);
}

// The rejection of a request whose assignment, and so whose task, is not
// found: the installation and worker checks come before the assignment's.
export function rejectUnknownAssignment(
  request: LaunchRequest,
  context: Pick<LaunchContext, 'installation' | 'workerAuthorized'>,
): LaunchRejection {
  return checkInstallation(request, context)
    ?? launchRejection('assignment-not-active', `assignment ${request.assignmentId} is not active for this worker`);
}

function checkInstallation(request: LaunchRequest, context: Pick<LaunchContext, 'installation' | 'workerAuthorized'>): Check {
  if (context.installation.quarantined) return launchRejection('quarantined', 'the installation is in restore quarantine');
  if (request.recoveryEpoch !== context.installation.recoveryEpoch) {
    return launchRejection('stale-recovery-epoch', `recovery epoch ${request.recoveryEpoch} is not current`);
  }
  if (!context.workerAuthorized) return launchRejection('worker-not-authorized', `worker ${request.workerId} is not authorized`);
  return undefined;
}

function checkAssignment(task: Task, request: LaunchRequest, context: LaunchContext): Check {
  const { assignment } = context;
  if (
    assignment === undefined || !assignment.active || assignment.assignmentId !== request.assignmentId
    || assignment.attemptId !== request.attemptId || assignment.workerId !== request.workerId
  ) {
    return launchRejection('assignment-not-active', `assignment ${request.assignmentId} is not active for this worker`);
  }
  const current = task.ownershipGeneration;
  if (request.ownershipGeneration !== current || assignment.ownershipGeneration !== current) {
    return launchRejection('stale-ownership-generation', `ownership generation ${request.ownershipGeneration} is not ${current}`);
  }
  return undefined;
}

function checkAdmission(task: Task, request: LaunchRequest, context: LaunchContext): Result<TaskAdmission, LaunchRejection> {
  const { admission, definition } = context;
  if (
    admission === undefined || admission.id !== request.admissionId || admission.id !== task.admissionId
    || admission.taskId !== task.id || admission.state !== 'used' || admission.generation !== request.admissionGeneration
    || admission.workflowId !== definition.id || admission.workflowVersion !== definition.version
  ) {
    return err(launchRejection('admission-not-current', `admission ${request.admissionId} is not the task's current one`));
  }
  return ok(admission);
}

// The gates G1 admission relied on, derived from the run's workflow: for an
// implementation task those of its prerequisite stages, for planning none.
function reliedOnGates(admission: TaskAdmission, context: LaunchContext): Result<readonly Gate[], LaunchRejection> {
  if (admission.kind === 'planning') return ok([]);
  const stage = context.definition.stages.find((candidate) => candidate.id === admission.stageId);
  const prerequisites = stage?.dependsOn ?? [];
  const relied = context.gates.filter((gate) => prerequisites.includes(gate.stageId));
  const ungated = prerequisites.find((stageId) => !relied.some((gate) => gate.stageId === stageId));
  if (stage === undefined || prerequisites.length === 0 || ungated !== undefined) {
    return err(launchRejection('gate-not-passed', `a prerequisite stage of ${admission.stageId} has no gate`));
  }
  const unpassed = relied.find((gate) => gate.state !== 'passed' || !gate.subject.every((judged) => isBound(admission, judged)));
  if (unpassed !== undefined) return err(launchRejection('gate-not-passed', `gate ${unpassed.id} has not passed the bound revisions`));
  return ok(relied);
}

function checkInputs(admission: TaskAdmission, context: LaunchContext): Check {
  const changed = admission.artifacts.find(
    (bound) => !context.currentRevisions.some((current) => isSameArtifactRevision(bound, current)),
  );
  if (changed !== undefined) {
    return launchRejection('artifact-revision-changed', `artifact ${changed.artifactId} has a newer revision`);
  }
  if (admission.policyRevision !== context.policyRevision) {
    return launchRejection('policy-revision-changed', `policy revision ${admission.policyRevision} is not the run's`);
  }
  return undefined;
}

function checkReservation(request: LaunchRequest, context: LaunchContext): Check {
  const { reservation } = context;
  if (reservation?.state === 'held' && reservation.attemptId === request.attemptId && reservation.workerId === request.workerId) {
    return undefined;
  }
  return launchRejection('capacity-not-reserved', `no capacity is held for attempt ${request.attemptId} on this worker`);
}

// One owning execution per attempt; only an unspawned, authorized execution
// is authorized again, and an identity is never reused (section 4).
function applyOwnershipRule(task: Task, attempt: Attempt, request: LaunchRequest, grant: LaunchGrant): Result<Attempt, LaunchRejection> {
  const owning = owningExecution(attempt);
  if (owning === undefined && locateExecution(task, request.executionId) === undefined) {
    return ok(withExecution(attempt, authorizedExecution(grant)));
  }
  if (owning?.id === request.executionId && owning.state === 'authorized' && request.reportsNotStarted) {
    return ok(withExecution(attempt, withGrant(owning, grant)));
  }
  const holder = owning === undefined ? 'the requested identity was used before' : `execution ${owning.id} is ${owning.state}`;
  return err(launchRejection('execution-conflict', `attempt ${attempt.id} cannot launch ${request.executionId}: ${holder}`));
}

// A reported seal ends its execution `not-started` in the same transaction;
// an execution never granted has nothing to end (section 4).
function recordReportedSeal(task: Task, attempt: Attempt, request: LaunchRequest): Result<Attempt, LaunchRejection> {
  const report = request.reportsNotStartedFor;
  if (report === undefined) return ok(attempt);
  if (report.executionId === request.executionId) return err(sealRejection(report, 'it is the requested execution'));
  const located = locateExecution(task, report.executionId);
  if (located === undefined) return ok(attempt);
  const { execution } = located;
  const conflict = sealConflict(task, located.attempt, execution, request, report);
  if (conflict !== undefined) return err(sealRejection(report, conflict));
  if (execution.state === 'not-started') return ok(attempt);
  const sealed = moveExecution(execution, 'not-started');
  return sealed.ok ? ok(withExecution(attempt, sealed.value)) : err(launchRejection('execution-conflict', sealed.error.message));
}

// The operation may be one whose request never reached the authority, so
// only an operation that granted another execution conflicts.
function sealConflict(task: Task, owner: Attempt, execution: Execution, request: LaunchRequest, report: SealedExecution): string | undefined {
  if (owner.id !== request.attemptId || execution.workerId !== request.workerId) return 'it is not of this attempt and worker';
  if (execution.state !== 'authorized' && execution.state !== 'not-started') return `it is ${execution.state}`;
  const named = grantOfOperation(task, request.workerId, report.operationId);
  if (named !== undefined && named.executionId !== execution.id) return `operation ${report.operationId} granted another execution`;
  return undefined;
}

function sealRejection(report: SealedExecution, conflict: string): LaunchRejection {
  return launchRejection('execution-conflict', `execution ${report.executionId} cannot be reported sealed: ${conflict}`);
}

// Only the worker's own operations, as a replay looks them up (section 6).
function grantOfOperation(task: Task, workerId: WorkerId, operationId: OperationId): LaunchGrant | undefined {
  return task.attempts.flatMap((attempt) => attempt.executions).flatMap((execution) => execution.grants)
    .find((grant) => grant.workerId === workerId && grant.operationId === operationId);
}

function checkSameOperation(recorded: LaunchGrant, request: LaunchRequest): Check {
  const same = recorded.operationId === request.operationId && recorded.workerId === request.workerId
    && recorded.recoveryEpoch === request.recoveryEpoch && recorded.assignmentId === request.assignmentId
    && recorded.attemptId === request.attemptId && recorded.ownershipGeneration === request.ownershipGeneration
    && recorded.executionId === request.executionId && recorded.admissionId === request.admissionId
    && recorded.admissionGeneration === request.admissionGeneration;
  if (same) return undefined;
  return launchRejection('operation-mismatch', `operation ${request.operationId} was recorded with other values`);
}

function isBound(admission: TaskAdmission, judged: ArtifactRevision): boolean {
  return admission.artifacts.some((bound) => isSameArtifactRevision(bound, judged));
}

function newGrant(request: LaunchRequest, admission: TaskAdmission, reliedOn: readonly Gate[], issue: GrantIssue): LaunchGrant {
  return Object.freeze({
    launchAuthId: issue.launchAuthId,
    operationId: request.operationId,
    executionId: request.executionId,
    attemptId: request.attemptId,
    assignmentId: request.assignmentId,
    workerId: request.workerId,
    ownershipGeneration: request.ownershipGeneration,
    recoveryEpoch: request.recoveryEpoch,
    admissionId: admission.id,
    admissionGeneration: admission.generation,
    reliedOnGates: Object.freeze(reliedOn.map((gate) => gate.id)),
    artifacts: admission.artifacts,
    policyRevision: admission.policyRevision,
    issuedAt: issue.issuedAt,
    parameters: issue.parameters,
    state: 'granted',
  });
}
