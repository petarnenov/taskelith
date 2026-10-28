import { instantFromEpochMilliseconds, type Instant } from '@taskelith/kernel';
import type { PrincipalId } from './principal.js';
import type { SecretHash } from './secret-hash.js';

// Provisional values held in configuration, verified in G6 (Q6).
export interface SessionLifetime {
  readonly idleMilliseconds: number;
  readonly absoluteMilliseconds: number;
  readonly anonymousMilliseconds: number;
  // A request renews the idle expiry at most once per this interval.
  readonly renewalMilliseconds: number;
  // Anonymous sessions beyond it are purged, oldest first.
  readonly anonymousCap: number;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export const SESSION_LIFETIME: SessionLifetime = Object.freeze({
  idleMilliseconds: 8 * HOUR,
  absoluteMilliseconds: 24 * HOUR,
  anonymousMilliseconds: 15 * MINUTE,
  renewalMilliseconds: MINUTE,
  anonymousCap: 10_000,
});

// A server-side session; its identifier is stored only as its hash, and a
// session without a principal is anonymous.
export interface StoredSession {
  readonly idHash: SecretHash;
  readonly csrfToken: string;
  readonly principalId?: PrincipalId;
  readonly createdAt: Instant;
  readonly authenticatedAt?: Instant;
  readonly lastSeenAt: Instant;
  readonly idleExpiresAt: Instant;
  readonly absoluteExpiresAt: Instant;
  readonly endedAt?: Instant;
}

export function anonymousSession(idHash: SecretHash, csrfToken: string, now: Instant, lifetime: SessionLifetime): StoredSession {
  const expiresAt = plus(now, lifetime.anonymousMilliseconds);
  return Object.freeze({ idHash, csrfToken, createdAt: now, lastSeenAt: now, idleExpiresAt: expiresAt, absoluteExpiresAt: expiresAt });
}

// The session after a login: a new identifier and CSRF token (section 2).
export function loggedInSession(
  previous: StoredSession,
  rotation: { readonly idHash: SecretHash; readonly csrfToken: string; readonly principalId: PrincipalId },
  now: Instant,
  lifetime: SessionLifetime,
): StoredSession {
  return Object.freeze({
    ...rotation, createdAt: previous.createdAt, authenticatedAt: now, lastSeenAt: now,
    idleExpiresAt: plus(now, lifetime.idleMilliseconds), absoluteExpiresAt: plus(now, lifetime.absoluteMilliseconds),
  });
}

export function isLive(session: StoredSession, now: Instant): boolean {
  return session.endedAt === undefined && now < session.idleExpiresAt && now < session.absoluteExpiresAt;
}

// When the session ends unless renewed: the earlier of its two expiries.
export function expiresAt(session: StoredSession): Instant {
  return session.idleExpiresAt < session.absoluteExpiresAt ? session.idleExpiresAt : session.absoluteExpiresAt;
}

// The renewed idle expiry of an authenticated session, when one is due.
export function renewal(session: StoredSession, now: Instant, lifetime: SessionLifetime): Instant | undefined {
  if (session.principalId === undefined) return undefined;
  if (Date.parse(now) - Date.parse(session.lastSeenAt) < lifetime.renewalMilliseconds) return undefined;
  return plus(now, lifetime.idleMilliseconds);
}

export function plus(at: Instant, milliseconds: number): Instant {
  const later = instantFromEpochMilliseconds(Date.parse(at) + milliseconds);
  if (!later.ok) throw new RangeError(later.error.message);
  return later.value;
}
