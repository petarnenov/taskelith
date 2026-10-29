import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, test } from 'node:test';
import {
  AuthorizationService,
  InMemoryAccessStore,
  LoginThrottle,
  OwnerBootstrapService,
  PrincipalAdministration,
  SessionService,
} from '@taskelith/access';
import { ControlPlaneApi, createApiServer, mintTurnId, type ApiServices } from '@taskelith/control-plane';
import {
  BEFORE_ANY_EVENT,
  InMemorySessionTimelineStore,
  InMemoryTaskLineage,
  SessionTimelineService,
  parseSessionGeneration,
  type SessionId,
  type SessionScope,
  type TurnId,
} from '@taskelith/execution';
import { err, failure, instantFromEpochMilliseconds, ok, parseIdentifier } from '@taskelith/kernel';
import { parseOwnershipGeneration, type ProjectId, type TaskId, type WorkflowRunId } from '@taskelith/sdlc';
import { Argon2idPasswordHasher, NodeSecrets } from '@taskelith/secrets';
import { sequentialIds, value } from '@taskelith/testing';

const OPERATOR = `tkop_${'C'.repeat(43)}`;
const PASSWORD = 'password of the agent session test';
const INVOCATION = { actor: 'root@control-plane-1', reason: 'agent session route test' };
const AS_OF = '2026-10-29T09:00:00.000Z';

// The real session, role, and hashing path over the in-memory access store.
const store = new InMemoryAccessStore();
const secrets = new NodeSecrets();
const clock = { now: () => value(instantFromEpochMilliseconds(Date.parse(AS_OF))) };
const hasher = value(Argon2idPasswordHasher.create({ parameters: { memoryKib: 64, passes: 1, parallelism: 1 } }));
const sessions = new SessionService({ store, hasher, secrets, random: secrets, clock, throttle: new LoginThrottle({ clock, sleep: async () => undefined }) });
const administration = new PrincipalAdministration({ store, hasher, random: secrets, clock });
const owner = value(await new OwnerBootstrapService({ store, random: secrets, clock }).ensureOwner(INVOCATION)).principalId;
value(await administration.setPassword(owner, 'owner', PASSWORD, INVOCATION));
for (const [loginName, projectId, role] of [
  ['vera', 'alpha', 'project-viewer'], ['otto', 'alpha', 'project-operator'], ['bob', 'beta', 'project-operator'], ['nora', undefined, undefined],
] as const) {
  value(await administration.createPrincipal(owner, loginName, INVOCATION));
  value(await administration.setPassword(owner, loginName, PASSWORD, INVOCATION));
  if (projectId !== undefined) value(await administration.assignProjectRole(owner, { projectId, loginName, role }, INVOCATION));
}

const id = <Kind extends string>(kind: Kind, text: string) => value(parseIdentifier(kind, text));
const scope = (projectId: string, runId: string): SessionScope => ({ projectId: id('ProjectId', projectId) as ProjectId, runId: id('RunId', runId) as WorkflowRunId });
// The cards `run-alpha` and `run-paged` of project alpha, and `run-beta` of
// beta; each session's task is a root task of its card.
const LINEAGE = new InMemoryTaskLineage({
  runs: [{ runId: 'run-alpha', projectId: 'alpha' }, { runId: 'run-paged', projectId: 'alpha' }, { runId: 'run-beta', projectId: 'beta' }],
  tasks: [],
});
const rootTask = (taskId: TaskId, at: SessionScope) => LINEAGE.addTask({ taskId, rootTaskId: taskId, depth: 0, ...at });
const timelineStore = new InMemorySessionTimelineStore(LINEAGE);
const timeline = new SessionTimelineService({
  store: timelineStore, digest: { digest: (input) => `digest:${input}` }, redactor: { redact: (text) => text },
  turnIds: { next: mintTurnId }, clock, itemIds: sequentialIds('NeedsYouItemId', 'item'),
});
const api = new ControlPlaneApi({
  operator: { authenticate: async (secret: string) => (secret === OPERATOR ? ok(owner) : err(failure('forbidden', 'not the operator'))) },
  sessions,
  authorization: new AuthorizationService(store),
  agentSessions: { timeline, scopes: timelineStore, positions: BEFORE_ANY_EVENT, clock },
} as unknown as ApiServices);
const server = createApiServer(api);
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
after(() => new Promise<void>((resolve) => server.close(() => resolve())));

const GENERATION = value(parseSessionGeneration(1));
const OWNERSHIP = value(parseOwnershipGeneration(1));
const PERSON = { kind: 'principal' as const, principalId: id('PrincipalId', 'person-1') };

