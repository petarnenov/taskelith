import { describe, expect, it, vi } from 'vitest';
import { CSRF_HEADER } from '../src/api/client';
import { MAX_PAGES } from '../src/api/read-pages';
import { createWorkersGateway } from '../src/workers/control-plane-workers';
import { enrollmentToken, issuedToken, TOKEN_SECRET, worker, workersView } from './fakes';

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function sendAnswers(...answers: Response[]) {
  const send = vi.fn<typeof fetch>();
  for (const answer of answers) send.mockResolvedValueOnce(answer);
  return send;
}

const UNAUTHENTICATED = { code: 'forbidden', message: 'No session.', details: { reason: 'unauthenticated' } };

describe('listWorkers', () => {
  it('reads the workers view with a GET of /workers and the session cookie, and no CSRF token', async () => {
    const view = workersView();
    const send = sendAnswers(json(200, view));
    expect(await createWorkersGateway({ fetch: send }).listWorkers()).toEqual({ kind: 'read', value: view });
    const [url, init] = send.mock.calls[0]!;
    expect(url).toBe('/workers');
    expect(init?.method).toBe('GET');
    expect(init?.credentials).toBe('same-origin');
    expect(new Headers(init?.headers).get(CSRF_HEADER)).toBeNull();
    expect(init?.body).toBeUndefined();
  });

  it('keeps only the documented fields of the answer', async () => {
    const planted = { ...workersView(), workers: [{ ...worker(), credentialHash: 'planted' }] };
    const result = await createWorkersGateway({ fetch: sendAnswers(json(200, planted)) }).listWorkers();
    expect(result).toEqual({ kind: 'read', value: workersView() });
  });

  it.each([
    ['401 unauthenticated', json(401, UNAUTHENTICATED), 'unauthenticated'],
    ['401 without its reason', json(401, { code: 'forbidden', message: 'No.', details: {} }), 'unavailable'],
    ['403 without a role', json(403, { code: 'forbidden', message: 'No role.', details: { reason: 'role-required' } }), 'denied'],
    ['404, which listWorkers does not document', json(404, { code: 'not-found', message: 'No.', details: {} }), 'unavailable'],
    ['500', json(500, { code: 'internal', message: 'Broken.', details: {} }), 'unavailable'],
    ['503, a source of the view unreadable', json(503, { code: 'unavailable', message: 'Later.', details: {} }), 'unavailable'],
    ['a body without the view', json(200, { asOf: '2026-11-03T09:10:00.000Z' }), 'unavailable'],
    ['a view with a date-only asOf', json(200, workersView({ asOf: '2026-11-03' })), 'unavailable'],
    ['a view with a worker identifier holding a space', json(200, workersView({ workers: [worker({ workerId: 'worker 1' })] })), 'unavailable'],
    [
      'a view with a hostname holding a control character',
      json(200, workersView({ workers: [worker({ host: { platform: 'linux', architecture: 'x64', hostname: 'b\u0007' } })] })),
      'unavailable',
    ],
    ['an HTML page', new Response('<html></html>', { status: 200, headers: { 'Content-Type': 'text/html' } }), 'unavailable'],
  ])('reads %s as %s', async (_, answer, kind) => {
    expect(await createWorkersGateway({ fetch: sendAnswers(answer) }).listWorkers()).toEqual({ kind });
  });

  it('reads a 403 with the role it needs', async () => {
    const details = { reason: 'role-required', requiredRole: 'installation-owner' };
    const answer = json(403, { code: 'forbidden', message: 'No role.', details });
    const result = await createWorkersGateway({ fetch: sendAnswers(answer) }).listWorkers();
    expect(result).toEqual({ kind: 'denied', requiredRole: 'installation-owner' });
  });

  it('reads a network failure as unreachable', async () => {
    const send = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('offline'));
    expect(await createWorkersGateway({ fetch: send }).listWorkers()).toEqual({ kind: 'unavailable' });
  });
});

