import { describe, expect, it, vi } from 'vitest';
import { CSRF_HEADER } from '../src/api/client';
import type { SubmitResult } from '../src/board/board';
import { createBoardGateway } from '../src/board/control-plane-board';
import { createSessionGateway } from '../src/session/control-plane-session';
import { turn } from './fakes';

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function sendAnswers(...answers: (Response | Error)[]) {
  const send = vi.fn<typeof fetch>();
  for (const answer of answers) {
    if (answer instanceof Error) send.mockRejectedValueOnce(answer);
    else send.mockResolvedValueOnce(answer);
  }
  return send;
}

const TOKEN = 'c'.repeat(43);
const SUBMISSION = { idempotencyKey: 'key-1', text: 'Fix the build' };
const RECORDED = turn({ turnId: 'turn-3', position: 3, state: 'queued', text: 'Fix the build' });
const failure = (code: string, reason?: string, more: Record<string, string> = {}) => ({
  code,
  message: 'Refused.',
  details: reason === undefined ? {} : { reason, ...more },
});

function submit(send: typeof fetch, csrfToken: () => string | undefined = () => TOKEN): Promise<SubmitResult> {
  return createBoardGateway({ fetch: send, csrfToken }).submitTurn('project/1', 'session.1', SUBMISSION);
}

describe('submitTurn', () => {
  it('posts the submission with the session token to the encoded path, and reads a recorded turn', async () => {
    const send = sendAnswers(json(201, { effect: 'recorded', turn: RECORDED }));
    expect(await submit(send)).toEqual({ kind: 'recorded', turn: RECORDED });
    const [url, init] = send.mock.calls[0]!;
    expect(url).toBe('/projects/project%2F1/agent-sessions/session.1/turns');
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).get(CSRF_HEADER)).toBe(TOKEN);
    expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json');
    expect(JSON.parse(String(init?.body))).toEqual(SUBMISSION);
  });

  it('reads a duplicate as the turn the control plane had recorded', async () => {
    const send = sendAnswers(json(200, { effect: 'duplicate', turn: RECORDED }));
    expect(await submit(send)).toEqual({ kind: 'duplicate', turn: RECORDED });
  });

  it('sends no token while none is known, and lets the control plane decide', async () => {
    const send = sendAnswers(json(403, failure('forbidden', 'csrf-token-invalid')));
    expect(await submit(send, () => undefined)).toEqual({ kind: 'csrf-rejected' });
    expect(new Headers(send.mock.calls[0]![1]?.headers).has(CSRF_HEADER)).toBe(false);
    const bare = createBoardGateway({ fetch: sendAnswers(json(201, { effect: 'recorded', turn: RECORDED })) });
    expect(await bare.submitTurn('project-1', 'session-1', SUBMISSION)).toEqual({ kind: 'recorded', turn: RECORDED });
  });

  it.each<[string, Response | Error, SubmitResult]>([
    ['a 201 whose effect says duplicate', json(201, { effect: 'duplicate', turn: RECORDED }), { kind: 'unavailable' }],
    ['a 200 whose effect says recorded', json(200, { effect: 'recorded', turn: RECORDED }), { kind: 'unavailable' }],
    ['a 201 without a turn', json(201, { effect: 'recorded' }), { kind: 'unavailable' }],
    ['a 201 whose turn lacks its state', json(201, { effect: 'recorded', turn: { ...RECORDED, state: 'lost' } }), { kind: 'unavailable' }],
    ['a 201 without a JSON body', new Response('created', { status: 201 }), { kind: 'unavailable' }],
    ['a 400', json(400, failure('invalid')), { kind: 'invalid' }],
    ['a 401 without a session', json(401, failure('unauthenticated', 'unauthenticated')), { kind: 'unauthenticated' }],
    ['a 401 with another reason', json(401, failure('unauthenticated', 'login-failed')), { kind: 'unavailable' }],
    ['a 403 for the token', json(403, failure('forbidden', 'csrf-token-invalid')), { kind: 'csrf-rejected' }],
    [
      'a 403 for the role',
      json(403, failure('forbidden', 'role-required', { requiredRole: 'project-operator' })),
      { kind: 'denied', requiredRole: 'project-operator' },
    ],
    ['a 403 without a reason', json(403, failure('forbidden')), { kind: 'unavailable' }],
    ['a 403 with an unknown reason', json(403, failure('forbidden', 'rate-limited')), { kind: 'unavailable' }],
    ['a 404', json(404, failure('not-found')), { kind: 'not-found' }],
    ['a 409', json(409, { code: 'conflict', message: 'Reused.', details: { reason: 'idempotency-key-reused' } }), { kind: 'key-reused' }],
    ['a 409 for another answer', json(409, { code: 'conflict', message: 'Answered.', details: { reason: 'already-answered' } }), { kind: 'unavailable' }],
    ['a 409 without a reason', json(409, failure('conflict')), { kind: 'unavailable' }],
    ['a 409 without a JSON body', new Response('conflict', { status: 409 }), { kind: 'unavailable' }],
    [
      'a 422',
      json(422, { code: 'precondition-failed', message: 'Stopped.', details: { reason: 'session-stopped' } }),
      { kind: 'session-stopped' },
    ],
    ['a 422 with another reason', json(422, failure('precondition-failed', 'session-handed-off')), { kind: 'unavailable' }],
    ['a 422 without a reason', json(422, failure('precondition-failed')), { kind: 'unavailable' }],
    ['a 500', json(500, failure('internal')), { kind: 'unavailable' }],
    ['a 503', json(503, failure('unavailable')), { kind: 'unavailable' }],
    ['an undocumented 429', new Response('slow down', { status: 429 }), { kind: 'unavailable' }],
    ['no answer', new TypeError('offline'), { kind: 'unavailable' }],
  ])('reads %s as %o', async (_, answer, result) => {
    expect(await submit(sendAnswers(answer))).toEqual(result);
  });
});

describe('the session gateway token for the board gateway', () => {
  const session = (token: string) => ({
    state: 'authenticated',
    csrfToken: token,
    principal: { principalId: 'p-1', loginName: 'operator' },
    installationRoles: [],
    expiresAt: '2026-11-04T11:00:00.000Z',
  });

  it('gives the board gateway the token of the latest session answer, and none once the session ended', async () => {
    const send = sendAnswers(
      json(200, session(TOKEN)),
      json(201, { effect: 'recorded', turn: RECORDED }),
      json(200, session('d'.repeat(43))),
      json(201, { effect: 'recorded', turn: RECORDED }),
      new Response(null, { status: 204 }),
      json(201, { effect: 'recorded', turn: RECORDED }),
    );
    const sessions = createSessionGateway(send);
    const board = createBoardGateway({ fetch: send, csrfToken: sessions.csrfToken });
    expect(sessions.csrfToken()).toBeUndefined();
    await sessions.read();
    await board.submitTurn('project-1', 'session-1', SUBMISSION);
    await sessions.read();
    await board.submitTurn('project-1', 'session-1', SUBMISSION);
    await sessions.logOut();
    await board.submitTurn('project-1', 'session-1', SUBMISSION);
    const tokens = send.mock.calls.map(([, init]) => new Headers(init?.headers).get(CSRF_HEADER));
    expect(tokens).toEqual([null, TOKEN, null, 'd'.repeat(43), 'd'.repeat(43), null]);
  });
});