// A session of a new task of the scope, with its attempt and generation 1
// running the delivered turn of key `key-1`.
async function runningSession(name: string, at: SessionScope = scope('alpha', 'run-alpha')): Promise<{ sessionId: SessionId; turnId: TurnId }> {
  const taskId = id('TaskId', `task-${name}`) as TaskId;
  rootTask(taskId, at);
  const sessionId = id('SessionId', name);
  value(await timeline.openSession({ id: sessionId, taskId, harness: id('HarnessPluginId', 'harness-a') }));
  value(await timeline.bindAttempt(sessionId, { attemptId: id('AttemptId', `attempt-${name}`), taskId, ownershipGeneration: OWNERSHIP }));
  value(await timeline.startGeneration(sessionId, { generation: GENERATION, nativeSessionId: id('NativeSessionId', 'native-1') }));
  const submitted = value(await timeline.submitTurn(sessionId, { key: id('IdempotencyKey', 'key-1'), author: PERSON, text: 'first turn' }));
  value(await timeline.deliverTurn(sessionId, { turnId: submitted.turn.id, generation: GENERATION }));
  return { sessionId, turnId: submitted.turn.id };
}

async function ask(sessionId: SessionId, turnId: TurnId, native: string, kind: 'permission-request' | 'input-request' = 'permission-request') {
  const key = { generation: GENERATION, nativeRequestId: id('NativeRequestId', native) };
  value(await timeline.recordRequest(sessionId, { key, kind, turnId, text: `may I ${native}` }));
}

// `s-alpha` has the open requests `request-1` (permission) and `request-2`
// (input); `s-beta` is of project beta; `s-stopped` is stopped by a limit.
const ALPHA = await runningSession('s-alpha');
await ask(ALPHA.sessionId, ALPHA.turnId, 'request-1');
await ask(ALPHA.sessionId, ALPHA.turnId, 'request-2', 'input-request');
const BETA = await runningSession('s-beta', scope('beta', 'run-beta'));
const STOPPED = await runningSession('s-stopped');
value(await timeline.recordLimitSignal(STOPPED.sessionId, {}));

interface Answer {
  readonly status: number;
  readonly text: string;
  readonly body: Record<string, unknown>;
}

