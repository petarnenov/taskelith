import type { Result } from '@taskelith/kernel';
import type { OwnershipGeneration } from '@taskelith/sdlc';
import type {
  DeliveredSlotCredential,
  DeliveredSlotId,
  SlotCredentialFetch,
  SlotCredentialRefusal,
} from '../domain/slot-credential-delivery.js';
import type { AttemptId, ExecutionId } from '../domain/identifiers.js';

export type SlotCredentialAnswer =
  | { readonly kind: 'delivered'; readonly credential: DeliveredSlotCredential }
  | { readonly kind: 'refused'; readonly refusal: SlotCredentialRefusal };

// The worker's side of `fetchSlotCredential`, over HTTPS only; an
// `unavailable` failure means that no answer arrived.
export interface SlotCredentialClient {
  fetch(request: SlotCredentialFetch): Promise<Result<SlotCredentialAnswer>>;
}

// The run whose slot credential the harness host asks for.
export interface RunSlotCredentialRequest {
  readonly executionId: ExecutionId;
  readonly attemptId: AttemptId;
  readonly ownershipGeneration: OwnershipGeneration;
  readonly slotId: DeliveredSlotId;
}

// The harness host's only source of a run's slot credential (item 18), held
// until the run ends or its ownership generation or recovery epoch changes.
export interface RunSlotCredentials {
  obtain(run: RunSlotCredentialRequest): Promise<Result<SlotCredentialAnswer>>;
  forget(run: Pick<RunSlotCredentialRequest, 'executionId' | 'attemptId'>): void;
}
