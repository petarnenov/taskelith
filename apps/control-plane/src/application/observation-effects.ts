import { createHash } from 'node:crypto';
import { SUPPORTED_PROTOCOL_VERSIONS, commonProtocolVersion, type MessageSchemas } from '@taskelith/contracts';
import {
  decideStartObservation,
  endAttempt,
  executionsUnderAssignment,
  isQuarantineEvidence,
  parseExitStatus,
  parseRecoveryEpoch,
  recordExecutionEvidence,
  recordExit,
  recordNotStarted,
  recordStartObservation,
  type AssignmentId,
  type AttemptId,
  type ExecutionEvidenceKind,
  type ExecutionId,
  type ExecutionReport,
  type LaunchAuthId,
  type LaunchGrant,
  type ObservationResult,
  type StartContext,
  type StartDecision,
  type StartObservation,
  type StartRecord,
  type Task,
} from '@taskelith/execution';
import { decideWorkerAdmission } from '@taskelith/fleet';
import { err, failure, ok, type EventId, type Failure, type Instant, type Result } from '@taskelith/kernel';
import {
  acceptAssignment,
  cancelExecutionInTransaction,
  refuseInTransaction,
  releaseInTransaction,
  type Assignment,
  type HardControl,
  type Refusal,
  type ReleaseRequest,
} from '@taskelith/scheduling';
import { freeIdleAssignment } from './assignment-freeing.js';
import type { ControlPlaneTransaction } from './control-plane-store.js';
import { requestInventory } from './inventory-reconciliation.js';
import type { ReconciliationContext } from './journal-reconciliation.js';
import { grantIn, installationState } from './launch-authority.js';
import type { Observation } from './observation.js';
import { followAttemptEnd } from './task-ending.js';

// What each consumed observation type changes, inside the transaction that
// records it; a domain refusal makes the observation `rejected`.
export type ObservationEffect = (
  tx: ControlPlaneTransaction, observation: Observation, at: Instant, context: ReconciliationContext,
) => Promise<Result<void>>;

type Payload<Name extends keyof MessageSchemas> = MessageSchemas[Name];

// A fact about one execution, and the end of its attempt that it implies
// beyond the fact itself, if any.
interface TerminalFact {
  readonly executionId: ExecutionId;
  record(task: Task): Result<ObservationResult>;
  end(task: Task): Result<Task>;
}

const OFFER = 'execution.assignment.offer';

// Item 21d D2: the launch rejections that release the assignment, and those
// that request the worker's inventory; any other one is only recorded.
const RELEASING_REJECTIONS: ReadonlySet<string> = new Set([
  'worker-not-authorized', 'stale-recovery-epoch', 'capacity-not-reserved', 'admission-not-current', 'gate-not-passed',
  'artifact-revision-changed', 'policy-revision-changed',
]);
const RECONCILING_REJECTIONS: ReadonlySet<string> = new Set(['stale-recovery-epoch', 'execution-conflict']);
const STALE_GENERATION = 'stale-ownership-generation';

async function acceptance(tx: ControlPlaneTransaction, observation: Observation, at: Instant): Promise<Result<void>> {
  const { assignmentId } = observation.payload as Payload<'AssignmentAcceptedPayload'>;
  const current = await currentAssignment(tx, observation, assignmentId as AssignmentId);
  if (!current.ok) return current;
  const assignment = current.value;
  const { workerId, journalId, sequence } = observation.position;
  const accepted = acceptAssignment(assignment, assignment.generation, workerId, at, { journalId, sequence });
  return accepted.ok ? tx.assignments.replace(accepted.value, assignment.generation) : accepted;
}

async function refusal(tx: ControlPlaneTransaction, observation: Observation, at: Instant): Promise<Result<void>> {
  const payload = observation.payload as Payload<'AssignmentRefusedPayload'>;
  const current = await currentAssignment(tx, observation, payload.assignmentId as AssignmentId);
  if (!current.ok) return current;
  const refused = await refuse(tx, observation, current.value, payload.reason);
  return refused.ok ? recordRefusalCause(tx, observation, payload.reason, at) : refused;
}

