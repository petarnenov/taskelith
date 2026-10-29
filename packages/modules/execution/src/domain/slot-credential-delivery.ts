import { err, failure, ok, REDACTED, type Identifier, type Result } from '@taskelith/kernel';
import type { OwnershipGeneration } from '@taskelith/sdlc';
import type { AttemptId, ExecutionId, RecoveryEpoch } from './identifiers.js';

// The refusals of `fetchSlotCredential`, in the order of account pool
// contract section 7.3 (execution wire contracts section 8.6).
export const SLOT_CREDENTIAL_REFUSAL_REASONS = Object.freeze([
  'quarantined',
  'stale-recovery-epoch',
  'worker-not-authorized',
  'assignment-not-active',
  'stale-ownership-generation',
  'attempt-not-launchable',
  'execution-conflict',
  'capacity-not-reserved',
  'revoked',
  'removed',
  'delivery-not-admitted',
] as const);

export type SlotCredentialRefusalReason = (typeof SLOT_CREDENTIAL_REFUSAL_REASONS)[number];

// The slot's identifier, as the reservation names it in providerCredentials.
export type DeliveredSlotId = Identifier<'ProviderCredentialId'>;

// The values a worker holds when it fetches a run's slot credential.
export interface SlotCredentialFetch {
  readonly executionId: ExecutionId;
  readonly slotId: DeliveredSlotId;
  readonly attemptId: AttemptId;
  readonly ownershipGeneration: OwnershipGeneration;
  readonly recoveryEpoch: RecoveryEpoch;
}

export interface SlotCredentialRefusal {
  readonly reason: SlotCredentialRefusalReason;
  readonly message: string;
}

export interface DeliveredSlotCredentialFields {
  readonly executionId: ExecutionId;
  readonly slotId: DeliveredSlotId;
  readonly mechanismId: string;
  readonly credentialVersion: number;
  readonly secret: string;
}

// One run's slot credential in the worker's memory; its string, JSON, and
// inspection forms show only `[redacted]` (account pool section 7.3).
export class DeliveredSlotCredential {
  readonly executionId: ExecutionId;
  readonly slotId: DeliveredSlotId;
  readonly mechanismId: string;
  readonly credentialVersion: number;
  readonly #secret: string;

  private constructor(fields: DeliveredSlotCredentialFields) {
    this.executionId = fields.executionId;
    this.slotId = fields.slotId;
    this.mechanismId = fields.mechanismId;
    this.credentialVersion = fields.credentialVersion;
    this.#secret = fields.secret;
  }

  // The failures name the fields at fault, never the secret.
  static of(fields: DeliveredSlotCredentialFields): Result<DeliveredSlotCredential> {
    if (fields.secret.length === 0) return err(failure('invalid', 'a delivered slot credential must not be empty'));
    if (!Number.isSafeInteger(fields.credentialVersion) || fields.credentialVersion < 1) {
      return err(failure('invalid', 'a credential version must be a positive integer'));
    }
    return ok(new DeliveredSlotCredential(fields));
  }

  reveal(): string {
    return this.#secret;
  }

  toString(): string {
    return REDACTED;
  }

  toJSON(): string {
    return REDACTED;
  }

  // Keeps console.log and util.inspect from showing the credential.
  [Symbol.for('nodejs.util.inspect.custom')](): string {
    return REDACTED;
  }
}