const TOKEN = 'c'.repeat(43);
const CSRF_REJECTED = { code: 'forbidden', message: 'No token.', details: { reason: 'csrf-token-invalid' } };
const ROLE_REQUIRED = { code: 'forbidden', message: 'No role.', details: { reason: 'role-required', requiredRole: 'installation-owner' } };
const NOT_FOUND = { code: 'not-found', message: 'No token.', details: {} };
const INVALID = { code: 'invalid', message: 'Bad.', details: { field: 'hostname' } };
const INTERNAL = { code: 'internal', message: 'Broken.', details: {} };

function failure(reason: string, details: Record<string, string> = {}) {
  return { code: 'precondition-failed', message: 'No.', details: { reason, ...details } };
}

function gateway(send: typeof fetch) {
  return createWorkersGateway({ fetch: send, csrfToken: () => TOKEN });
}

function requestOf(send: ReturnType<typeof vi.fn<typeof fetch>>, index = 0) {
  const [url, init] = send.mock.calls[index]!;
  return { url: String(url), method: init?.method, headers: new Headers(init?.headers), body: init?.body };
}

describe('listEnrollmentTokens', () => {
  it('reads every page with GETs of /enrollment-tokens that carry no CSRF token, and joins the tokens', async () => {
    const second = enrollmentToken({ tokenId: 'token-2' });
    const send = sendAnswers(json(200, { tokens: [enrollmentToken()], next: 'token-1' }), json(200, { tokens: [second] }));
    expect(await gateway(send).listEnrollmentTokens()).toEqual({ kind: 'read', value: { tokens: [enrollmentToken(), second], truncated: false } });
    expect(requestOf(send)).toMatchObject({ url: '/enrollment-tokens', method: 'GET' });
    expect(requestOf(send).headers.get(CSRF_HEADER)).toBeNull();
    expect(requestOf(send, 1).url).toBe('/enrollment-tokens?after=token-1');
  });

  it('keeps only the documented fields of each token', async () => {
    const planted = { tokens: [{ ...enrollmentToken(), secret: TOKEN_SECRET, constraints: { hostname: 'h', secret: TOKEN_SECRET } }] };
    const result = await gateway(sendAnswers(json(200, planted))).listEnrollmentTokens();
    expect(result).toEqual({ kind: 'read', value: { tokens: [enrollmentToken({ constraints: { hostname: 'h' } })], truncated: false } });
    expect(JSON.stringify(result)).not.toContain('tken_');
  });

  it('says that the list was cut short at the page limit', async () => {
    let pages = 0;
    const send = vi.fn<typeof fetch>(async () => {
      pages += 1;
      return json(200, { tokens: [enrollmentToken({ tokenId: `t${pages}` })], next: `p${pages}` });
    });
    const result = await gateway(send).listEnrollmentTokens();
    expect(result).toMatchObject({ kind: 'read', value: { truncated: true } });
    expect(send).toHaveBeenCalledTimes(MAX_PAGES);
  });

  it.each([
    ['400, which only a cursor the control plane itself named could cause', json(400, INVALID), 'unavailable'],
    ['401 unauthenticated', json(401, UNAUTHENTICATED), 'unauthenticated'],
    ['403 with the role', json(403, ROLE_REQUIRED), 'denied'],
    ['403 csrf-token-invalid, which a GET never earns', json(403, CSRF_REJECTED), 'unavailable'],
    ['403 with an unknown reason', json(403, { code: 'forbidden', message: 'No.', details: { reason: 'unexpected' } }), 'unavailable'],
    ['403 without a reason', json(403, { code: 'forbidden', message: 'No.', details: {} }), 'unavailable'],
    ['403 without a body', new Response(null, { status: 403 }), 'unavailable'],
    ['404, which the list does not document', json(404, NOT_FOUND), 'unavailable'],
    ['503', json(503, { code: 'unavailable', message: 'Later.', details: {} }), 'unavailable'],
    ['a page with a token that fails its check', json(200, { tokens: [enrollmentToken({ tokenId: 'token 1' })] }), 'unavailable'],
    ['a page over the maximum', json(200, { tokens: Array.from({ length: 101 }, () => enrollmentToken()) }), 'unavailable'],
  ])('reads %s as %s', async (_, answer, kind) => {
    expect(await gateway(sendAnswers(answer)).listEnrollmentTokens()).toMatchObject({ kind });
  });

  it.each([
    ['403 with the role', ROLE_REQUIRED, { kind: 'denied', requiredRole: 'installation-owner' }],
    ['403 csrf-token-invalid', CSRF_REJECTED, { kind: 'unavailable' }],
    ['403 with an unknown reason', { code: 'forbidden', message: 'No.', details: { reason: 'unexpected' } }, { kind: 'unavailable' }],
  ])('reads %s on a later page as on the first', async (_, body, failure) => {
    const send = sendAnswers(json(200, { tokens: [enrollmentToken()], next: 'token-1' }), json(403, body));
    expect(await gateway(send).listEnrollmentTokens()).toEqual(failure);
    expect(send).toHaveBeenCalledTimes(2);
  });
});

