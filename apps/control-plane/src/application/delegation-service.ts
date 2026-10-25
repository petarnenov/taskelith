import type { HttpSchemas } from '@taskelith/contracts';
import type { WorkerId } from '@taskelith/execution';
import type { WorkerPrincipal } from '@taskelith/fleet';
import { err, failure, ok, parseIdentifier, type CorrelationId, type Instant, type Result } from '@taskelith/kernel';
import {
  admitDelegation,
  isAwaitingCapacity,
  isSameDelegation,
  recordDelegation,
  redecideDelegation,
  type Assignment,
  type DelegationId,
  type DelegationOutcome,
  type DelegationRecord,
  type DelegationValues,
} from '@taskelith/scheduling';
import { parseOwnershipGeneration, type JsonObject, type TaskId } from '@taskelith/sdlc';
import type { ControlPlaneStore, ControlPlaneTransaction } from './control-plane-store.js';
import { admissionView, admitTask, appendAdmissionUsed, openAdmittedTask, parseTaskRequest, type ParsedTaskRequest } from './task-creation.js';
import { checkCredential } from './worker-credential.js';

export type DelegationRequestBody = HttpSchemas['DelegationRequest'];
export type DelegationAnswer = HttpSchemas['DelegationOutcome'];
type RejectionReason = Extract<DelegationAnswer, { state: 'rejected' }>['reason'];

interface Delegation {
  readonly delegationId: DelegationId;
  readonly workerId: WorkerId;
  readonly values: DelegationValues;
  readonly child: ParsedTaskRequest;
  readonly childTaskId: TaskId;
  readonly correlationId: CorrelationId;
}

// Item 16, coordinator decision Q7: a worker delegates a child task of the
// attempt it holds; a repeat by delegationId answers the stored state.
export class DelegationService {
  readonly #store: ControlPlaneStore;

  constructor(store: ControlPlaneStore) {
    this.#store = store;
  }

  requestDelegation(principal: WorkerPrincipal, body: DelegationRequestBody, correlationId: CorrelationId): Promise<Result<DelegationAnswer>> {
    const delegation = parseDelegation(principal.workerId, body, correlationId);
    if (!delegation.ok) return Promise.resolve(delegation);
    return this.#store.transaction(async (tx) => {
      const credential = await checkCredential(tx, principal);
      if (!credential.ok) return credential;
      const parent = await heldParent(tx, delegation.value);
      if (!parent.ok) return parent;
      const stored = await tx.delegations.get(delegation.value.delegationId);
      if (stored.ok) return repeat(tx, stored.value, delegation.value, parent.value);
      if (stored.error.code !== 'not-found') return stored;
      const waitingSince = await tx.now();
      const outcome = await decide(tx, delegation.value, parent.value, waitingSince);
      if (!outcome.ok) return outcome;
      const { delegationId, workerId, values } = delegation.value;
      const record = recordDelegation({ delegationId, workerId, values, waitingSince }, outcome.value);
      const added = await tx.delegations.add(record);
      return added.ok ? answerOf(tx, record) : added;
    });
  }
}

function parseDelegation(workerId: WorkerId, body: DelegationRequestBody, correlationId: CorrelationId): Result<Delegation> {
  const delegationId = parseIdentifier('DelegationId', body.delegationId);
  if (!delegationId.ok) return delegationId;
  const attemptId = parseIdentifier('AttemptId', body.attemptId);
  if (!attemptId.ok) return attemptId;
  const ownershipGeneration = parseOwnershipGeneration(body.ownershipGeneration);
  if (!ownershipGeneration.ok) return ownershipGeneration;
  const childTaskId = parseIdentifier('TaskId', body.child.taskId);
  if (!childTaskId.ok) return childTaskId;
  const child = parseTaskRequest(body.runId, body.child);
  if (!child.ok) return child;
  const values: DelegationValues = {
    attemptId: attemptId.value,
    ownershipGeneration: ownershipGeneration.value,
    runId: child.value.runId,
    child: JSON.parse(JSON.stringify(body.child)) as JsonObject,
  };
  return ok({ delegationId: delegationId.value, workerId, values, child: child.value, childTaskId: childTaskId.value, correlationId });
}

