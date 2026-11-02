import { describe, expect, it } from 'vitest';
import { CSRF_HEADER } from '../src/api/client';
import { createSessionGateway } from '../src/session/control-plane-session';

const ANONYMOUS_TOKEN = 'a'.repeat(43);
const SESSION_TOKEN = 'b'.repeat(43);
const EXPIRES_AT = '2026-11-02T11:00:00.000Z';

const AUTHENTICATED = {
  state: 'authenticated',
  csrfToken: SESSION_TOKEN,
  principal: { principalId: 'p-1', loginName: 'operator' },
  installationRoles: ['installation-owner'],
  expiresAt: EXPIRES_AT,
};

interface Answer {
  readonly status: number;
  readonly body?: unknown;
}

// A control plane that answers each request with the next scripted answer
// and records the request's method and CSRF header.
function controlPlane(...answers: (Answer | Error)[]) {
  const requests: { method: string; csrf: string | null; body: unknown }[] = [];
  const send = (async (_url: string | URL | Request, init?: RequestInit) => {
    const answer = answers.shift();
    if (answer === undefined) throw new Error('No scripted answer left');
    requests.push({
      method: init?.method ?? 'GET',
      csrf: new Headers(init?.headers).get(CSRF_HEADER),
      body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
    });
    if (answer instanceof Error) throw answer;
    return response(answer);
  }) as typeof fetch;
  return { requests, gateway: createSessionGateway(send) };
}

function response(answer: Answer): Response {
  const payload = answer.body === undefined ? null : JSON.stringify(answer.body);
  const headers: HeadersInit = answer.body === undefined ? {} : { 'Content-Type': 'application/json' };
  return new Response(payload, { status: answer.status, headers });
}

interface HeldRequest {
  readonly method: string;
  readonly csrf: string | null;
  readonly answer: (answer: Answer) => void;
}

// A control plane that holds each request until the test answers it, so
// a test chooses the order in which the answers arrive.
function heldControlPlane() {
  const held: HeldRequest[] = [];
  const send = ((_url: string | URL | Request, init?: RequestInit) =>
    new Promise<Response>((settle) => {
      held.push({
        method: init?.method ?? 'GET',
        csrf: new Headers(init?.headers).get(CSRF_HEADER),
        answer: (answer) => settle(response(answer)),
      });
    })) as typeof fetch;
  return { held, gateway: createSessionGateway(send) };
}

const anonymous: Answer = { status: 200, body: { state: 'anonymous', csrfToken: ANONYMOUS_TOKEN } };
const failure = (status: number, reason: string): Answer => ({
  status,
  body: { code: 'forbidden', message: 'refused', details: { reason } },
});
const credentials = { loginName: 'operator', password: 'fixture-secret' };

describe('createSessionGateway read', () => {
  it('reads an anonymous session', async () => {
    const { gateway } = controlPlane(anonymous);
    expect(await gateway.read()).toEqual({ kind: 'anonymous' });
  });

  it('reads an authenticated session as its operator', async () => {
    const { gateway } = controlPlane({ status: 200, body: AUTHENTICATED });
    expect(await gateway.read()).toEqual({
      kind: 'authenticated',
      operator: { loginName: 'operator', installationRoles: ['installation-owner'], expiresAt: Date.parse(EXPIRES_AT) },
    });
  });

  it('reports a failing or unreachable control plane as unavailable', async () => {
    const { gateway } = controlPlane({ status: 503, body: { code: 'unavailable', message: 'x', details: {} } }, new TypeError('offline'));
    expect(await gateway.read()).toEqual({ kind: 'unavailable' });
    expect(await gateway.read()).toEqual({ kind: 'unavailable' });
  });
});

describe('createSessionGateway logIn', () => {
  it('logs in with the anonymous token and keeps the new session token', async () => {
    const { gateway, requests } = controlPlane(anonymous, { status: 200, body: AUTHENTICATED }, { status: 204 });
    await gateway.read();
    const outcome = await gateway.logIn(credentials);
    await gateway.logOut();
    expect(outcome.kind).toBe('logged-in');
    expect(requests.map(({ method, csrf }) => [method, csrf])).toEqual([
      ['GET', null],
      ['POST', ANONYMOUS_TOKEN],
      ['DELETE', SESSION_TOKEN],
    ]);
    expect(requests[1]?.body).toEqual(credentials);
  });

  it.each([
    ['a wrong password', failure(401, 'login-failed'), { kind: 'rejected', reason: 'wrong-credentials' }],
    ['an invalid request', { status: 400, body: { code: 'invalid', message: 'x', details: {} } }, { kind: 'rejected', reason: 'invalid-request' }],
    ['a missing anonymous session', failure(401, 'unauthenticated'), { kind: 'rejected', reason: 'form-expired' }],
    ['a wrong CSRF token', failure(403, 'csrf-token-invalid'), { kind: 'rejected', reason: 'form-expired' }],
    ['a control plane failure', { status: 500, body: { code: 'internal', message: 'x', details: {} } }, { kind: 'unavailable' }],
    ['a network failure', new TypeError('offline'), { kind: 'unavailable' }],
  ])('maps %s', async (_, answer, outcome) => {
    const { gateway } = controlPlane(answer);
    expect(await gateway.logIn(credentials)).toEqual(outcome);
  });
});

