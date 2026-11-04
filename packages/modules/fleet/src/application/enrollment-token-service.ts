import { err, failure, instantFromEpochMilliseconds, ok, type Instant, type Result } from '@taskelith/kernel';
import type { Secrets } from '@taskelith/access';
import type { Clock } from '@taskelith/sdlc';
import { tokenRecord, type EnrollmentToken, type EnrollmentTokenRecord, type HostConstraints } from '../domain/enrollment.js';
import { FLEET_LIMITS, type FleetLimits } from '../domain/fleet-limits.js';
import type { FleetRegistry } from '../ports/fleet-registry.js';
import type { IdentifierSource } from '../ports/identifier-source.js';

// Control-plane wire contracts section 6: a page holds at most 100 tokens.
export const ENROLLMENT_TOKEN_PAGE_SIZE = 100;

// The one answer that carries a token's secret (wire contracts section 7).
export interface IssuedEnrollmentToken {
  readonly token: EnrollmentTokenRecord;
  readonly secret: string;
}

export interface EnrollmentTokenPage {
  readonly tokens: readonly EnrollmentTokenRecord[];
  readonly next?: string;
}

export type EnrollmentTokenRegistry = Pick<FleetRegistry, 'addToken' | 'pendingTokens' | 'tokenById' | 'revokeToken' | 'rotateToken'>;

export interface EnrollmentTokenServiceDependencies {
  readonly registry: EnrollmentTokenRegistry;
  readonly secrets: Pick<Secrets, 'issue'>;
  readonly ids: Pick<IdentifierSource, 'newEnrollmentTokenId'>;
  readonly clock: Clock;
  readonly limits?: FleetLimits;
}

// The owner's enrollment token commands (control-plane wire contracts
// section 4); the registry serializes each command with a redemption.
export class EnrollmentTokenService {
  readonly #deps: EnrollmentTokenServiceDependencies;
  readonly #ttl: number;

  constructor(dependencies: EnrollmentTokenServiceDependencies) {
    this.#deps = dependencies;
    this.#ttl = (dependencies.limits ?? FLEET_LIMITS).enrollmentTokenTtlMilliseconds;
  }

  async issue(constraints: HostConstraints): Promise<Result<IssuedEnrollmentToken>> {
    const minted = this.#mint(constraints);
    const added = await this.#deps.registry.addToken(minted.token);
    return added.ok ? ok(issued(minted)) : added;
  }

  async list(after?: string): Promise<Result<EnrollmentTokenPage>> {
    const pending = await this.#deps.registry.pendingTokens(after, ENROLLMENT_TOKEN_PAGE_SIZE + 1);
    if (!pending.ok) return pending;
    if (pending.value.length <= ENROLLMENT_TOKEN_PAGE_SIZE) return ok({ tokens: pending.value });
    const tokens = pending.value.slice(0, ENROLLMENT_TOKEN_PAGE_SIZE);
    return ok({ tokens, next: tokens.at(-1)!.tokenId });
  }

  revoke(tokenId: string): Promise<Result<void>> {
    return this.#deps.registry.revokeToken(tokenId, this.#deps.clock.now());
  }

  // The replacement keeps the constraints and gets a new TTL; the registry
  // checks under the lock that the token is still pending.
  async rotate(tokenId: string): Promise<Result<IssuedEnrollmentToken>> {
    const current = await this.#deps.registry.tokenById(tokenId);
    if (!current.ok) return current;
    if (current.value === undefined) return err(failure('not-found', `no enrollment token ${tokenId} exists`, { tokenId }));
    const minted = this.#mint(current.value.constraints);
    const rotated = await this.#deps.registry.rotateToken(tokenId, minted.token, minted.token.issuedAt);
    return rotated.ok ? ok(issued(minted)) : rotated;
  }

  #mint(constraints: HostConstraints): { token: EnrollmentToken; secret: string } {
    const { secret, hash } = this.#deps.secrets.issue('enrollment');
    const issuedAt = this.#deps.clock.now();
    const token: EnrollmentToken = Object.freeze({
      tokenId: this.#deps.ids.newEnrollmentTokenId(), hash, issuedAt, expiresAt: after(issuedAt, this.#ttl), constraints: Object.freeze({ ...constraints }),
    });
    return { token, secret };
  }
}

function issued({ token, secret }: { token: EnrollmentToken; secret: string }): IssuedEnrollmentToken {
  return Object.freeze({ token: tokenRecord(token), secret });
}

function after(instant: Instant, milliseconds: number): Instant {
  const later = instantFromEpochMilliseconds(Date.parse(instant) + milliseconds);
  if (!later.ok) throw new RangeError(later.error.message);
  return later.value;
}
