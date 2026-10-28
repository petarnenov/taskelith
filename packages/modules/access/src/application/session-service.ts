import { err, failure, ok, type Failure, type Instant, type Result } from '@taskelith/kernel';
import type { Clock } from '@taskelith/sdlc';
import { normalizePassword } from '../domain/password-policy.js';
import { parseLoginName, type LoginName, type Principal } from '../domain/principal.js';
import { INSTALLATION_OWNER, type InstallationRole } from '../domain/roles.js';
import {
  anonymousSession,
  expiresAt,
  isLive,
  loggedInSession,
  renewal,
  SESSION_LIFETIME,
  type SessionLifetime,
  type StoredSession,
} from '../domain/session.js';
import type { AccessStore, AccessTransaction } from '../ports/access-store.js';
import type { PasswordHasher } from '../ports/password-hasher.js';
import type { RandomValues } from '../ports/random-values.js';
import type { Secrets } from '../ports/secrets.js';
import type { LoginThrottle } from './login-throttle.js';

// The contract shapes of `SessionState` (control-plane document).
export type SessionView =
  | { readonly state: 'anonymous'; readonly csrfToken: string }
  | {
    readonly state: 'authenticated';
    readonly csrfToken: string;
    readonly principal: { readonly principalId: string; readonly loginName: string };
    readonly installationRoles: readonly InstallationRole[];
    readonly expiresAt: Instant;
  };

// A session that a request's cookie names and that has not expired.
export interface LiveSession {
  readonly session: StoredSession;
  readonly principal?: Principal;
  readonly installationRoles: readonly InstallationRole[];
}

// A session state, and the identifier to set as the cookie when new.
export interface SessionAnswer {
  readonly view: SessionView;
  readonly cookie?: string;
}

export interface LoginAttempt {
  readonly loginName: string;
  readonly password: string;
  readonly sourceAddress: string;
}

export interface SessionServiceDependencies {
  readonly store: AccessStore;
  readonly hasher: PasswordHasher;
  readonly secrets: Pick<Secrets, 'hashOf' | 'matches'>;
  readonly random: RandomValues;
  readonly clock: Clock;
  readonly throttle: LoginThrottle;
  readonly lifetime?: SessionLifetime;
}

export const SESSION_PURGE_BATCH = 1_000;

export function unauthenticated(): Failure {
  return failure('forbidden', 'the request has no valid session or operator credential', { reason: 'unauthenticated' });
}

function loginFailed(): Failure {
  return failure('forbidden', 'the login name and password do not match', { reason: 'login-failed' });
}

// `readSession`, `logIn`, and `logOut` over server-side sessions (wire
// contracts section 2; design decision 4).
export class SessionService {
  readonly #deps: SessionServiceDependencies;
  readonly #lifetime: SessionLifetime;

  constructor(dependencies: SessionServiceDependencies) {
    this.#deps = dependencies;
    this.#lifetime = dependencies.lifetime ?? SESSION_LIFETIME;
  }

