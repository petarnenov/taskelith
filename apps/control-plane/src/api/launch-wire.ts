import type { HttpSchemas } from '@taskelith/contracts';
import { parseRecoveryEpoch, type LaunchAuthorizationRequest, type LaunchOutcome } from '@taskelith/execution';
import { ok, parseIdentifier, type Result } from '@taskelith/kernel';
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
  return ok(Object.freeze({ ...values, reportsNotStarted: body.reportsNotStarted }) as LaunchAuthorizationRequest);
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