// Capacity reservation section 8: a refusal for slots or capacity makes
// the worker ineligible, and one for pressure records its pressure.
function recordRefusalCause(tx: ControlPlaneTransaction, observation: Observation, reason: Refusal['reason'], at: Instant): Promise<Result<void>> {
  const { workerId, sequence } = observation.position;
  if (reason === 'worker-slots-exhausted' || reason === 'worker-capacity-exhausted') return tx.reports.markCapacityRefused(workerId, sequence, at);
  if (reason === 'worker-admission-pressure') return tx.reports.enterPressure(workerId, sequence, at);
  return Promise.resolve(ok(undefined));
}

// Wire contracts section 3: an offer the worker cannot read refuses its
// assignment, and the worker keeps only a version both windows share.
async function commandRejection(tx: ControlPlaneTransaction, observation: Observation): Promise<Result<void>> {
  const payload = observation.payload as Payload<'CommandRejectedPayload'>;
  if (payload.commandType !== OFFER || payload.reason !== 'protocol-not-supported') {
    return err(failure('precondition-failed', `a rejection of ${payload.commandType} for ${payload.reason} changes nothing`));
  }
  const offered = await tx.assignments.byOfferCommand(payload.commandId as EventId);
  if (!offered.ok) return offered;
  const refused = await refuse(tx, observation, offered.value, 'protocol-not-supported');
  if (!refused.ok) return refused;
  const { workerId, sequence } = observation.position;
  return tx.reports.setProtocolVersion(workerId, commonProtocolVersion(payload.supportedProtocolVersions, SUPPORTED_PROTOCOL_VERSIONS), sequence);
}

// The owner's decision for 21b: every exit ends its attempt.
async function exit(tx: ControlPlaneTransaction, observation: Observation, at: Instant): Promise<Result<void>> {
  const payload = observation.payload as Payload<'ExecutionExitedPayload'>;
  const status = parseExitStatus(payload.status);
  if (!status.ok) return status;
  const report = { ...executionReport(observation, payload.executionId), status: status.value, startProven: payload.startProven, spawnFailed: payload.spawnFailed };
  const attemptId = observation.attemptId!;
  return recordTerminalFact(tx, observation, at, {
    executionId: report.executionId,
    record: (task) => recordExit(task, report, at),
    end: (task) => (hasEnded(task, attemptId) ? ok(task) : endAttempt(task, attemptId, at)),
  });
}

// A `not-started` alone ends nothing; a cancelled attempt ends with it.
function notStarted(tx: ControlPlaneTransaction, observation: Observation, at: Instant): Promise<Result<void>> {
  const report = executionReport(observation, (observation.payload as Payload<'ExecutionNotStartedPayload'>).executionId);
  return recordTerminalFact(tx, observation, at, {
    executionId: report.executionId, record: (task) => recordNotStarted(task, report, at), end: (task) => ok(task),
  });
}

// Decision 13: the capacity, the protocol version, and the end of a
// capacity refusal, each under its own sequence fence.
async function capacityDeclaration(tx: ControlPlaneTransaction, observation: Observation): Promise<Result<void>> {
  const { capacity, protocolVersions } = observation.payload as Payload<'CapacityDeclaredPayload'>;
  const { slots, cpuMillicores, memoryMebibytes, enforceableControls } = capacity;
  const { workerId, sequence } = observation.position;
  const declared = await tx.reports.declareCapacity(workerId, {
    slots, cpuMillicores, memoryMebibytes, controls: enforceableControls as HardControl[],
  }, sequence);
  if (!declared.ok) return declared;
  const versioned = await tx.reports.setProtocolVersion(workerId, commonProtocolVersion(protocolVersions, SUPPORTED_PROTOCOL_VERSIONS), sequence);
  return versioned.ok ? tx.reports.clearCapacityRefusal(workerId, sequence) : versioned;
}

