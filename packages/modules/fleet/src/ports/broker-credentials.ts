import type { Result } from '@taskelith/kernel';
import type { WorkerId } from '@taskelith/execution';
import type { InstallationIdentity } from '../domain/installation.js';

// A broker user of one generation: `creds` is the secret the worker gets
// once, and `userKey` the public key that revocation names.
export interface IssuedBrokerCredential {
  readonly creds: string;
  readonly userKey: string;
}

// Issues per-worker broker users limited to the worker's own subjects, and
// revokes them without a server reload (decisions D9 (a) and O2 (a)).
export interface BrokerCredentials {
  issue(installation: InstallationIdentity, workerId: WorkerId, generation: number): Promise<Result<IssuedBrokerCredential>>;
  revoke(userKeys: readonly string[]): Promise<Result<void>>;
}