describe('createSessionGateway logOut', () => {
  it('forgets the session token once the session ended', async () => {
    const { gateway, requests } = controlPlane({ status: 200, body: AUTHENTICATED }, { status: 204 }, { status: 204 });
    await gateway.read();
    expect(await gateway.logOut()).toEqual({ kind: 'logged-out' });
    await gateway.logOut();
    expect(requests.map(({ csrf }) => csrf)).toEqual([null, SESSION_TOKEN, null]);
  });

  it('treats a session that had already ended as logged out', async () => {
    const { gateway } = controlPlane(failure(401, 'unauthenticated'));
    expect(await gateway.logOut()).toEqual({ kind: 'logged-out' });
  });

  it.each([
    ['a wrong CSRF token', failure(403, 'csrf-token-invalid')],
    ['a control plane failure', { status: 503, body: { code: 'unavailable', message: 'x', details: {} } }],
    ['a network failure', new TypeError('offline')],
  ])('fails on %s and keeps the token', async (_, answer) => {
    const { gateway, requests } = controlPlane({ status: 200, body: AUTHENTICATED }, answer, { status: 204 });
    await gateway.read();
    expect(await gateway.logOut()).toEqual({ kind: 'failed' });
    await gateway.logOut();
    expect(requests[2]?.csrf).toBe(SESSION_TOKEN);
  });
});

describe('createSessionGateway answer order', () => {
  const STALE_TOKEN = 'c'.repeat(43);
  const staleAnonymous: Answer = { status: 200, body: { state: 'anonymous', csrfToken: STALE_TOKEN } };

  it('keeps the login token over a read that started before the login and ends after it', async () => {
    const { gateway, held } = heldControlPlane();
    const first = gateway.read();
    const second = gateway.read();
    held[1]!.answer(anonymous);
    await second;
    const login = gateway.logIn(credentials);
    held[2]!.answer({ status: 200, body: AUTHENTICATED });
    await login;
    held[0]!.answer(staleAnonymous);
    await first;
    void gateway.logOut();
    expect(held.map(({ method, csrf }) => [method, csrf])).toEqual([
      ['GET', null],
      ['GET', null],
      ['POST', ANONYMOUS_TOKEN],
      ['DELETE', SESSION_TOKEN],
    ]);
  });

  it('keeps the login token over a logout that started before the login and ends after it', async () => {
    const { gateway, held } = heldControlPlane();
    const read = gateway.read();
    held[0]!.answer({ status: 200, body: AUTHENTICATED });
    await read;
    const logout = gateway.logOut();
    const login = gateway.logIn(credentials);
    held[2]!.answer({ status: 200, body: { ...AUTHENTICATED, csrfToken: STALE_TOKEN } });
    await login;
    held[1]!.answer({ status: 204 });
    await logout;
    void gateway.logOut();
    expect(held[3]?.csrf).toBe(STALE_TOKEN);
  });

  it('keeps the token of a read that answered after the logout was sent', async () => {
    const { gateway, held } = heldControlPlane();
    const signedIn = gateway.read();
    held[0]!.answer({ status: 200, body: AUTHENTICATED });
    await signedIn;
    const logout = gateway.logOut();
    const expiry = gateway.read();
    held[2]!.answer(anonymous);
    await expiry;
    held[1]!.answer({ status: 204 });
    await logout;
    void gateway.logIn(credentials);
    expect(held[3]?.csrf).toBe(ANONYMOUS_TOKEN);
  });
});

describe('createSessionGateway invalid answers', () => {
  const htmlResponse = () => new Response('<html></html>', { status: 200, headers: { 'Content-Type': 'text/html' } });

  function sendingOnly(make: () => Response) {
    return createSessionGateway((async () => make()) as unknown as typeof fetch);
  }

  it.each([
    ['an empty body', { status: 200 }],
    ['an empty object', { status: 200, body: {} }],
    ['an unknown state', { status: 200, body: { state: 'other', csrfToken: ANONYMOUS_TOKEN } }],
    ['a missing token', { status: 200, body: { state: 'anonymous' } }],
    ['a missing principal', { status: 200, body: { ...AUTHENTICATED, principal: undefined } }],
    ['roles that are not a list', { status: 200, body: { ...AUTHENTICATED, installationRoles: 'installation-owner' } }],
    ['an unreadable end', { status: 200, body: { ...AUTHENTICATED, expiresAt: 'soon' } }],
  ])('reads %s as unavailable', async (_, answer) => {
    const { gateway } = controlPlane(answer);
    expect(await gateway.read()).toEqual({ kind: 'unavailable' });
  });

  it('reads an HTML page and incomplete JSON as unavailable', async () => {
    expect(await sendingOnly(htmlResponse).read()).toEqual({ kind: 'unavailable' });
    const incomplete = () => new Response('{"state":', { status: 200, headers: { 'Content-Type': 'application/json' } });
    expect(await sendingOnly(incomplete).read()).toEqual({ kind: 'unavailable' });
  });

  it.each([
    ['an empty body', { status: 401 }],
    ['an empty object', { status: 401, body: {} }],
    ['a failure without a reason', { status: 401, body: { code: 'unauthenticated', message: 'x', details: {} } }],
    ['an incomplete session', { status: 200, body: { state: 'authenticated', csrfToken: SESSION_TOKEN } }],
    ['an empty success', { status: 200 }],
  ])('maps a login answer with %s to unavailable', async (_, answer) => {
    const { gateway } = controlPlane(answer);
    expect(await gateway.logIn(credentials)).toEqual({ kind: 'unavailable' });
  });

  it('maps a login answer of an HTML page to unavailable', async () => {
    expect(await sendingOnly(htmlResponse).logIn(credentials)).toEqual({ kind: 'unavailable' });
  });
});