function pressureChange(tx: ControlPlaneTransaction, observation: Observation, at: Instant): Promise<Result<void>> {
  const { causes } = observation.payload as Payload<'AdmissionPressureChangedPayload'>;
  const { workerId, sequence } = observation.position;
  return causes.length === 0 ? tx.reports.leavePressure(workerId, sequence) : tx.reports.enterPressure(workerId, sequence, at);
}

// Worker admission contract section 5: the enrolled platform refutes a
// not-applicable claim that the worker's own facts could not make.
async function selfCheckReport(tx: ControlPlaneTransaction, observation: Observation, at: Instant): Promise<Result<void>> {
  const { results } = observation.payload as Payload<'SelfCheckReportedPayload'>;
  const { workerId, sequence } = observation.position;
  const worker = await tx.fleet.worker(workerId);
  if (!worker.ok) return worker;
  if (worker.value === undefined) return err(failure('not-found', `worker ${workerId} is not enrolled`, { worker: workerId }));
  const decision = decideWorkerAdmission(results, worker.value.host.platform);
  const recorded = await tx.workerAdmissions.record(workerId, decision, sequence, at);
  if (!recorded.ok) return recorded;
  const appliedFailure = recorded.value === 'applied' && decision.state === 'self-check-failed';
  return appliedFailure ? freeUngrantedAssignments(tx, observation) : ok(undefined);
}

// Worker admission section 7: a worker whose self-check failed launches
// nothing, so each assignment without a grant is freed; a granted one stays.
async function freeUngrantedAssignments(tx: ControlPlaneTransaction, observation: Observation): Promise<Result<void>> {
  for (const assignment of await tx.assignments.listUnfinishedByWorker(observation.position.workerId)) {
    const task = await tx.tasks.get(assignment.reservation.scope.taskId);
    if (!task.ok) return task;
    if (executionsUnderAssignment(task.value, assignment.id).granted) continue;
    const freed = await freeIdleAssignment(tx, assignment, commandIdentity(observation, assignment.id));
    if (!freed.ok) return freed;
  }
  return ok(undefined);
}

// 21c decisions 14 and 15: the evidence beside the execution's state; the
// domain refuses it for a terminal execution.
function executionEvidence(kind: ExecutionEvidenceKind): ObservationEffect {
  return async (tx, observation, at) => {
    const { executionId } = observation.payload as { readonly executionId: string };
    const loaded = await attemptTask(tx, observation);
    if (!loaded.ok) return loaded;
    const task = loaded.value;
    if (!holdsExecution(task, observation.attemptId!, executionId as ExecutionId)) {
      return err(failure('not-found', `attempt ${observation.attemptId} has no execution ${executionId}`, { execution: executionId }));
    }
    const recorded = recordExecutionEvidence(task, { ...executionReport(observation, executionId), kind }, at);
    return recorded.ok ? tx.tasks.replace(recorded.value.task, task.generation) : recorded;
  };
}

// 21c decision 13 and 21d D5: never current work, at any epoch; recorded
// for the reconciliation queue beside its warning, with its epoch.
async function unrecordedProcess(
  tx: ControlPlaneTransaction, observation: Observation, at: Instant, context: ReconciliationContext,
): Promise<Result<void>> {
  const { containment, recoveryEpoch, processes } = observation.payload as Payload<'UnrecordedProcessPayload'>;
  const { workerId, journalId, observationId } = observation.position;
  context.log.warn({ workerId, observationId, correlationId: observation.correlationId }, 'execution.unrecorded-process', {
    containment, recoveryEpoch, processCount: processes.length,
  });
  return tx.unrecordedProcesses.record({ workerId, journalId, observationId, containment, processCount: processes.length, recordedAt: at });
}

