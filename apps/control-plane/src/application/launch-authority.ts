import {
  authorizeLaunch,
  launchRejection,
  parseRecoveryEpoch,
  rejectUnknownAssignment,
  replayLaunchOperation,
  type InstallationState,
  type LaunchAuthId,
  type LaunchAuthorizationRequest,
  type LaunchContext,
  type LaunchOutcome,
  type LaunchParameters,
  type LaunchRejection,
  type LaunchRequest,
  type RecordedLaunch,
  type RecordedRejection,
  type Task,
} from '@taskelith/execution';
import type { WorkerPrincipal } from '@taskelith/fleet';
import { err, failure, ok, parseIdentifier, type Result } from '@taskelith/kernel';
import { launchAssignment, launchReservation, type Assignment } from '@taskelith/scheduling';
import type { TaskAdmission } from '@taskelith/sdlc';
import type { ControlPlaneStore, ControlPlaneTransaction } from './control-plane-store.js';
import type { WorkflowRegistry } from './workflow-registry.js';

export interface LaunchAuthoritySettings {
  readonly workflows: WorkflowRegistry;
  readonly parameters: LaunchParameters;
  readonly newLaunchAuthId: () => string;
}

// The launch authority of the item 3 contract: one SERIALIZABLE transaction
// decides, records, and answers each operation of a worker.
export class LaunchAuthority {
  readonly #store: ControlPlaneStore;
  readonly #settings: LaunchAuthoritySettings;

  constructor(store: ControlPlaneStore, settings: LaunchAuthoritySettings) {
    this.#store = store;
    this.#settings = settings;
  }

  // A store that reaches no decision answers `unavailable`, and the worker
  // repeats the same operation (coordinator decision B6).
  async authorize(principal: WorkerPrincipal, values: LaunchAuthorizationRequest): Promise<Result<LaunchOutcome>> {
    const request: LaunchRequest = Object.freeze({ ...values, workerId: principal.workerId });
    const decided = await this.#store.transaction(async (tx) => {
      const installation = await installationState(tx);
      if (!installation.ok) return installation;
      const workerAuthorized = await isCurrentWorker(tx, principal);
      if (!workerAuthorized.ok) return workerAuthorized;
      const checked = { installation: installation.value, workerAuthorized: workerAuthorized.value };
      const recorded = await tx.launches.byOperation(request.workerId, request.operationId);
      if (!recorded.ok) return recorded;
      if (recorded.value !== undefined) return replay(tx, recorded.value, request, checked);
      const rejected = await tx.launches.rejection(request.workerId, request.operationId);
      if (!rejected.ok) return rejected;
      if (rejected.value !== undefined) return ok(repeatedRejection(rejected.value, request));
      return this.#decide(tx, request, checked);
    });
    // A concurrent decision of the same operation won; a repeat replays it.
    if (!decided.ok && decided.error.code === 'conflict') return err(failure('unavailable', decided.error.message));
    return decided;
  }

  async #decide(tx: ControlPlaneTransaction, request: LaunchRequest, checked: Checked): Promise<Result<LaunchOutcome>> {
    const assignment = await optional(tx.assignments.get(request.assignmentId));
    if (!assignment.ok) return assignment;
    if (assignment.value === undefined) return recordRejection(tx, request, rejectUnknownAssignment(request, checked));
    const task = await tx.tasks.get(assignment.value.reservation.scope.taskId);
    if (!task.ok) return task;
    const context = await this.#context(tx, assignment.value, task.value, checked);
    if (!context.ok) return context;
    const launchAuthId = parseIdentifier('LaunchAuthId', this.#settings.newLaunchAuthId());
    if (!launchAuthId.ok) return launchAuthId;
    const issue = { launchAuthId: launchAuthId.value as LaunchAuthId, issuedAt: await tx.now(), parameters: this.#settings.parameters };
    const authorized = authorizeLaunch(task.value, request, context.value, issue);
    if (!authorized.ok) return recordRejection(tx, request, authorized.error);
    const stored = await tx.tasks.replace(authorized.value.task, task.value.generation);
    return stored.ok ? ok(Object.freeze({ kind: 'granted', grant: authorized.value.grant })) : stored;
  }

  // Every current value, read in the deciding transaction (contract section 3).
  async #context(tx: ControlPlaneTransaction, assignment: Assignment, task: Task, checked: Checked): Promise<Result<LaunchContext>> {
    const stored = await optional(tx.admissions.get(task.admissionId));
    if (!stored.ok) return stored;
    // The assignment names its run, so a missing admission is a rejection;
    // one bound to another run is not the task's current one either.
    const boundRun = await tx.catalog.runOfAdmission(task.admissionId);
    if (!boundRun.ok) return boundRun;
    const runId = assignment.reservation.scope.runId;
    const admission = boundRun.value === runId ? stored.value : undefined;
    const run = await tx.runs.get(runId);
    if (!run.ok) return run.error.code === 'not-found' ? noDecision(run.error.message) : run;
    const definition = this.#settings.workflows.resolve(run.value.binding);
    if (!definition.ok) return noDecision(definition.error.message);
    const currentRevisions = await tx.revisions.current(run.value.id, artifactIdsOf(admission));
    if (!currentRevisions.ok) return currentRevisions;
    return ok({
      ...checked,
      assignment: launchAssignment(assignment),
      reservation: launchReservation(assignment),
      ...(admission === undefined ? {} : { admission }),
      definition: definition.value,
      gates: await tx.gates.listByRun(run.value.id),
      currentRevisions: currentRevisions.value,
      policyRevision: run.value.binding.policyRevision,
    });
  }
}

