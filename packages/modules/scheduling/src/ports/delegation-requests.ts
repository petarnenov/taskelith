import type { Result } from '@taskelith/kernel';
import type { Generation } from '@taskelith/sdlc';
import type { DelegationId, DelegationRecord } from '../domain/delegation-request.js';

// Stores each delegation request once; `replace` is a compare-and-set on the
// record's generation, and `add` fails with `conflict` for a known identity.
export interface DelegationRequests {
  get(delegationId: DelegationId): Promise<Result<DelegationRecord>>;
  add(record: DelegationRecord): Promise<Result<void>>;
  replace(record: DelegationRecord, expectedGeneration: Generation): Promise<Result<void>>;
}
