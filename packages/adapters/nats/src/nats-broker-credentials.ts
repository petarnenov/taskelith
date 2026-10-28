import type { NatsConnection } from '@nats-io/nats-core';
import type { BrokerCredentials, BrokerRevocation, InstallationIdentity, IssuedBrokerCredential, SignedBrokerUser } from '@taskelith/fleet';
import { err, failure, instantFromEpochMilliseconds, ok, type Result } from '@taskelith/kernel';
import { brokerFailure } from './broker-failure.js';
import type { BrokerAuthority } from './broker-authority.js';
import type { ClaimTime } from './broker-jwt.js';
import { TransportAddress } from './transport-address.js';

const CLAIMS_TIMEOUT_MILLISECONDS = 5000;

interface ClaimsReply {
  readonly data?: { readonly code?: number; readonly message?: string };
  readonly error?: { readonly code?: number; readonly description?: string };
}

// Issues worker users with the contract's subject permissions; publishes the
// complete revocation list in the account JWT, with no reload (O2 a).
export class NatsBrokerCredentials implements BrokerCredentials {
  readonly #authority: BrokerAuthority;
  readonly #system: NatsConnection;
  readonly #now: () => ClaimTime;

  constructor(authority: BrokerAuthority, systemConnection: NatsConnection, now: () => ClaimTime = epochSeconds) {
    this.#authority = authority;
    this.#system = systemConnection;
    this.#now = now;
  }

  async issue(installation: InstallationIdentity, workerId: string, generation: number): Promise<Result<IssuedBrokerCredential>> {
    const address = TransportAddress.of(installation.installationId);
    if (!address.ok) return address;
    const permissions = address.value.workerPermissions(workerId);
    if (!permissions.ok) return permissions;
    const issuedAt = this.#now();
    const instant = instantFromEpochMilliseconds(issuedAt * 1000);
    if (!instant.ok) return instant;
    return ok({ ...this.#authority.user(`${workerId}.${generation}`, issuedAt, permissions.value), issuedAt: instant.value });
  }

  async sign(installation: InstallationIdentity, workerId: string, generation: number, userKey: string): Promise<Result<SignedBrokerUser>> {
    const address = TransportAddress.of(installation.installationId);
    if (!address.ok) return address;
    const permissions = address.value.workerPermissions(workerId);
    if (!permissions.ok) return permissions;
    const issuedAt = this.#now();
    const instant = instantFromEpochMilliseconds(issuedAt * 1000);
    if (!instant.ok) return instant;
    const jwt = this.#authority.userJwtFor(userKey, `${workerId}.${generation}`, issuedAt, permissions.value);
    if (jwt === undefined) return err(failure('invalid', 'the broker user public key is not an NKey user key', { field: 'brokerUserPublicKey' }));
    return ok(Object.freeze({ jwt, issuedAt: instant.value }));
  }

  // The list replaces the account's, so the registry keeps every entry and
  // lets one publisher run at a time.
  async publishRevocations(revocations: readonly BrokerRevocation[]): Promise<Result<void>> {
    const voidBefore = Object.fromEntries(revocations.map(({ userKey, revokedAt }) => [userKey, claimTime(revokedAt)]));
    try {
      const reply = await this.#system.request('$SYS.REQ.CLAIMS.UPDATE', this.#authority.accountJwt(this.#now(), voidBefore), {
        timeout: CLAIMS_TIMEOUT_MILLISECONDS,
      });
      return claimsAccepted(reply.json<ClaimsReply>());
    } catch (error) {
      return brokerFailure('push the account revocations', error);
    }
  }
}

function claimsAccepted(reply: ClaimsReply): Result<void> {
  if (reply.data?.code === 200) return ok(undefined);
  const detail = reply.error?.description ?? reply.data?.message ?? 'no answer';
  return err(failure('unavailable', 'the broker refused the account update', { cause: detail }));
}

// A JWT issued in the second of the revocation is void too (`iat <= time`).
function claimTime(instant: string): ClaimTime {
  return Math.ceil(Date.parse(instant) / 1000);
}

function epochSeconds(): ClaimTime {
  return Math.floor(Date.now() / 1000);
}