// Contract section 7: the parent is the task of the attempt for which this
// worker's assignment holds a reservation at the named ownership.
async function heldParent(tx: ControlPlaneTransaction, delegation: Delegation): Promise<Result<Assignment>> {
  const { attemptId, ownershipGeneration } = delegation.values;
  const assignments = await tx.assignments.listByAttempt(attemptId);
  const held = assignments.find((assignment) => assignment.workerId === delegation.workerId
    && assignment.reservation.state === 'held' && assignment.ownershipGeneration === ownershipGeneration);
  if (held !== undefined) return ok(held);
  return err(failure('forbidden', `the worker does not hold attempt ${attemptId} at ownership generation ${ownershipGeneration}`, {
    attempt: attemptId,
  }));
}

// Another request under the same identity is `conflict`; a waiting one is
// decided again from the stored start of its wait.
async function repeat(
  tx: ControlPlaneTransaction,
  stored: DelegationRecord,
  delegation: Delegation,
  parent: Assignment,
): Promise<Result<DelegationAnswer>> {
  if (!isSameDelegation(stored, delegation.workerId, delegation.values)) {
    return err(failure('conflict', `delegation ${stored.delegationId} was requested with other values`, { delegation: stored.delegationId }));
  }
  if (!isAwaitingCapacity(stored)) return answerOf(tx, stored);
  const outcome = await decide(tx, delegation, parent, stored.waitingSince);
  if (!outcome.ok) return outcome;
  const record = redecideDelegation(stored, outcome.value);
  const replaced = await tx.delegations.replace(record, stored.generation);
  return replaced.ok ? answerOf(tx, record) : replaced;
}

// SDLC admission first, as for a submitted task, then the delegation checks;
// only an admitted child is created, with its admission and event.
async function decide(tx: ControlPlaneTransaction, delegation: Delegation, parent: Assignment, waitingSince: Instant): Promise<Result<DelegationOutcome>> {
  const { runId } = delegation.values;
  const run = await tx.runs.get(runId);
  if (!run.ok) return run;
  const envelope = await tx.catalog.envelope(runId);
  if (!envelope.ok) return envelope;
  const { scope } = parent.reservation;
  if (envelope.value?.projectId !== scope.projectId) {
    return err(failure('precondition-failed', `run ${runId} does not belong to project ${scope.projectId}`, { run: runId }));
  }
  const at = await tx.now();
  const admitted = await admitTask(tx, run.value, delegation.child, at);
  if (!admitted.ok) return admitted;
  const decision = await admitDelegation(tx, {
    parentTaskId: scope.taskId, parentAttemptId: parent.attemptId, parentOwnershipGeneration: parent.ownershipGeneration,
    childTaskId: delegation.childTaskId, childRunId: runId, waitingSince,
  });
  if (!decision.ok) return decision;
  const verdict = decision.value;
  if (verdict.outcome !== 'admitted') {
    return ok(verdict.outcome === 'waiting' ? { state: 'awaiting-capacity' } : { state: 'rejected', reason: verdict.reason });
  }
  const created = await openAdmittedTask(tx, run.value, admitted.value, at);
  if (!created.ok) return created;
  const appended = await appendAdmissionUsed(tx, runId, created.value.admission, delegation.correlationId, at);
  if (!appended.ok) return appended;
  const { rootTaskId, depth } = verdict.link;
  return ok({ state: 'admitted', childTaskId: delegation.childTaskId, admissionId: created.value.admission.id, parentTaskId: scope.taskId, rootTaskId, depth });
}

async function answerOf(tx: ControlPlaneTransaction, record: DelegationRecord): Promise<Result<DelegationAnswer>> {
  const { delegationId, outcome } = record;
  if (outcome.state === 'awaiting-capacity') return ok({ state: outcome.state, delegationId });
  if (outcome.state === 'rejected') return ok({ state: outcome.state, delegationId, reason: outcome.reason as RejectionReason });
  const admission = await tx.admissions.get(outcome.admissionId);
  if (!admission.ok) return admission;
  const { parentTaskId, rootTaskId, depth, childTaskId } = outcome;
  const submission = { taskId: childTaskId, admission: admissionView(admission.value) };
  return ok({ state: outcome.state, delegationId, parentTaskId, rootTaskId, depth, submission });
}
