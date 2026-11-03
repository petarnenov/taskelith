import { createApiClient, hasStatus, type ApiRequest } from '../api/client';
import type { components } from '../generated/control-plane';
import type { Credentials, LoginOutcome, LogoutOutcome, Operator, SessionGateway, SessionRead } from './session';

type SessionState = components['schemas']['SessionState'];
type AuthenticatedSession = components['schemas']['AuthenticatedSession'];

const UNAVAILABLE = { kind: 'unavailable' } as const;
// The anonymous session or its token is gone; a fresh read replaces it.
const FORM_EXPIRED = { kind: 'rejected', reason: 'form-expired' } as const;

// The session operations readSession, logIn, and logOut of the control
// plane. The gateway keeps the CSRF token of the latest session answer.
export function createSessionGateway(send?: typeof fetch): SessionGateway {
  const tokens = createTokenKeeper();
  const request: ApiRequest = createApiClient({ csrfToken: tokens.current, fetch: send });

  async function read(): Promise<SessionRead> {
    const answer = tokens.track();
    const result = await reachable(() => request('get', '/session'));
    const session = result !== undefined && hasStatus(result, 200) ? sessionOf(result.body) : undefined;
    if (session === undefined) return UNAVAILABLE;
    answer.keep(session.csrfToken);
    if (session.state === 'anonymous') return { kind: 'anonymous' };
    return { kind: 'authenticated', operator: operatorOf(session) };
  }

  async function logIn(credentials: Credentials): Promise<LoginOutcome> {
    const answer = tokens.track();
    const result = await reachable(() => request('post', '/session', { body: credentials }));
    if (result === undefined) return UNAVAILABLE;
    if (hasStatus(result, 200)) {
      const session = sessionOf(result.body);
      if (session?.state !== 'authenticated') return UNAVAILABLE;
      answer.change(session.csrfToken);
      return { kind: 'logged-in', operator: operatorOf(session) };
    }
    if (hasStatus(result, 400)) return { kind: 'rejected', reason: 'invalid-request' };
    if (hasStatus(result, 401)) return refusalOf(result.body);
    if (hasStatus(result, 403)) return FORM_EXPIRED;
    return UNAVAILABLE;
  }

  async function logOut(): Promise<LogoutOutcome> {
    const answer = tokens.track();
    const result = await reachable(() => request('delete', '/session'));
    if (result === undefined) return { kind: 'failed' };
    // 401: the session had already ended, which is what logging out wants.
    if (!hasStatus(result, 204) && !hasStatus(result, 401)) return { kind: 'failed' };
    answer.end();
    return { kind: 'logged-out' };
  }

  return { read, logIn, logOut };
}

interface TrackedAnswer {
  readonly keep: (token: string) => void;
  readonly change: (token: string) => void;
  readonly end: () => void;
}

// An answer to a request sent before a login or logout ended carries the
// token of a session that is gone, so the keeper drops it.
function createTokenKeeper() {
  let token: string | undefined;
  let sessionChanges = 0;
  let keeps = 0;
  function track(): TrackedAnswer {
    const sentAfter = sessionChanges;
    const keepsBefore = keeps;
    const isCurrent = () => sentAfter === sessionChanges;
    function replace(next: string | undefined) {
      token = next;
      sessionChanges += 1;
    }
    return {
      keep: (next) => {
        if (!isCurrent()) return;
        token = next;
        keeps += 1;
      },
      change: (next) => {
        if (isCurrent()) replace(next);
      },
      // A read kept since the logout was sent holds the session that
      // followed the ended one, so its token stays.
      end: () => {
        if (isCurrent()) replace(keeps === keepsBefore ? undefined : token);
      },
    };
  }
  return { current: () => token, track };
}

function refusalOf(body: unknown): LoginOutcome {
  const reason = failureReason(body);
  if (reason === undefined) return UNAVAILABLE;
  return reason === 'login-failed' ? { kind: 'rejected', reason: 'wrong-credentials' } : FORM_EXPIRED;
}

// Each body is checked for the fields the shell uses, so that a proxy's
// page or a broken answer reads as an unreachable control plane.
function sessionOf(body: unknown): SessionState | undefined {
  if (!isRecord(body) || typeof body.csrfToken !== 'string') return undefined;
  if (body.state === 'anonymous') return body as SessionState;
  if (body.state !== 'authenticated') return undefined;
  const { principal, installationRoles, expiresAt } = body;
  if (!isRecord(principal) || typeof principal.loginName !== 'string') return undefined;
  if (!Array.isArray(installationRoles) || !installationRoles.every((role) => typeof role === 'string')) return undefined;
  if (typeof expiresAt !== 'string' || Number.isNaN(Date.parse(expiresAt))) return undefined;
  return body as SessionState;
}

function failureReason(body: unknown): string | undefined {
  if (!isRecord(body) || !isRecord(body.details)) return undefined;
  return typeof body.details.reason === 'string' ? body.details.reason : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function operatorOf(session: AuthenticatedSession): Operator {
  return {
    loginName: session.principal.loginName,
    installationRoles: session.installationRoles,
    expiresAt: Date.parse(session.expiresAt),
  };
}

// A network failure or an unreadable body reaches no documented status;
// callers treat it so.
async function reachable<T>(call: () => Promise<T>): Promise<T | undefined> {
  try {
    return await call();
  } catch {
    return undefined;
  }
}