describe('issueEnrollmentToken', () => {
  it('posts the constraints to /enrollment-tokens with the CSRF token and reads the 201 with its secret', async () => {
    const send = sendAnswers(json(201, issuedToken()));
    const constraints = { platform: 'linux', hostname: 'build-1' } as const;
    expect(await gateway(send).issueEnrollmentToken(constraints)).toEqual({ kind: 'issued', value: issuedToken() });
    const request = requestOf(send);
    expect(request).toMatchObject({ url: '/enrollment-tokens', method: 'POST', body: JSON.stringify(constraints) });
    expect(request.headers.get(CSRF_HEADER)).toBe(TOKEN);
    expect(request.headers.get('Content-Type')).toBe('application/json');
  });

  it('sends an empty object for no constraint', async () => {
    const send = sendAnswers(json(201, issuedToken()));
    await gateway(send).issueEnrollmentToken({});
    expect(requestOf(send).body).toBe('{}');
  });

  it('sends no CSRF header when the session has no token', async () => {
    const send = sendAnswers(json(403, CSRF_REJECTED));
    expect(await createWorkersGateway({ fetch: send }).issueEnrollmentToken({})).toEqual({ kind: 'csrf-rejected' });
    expect(requestOf(send).headers.get(CSRF_HEADER)).toBeNull();
  });

  it.each([
    ['400', json(400, INVALID), { kind: 'invalid' }],
    ['401 unauthenticated', json(401, UNAUTHENTICATED), { kind: 'unauthenticated' }],
    ['403 csrf-token-invalid', json(403, CSRF_REJECTED), { kind: 'csrf-rejected' }],
    ['403 role-required with its role', json(403, ROLE_REQUIRED), { kind: 'denied', requiredRole: 'installation-owner' }],
    ['403 without its reason', json(403, { code: 'forbidden', message: 'No.', details: {} }), { kind: 'unavailable' }],
    ['404, which issuing does not document', json(404, NOT_FOUND), { kind: 'unavailable' }],
    ['422, which issuing does not document', json(422, failure('token-used')), { kind: 'unavailable' }],
    ['500', json(500, INTERNAL), { kind: 'unavailable' }],
    ['a 201 whose secret is not of the documented shape', json(201, issuedToken({ secret: 'tken_short' })), { kind: 'unavailable' }],
    ['a 201 without a token', json(201, { secret: TOKEN_SECRET }), { kind: 'unavailable' }],
    ['a 200, which issuing does not document', json(200, issuedToken()), { kind: 'unavailable' }],
  ])('reads %s as %o', async (_, answer, result) => {
    expect(await gateway(sendAnswers(answer)).issueEnrollmentToken({})).toEqual(result);
  });

  it('reads a network failure as unreachable', async () => {
    const send = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('offline'));
    expect(await gateway(send).issueEnrollmentToken({})).toEqual({ kind: 'unavailable' });
  });
});