async function call(method: string, path: string, headers: Record<string, string> = {}, body?: unknown): Promise<Answer> {
  const response = await fetch(`${base}${path}`, {
    method, headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  return { status: response.status, text, body: text === '' ? {} : JSON.parse(text) as Record<string, unknown> };
}

// A logged-in browser's headers, with the CSRF header of its session.
async function browser(loginName: string): Promise<Record<string, string>> {
  const anonymous = await fetch(`${base}/session`);
  const cookie = /^(__Host-taskelith-session=[^;]*);/.exec(anonymous.headers.get('set-cookie') ?? '')![1]!;
  const csrf = String((await anonymous.json() as { csrfToken: string }).csrfToken);
  const loggedIn = await fetch(`${base}/session`, {
    method: 'POST', headers: { cookie, 'x-csrf-token': csrf, 'content-type': 'application/json' }, body: JSON.stringify({ loginName, password: PASSWORD }),
  });
  assert.equal(loggedIn.status, 200);
  const rotated = /^(__Host-taskelith-session=[^;]*);/.exec(loggedIn.headers.get('set-cookie') ?? '')![1]!;
  return { cookie: rotated, 'x-csrf-token': String((await loggedIn.json() as { csrfToken: string }).csrfToken) };
}

const BEARER = { authorization: `Bearer ${OPERATOR}` };
const VERA = await browser('vera');
const OTTO = await browser('otto');
const BOB = await browser('bob');
const NORA = await browser('nora');

const sessionPath = (sessionId: string, project = 'alpha') => `/projects/${project}/agent-sessions/${sessionId}`;
const turnBody = (key: string, text = `text of ${key}`) => ({ idempotencyKey: key, text });
const responseBody = (key: string, native = 'request-1', answer: unknown = { kind: 'permission', decision: 'allow' }, attemptId = 'attempt-s-alpha') => ({
  idempotencyKey: key, request: { generation: 1, nativeRequestId: native }, attemptId, ownershipGeneration: 1, answer,
});

// Every routed operation of section 9, with a valid body for each command.
const READS = [
  ['GET', '/projects/alpha/cards/run-alpha/agent-sessions'],
  ['GET', sessionPath('s-alpha')],
  ['GET', `${sessionPath('s-alpha')}/turns`],
  ['GET', `${sessionPath('s-alpha')}/requests`],
] as const;
const COMMANDS = [
  ['POST', `${sessionPath('s-alpha')}/turns`, turnBody('refused-key')],
  ['POST', `${sessionPath('s-alpha')}/responses`, responseBody('refused-key')],
] as const;

async function unchanged<T>(work: () => Promise<T>): Promise<T> {
  const before = value(await timeline.readSession(ALPHA.sessionId));
  const answered = await work();
  assert.deepEqual(value(await timeline.readSession(ALPHA.sessionId)), before, 'nothing is recorded');
  return answered;
}

test('every agent session operation answers 401 without a credential', async () => {
  for (const [method, path] of READS) assert.equal((await call(method, path)).status, 401, path);
  for (const [method, path, body] of COMMANDS) assert.equal((await unchanged(() => call(method, path, {}, body))).status, 401, path);
});

test('a principal without a role on the project, or with a role on another, is refused 403 role-required on every operation', async () => {
  for (const headers of [NORA, BOB]) {
    for (const [method, path] of READS) {
      const denied = await call(method, path, headers);
      assert.deepEqual([denied.status, denied.body.details], [403, { reason: 'role-required', requiredRole: 'project-viewer' }], path);
    }
    for (const [method, path, body] of COMMANDS) {
      const denied = await unchanged(() => call(method, path, headers, body));
      assert.deepEqual([denied.status, denied.body.details], [403, { reason: 'role-required', requiredRole: 'project-operator' }], path);
    }
  }
});

test('a project-viewer reads every view and is refused both commands with 403 before the body', async () => {
  for (const [method, path] of READS) assert.equal((await call(method, path, VERA)).status, 200, path);
  for (const [method, path] of COMMANDS) {
    const denied = await unchanged(() => call(method, path, VERA, { not: 'a valid body' }));
    assert.deepEqual([denied.status, denied.body.details], [403, { reason: 'role-required', requiredRole: 'project-operator' }], path);
  }
});

test('an installation-owner without a project role reads every view and is refused both commands', async () => {
  const ownerBrowser = await browser('owner');
  for (const headers of [BEARER, ownerBrowser]) {
    for (const [method, path] of READS) assert.equal((await call(method, path, headers)).status, 200, path);
    for (const [method, path, body] of COMMANDS) {
      const denied = await unchanged(() => call(method, path, headers, body));
      assert.deepEqual([denied.status, denied.body.details], [403, { reason: 'role-required', requiredRole: 'project-operator' }], path);
    }
  }
});

test('a cookie command without its CSRF header is 403 csrf-token-invalid and records nothing', async () => {
  for (const [method, path, body] of COMMANDS) {
    const denied = await unchanged(() => call(method, path, { cookie: OTTO.cookie! }, body));
    assert.deepEqual([denied.status, (denied.body.details as Record<string, string>).reason], [403, 'csrf-token-invalid'], path);
  }
});

test('a session of another project answers a member the same 404 as an unknown one, on every operation', async () => {
  const answers: Answer[] = [];
  for (const sessionId of [BETA.sessionId, 's-unknown']) {
    answers.push(await call('GET', sessionPath(sessionId), OTTO));
    answers.push(await call('GET', `${sessionPath(sessionId)}/turns`, OTTO));
    answers.push(await call('GET', `${sessionPath(sessionId)}/requests`, OTTO));
    answers.push(await call('POST', `${sessionPath(sessionId)}/turns`, OTTO, turnBody('foreign-key')));
    answers.push(await call('POST', `${sessionPath(sessionId)}/responses`, OTTO, responseBody('foreign-key', 'request-1', undefined, 'attempt-s-beta')));
  }
  const [first] = answers;
  assert.deepEqual([first?.status, first?.body.code], [404, 'not-found']);
  assert.doesNotMatch(first?.text ?? '', /s-beta|beta/, 'the body names neither the session nor its project');
  assert.deepEqual(answers.map((answer) => [answer.status, answer.text]), answers.map(() => [first?.status, first?.text]));
  assert.equal(value(await timeline.readSession(BETA.sessionId)).turns.length, 1, 'no turn reached the foreign session');
});

test('listAgentSessions answers 404 for a run that is no card of the project, and 400 for a malformed after', async () => {
  for (const path of ['/projects/alpha/cards/run-beta/agent-sessions', '/projects/alpha/cards/run-none/agent-sessions']) {
    const unknown = await call('GET', path, OTTO);
    assert.deepEqual([unknown.status, unknown.body.code], [404, 'not-found'], path);
  }
  assert.equal((await call('GET', `/projects/alpha/cards/run-alpha/agent-sessions?after=${'x'.repeat(129)}`, OTTO)).status, 400);
  for (const after of ['-1', '01', 'one']) assert.equal((await call('GET', `${sessionPath('s-alpha')}/turns?after=${after}`, OTTO)).status, 400, after);
});

test('listAgentSessions pages a card\'s sessions in identifier order with a next key, stamped before any event', async () => {
  const card = scope('alpha', 'run-paged');
  for (let index = 0; index < 101; index += 1) {
    const taskId = id('TaskId', `task-paged-${index}`) as TaskId;
    rootTask(taskId, card);
    value(await timeline.openSession({ id: id('SessionId', `paged-${String(index).padStart(3, '0')}`), taskId, harness: id('HarnessPluginId', 'harness-a') }));
  }
  const first = await call('GET', '/projects/alpha/cards/run-paged/agent-sessions', VERA);
  const sessionsOf = (answer: Answer) => (answer.body.sessions as { sessionId: string; runId: string }[]);
  assert.deepEqual([first.status, first.body.asOf, first.body.position, sessionsOf(first).length, first.body.next], [200, AS_OF, '0', 100, 'paged-099']);
  assert.ok(sessionsOf(first).every((session) => session.runId === 'run-paged'));
  const second = await call('GET', '/projects/alpha/cards/run-paged/agent-sessions?after=paged-099', VERA);
  assert.deepEqual([sessionsOf(second).map((session) => session.sessionId), second.body.next], [['paged-100'], undefined]);
});

test('readAgentSession shows the card, attempt, generation, positions, limit, and output bounds', async () => {
  const read = await call('GET', sessionPath('s-alpha'), VERA);
  assert.equal(read.status, 200);
  assert.deepEqual(read.body, {
    asOf: AS_OF, position: '0',
    session: {
      sessionId: 's-alpha', taskId: 'task-s-alpha', runId: 'run-alpha', harness: 'harness-a',
      activeAttempt: { attemptId: 'attempt-s-alpha', ownershipGeneration: 1 }, runningGeneration: 1,
      lastTurnPosition: 1, lastRequestPosition: 2, output: { lastPosition: 0 },
    },
  });
  const stopped = await call('GET', sessionPath('s-stopped'), VERA);
  assert.deepEqual((stopped.body.session as { limit: unknown }).limit, {});
});

test('submitTurn records a turn under a minted identifier, repeats it, and refuses a reused key, a stopped session, and an empty text', async () => {
  const path = `${sessionPath('s-alpha')}/turns`;
  const recorded = await call('POST', path, OTTO, turnBody('submit-1'));
  assert.equal(recorded.status, 201, recorded.text);
  const turn = recorded.body.turn as { turnId: string; author: unknown; state: string; position: number };
  assert.match(turn.turnId, /^t[0-9a-f]{32}$/);
  assert.deepEqual([recorded.body.effect, turn.state, turn.position], ['recorded', 'queued', 2]);
  const ottoId = value(await sessions.authenticate(/=(.*)$/.exec(OTTO.cookie!)![1]!)).principal!.principalId;
  assert.deepEqual(turn.author, { kind: 'principal', principalId: ottoId });
  const repeated = await call('POST', path, OTTO, turnBody('submit-1'));
  assert.deepEqual([repeated.status, repeated.body], [200, { effect: 'duplicate', turn }]);
  const reused = await call('POST', path, OTTO, turnBody('submit-1', 'another text'));
  assert.deepEqual([reused.status, reused.body.code, (reused.body.details as Record<string, string>).reason], [409, 'conflict', 'idempotency-key-reused']);
  const stopped = await call('POST', `${sessionPath('s-stopped')}/turns`, OTTO, turnBody('submit-2'));
  assert.deepEqual([stopped.status, stopped.body.code, (stopped.body.details as Record<string, string>).reason], [422, 'precondition-failed', 'session-stopped']);
  assert.equal((await call('POST', path, OTTO, turnBody('submit-3', ''))).status, 400);
  assert.equal(value(await timeline.readSession(ALPHA.sessionId)).turns.length, 2);
});

test('respondToNativeRequest answers with the request and its position, repeats it, and refuses as section 9 orders', async () => {
  const path = `${sessionPath('s-alpha')}/responses`;
  const wrongKind = await call('POST', path, OTTO, responseBody('respond-0', 'request-1', { kind: 'input', text: 'yes' }));
  assert.deepEqual([wrongKind.status, wrongKind.body.code], [400, 'invalid']);
  const notCurrent = await call('POST', path, OTTO, responseBody('respond-0', 'request-1', undefined, 'attempt-other'));
  assert.deepEqual([notCurrent.status, notCurrent.body.code, (notCurrent.body.details as Record<string, string>).reason], [422, 'precondition-failed', 'attempt-not-current']);
  const unknown = await call('POST', path, OTTO, responseBody('respond-0', 'request-9'));
  assert.deepEqual([unknown.status, unknown.body.code], [404, 'not-found']);
  const answered = await call('POST', path, OTTO, responseBody('respond-1'));
  assert.equal(answered.status, 200, answered.text);
  assert.deepEqual([answered.body.position, answered.body.state, answered.body.delivery, answered.body.answer], [1, 'answered', 'pending', { kind: 'permission', decision: 'allow' }]);
  const repeated = await call('POST', path, OTTO, responseBody('respond-1'));
  assert.deepEqual([repeated.status, repeated.body], [200, answered.body]);
  const reused = await call('POST', path, OTTO, responseBody('respond-1', 'request-1', { kind: 'permission', decision: 'deny' }));
  assert.deepEqual([reused.status, (reused.body.details as Record<string, string>).reason], [409, 'idempotency-key-reused']);
  const second = await call('POST', path, OTTO, responseBody('respond-2', 'request-1', { kind: 'permission', decision: 'deny' }));
  assert.deepEqual([second.status, (second.body.details as Record<string, string>).reason], [409, 'already-answered']);
  const input = await call('POST', path, OTTO, responseBody('respond-3', 'request-2', { kind: 'input', text: 'an answer' }));
  assert.deepEqual([input.status, input.body.position, input.body.answer], [200, 2, { kind: 'input', text: 'an answer' }]);
});

test('an expired request answers 404 and is never answered', async () => {
  const expiring = await runningSession('s-expiring');
  await ask(expiring.sessionId, expiring.turnId, 'request-1');
  value(await timeline.recordTurnOutcome(expiring.sessionId, { turnId: expiring.turnId, generation: GENERATION, outcome: 'completed' }));
  const expired = await call('POST', `${sessionPath('s-expiring')}/responses`, OTTO, responseBody('expired-1', 'request-1', undefined, 'attempt-s-expiring'));
  assert.deepEqual([expired.status, expired.body.code], [404, 'not-found']);
  assert.match(String(expired.body.message), /holds the request as expired/);
  assert.equal(value(await timeline.readSession(expiring.sessionId)).requests[0]!.state, 'expired');
});

test('listAgentSessionTurns shows a refused turn with its generation, and pages after a position', async () => {
  const paged = await runningSession('s-turns');
  const queued: TurnId[] = [];
  for (let index = 2; index <= 101; index += 1) {
    const submitted = value(await timeline.submitTurn(paged.sessionId, { key: id('IdempotencyKey', `key-${index}`), author: PERSON, text: `turn ${index}` }));
    queued.push(submitted.turn.id);
  }
  value(await timeline.recordTurnRefused(paged.sessionId, { turnId: queued[0]!, generation: GENERATION }));
  const first = await call('GET', `${sessionPath('s-turns')}/turns`, VERA);
  const turns = first.body.turns as { position: number; state: string; generation?: number }[];
  assert.deepEqual([first.status, turns.length, first.body.next], [200, 100, 100]);
  assert.deepEqual(turns[1], { ...turns[1], position: 2, state: 'refused', generation: 1 });
  const second = await call('GET', `${sessionPath('s-turns')}/turns?after=100`, VERA);
  assert.deepEqual([(second.body.turns as { position: number }[]).map((turn) => turn.position), second.body.next], [[101], undefined]);
});

test('listAgentSessionRequests numbers requests from 1 in recording order, and pages after a position', async () => {
  const paged = await runningSession('s-requests');
  for (let index = 1; index <= 101; index += 1) await ask(paged.sessionId, paged.turnId, `native-${index}`);
  const first = await call('GET', `${sessionPath('s-requests')}/requests`, VERA);
  const requests = first.body.requests as { position: number; key: { nativeRequestId: string }; state: string }[];
  assert.deepEqual([first.status, requests.length, first.body.next], [200, 100, 100]);
  assert.deepEqual(requests.slice(0, 2).map((request) => [request.position, request.key.nativeRequestId, request.state]), [[1, 'native-1', 'open'], [2, 'native-2', 'open']]);
  const second = await call('GET', `${sessionPath('s-requests')}/requests?after=100`, VERA);
  const rest = second.body.requests as { position: number; key: { nativeRequestId: string } }[];
  assert.deepEqual([rest.map((request) => [request.position, request.key.nativeRequestId]), second.body.next], [[[101, 'native-101']], undefined]);
});
