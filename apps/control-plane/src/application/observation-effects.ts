import { createHash } from 'node:crypto';
import { SUPPORTED_PROTOCOL_VERSIONS, commonProtocolVersion, type MessageSchemas } from '@taskelith/contracts';
import {
  endAttempt,
  openAttempt,
  parseExitStatus,
  recordExit,
  recordNotStarted,
  type AssignmentId,
  type AttemptId,
  type ExecutionId,
  type ExecutionReport,
  type ObservationResult,
  type Task,
} from '@taskelith/execution';
import { err, failure, ok, type EventId, type Instant, type Result } from '@taskelith/kernel';
import {
  acceptAssignment,
  automaticRetryOf,
  refuseInTransaction,
  releaseInTransaction,
  type Assignment,
  type HardControl,
  type Refusal,
  type ReleaseRequest,
} from '@taskelith/scheduling';
import { nextAttemptIdOf } from './attempt-identities.js';
import type { ControlPlaneTransaction } from './control-plane-store.js';
import type { Observation } from './observation.js';
import { closeDelegationOf } from './task-ending.js';

// What each consumed observation type changes, inside the transaction that
// records it; a domain refusal makes the observation `rejected`.
export type ObservationEffect = (tx: ControlPlaneTransaction, observation: Observation, at: Instant) => Promise<Result<void>>;

type Payload<Name extends keyof MessageSchemas> = MessageSchemas[Name];

// A fact about one execution, and the end of its attempt that it implies
// beyond the fact itself, if any.
interface TerminalFact {
  readonly executionId: ExecutionId;
  record(task: Task): Result<ObservationResult>;
  end(task: Task): Result<Task>;
}

const OFFER = 'execution.assignment.offer';

async function acceptance(tx: ControlPlaneTransaction, observation: Observation, at: Instant): Promise<Result<void>> {
  const { assignmentId } = observation.payload as Payload<'AssignmentAcceptedPayload'>;
  const current = await currentAssignment(tx, observation, assignmentId as AssignmentId);
  if (!current.ok) return current;
  const assignment = current.value;
  const accepted = acceptAssignment(assignment, assignment.generation, observation.position.workerId, at);
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

export const OBSERVATION_EFFECTS: Readonly<Record<string, ObservationEffect>> = Object.freeze({
  'execution.assignment.accepted': acceptance,
  'execution.assignment.refused': refusal,
  'execution.command.rejected': commandRejection,
  'execution.exited': exit,
  'execution.not-started': notStarted,
  'worker.capacity.declared': capacityDeclaration,
  'worker.admission-pressure.changed': pressureChange,
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
    reason: 'stale-ownership-generation',
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
  const { workerId, sequence } = observation.position;
  const cleared = await tx.reports.clearCapacityRefusal(workerId, sequence);
  if (!cleared.ok) return cleared;
  const released = await releaseAssignments(tx, observation, next.value);
  if (!released.ok) return released;
  return hasEnded(task, attemptId) || !hasEnded(next.value, attemptId) ? ok(undefined) : followEnd(tx, next.value, attemptId, at);
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

// An automatic retry opens under the next derived attempt identity; a task
// without one is terminal, and its delegation closes.
async function followEnd(tx: ControlPlaneTransaction, task: Task, attemptId: AttemptId, at: Instant): Promise<Result<void>> {
  if (!automaticRetryOf(task, attemptId)) return closeDelegationOf(tx, task.id, at);
  const retry = openAttempt(task, task.ownershipGeneration, { id: nextAttemptIdOf(task), retryOf: attemptId }, at);
  return retry.ok ? tx.tasks.replace(retry.value, task.generation) : retry;
}

function holdsExecution(task: Task, attemptId: AttemptId, executionId: ExecutionId): boolean {
  return task.attempts.some((attempt) => attempt.id === attemptId && attempt.executions.some(({ id }) => id === executionId));
}

function hasEnded(task: Task, attemptId: AttemptId): boolean {
  return task.attempts.some((attempt) => attempt.id === attemptId && attempt.outcome !== undefined);
}
