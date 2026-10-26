import assert from 'node:assert/strict';
import test from 'node:test';
import { parseIdentifier } from '@taskelith/kernel';
import { parseGeneration } from '@taskelith/sdlc';
import {
  LAUNCH_REJECTION_REASONS,
  RETRYABLE_LAUNCH_REJECTIONS,
  attemptPhase,
  authorizeLaunch,
  isGrantExpired,
  isLaunchAffected,
  rejectUnknownAssignment,
  workerLaunchDeadline,
  parseLaunchParameters,
  recordNotStarted,
  replayLaunchOperation,
  requestCancellation,
  revokeLaunch,
  type LaunchContext,
  type LaunchRejectionReason,
  type LaunchRequest,
  type Task,
} from '@taskelith/execution';
import { failed, value } from '@taskelith/testing';
import {
  ASSIGNMENT,
  ATTEMPT,
  DESIGN,
  EPOCH,
  EXECUTION,
  NEW_SPEC,
  OTHER_WORKER,
  SPEC,
  T1,
  T2,
  T3,
  T4,
  WORKER,
  assignmentId,
  attemptId,
  authorized,
  epoch,
  executionId,
  grantIssue,
  implementationAdmission,
  launchContext,
  launchRequest,
  operationId,
  ownership,
  passedGate,
  pendingGate,
  placedTask,
  planningAdmission,
} from './fixtures.ts';

function rejectionOf(task: Task, request: Partial<LaunchRequest>, context: Partial<LaunchContext>): LaunchRejectionReason {
  const result = authorizeLaunch(task, launchRequest(task, request), launchContext(task, context), grantIssue());
  return failed(result).reason;
}

test('a granted launch authorizes one execution and moves the attempt to launch-authorized', () => {
  const { task, grant } = authorized();
  const attempt = task.attempts[0]!;
  assert.equal(attemptPhase(attempt), 'launch-authorized');
  assert.equal(attempt.executions.length, 1);
  assert.equal(attempt.executions[0]!.state, 'authorized');
  assert.equal(grant.state, 'granted');
  assert.equal(grant.executionId, EXECUTION);
  assert.deepEqual(grant.reliedOnGates, ['specs-approval', 'design-approval']);
  assert.deepEqual(grant.artifacts.map((revision) => revision.artifactId), ['spec', 'design']);
  assert.equal(task.generation, placedTask().generation + 1);
  assert.ok(Object.isFrozen(grant));
});

test('each check rejects with the reason of contract section 9', () => {
  const task = placedTask();
  const cases: readonly [LaunchRejectionReason, Partial<LaunchRequest>, Partial<LaunchContext>][] = [
    ['quarantined', {}, { installation: { recoveryEpoch: EPOCH, quarantined: true } }],
    ['stale-recovery-epoch', { recoveryEpoch: epoch(2) }, {}],
    ['worker-not-authorized', {}, { workerAuthorized: false }],
    ['assignment-not-active', {}, { assignment: undefined }],
    ['assignment-not-active', { workerId: OTHER_WORKER }, { reservation: { state: 'held', attemptId: ATTEMPT, workerId: OTHER_WORKER } }],
    ['assignment-not-active', { assignmentId: assignmentId('assignment-0') }, {}],
    ['stale-ownership-generation', { ownershipGeneration: ownership(2) }, {}],
    ['admission-not-current', {}, { admission: undefined }],
    ['admission-not-current', { admissionGeneration: value(parseGeneration(9)) }, {}],
    ['admission-not-current', {}, { admission: implementationAdmission('admission-9') }],
    ['gate-not-passed', {}, { gates: [passedGate('specs', [SPEC]), pendingGate('design', [SPEC, DESIGN])] }],
    ['gate-not-passed', {}, { gates: [passedGate('specs', [SPEC])] }],
    ['gate-not-passed', {}, { gates: [passedGate('specs', [NEW_SPEC]), passedGate('design', [SPEC, DESIGN])] }],
    ['artifact-revision-changed', {}, { currentRevisions: [NEW_SPEC, DESIGN] }],
    ['policy-revision-changed', {}, { policyRevision: value(parseIdentifier('PolicyRevision', 'policy-8')) }],
    ['capacity-not-reserved', {}, { reservation: { state: 'released', attemptId: ATTEMPT, workerId: WORKER } }],
    ['capacity-not-reserved', {}, { reservation: undefined }],
  ];
  for (const [reason, request, context] of cases) {
    assert.equal(rejectionOf(task, request, context), reason, `expected ${reason}`);
  }
});

test('an ownership generation of an earlier owner is stale even with a matching assignment', () => {
  const task = placedTask();
  const assignment = { assignmentId: ASSIGNMENT, attemptId: ATTEMPT, workerId: WORKER, ownershipGeneration: ownership(2), active: true };
  assert.equal(rejectionOf(task, { ownershipGeneration: ownership(2) }, { assignment }), 'stale-ownership-generation');
});