// Item 21d D1: decided as launch authorization section 7 requires, by the
// grant its `launchAuthId` names; only an unauthorized start sends a command.
async function start(tx: ControlPlaneTransaction, observation: Observation, at: Instant, context: ReconciliationContext): Promise<Result<void>> {
  const payload = observation.payload as Payload<'ExecutionStartedPayload'>;
  const loaded = await attemptTask(tx, observation);
  if (!loaded.ok) return loaded;
  const recoveryEpoch = parseRecoveryEpoch(payload.recoveryEpoch);
  if (!recoveryEpoch.ok) return recoveryEpoch;
  const launchAuthId = payload.launchAuthId as LaunchAuthId;
  const reported: StartObservation = {
    workerId: observation.position.workerId, launchAuthId, executionId: payload.executionId as ExecutionId, recoveryEpoch: recoveryEpoch.value,
  };
  const startContext = await startContextOf(tx, launchAuthId);
  if (!startContext.ok) return startContext;
  const task = loaded.value;
  const recorded = recordStart(task, reported, startContext.value, at);
  if (!recorded.ok) return recorded;
  if (recorded.value.task !== task) {
    const stored = await tx.tasks.replace(recorded.value.task, task.generation);
    if (!stored.ok) return stored;
  }
  return followStart(tx, observation, recorded.value.decision, context);
}

async function startContextOf(tx: ControlPlaneTransaction, launchAuthId: LaunchAuthId): Promise<Result<Omit<StartContext, 'task'>>> {
  const installation = await installationState(tx);
  if (!installation.ok) return installation;
  const grant = await namedGrant(tx, launchAuthId);
  if (!grant.ok) return grant;
  return ok({ installation: installation.value, ...(grant.value === undefined ? {} : { grant: grant.value }) });
}

// The grant the authority recorded under that identity, if any.
async function namedGrant(tx: ControlPlaneTransaction, launchAuthId: LaunchAuthId): Promise<Result<LaunchGrant | undefined>> {
  const recorded = await tx.launches.byLaunchAuthId(launchAuthId);
  if (!recorded.ok || recorded.value === undefined) return recorded.ok ? ok(undefined) : recorded;
  const task = await tx.tasks.get(recorded.value.taskId);
  return task.ok ? ok(grantIn(task.value, launchAuthId)) : task;
}

// An execution the task does not hold is decided without being recorded.
function recordStart(task: Task, observation: StartObservation, context: Omit<StartContext, 'task'>, at: Instant): Result<StartRecord> {
  const held = task.attempts.some((attempt) => attempt.executions.some(({ id }) => id === observation.executionId));
  if (held) return recordStartObservation(task, observation, context, at);
  return ok(Object.freeze({ decision: decideStartObservation(observation, { ...context, task }), task }));
}

async function followStart(
  tx: ControlPlaneTransaction, observation: Observation, decision: StartDecision, context: ReconciliationContext,
): Promise<Result<void>> {
  if (decision === 'started' || decision === 'historical' || decision === 'duplicate') return ok(undefined);
  const { executionId, launchAuthId, assignmentId } = observation.payload as Payload<'ExecutionStartedPayload'>;
  const { workerId, observationId } = observation.position;
  context.log.warn({ workerId, observationId, correlationId: observation.correlationId }, 'execution.start.evidence', {
    decision, executionId, launchAuthId,
  });
  return decision === 'unauthorized-start' ? cancelUnauthorizedStart(tx, observation, assignmentId as AssignmentId, executionId as ExecutionId) : ok(undefined);
}

// The cancellation goes to the reporting worker, under its assignment.
async function cancelUnauthorizedStart(
  tx: ControlPlaneTransaction, observation: Observation, assignmentId: AssignmentId, executionId: ExecutionId,
): Promise<Result<void>> {
  const current = await reportersAssignment(tx, observation, assignmentId);
  if (!current.ok) return current;
  return cancelExecutionInTransaction(tx, commandIdentity(observation, assignmentId), executionId);
}

// The current assignment, only when the reporting worker holds it.
async function reportersAssignment(tx: ControlPlaneTransaction, observation: Observation, assignmentId: AssignmentId): Promise<Result<Assignment>> {
  const current = await currentAssignment(tx, observation, assignmentId);
  if (!current.ok) return current;
  if (current.value.workerId !== observation.position.workerId) {
    return err(failure('forbidden', `assignment ${assignmentId} is held by another worker`, { assignment: assignmentId }));
  }
  return current;
}

