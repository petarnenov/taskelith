import type { NatsConnection } from '@nats-io/nats-core';
import type { BrokerCredentials, InstallationIdentity, IssuedBrokerCredential } from '@taskelith/fleet';
import { err, failure, ok, type Result } from '@taskelith/kernel';
import { brokerFailure } from './broker-failure.js';
import type { BrokerAuthority } from './broker-authority.js';
import type { ClaimTime } from './broker-jwt.js';
import { TransportAddress } from './transport-address.js';

const CLAIMS_TIMEOUT_MILLISECONDS = 5000;

interface ClaimsReply {
  readonly data?: { readonly code?: number; readonly message?: string };
  readonly error?: { readonly code?: number; readonly description?: string };
}

// Issues worker users with the contract's subject permissions; revokes them
// by pushing the account JWT over the system account, with no reload (O2 a).
export class NatsBrokerCredentials implements BrokerCredentials {
  readonly #authority: BrokerAuthority;
  readonly #system: NatsConnection;
  readonly #now: () => ClaimTime;
  #revoking: Promise<unknown> = Promise.resolve();

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
    return ok(this.#authority.user(`${workerId}.${generation}`, this.#now(), permissions.value));
  }

  // Revocations accumulate in the account JWT, so each one reads the
  // server's current JWT and adds to it; this process runs them one by one.
  revoke(userKeys: readonly string[]): Promise<Result<void>> {
    const run = this.#revoking.then(() => this.#revoke(userKeys));
    this.#revoking = run.catch(() => undefined);
    return run;
  }

  async #revoke(userKeys: readonly string[]): Promise<Result<void>> {
    try {
      const current = await this.#currentRevocations();
      if (!current.ok) return current;
      // A revocation voids JWTs issued at or before its time.
      const at = this.#now();
      const revocations = { ...current.value, ...Object.fromEntries(userKeys.map((key) => [key, at])) };
      const reply = await this.#system.request('$SYS.REQ.CLAIMS.UPDATE', this.#authority.accountJwt(at, revocations), {
        timeout: CLAIMS_TIMEOUT_MILLISECONDS,
      });
      return claimsAccepted(reply.json<ClaimsReply>());
    } catch (error) {
      return brokerFailure('push the account revocations', error);
    }
  }

  async #currentRevocations(): Promise<Result<Record<string, ClaimTime>>> {
    const subject = `$SYS.REQ.ACCOUNT.${this.#authority.accountKey}.CLAIMS.LOOKUP`;
    const jwt = (await this.#system.request(subject, '', { timeout: CLAIMS_TIMEOUT_MILLISECONDS })).string();
    const payload = jwt.split('.')[1];
    if (payload === undefined) return err(failure('unavailable', 'the broker returned no account JWT'));
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { nats?: { revocations?: Record<string, ClaimTime> } };
    return ok({ ...(claims.nats?.revocations ?? {}) });
  }
}

function claimsAccepted(reply: ClaimsReply): Result<void> {
  if (reply.data?.code === 200) return ok(undefined);
  const detail = reply.error?.description ?? reply.data?.message ?? 'no answer';
  return err(failure('unavailable', 'the broker refused the account update', { cause: detail }));
}

function epochSeconds(): ClaimTime {
  return Math.floor(Date.now() / 1000);
}