  // The live session the identifier names; an authenticated one is renewed
  // at most once per renewal interval. Else `forbidden` `unauthenticated`.
  authenticate(sessionId: string): Promise<Result<LiveSession>> {
    const idHash = this.#deps.secrets.hashOf(sessionId);
    return this.#deps.store.transaction(async (tx) => {
      const stored = await tx.sessions.get(idHash);
      if (!stored.ok) return stored;
      const now = this.#deps.clock.now();
      const session = stored.value;
      if (session === undefined || !this.#deps.secrets.matches(sessionId, session.idHash) || !isLive(session, now)) {
        return err(unauthenticated());
      }
      const live = await liveSession(tx, session);
      if (!live.ok) return live;
      const renewed = renewal(session, now, this.#lifetime);
      if (renewed === undefined) return live;
      const touched = await tx.sessions.touch(idHash, now, renewed);
      if (!touched.ok) return touched;
      return liveSession(tx, { ...session, lastSeenAt: now, idleExpiresAt: renewed });
    });
  }

  // The state of the cookie's session, or a new anonymous one with its
  // cookie when the cookie is missing, ended, or expired.
  async read(sessionId: string | undefined): Promise<Result<SessionAnswer>> {
    if (sessionId !== undefined) {
      const live = await this.authenticate(sessionId);
      if (live.ok) return ok({ view: viewOf(live.value) });
      if (live.error.code !== 'forbidden') return live;
    }
    return this.#start();
  }

  // Rotates the session's identifier and CSRF token in one write, with a
  // rehash when the stored parameters are weaker than the current ones.
  async logIn(live: LiveSession, attempt: LoginAttempt): Promise<Result<SessionAnswer>> {
    const loginName = parseLoginName(attempt.loginName);
    const keys = throttleKeys(loginName.ok ? loginName.value : attempt.loginName, attempt.sourceAddress);
    await this.#deps.throttle.admit(keys);
    const principal = loginName.ok ? await this.#loginPrincipal(loginName.value) : ok(undefined);
    if (!principal.ok) return principal;
    const password = normalizePassword(attempt.password);
    const verified = await this.#deps.hasher.verify(password, principal.value?.passwordHash);
    if (!verified.ok) return verified;
    if (principal.value === undefined || !verified.value.matches) {
      this.#deps.throttle.recordFailure(keys);
      return err(loginFailed());
    }
    this.#deps.throttle.clear(keys[0]!);
    const rehash = verified.value.rehashDue ? await this.#deps.hasher.hash(password) : undefined;
    if (rehash !== undefined && !rehash.ok) return rehash;
    return this.#rotate(live.session, principal.value, rehash?.value);
  }

  // Ends only this session; a repeat is `unauthenticated`.
  async logOut(live: LiveSession): Promise<Result<void>> {
    const ended = await this.#deps.store.transaction((tx) => tx.sessions.end(live.session.idHash, this.#deps.clock.now()));
    if (ended.ok || ended.error.code !== 'not-found') return ended;
    return err(unauthenticated());
  }

  // Deletes ended and expired sessions in a batch, then the oldest
  // anonymous ones beyond the cap; answers how many went.
  purgeExpired(batch: number = SESSION_PURGE_BATCH): Promise<Result<number>> {
    return this.#deps.store.transaction(async (tx) => {
      const purged = await tx.sessions.purge(this.#deps.clock.now(), batch);
      if (!purged.ok) return purged;
      const trimmed = await tx.sessions.trimAnonymous(this.#lifetime.anonymousCap);
      return trimmed.ok ? ok(purged.value + trimmed.value) : trimmed;
    });
  }

  async #start(): Promise<Result<SessionAnswer>> {
    const sessionId = this.#deps.random.sessionToken();
    const session = anonymousSession(this.#deps.secrets.hashOf(sessionId), this.#deps.random.sessionToken(), this.#deps.clock.now(), this.#lifetime);
    const added = await this.#deps.store.transaction((tx) => tx.sessions.add(session));
    return added.ok ? ok({ view: viewOf({ session, installationRoles: [] }), cookie: sessionId }) : added;
  }

  #loginPrincipal(loginName: LoginName): Promise<Result<Principal | undefined>> {
    return this.#deps.store.transaction(async (tx) => {
      const found = await tx.principals.findByLoginName(loginName);
      if (!found.ok) return found;
      return ok(found.value?.disabledAt === undefined ? found.value : undefined);
    });
  }

  async #rotate(previous: StoredSession, principal: Principal, rehash: Principal['passwordHash']): Promise<Result<SessionAnswer>> {
    const sessionId = this.#deps.random.sessionToken();
    const rotation = {
      idHash: this.#deps.secrets.hashOf(sessionId), csrfToken: this.#deps.random.sessionToken(), principalId: principal.principalId,
    };
    const now = this.#deps.clock.now();
    const next = loggedInSession(previous, rotation, now, this.#lifetime);
    const rotated = await this.#deps.store.transaction(async (tx) => {
      const confirmed = await confirmLogin(tx, previous, principal, now);
      if (!confirmed.ok) return confirmed;
      const replaced = await tx.sessions.replace(previous.idHash, next);
      if (!replaced.ok) return replaced;
      if (rehash !== undefined) {
        const stored = await tx.principals.setPasswordHash(principal.principalId, rehash);
        if (!stored.ok) return stored;
      }
      return liveSession(tx, next);
    });
    if (rotated.ok) return ok({ view: viewOf(rotated.value), cookie: sessionId });
    return rotated.error.code === 'not-found' ? err(unauthenticated()) : rotated;
  }
}

function throttleKeys(loginName: string, sourceAddress: string): readonly string[] {
  return [`login-name:${loginName}`, `source-address:${sourceAddress}`];
}

// A login holds only when, at its rotation, the session is still live and
// the principal still enabled with the verified hash.
async function confirmLogin(tx: AccessTransaction, previous: StoredSession, principal: Principal, now: Instant): Promise<Result<void>> {
  const session = await tx.sessions.get(previous.idHash);
  if (!session.ok) return session;
  if (session.value === undefined || !isLive(session.value, now)) return err(unauthenticated());
  const current = await tx.principals.get(principal.principalId);
  if (!current.ok) return current;
  const unchanged = current.value !== undefined && current.value.disabledAt === undefined
    && current.value.passwordHash === principal.passwordHash;
  return unchanged ? ok(undefined) : err(loginFailed());
}

// A session whose principal is gone or disabled authenticates nothing.
async function liveSession(tx: AccessTransaction, session: StoredSession): Promise<Result<LiveSession>> {
  if (session.principalId === undefined) return ok({ session, installationRoles: [] });
  const principal = await tx.principals.get(session.principalId);
  if (!principal.ok) return principal;
  if (principal.value === undefined || principal.value.disabledAt !== undefined) return err(unauthenticated());
  const owner = await tx.principals.isInstallationOwner(session.principalId);
  if (!owner.ok) return owner;
  return ok({ session, principal: principal.value, installationRoles: owner.value ? [INSTALLATION_OWNER] : [] });
}

export function viewOf(live: LiveSession): SessionView {
  const { session, principal } = live;
  if (principal === undefined) return { state: 'anonymous', csrfToken: session.csrfToken };
  return {
    state: 'authenticated', csrfToken: session.csrfToken,
    principal: { principalId: principal.principalId, loginName: principal.loginName },
    installationRoles: [...live.installationRoles], expiresAt: expiresAt(session),
  };
}
