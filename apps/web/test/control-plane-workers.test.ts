import { describe, expect, it, vi } from 'vitest';
import { CSRF_HEADER } from '../src/api/client';
import { createWorkersGateway } from '../src/workers/control-plane-workers';
import { worker, workersView } from './fakes';

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
