import { createApiClient, hasStatus, type ApiRequest } from '../api/client';
import type { components } from '../generated/control-plane';
import type { Credentials, LoginOutcome, LogoutOutcome, Operator, SessionGateway, SessionRead } from './session';

type AuthenticatedSession = components['schemas']['AuthenticatedSession'];

// The session operations readSession, logIn, and logOut of the control
// plane. The gateway keeps the CSRF token of the latest session answer.
export function createSessionGateway(send?: typeof fetch): SessionGateway {
  let csrfToken: string | undefined;
  const request: ApiRequest = createApiClient({ csrfToken: () => csrfToken, fetch: send });

  async function read(): Promise<SessionRead> {
    const result = await reachable(() => request('get', '/session'));
    if (result === undefined || !hasStatus(result, 200)) return { kind: 'unavailable' };
    csrfToken = result.body.csrfToken;
    if (result.body.state === 'anonymous') return { kind: 'anonymous' };
    return { kind: 'authenticated', operator: operatorOf(result.body) };
  }

  async function logIn(credentials: Credentials): Promise<LoginOutcome> {
    const result = await reachable(() => request('post', '/session', { body: credentials }));
    if (result === undefined) return { kind: 'unavailable' };
    if (hasStatus(result, 200)) {
      csrfToken = result.body.csrfToken;
      return { kind: 'logged-in', operator: operatorOf(result.body) };
    }
    if (hasStatus(result, 400)) return { kind: 'rejected', reason: 'invalid-request' };
    if (hasStatus(result, 401) && result.body.details.reason === 'login-failed') {
      return { kind: 'rejected', reason: 'wrong-credentials' };
    }
    // The anonymous session or its token is gone; a fresh read replaces it.
    if (hasStatus(result, 401) || hasStatus(result, 403)) return { kind: 'rejected', reason: 'form-expired' };
    return { kind: 'unavailable' };
  }

  async function logOut(): Promise<LogoutOutcome> {
    const result = await reachable(() => request('delete', '/session'));
    if (result === undefined) return { kind: 'failed' };
    // 401: the session had already ended, which is what logging out wants.
    if (!hasStatus(result, 204) && !hasStatus(result, 401)) return { kind: 'failed' };
    csrfToken = undefined;
    return { kind: 'logged-out' };
  }

  return { read, logIn, logOut };
}

function operatorOf(session: AuthenticatedSession): Operator {
  return {
    loginName: session.principal.loginName,
    installationRoles: session.installationRoles,
    expiresAt: Date.parse(session.expiresAt),
  };
}

// A network failure reaches no documented status; callers treat it so.
async function reachable<T>(call: () => Promise<T>): Promise<T | undefined> {
  try {
    return await call();
  } catch {
    return undefined;
  }
}