type Checked = Pick<LaunchContext, 'installation' | 'workerAuthorized'>;

// A recorded grant is answered from its record, never decided again, and
// its deadline is never extended (contract section 6).
async function replay(tx: ControlPlaneTransaction, recorded: RecordedLaunch, request: LaunchRequest, checked: Checked): Promise<Result<LaunchOutcome>> {
  const task = await tx.tasks.get(recorded.taskId);
  if (!task.ok) return task;
  const grant = task.value.attempts.flatMap((attempt) => attempt.executions).flatMap((execution) => execution.grants)
    .find((candidate) => candidate.launchAuthId === recorded.launchAuthId);
  if (grant === undefined) return err(failure('internal', `grant ${recorded.launchAuthId} is not in task ${recorded.taskId}`));
  return ok(replayLaunchOperation(task.value, grant, request, checked, await tx.now()));
}

function repeatedRejection(recorded: RecordedRejection, request: LaunchRequest): LaunchOutcome {
  if (isSameOperation(recorded.request, request)) return Object.freeze({ kind: 'rejected', rejection: recorded.rejection });
  const rejection = launchRejection('operation-mismatch', `operation ${request.operationId} was recorded with other values`);
  return Object.freeze({ kind: 'rejected', rejection });
}

// A non-retryable rejection is final for its operation, so it commits with
// the request; a retryable one is retried under a new operation.
async function recordRejection(tx: ControlPlaneTransaction, request: LaunchRequest, rejection: LaunchRejection): Promise<Result<LaunchOutcome>> {
  if (!rejection.retryable) {
    const recorded = await tx.launches.recordRejection({ request, rejection });
    if (!recorded.ok) return recorded;
  }
  return ok(Object.freeze({ kind: 'rejected', rejection }));
}

function isSameOperation(recorded: LaunchRequest, request: LaunchRequest): boolean {
  const compared = ['operationId', 'workerId', 'recoveryEpoch', 'assignmentId', 'attemptId', 'ownershipGeneration', 'executionId',
    'admissionId', 'admissionGeneration'] as const;
  return compared.every((field) => recorded[field] === request[field]);
}

// The worker as the deciding transaction reads it: enrolled, unrevoked, and
// at its current generation (contract section 2), not a predecessor's.
async function isCurrentWorker(tx: ControlPlaneTransaction, principal: WorkerPrincipal): Promise<Result<boolean>> {
  const worker = await tx.fleet.worker(principal.workerId);
  if (!worker.ok) return worker;
  if (worker.value === undefined) return ok(false);
  return ok(worker.value.revokedAt === undefined && worker.value.credentials.current.generation === principal.generation);
}

// A stored run without its workflow reaches no decision; the worker retries
// until its deadline (contract section 7).
function noDecision(message: string): Result<never> {
  return err(failure('unavailable', message));
}

async function installationState(tx: ControlPlaneTransaction): Promise<Result<InstallationState>> {
  const epoch = await tx.installation.recoveryEpoch();
  const recoveryEpoch = epoch === undefined ? undefined : parseRecoveryEpoch(epoch);
  if (recoveryEpoch === undefined || !recoveryEpoch.ok) return err(failure('internal', 'the installation has no valid recovery epoch'));
  return ok(Object.freeze({ recoveryEpoch: recoveryEpoch.value, quarantined: await tx.installation.quarantined() }));
}

function artifactIdsOf(admission: TaskAdmission | undefined) {
  return admission === undefined ? [] : admission.artifacts.map((revision) => revision.artifactId);
}

async function optional<Value>(read: Promise<Result<Value>>): Promise<Result<Value | undefined>> {
  const result = await read;
  if (!result.ok && result.error.code === 'not-found') return ok(undefined);
  return result;
}