// Item 21d D2: the authority recorded no grant; each reason acts as launch
// authorization section 9 says, and a re-admission is a release in G2.
async function launchRejection(
  tx: ControlPlaneTransaction, observation: Observation, _at: Instant, context: ReconciliationContext,
): Promise<Result<void>> {
  const { assignmentId, executionId, reason } = observation.payload as Payload<'LaunchRejectedPayload'>;
  const current = await reportersAssignment(tx, observation, assignmentId as AssignmentId);
  if (!current.ok) return current;
  const { workerId, observationId } = observation.position;
  context.log.warn({ workerId, observationId, correlationId: observation.correlationId }, 'execution.launch.rejected', {
    assignmentId, executionId, reason,
  });
  const cleared = await clearRefusal(tx, observation);
  if (!cleared.ok) return cleared;
  if (RELEASING_REJECTIONS.has(reason)) {
    const released = await releaseRejected(tx, observation, current.value);
    if (!released.ok) return released;
  }
  return RECONCILING_REJECTIONS.has(reason) ? requestInventory(tx, workerId, context) : ok(undefined);
}

// An assignment that already ended is not released again.
function releaseRejected(tx: ControlPlaneTransaction, observation: Observation, assignment: Assignment): Promise<Result<void>> {
  if (assignment.state === 'ended') return Promise.resolve(ok(undefined));
  return freeIdleAssignment(tx, assignment, commandIdentity(observation, assignment.id));
}

// Launch authorization section 7: an execution observation of another epoch,
// or received in quarantine, is kept as evidence and applies nothing.
function atCurrentEpoch(effect: ObservationEffect): ObservationEffect {
  return async (tx, observation, at, context) => {
    const recoveryEpoch = parseRecoveryEpoch((observation.payload as { readonly recoveryEpoch: number }).recoveryEpoch);
    if (!recoveryEpoch.ok) return recoveryEpoch;
    const installation = await installationState(tx);
    if (!installation.ok) return installation;
    if (!isQuarantineEvidence(recoveryEpoch.value, installation.value)) return effect(tx, observation, at, context);
    const { workerId, observationId } = observation.position;
    context.log.warn({ workerId, observationId, correlationId: observation.correlationId }, 'execution.observation.evidence', {
      observationType: observation.type, recoveryEpoch: recoveryEpoch.value,
      currentEpoch: installation.value.recoveryEpoch, quarantined: installation.value.quarantined,
    });
    return ok(undefined);
  };
}

// Item 21d D3: a revoked worker takes no new work, so an observation that
// would give it some is refused.
function forWorkingProducer(effect: ObservationEffect): ObservationEffect {
  return async (tx, observation, at, context) => {
    const { workerId } = observation.position;
    const worker = await tx.fleet.worker(workerId);
    if (!worker.ok) return worker;
    if (worker.value?.revokedAt === undefined) return effect(tx, observation, at, context);
    return err(failure('forbidden', `worker ${workerId} is revoked and takes no new work`, { worker: workerId, reason: 'worker-revoked' }));
  };
}

export const OBSERVATION_EFFECTS: Readonly<Record<string, ObservationEffect>> = Object.freeze({
  'execution.uncertain': atCurrentEpoch(executionEvidence('uncertain')),
  'execution.termination-unproven': atCurrentEpoch(executionEvidence('termination-unproven')),
  'execution.cancellation.not-applied': atCurrentEpoch(executionEvidence('cancellation-not-applied')),
  'execution.unrecorded-process': unrecordedProcess,
  'execution.assignment.accepted': forWorkingProducer(acceptance),
  'execution.assignment.refused': refusal,
  'execution.command.rejected': commandRejection,
  'execution.started': start,
  'execution.launch.rejected': launchRejection,
  'execution.exited': atCurrentEpoch(exit),
  'execution.not-started': atCurrentEpoch(notStarted),
  'worker.capacity.declared': forWorkingProducer(capacityDeclaration),
  'worker.admission-pressure.changed': forWorkingProducer(pressureChange),
  'worker.self-check.reported': forWorkingProducer(selfCheckReport),
});

