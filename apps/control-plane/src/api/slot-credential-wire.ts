import type { HttpSchemas } from '@taskelith/contracts';
import { parseRecoveryEpoch, type AttemptId, type ExecutionId } from '@taskelith/execution';
import { err, failure, ok, parseIdentifier, type Result } from '@taskelith/kernel';
import type { ProviderCredentialId } from '@taskelith/scheduling';
import { parseOwnershipGeneration } from '@taskelith/sdlc';
import type { RevealedSlotDelivery, SlotCredentialFetchRequest } from '../application/slot-credential-delivery.js';

const DECIMAL = /^[1-9][0-9]{0,15}$/;

// The path's execution and slot and the query's attempt, ownership
// generation, and recovery epoch; a failure names only the parameter.
export function parseSlotCredentialFetch(
  [executionText = '', slotText = '']: readonly string[], query: URLSearchParams,
): Result<SlotCredentialFetchRequest> {
  const executionId = parseIdentifier('ExecutionId', executionText);
  if (!executionId.ok) return executionId;
  const slotId = parseIdentifier('ProviderCredentialId', slotText);
  if (!slotId.ok) return slotId;
  const attemptId = parseIdentifier('AttemptId', query.get('attemptId') ?? '');
  if (!attemptId.ok) return attemptId;
  const ownershipGeneration = positive(query, 'ownershipGeneration');
  if (!ownershipGeneration.ok) return ownershipGeneration;
  const generation = parseOwnershipGeneration(ownershipGeneration.value);
  if (!generation.ok) return generation;
  const epochValue = positive(query, 'recoveryEpoch');
  if (!epochValue.ok) return epochValue;
  const recoveryEpoch = parseRecoveryEpoch(epochValue.value);
  if (!recoveryEpoch.ok) return recoveryEpoch;
  return ok(Object.freeze({
    executionId: executionId.value as ExecutionId, slotId: slotId.value as ProviderCredentialId, attemptId: attemptId.value as AttemptId,
    ownershipGeneration: generation.value, recoveryEpoch: recoveryEpoch.value,
  }));
}

// The one place where the credential's text enters a response body.
export function slotCredentialBody(delivery: RevealedSlotDelivery): HttpSchemas['SlotCredentialDelivery'] {
  const { executionId, slotId, mechanismId, credentialVersion, credential } = delivery;
  return { executionId, slotId, mechanismId, credentialVersion, credential: credential.reveal() };
}

function positive(query: URLSearchParams, name: string): Result<number> {
  const text = query.get(name);
  if (text === null || !DECIMAL.test(text)) return err(failure('invalid', `${name} must be a positive decimal integer`, { parameter: name }));
  return ok(Number(text));
}