describe('revokeEnrollmentToken', () => {
  it('deletes /enrollment-tokens/{tokenId} with the CSRF token and no body, and reads the 204', async () => {
    const send = sendAnswers(new Response(null, { status: 204 }));
    expect(await gateway(send).revokeEnrollmentToken('token/1')).toEqual({ kind: 'revoked' });
    const request = requestOf(send);
    expect(request).toMatchObject({ url: '/enrollment-tokens/token%2F1', method: 'DELETE', body: undefined });
    expect(request.headers.get(CSRF_HEADER)).toBe(TOKEN);
  });

  it.each([
    ['400', json(400, INVALID), { kind: 'invalid' }],
    ['401 unauthenticated', json(401, UNAUTHENTICATED), { kind: 'unauthenticated' }],
    ['403 csrf-token-invalid', json(403, CSRF_REJECTED), { kind: 'csrf-rejected' }],
    ['403 role-required', json(403, ROLE_REQUIRED), { kind: 'denied', requiredRole: 'installation-owner' }],
    ['404', json(404, NOT_FOUND), { kind: 'not-found' }],
    ['422 token-used', json(422, failure('token-used')), { kind: 'token-used' }],
    ['422 token-rotated with its replacement', json(422, failure('token-rotated', { replacementTokenId: 'token-2' })), { kind: 'token-rotated', replacementTokenId: 'token-2' }],
    ['422 token-rotated without a replacement', json(422, failure('token-rotated')), { kind: 'unavailable' }],
    ['422 token-rotated with a replacement that is no identifier', json(422, failure('token-rotated', { replacementTokenId: 'token 2' })), { kind: 'unavailable' }],
    ['422 token-not-pending, which revoking does not document', json(422, failure('token-not-pending')), { kind: 'unavailable' }],
    ['422 without a reason', json(422, { code: 'precondition-failed', message: 'No.', details: {} }), { kind: 'unavailable' }],
    ['503', json(503, { code: 'unavailable', message: 'Later.', details: {} }), { kind: 'unavailable' }],
  ])('reads %s as %o', async (_, answer, result) => {
    expect(await gateway(sendAnswers(answer)).revokeEnrollmentToken('token-1')).toEqual(result);
  });
});

describe('the token commands without an answer', () => {
  it.each([
    ['revoke', (send: typeof fetch) => gateway(send).revokeEnrollmentToken('token-1')],
    ['rotate', (send: typeof fetch) => gateway(send).rotateEnrollmentToken('token-1')],
  ])('read a network failure of %s as unreachable', async (_, call) => {
    expect(await call(vi.fn<typeof fetch>().mockRejectedValue(new TypeError('offline')))).toEqual({ kind: 'unavailable' });
  });
});

describe('rotateEnrollmentToken', () => {
  it('posts to /enrollment-tokens/{tokenId}/rotation with the CSRF token and no body, and reads the 201', async () => {
    const issued = issuedToken({ token: enrollmentToken({ tokenId: 'token-2' }) });
    const send = sendAnswers(json(201, issued));
    expect(await gateway(send).rotateEnrollmentToken('token-1')).toEqual({ kind: 'issued', value: issued });
    const request = requestOf(send);
    expect(request).toMatchObject({ url: '/enrollment-tokens/token-1/rotation', method: 'POST', body: undefined });
    expect(request.headers.get(CSRF_HEADER)).toBe(TOKEN);
    expect(request.headers.get('Content-Type')).toBeNull();
  });

  it.each([
    ['403 csrf-token-invalid', json(403, CSRF_REJECTED), { kind: 'csrf-rejected' }],
    ['404', json(404, NOT_FOUND), { kind: 'not-found' }],
    ['422 token-not-pending', json(422, failure('token-not-pending')), { kind: 'token-not-pending' }],
    ['422 token-used, which rotating does not document', json(422, failure('token-used')), { kind: 'unavailable' }],
    ['500', json(500, INTERNAL), { kind: 'unavailable' }],
    ['a 201 whose secret is not of the documented shape', json(201, issuedToken({ secret: `tkwk_${'s'.repeat(43)}` })), { kind: 'unavailable' }],
  ])('reads %s as %o', async (_, answer, result) => {
    expect(await gateway(sendAnswers(answer)).rotateEnrollmentToken('token-1')).toEqual(result);
  });
});