// The assignment the payload names, of the observed attempt, at the
// observed generation, which is also its task's (decision 5).
async function currentAssignment(tx: ControlPlaneTransaction, observation: Observation, assignmentId: AssignmentId): Promise<Result<Assignment>> {
  const assignment = await tx.assignments.get(assignmentId);
  if (!assignment.ok) return assignment;
  if (assignment.value.attemptId !== observation.attemptId) {
    return err(failure('not-found', `assignment ${assignmentId} is not of attempt ${observation.attemptId}`, { assignment: assignmentId }));
  }
  const fresh = checkGeneration(assignment.value.ownershipGeneration, observation);
  if (!fresh.ok) return fresh;
  const task = await tx.tasks.get(assignment.value.reservation.scope.taskId);
  if (!task.ok) return task;
  const current = checkGeneration(task.value.ownershipGeneration, observation);
  return current.ok ? assignment : current;
}

// The task of the observed attempt, found through its assignments.
async function attemptTask(tx: ControlPlaneTransaction, observation: Observation): Promise<Result<Task>> {
  const [placed] = await tx.assignments.listByAttempt(observation.attemptId!);
  if (placed === undefined) return err(failure('not-found', `attempt ${observation.attemptId} has no assignment`, { attempt: observation.attemptId! }));
  const task = await tx.tasks.get(placed.reservation.scope.taskId);
  if (!task.ok) return task;
  const current = checkGeneration(task.value.ownershipGeneration, observation);
  return current.ok ? task : current;
}

function checkGeneration(current: number, observation: Observation): Result<void> {
  if (current === observation.ownershipGeneration) return ok(undefined);
  return err(failure('conflict', `the observation is at ownership generation ${observation.ownershipGeneration}, not ${current}`, {
    reason: STALE_GENERATION,
  }));
}

// Decision 10: the refusal ends the assignment as Scheduling decides.
async function refuse(tx: ControlPlaneTransaction, observation: Observation, assignment: Assignment, reason: Refusal['reason']): Promise<Result<void>> {
  const refusal = { workerId: observation.position.workerId, reason };
  const refused = await refuseInTransaction(tx, commandIdentity(observation, assignment.id), refusal);
  return refused.ok ? ok(undefined) : refused;
}

// A command the observation sends about one assignment: unique per pair.
function commandIdentity(observation: Observation, assignmentId: AssignmentId): ReleaseRequest {
  const commandId = `e${createHash('sha256').update(JSON.stringify([observation.messageId, assignmentId])).digest('hex')}` as EventId;
  return { assignmentId, commandId, correlationId: observation.correlationId };
}

function executionReport(observation: Observation, executionId: string): ExecutionReport {
  return { workerId: observation.position.workerId, executionId: executionId as ExecutionId };
}

// Decision 12: the fact, the end of the worker's capacity refusal, the
// releases, and a retry or the delegation's close once the attempt ended.
async function recordTerminalFact(tx: ControlPlaneTransaction, observation: Observation, at: Instant, fact: TerminalFact): Promise<Result<void>> {
  const loaded = await attemptTask(tx, observation);
  if (!loaded.ok) return loaded;
  const task = loaded.value;
  const attemptId = observation.attemptId!;
  if (!holdsExecution(task, attemptId, fact.executionId)) {
    return err(failure('not-found', `attempt ${attemptId} has no execution ${fact.executionId}`, { execution: fact.executionId }));
  }
  const recorded = fact.record(task);
  if (!recorded.ok || recorded.value.effect === 'duplicate') return recorded.ok ? ok(undefined) : recorded;
  const next = await storeChanges(tx, task, [() => ok(recorded.value.task), fact.end]);
  if (!next.ok) return next;
  const cleared = await clearRefusal(tx, observation);
  if (!cleared.ok) return cleared;
  const released = await releaseAssignments(tx, observation, next.value);
  if (!released.ok) return released;
  return hasEnded(task, attemptId) || !hasEnded(next.value, attemptId) ? ok(undefined) : followAttemptEnd(tx, next.value, attemptId, at);
}