test('a cancelled, ended, or unknown attempt is not launchable', () => {
  const task = placedTask();
  const cancelled = value(requestCancellation(task, ATTEMPT, 'requested', T1));
  assert.equal(rejectionOf(cancelled, {}, {}), 'attempt-not-launchable');
  const assignment = { assignmentId: ASSIGNMENT, attemptId: attemptId('attempt-9'), workerId: WORKER, ownershipGeneration: task.ownershipGeneration, active: true };
  assert.equal(rejectionOf(task, { attemptId: attemptId('attempt-9') }, { assignment }), 'attempt-not-launchable');
});

test('a planning admission relies on no gate, so unpassed prerequisites do not block it', () => {
  const task = placedTask(planningAdmission());
  const admission = planningAdmission();
  const request = { admissionId: admission.id, admissionGeneration: admission.generation };
  const result = authorizeLaunch(task, launchRequest(task, request), launchContext(task, { admission, gates: [pendingGate('proposal', [SPEC])] }), grantIssue());
  assert.deepEqual(value(result).grant.reliedOnGates, []);
});

test('relied-on gates with different subjects are granted when every subject is bound', () => {
  const { grant } = authorized();
  assert.equal(grant.reliedOnGates.length, 2);
});

test('only an unspawned, authorized execution is authorized again, never a second identity', () => {
  const first = authorized();
  const other = { executionId: executionId('execution-2'), operationId: operationId('operation-2') };
  assert.equal(failed(authorizeLaunch(first.task, launchRequest(first.task, other), launchContext(first.task), grantIssue('launch-2'))).reason, 'execution-conflict');
  const unproven = { operationId: operationId('operation-2') };
  assert.equal(failed(authorizeLaunch(first.task, launchRequest(first.task, unproven), launchContext(first.task), grantIssue('launch-2'))).reason, 'execution-conflict');
  const again = value(authorizeLaunch(first.task, launchRequest(first.task, { ...unproven, reportsNotStarted: true }), launchContext(first.task), grantIssue('launch-2', T4)));
  assert.equal(again.task.attempts[0]!.executions[0]!.grants.length, 2);
});

test('after not-started, a new identity is authorized against the same reservation, and an old one never', () => {
  const first = authorized();
  const sealed = value(recordNotStarted(first.task, { workerId: WORKER, executionId: EXECUTION }, T3)).task;
  const reused = { operationId: operationId('operation-2'), reportsNotStarted: true };
  assert.equal(failed(authorizeLaunch(sealed, launchRequest(sealed, reused), launchContext(sealed), grantIssue('launch-2'))).reason, 'execution-conflict');
  const fresh = { operationId: operationId('operation-3'), executionId: executionId('execution-2') };
  const second = value(authorizeLaunch(sealed, launchRequest(sealed, fresh), launchContext(sealed), grantIssue('launch-3')));
  assert.deepEqual(second.task.attempts[0]!.executions.map((execution) => execution.state), ['not-started', 'authorized']);
});

test('expiry is computed from issuedAt and ttl and changes no state', () => {
  const { grant } = authorized();
  assert.equal(isGrantExpired(grant, T2), false);
  assert.equal(isGrantExpired(grant, T3), true);
  assert.equal(grant.state, 'granted');
});

test("the worker's deadline is its first reading plus ttl less skew, whatever its wall clock", () => {
  const parameters = value(parseLaunchParameters({ ttlMilliseconds: 30_000, skewMilliseconds: 5_000 }));
  assert.equal(workerLaunchDeadline(1_000, parameters), 26_000);
});

test('an unknown assignment is rejected after the installation and worker checks', () => {
  const { task } = authorized();
  const request = launchRequest(task);
  const context = launchContext(task);
  assert.equal(rejectUnknownAssignment(request, context).reason, 'assignment-not-active');
  assert.equal(rejectUnknownAssignment(request, { ...context, workerAuthorized: false }).reason, 'worker-not-authorized');
  assert.equal(rejectUnknownAssignment(request, { ...context, installation: { ...context.installation, quarantined: true } }).reason, 'quarantined');
});

test('launch parameters need a skew shorter than the ttl', () => {
  assert.equal(failed(parseLaunchParameters({ ttlMilliseconds: 5_000, skewMilliseconds: 5_000 })).code, 'invalid');
  assert.equal(failed(parseLaunchParameters({ ttlMilliseconds: 0, skewMilliseconds: 1 })).code, 'invalid');
  assert.equal(failed(parseLaunchParameters({ ttlMilliseconds: 1.5, skewMilliseconds: 1 })).code, 'invalid');
});

test('only quarantine and transient failures are retryable', () => {
  assert.deepEqual(RETRYABLE_LAUNCH_REJECTIONS, ['quarantined', 'unavailable']);
  assert.equal(new Set(LAUNCH_REJECTION_REASONS).size, LAUNCH_REJECTION_REASONS.length);
  assert.equal(failed(authorizeLaunch(placedTask(), launchRequest(placedTask()), launchContext(placedTask(), { workerAuthorized: false }), grantIssue())).retryable, false);
});

