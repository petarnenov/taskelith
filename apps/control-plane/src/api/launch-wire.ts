import type { HttpSchemas } from '@taskelith/contracts';
import {
  parseRecoveryEpoch,
  REPORTED_SEALS_LIMIT,
  type LaunchAuthorizationRequest,
  type LaunchOutcome,
  type SealedExecution,
} from '@taskelith/execution';
import { err, failure, ok, parseIdentifier, type Result } from '@taskelith/kernel';
import { parseGeneration, parseOwnershipGeneration } from '@taskelith/sdlc';

// The `authorizeLaunch` shapes of execution.openapi.json and the domain's.

export function parseLaunchAuthorizationRequest(body: HttpSchemas['LaunchAuthorizationRequest']): Result<LaunchAuthorizationRequest> {
  const parsed = {
    operationId: parseIdentifier('OperationId', body.operationId),
    recoveryEpoch: parseRecoveryEpoch(body.recoveryEpoch),
    assignmentId: parseIdentifier('AssignmentId', body.assignmentId),
    attemptId: parseIdentifier('AttemptId', body.attemptId),
    ownershipGeneration: parseOwnershipGeneration(body.ownershipGeneration),
    executionId: parseIdentifier('ExecutionId', body.executionId),
    admissionId: parseIdentifier('AdmissionId', body.admissionId),
    admissionGeneration: parseGeneration(body.admissionGeneration),
  };
  const values: Record<string, unknown> = {};
  for (const [field, result] of Object.entries(parsed)) {
    if (!result.ok) return result;
    values[field] = result.value;
  }
  // The domain re-authorizes an execution on this flag, so it is checked too.
  if (typeof body.reportsNotStarted !== 'boolean') return err(failure('invalid', 'reportsNotStarted must be a boolean'));
  const sealed = parseSealedExecutions(body.reportsNotStartedFor);
  if (!sealed.ok) return sealed;
  const reported = sealed.value === undefined ? {} : { reportsNotStartedFor: sealed.value };
  return ok(Object.freeze({ ...values, reportsNotStarted: body.reportsNotStarted, ...reported }) as LaunchAuthorizationRequest);
}

// One to REPORTED_SEALS_LIMIT entries, as the schema bounds them.
function parseSealedExecutions(body: readonly HttpSchemas['SealedExecution'][] | undefined): Result<readonly SealedExecution[] | undefined> {
  if (body === undefined) return ok(undefined);
  if (body.length === 0 || body.length > REPORTED_SEALS_LIMIT) {
    return err(failure('invalid', `reportsNotStartedFor must hold 1 to ${REPORTED_SEALS_LIMIT} entries`));
  }
  const parsed: SealedExecution[] = [];
  for (const entry of body) {
    const sealed = parseSealedExecution(entry);
    if (!sealed.ok) return sealed;
    parsed.push(sealed.value);
  }
  return ok(Object.freeze(parsed));
}

function parseSealedExecution(body: HttpSchemas['SealedExecution']): Result<SealedExecution> {
  const executionId = parseIdentifier('ExecutionId', body.executionId);
  if (!executionId.ok) return executionId;
  const operationId = parseIdentifier('OperationId', body.operationId);
  if (!operationId.ok) return operationId;
  return ok(Object.freeze({ executionId: executionId.value, operationId: operationId.value }));
}

// A grant's parameters are flat on the wire, and its state is the outcome.
export function launchOutcomeBody(outcome: LaunchOutcome): HttpSchemas['LaunchAuthorizationOutcome'] {
  switch (outcome.kind) {
    case 'granted': {
      const { parameters, state: _state, ...values } = outcome.grant;
      const grant = { ...values, ttlMilliseconds: parameters.ttlMilliseconds, skewMilliseconds: parameters.skewMilliseconds };
      return { outcome: 'granted', grant: JSON.parse(JSON.stringify(grant)) as HttpSchemas['LaunchGrant'] };
    }
    case 'rejected':
      return { outcome: 'rejected', rejection: { ...outcome.rejection } as HttpSchemas['LaunchRejection'] };
    case 'revoked':
      return { outcome: 'revoked', reason: outcome.reason };
    case 'expired':
      return { outcome: 'expired' };
  }
}
