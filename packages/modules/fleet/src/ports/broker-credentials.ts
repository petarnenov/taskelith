import type { Instant, Result } from '@taskelith/kernel';
import type { WorkerId } from '@taskelith/execution';
import type { BrokerRevocation } from '../domain/enrollment.js';
import type { InstallationIdentity } from '../domain/installation.js';

// A broker user of one generation: `creds` is the secret the worker gets
// once, and `userKey` the public key that revocation names.
export interface IssuedBrokerCredential {
  readonly creds: string;
  readonly userKey: string;
  readonly issuedAt: Instant;
}

// A user JWT signed for a key the worker generated; no seed is involved.
export interface SignedBrokerUser {
  readonly jwt: string;
  readonly issuedAt: Instant;
}

// Issues per-worker broker users limited to the worker's own subjects, and
// revokes them without a server reload (decisions D9 (a) and O2 (a)).
export interface BrokerCredentials {
  issue(installation: InstallationIdentity, workerId: WorkerId, generation: number): Promise<Result<IssuedBrokerCredential>>;
  // `invalid` when `userKey` is not an NKey user public key.
  sign(installation: InstallationIdentity, workerId: WorkerId, generation: number, userKey: string): Promise<Result<SignedBrokerUser>>;
  // Makes `revocations` the broker's complete list of revoked users.
  publishRevocations(revocations: readonly BrokerRevocation[]): Promise<Result<void>>;
}