// Capacity reservation section 8: the producer's own refusal, by its fence.
function clearRefusal(tx: ControlPlaneTransaction, observation: Observation): Promise<Result<void>> {
  const { workerId, sequence } = observation.position;
  return tx.reports.clearCapacityRefusal(workerId, sequence);
}

type Holding = (tx: ControlPlaneTransaction, observation: Observation) => Promise<Result<boolean>>;

// The clear, only for a fact about an assignment the producer holds; a
// failed lookup fails the effect, so the observation is delivered again.
function clearOwnRefusal(holds: Holding): ObservationEffect {
  return async (tx, observation) => {
    const held = await holds(tx, observation);
    if (!held.ok) return held;
    return held.value ? clearRefusal(tx, observation) : ok(undefined);
  };
}

// The assignment the payload names, of the observed attempt; only an
// unknown one is not held.
const namedAssignmentHeld: Holding = async (tx, observation) => {
  const { assignmentId } = observation.payload as Payload<'LaunchRejectedPayload'>;
  const named = await tx.assignments.get(assignmentId as AssignmentId);
  if (!named.ok) return named.error.code === 'not-found' ? ok(false) : named;
  return ok(named.value.attemptId === observation.attemptId && named.value.workerId === observation.position.workerId);
};

// Any assignment of the observed attempt.
const attemptAssignmentHeld: Holding = async (tx, observation) => ok(
  (await tx.assignments.listByAttempt(observation.attemptId!)).some(({ workerId }) => workerId === observation.position.workerId),
);

// Capacity reservation section 8: the facts that prove a worker's slot free,
// each under the epoch gate its applied effect has.
const SLOT_FREEING: Readonly<Record<string, ObservationEffect>> = Object.freeze({
  'execution.launch.rejected': clearOwnRefusal(namedAssignmentHeld),
  'execution.not-started': atCurrentEpoch(clearOwnRefusal(attemptAssignmentHeld)),
  'execution.exited': atCurrentEpoch(clearOwnRefusal(attemptAssignmentHeld)),
});

// The effect of an observation the domain refused: a stale slot-freeing
// fact still clears its producer's capacity refusal, and nothing else.
export function rejectedEffect(observation: Observation, refusal: Failure): ObservationEffect | undefined {
  return refusal.details.reason === STALE_GENERATION ? SLOT_FREEING[observation.type] : undefined;
}

// Stores each change that changes the task, one generation at a time.
async function storeChanges(tx: ControlPlaneTransaction, task: Task, changes: readonly ((task: Task) => Result<Task>)[]): Promise<Result<Task>> {
  let current = task;
  for (const change of changes) {
    const next = change(current);
    if (!next.ok) return next;
    if (next.value === current) continue;
    const stored = await tx.tasks.replace(next.value, current.generation);
    if (!stored.ok) return stored;
    current = next.value;
  }
  return ok(current);
}

// Each held reservation of the attempt whose end, or whose assignment's
// end, allows it; `kept` while an execution under it can still run.
async function releaseAssignments(tx: ControlPlaneTransaction, observation: Observation, task: Task): Promise<Result<void>> {
  const attemptId = observation.attemptId!;
  const attemptEnded = hasEnded(task, attemptId);
  for (const assignment of await tx.assignments.listByAttempt(attemptId)) {
    if (assignment.reservation.state !== 'held' || !(attemptEnded || assignment.state === 'ended')) continue;
    const released = await releaseInTransaction(tx, commandIdentity(observation, assignment.id));
    if (!released.ok) return released;
  }
  return ok(undefined);
}

function holdsExecution(task: Task, attemptId: AttemptId, executionId: ExecutionId): boolean {
  return task.attempts.some((attempt) => attempt.id === attemptId && attempt.executions.some(({ id }) => id === executionId));
}

function hasEnded(task: Task, attemptId: AttemptId): boolean {
  return task.attempts.some((attempt) => attempt.id === attemptId && attempt.outcome !== undefined);
}