test('a transport retry returns the recorded grant without extending it', () => {
  const { task, grant } = authorized();
  const request = launchRequest(placedTask());
  const context = { installation: { recoveryEpoch: EPOCH, quarantined: false }, workerAuthorized: true };
  assert.deepEqual(replayLaunchOperation(task, grant, request, context, T2), { kind: 'granted', grant });
  assert.deepEqual(replayLaunchOperation(task, grant, request, context, T3), { kind: 'expired' });
});

test('a retry after revocation, quarantine, a worker revocation, or with changed values returns no grant', () => {
  const { task, grant } = authorized();
  const request = launchRequest(placedTask());
  const context = { installation: { recoveryEpoch: EPOCH, quarantined: false }, workerAuthorized: true };
  const revoked = value(revokeLaunch(task, ATTEMPT, { grants: 'policy-revision-changed', cancellation: 'launch-revoked' }, T2));
  const revokedGrant = revoked.attempts[0]!.executions[0]!.grants[0]!;
  assert.deepEqual(replayLaunchOperation(revoked, revokedGrant, request, context, T2), { kind: 'revoked', reason: 'policy-revision-changed' });
  const quarantined = replayLaunchOperation(task, grant, request, { ...context, installation: { recoveryEpoch: EPOCH, quarantined: true } }, T2);
  assert.equal(quarantined.kind === 'rejected' && quarantined.rejection.reason, 'quarantined');
  const unauthorized = replayLaunchOperation(task, grant, request, { ...context, workerAuthorized: false }, T2);
  assert.equal(unauthorized.kind === 'rejected' && unauthorized.rejection.reason, 'worker-not-authorized');
  const changed = replayLaunchOperation(task, grant, { ...request, executionId: executionId('execution-2') }, context, T2);
  assert.equal(changed.kind === 'rejected' && changed.rejection.reason, 'operation-mismatch');
  const foreign = replayLaunchOperation(task, grant, { ...request, workerId: OTHER_WORKER }, context, T2);
  assert.equal(foreign.kind === 'rejected' && foreign.rejection.reason, 'operation-mismatch');
});

test('a retry of a grant whose execution has ended returns no grant', () => {
  const { task, grant } = authorized();
  const sealed = value(recordNotStarted(task, { workerId: WORKER, executionId: EXECUTION }, T2)).task;
  const context = { installation: { recoveryEpoch: EPOCH, quarantined: false }, workerAuthorized: true };
  const result = replayLaunchOperation(sealed, grant, launchRequest(placedTask()), context, T2);
  assert.equal(result.kind === 'rejected' && result.rejection.reason, 'execution-conflict');
});

test('an invalidating writer finds an expired grant, revokes it, and requests cancellation', () => {
  const { task } = authorized();
  assert.equal(isLaunchAffected(task, ATTEMPT), true);
  const revoked = value(revokeLaunch(task, ATTEMPT, { grants: 'artifact-revision-changed', cancellation: 'launch-revoked' }, T4));
  const attempt = revoked.attempts[0]!;
  assert.equal(attempt.executions[0]!.grants[0]!.state, 'revoked');
  assert.deepEqual(attempt.cancellation, { reason: 'launch-revoked', requestedAt: T4 });
  assert.equal(attemptPhase(attempt), 'launch-authorized');
  const again = value(revokeLaunch(revoked, ATTEMPT, { grants: 'policy-revision-changed', cancellation: 'launch-revoked' }, T4));
  const grant = again.attempts[0]!.executions[0]!.grants[0]!;
  assert.equal(grant.state === 'revoked' && grant.revokedFor, 'artifact-revision-changed');
  assert.equal(again.attempts[0]!.cancellation?.reason, 'launch-revoked');
});

test('the attempt keeps the cancellation reason its writer names', () => {
  const { task } = authorized();
  const ended = value(revokeLaunch(task, ATTEMPT, { grants: 'attempt-not-launchable', cancellation: 'assignment-ended' }, T4));
  assert.deepEqual(ended.attempts[0]!.cancellation, { reason: 'assignment-ended', requestedAt: T4 });
});

test('an earlier cancellation request wins over the reason of a later writer', () => {
  const requested = value(requestCancellation(authorized().task, ATTEMPT, 'requested', T2));
  const ended = value(revokeLaunch(requested, ATTEMPT, { grants: 'attempt-not-launchable', cancellation: 'assignment-ended' }, T4));
  assert.deepEqual(ended.attempts[0]!.cancellation, { reason: 'requested', requestedAt: T2 });
});

test('an invalidating writer with an empty predicate affects nothing', () => {
  const task = placedTask();
  assert.equal(isLaunchAffected(task, ATTEMPT), false);
  assert.equal(isLaunchAffected(task, attemptId('attempt-9')), false);
  assert.equal(failed(revokeLaunch(task, ATTEMPT, { grants: 'policy-revision-changed', cancellation: 'launch-revoked' }, T1)).code, 'precondition-failed');
});
