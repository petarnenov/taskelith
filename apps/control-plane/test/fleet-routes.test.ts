import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { test, type TestContext } from 'node:test';
import {
  AuthorizationService,
  InMemoryAccessStore,
  LoginThrottle,
  OwnerBootstrapService,
  PrincipalAdministration,
  SessionService,
  type SecretHash,
} from '@taskelith/access';
import { checkHttpSchema } from '@taskelith/contracts';
import { ControlPlaneApi, createApiServer, type ApiServices } from '@taskelith/control-plane';
import type { WorkerId } from '@taskelith/execution';
import {
  EnrollmentTokenService,
  FLEET_LIMITS,
  InMemoryFleetRegistry,
  InMemoryWorkerAdmissions,
  decideWorkerAdmission,
  fleetToken,
  fleetWorker,
  type WorkerAdmissionView,
} from '@taskelith/fleet';
import { err, failure, instantFromEpochMilliseconds, ok, parseInstant, type Instant } from '@taskelith/kernel';
import { InMemoryLogSink, Logger } from '@taskelith/observability';
import { Argon2idPasswordHasher, NodeSecrets, REDACTED, RandomIdentifiers } from '@taskelith/secrets';
import { value } from '@taskelith/testing';

const OPERATOR = `tkop_${'D'.repeat(43)}`;
const PASSWORD = 'password of the fleet route test';
const INVOCATION = { actor: 'root@control-plane-1', reason: 'fleet route test' };
const BEARER = { authorization: `Bearer ${OPERATOR}` };
const TTL = FLEET_LIMITS.enrollmentTokenTtlMilliseconds;
const UNKNOWN = `e${'f'.repeat(32)}`;
const LONG_AGO = value(parseInstant('2000-01-01T00:00:00.000Z'));
const hasher = value(Argon2idPasswordHasher.create({ parameters: { memoryKib: 64, passes: 1, parallelism: 1 } }));

interface Answer {
  readonly status: number;
  readonly text: string;
  readonly body: Record<string, unknown>;
  readonly headers: Headers;
}

type RequestHeaders = Record<string, string>;

// A clock that a test moves by hand.
class TestClock {
  #now = Date.parse('2026-11-04T09:00:00.000Z');

  now(): Instant {
    return value(instantFromEpochMilliseconds(this.#now));
  }

  advance(milliseconds: number): void {
    this.#now += milliseconds;
  }
}

const later = (instant: string, milliseconds: number) => new Date(Date.parse(instant) + milliseconds).toISOString();

async function fetched(base: string, method: string, path: string, headers: RequestHeaders = {}, body?: unknown): Promise<Answer> {
  const response = await fetch(`${base}${path}`, {
    method, headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  return { status: response.status, text, body: text === '' ? {} : JSON.parse(text) as Record<string, unknown>, headers: response.headers };
}

// A logged-in browser's headers, with the CSRF header of its session.
async function browser(base: string, loginName: string): Promise<RequestHeaders> {
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

// Each test's own stores, clock, and server: the real session and role path
// over the in-memory access store, the in-memory registry, and a log sink.
async function fixture(t: TestContext, workers?: WorkerAdmissionView) {
  const store = new InMemoryAccessStore();
  const secrets = new NodeSecrets();
  const clock = new TestClock();
  const sessions = new SessionService({ store, hasher, secrets, random: secrets, clock, throttle: new LoginThrottle({ clock, sleep: async () => undefined }) });
  const administration = new PrincipalAdministration({ store, hasher, random: secrets, clock });
  const owner = value(await new OwnerBootstrapService({ store, random: secrets, clock }).ensureOwner(INVOCATION)).principalId;
  value(await administration.setPassword(owner, 'owner', PASSWORD, INVOCATION));
  value(await administration.createPrincipal(owner, 'vera', INVOCATION));
  value(await administration.setPassword(owner, 'vera', PASSWORD, INVOCATION));
  const registry = new InMemoryFleetRegistry(() => clock.now());
  const admissions = new InMemoryWorkerAdmissions({ registry, now: () => clock.now() });
  const tokens = new EnrollmentTokenService({ registry, secrets, ids: new RandomIdentifiers(), clock });
  const sink = new InMemoryLogSink();
  const server = createApiServer(new ControlPlaneApi({
    operator: { authenticate: async (secret: string) => (secret === OPERATOR ? ok(owner) : err(failure('forbidden', 'not the operator'))) },
    sessions, authorization: new AuthorizationService(store), fleet: { workers: workers ?? admissions, tokens },
  } as unknown as ApiServices), { logger: new Logger(sink, clock) });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const call = (method: string, path: string, headers: RequestHeaders = {}, body?: unknown) => fetched(base, method, path, headers, body);
  const issued = async (constraints: Record<string, string> = {}, headers: RequestHeaders = BEARER): Promise<{ tokenId: string; secret: string }> => {
    const answer = await call('POST', '/enrollment-tokens', headers, constraints);
    assert.equal(answer.status, 201, 'the fixture token is issued');
    const { token, secret } = answer.body as { token: { tokenId: string }; secret: string };
    return { tokenId: token.tokenId, secret };
  };
  const state = async (): Promise<unknown> => [value(await registry.pendingTokens(undefined, 1000)), value(await registry.activeWorkerIds())];
  const unchanged = async (work: () => Promise<Answer>): Promise<Answer> => {
    const before = await state();
    const answered = await work();
    assert.deepEqual(await state(), before, 'nothing is recorded');
    return answered;
  };
  const enrolled = async (workerId: string, journalId: string): Promise<WorkerId> => {
    value(await registry.addToken(fleetToken(`t-${workerId}`)));
    const worker = fleetWorker(workerId, journalId);
    value(await registry.enroll(`t-${workerId}` as SecretHash, worker));
    return worker.workerId;
  };
  return { call, clock, registry, admissions, sink, issued, unchanged, enrolled, OWNER: await browser(base, 'owner'), VERA: await browser(base, 'vera') };
}

const denialOf = (answer: Answer) => [answer.status, answer.body.details];
const reasonOf = (answer: Answer) => [answer.status, (answer.body.details as Record<string, string> | undefined)?.reason];

const commands = (tokenId: string) => [
  ['POST', '/enrollment-tokens', {}],
  ['DELETE', `/enrollment-tokens/${tokenId}`, undefined],
  ['POST', `/enrollment-tokens/${tokenId}/rotation`, undefined],
] as const;

test('every workers and token operation answers 401 without a credential, and 403 role-required for a principal that is no owner, before the body', async (t) => {
  const { call, unchanged, issued, VERA } = await fixture(t);
  const { tokenId } = await issued();
  for (const path of ['/workers', '/enrollment-tokens']) assert.equal((await call('GET', path)).status, 401, path);
  for (const [method, path, body] of commands(tokenId)) assert.equal((await unchanged(() => call(method, path, {}, body))).status, 401, path);
  for (const path of ['/workers', '/enrollment-tokens']) {
    assert.deepEqual(denialOf(await call('GET', path, VERA)), [403, { reason: 'role-required', requiredRole: 'installation-owner' }], path);
  }
  for (const [method, path] of commands(tokenId)) {
    const denied = await unchanged(() => call(method, path, VERA, { platform: 'not a platform' }));
    assert.deepEqual(denialOf(denied), [403, { reason: 'role-required', requiredRole: 'installation-owner' }], path);
  }
});

test('a cookie command without its CSRF header is 403 csrf-token-invalid and records nothing', async (t) => {
  const { call, unchanged, issued, OWNER } = await fixture(t);
  const { tokenId } = await issued();
  for (const [method, path, body] of commands(tokenId)) {
    const denied = await unchanged(() => call(method, path, { cookie: OWNER.cookie! }, body));
    assert.deepEqual(reasonOf(denied), [403, 'csrf-token-invalid'], path);
  }
});

test('the workers view lists the enrolled workers in identifier order with every detail redacted again', async (t) => {
  const { call, clock, admissions, enrolled, OWNER } = await fixture(t);
  const secret = new NodeSecrets().issue('worker').secret;
  const second = await enrolled('w2', 'j2');
  const first = await enrolled('w1', 'j1');
  const failed = { checkId: 'linux-containment', outcome: 'failed', details: [`probe saw ${secret}`, 'no cgroup.kill'] } as const;
  value(await admissions.record(first, decideWorkerAdmission([failed], 'linux'), 1 as never, clock.now()));
  const view = await call('GET', '/workers', OWNER);
  assert.equal(view.status, 200, 'the view is answered');
  assert.ok(checkHttpSchema('WorkersView', view.body).ok);
  const workers = view.body.workers as Array<{ workerId: string; admission: string; results: Array<{ details: string[] }> }>;
  assert.deepEqual([view.body.asOf, workers.map((worker) => [worker.workerId, worker.admission])], [clock.now(), [[first, 'self-check-failed'], [second, 'awaiting-self-check']]]);
  assert.deepEqual(workers[0]!.results[0]!.details, [`probe saw ${REDACTED}`, 'no cgroup.kill']);
  assert.ok(!view.text.includes(secret));
  assert.ok(!view.text.includes('controlPlaneHash'), 'no credential hash');
  assert.equal((await call('GET', '/workers', BEARER)).status, 200, 'the operator bearer reads it too');
});

test('the workers view answers 503 with no partial data when a source cannot be read', async (t) => {
  const down: WorkerAdmissionView = { workers: async () => err(failure('unavailable', 'worker w1 has an unreadable enrollment record', { worker: 'w1' })) };
  const { call, OWNER } = await fixture(t, down);
  const view = await call('GET', '/workers', OWNER);
  assert.deepEqual([view.status, view.body.code, 'workers' in view.body], [503, 'unavailable', false]);
});

test('an issued token is revealed once in a 201 with no-store, and is listed as pending without its secret', async (t) => {
  const { call, clock, issued, OWNER } = await fixture(t);
  const answer = await call('POST', '/enrollment-tokens', OWNER, { platform: 'linux', hostname: 'build-1' });
  assert.equal(answer.status, 201, 'the token is issued');
  assert.equal(answer.headers.get('cache-control'), 'no-store');
  assert.ok(checkHttpSchema('IssuedEnrollmentToken', answer.body).ok, 'the issued token keeps its schema');
  const { token, secret } = answer.body as { token: Record<string, unknown>; secret: string };
  assert.match(secret, /^tken_[A-Za-z0-9_-]{43}$/);
  assert.match(String(token.tokenId), /^e[0-9a-f]{32}$/);
  assert.deepEqual(token, { tokenId: token.tokenId, issuedAt: clock.now(), expiresAt: later(clock.now(), TTL), constraints: { platform: 'linux', hostname: 'build-1' } });
  const operatorIssued = await issued({ architecture: 'arm64' }, BEARER);
  assert.notEqual(operatorIssued.tokenId, token.tokenId);
  const listed = await call('GET', '/enrollment-tokens', OWNER);
  assert.equal(listed.status, 200, 'the tokens are listed');
  assert.ok(checkHttpSchema('EnrollmentTokenPage', listed.body).ok);
  const tokens = listed.body.tokens as Array<{ tokenId: string }>;
  assert.deepEqual(tokens.map((entry) => entry.tokenId).sort(), [String(token.tokenId), operatorIssued.tokenId].sort());
  assert.ok(!listed.text.includes('tken_'));
  assert.equal(listed.body.next, undefined);
});

test('a body that breaks the constraints schema and an after that is no identifier are 400 after the role check', async (t) => {
  const { call, unchanged, VERA } = await fixture(t);
  for (const body of [{ platform: 'windows' }, { hostname: '' }, { extra: 'field' }, []]) {
    assert.equal((await unchanged(() => call('POST', '/enrollment-tokens', BEARER, body))).status, 400, JSON.stringify(body));
    assert.equal((await unchanged(() => call('POST', '/enrollment-tokens', VERA, body))).status, 403, JSON.stringify(body));
  }
  const after = await call('GET', '/enrollment-tokens?after=a%20b', BEARER);
  assert.deepEqual([after.status, after.body.details], [400, { field: 'after' }]);
  assert.equal((await call('GET', '/enrollment-tokens?after=a%20b', VERA)).status, 403);
});

test('the token list pages by identifier at 100 and leaves out used, expired, and revoked tokens', async (t) => {
  const { call, registry, issued, OWNER } = await fixture(t);
  for (let n = 1; n <= 101; n++) value(await registry.addToken(fleetToken(`t${String(n).padStart(3, '0')}`)));
  const first = await call('GET', '/enrollment-tokens', OWNER);
  const page = first.body.tokens as Array<{ tokenId: string }>;
  assert.deepEqual([page.length, page[0]?.tokenId, page.at(-1)?.tokenId, first.body.next], [100, 'id-t001', 'id-t100', 'id-t100']);
  const second = await call('GET', `/enrollment-tokens?after=${first.body.next}`, OWNER);
  assert.deepEqual([(second.body.tokens as unknown[]).length, second.body.next], [1, undefined]);
  value(await registry.addToken(fleetToken('expired', {}, LONG_AGO)));
  value(await registry.enroll('t001' as SecretHash, fleetWorker('w1', 'j1')));
  assert.equal((await call('DELETE', '/enrollment-tokens/id-t002', OWNER)).status, 204);
  const { tokenId } = await issued();
  const third = await call('GET', '/enrollment-tokens?after=id-t100', OWNER);
  assert.deepEqual((third.body.tokens as Array<{ tokenId: string }>).map((entry) => entry.tokenId), ['id-t101']);
  const all = [...(await call('GET', '/enrollment-tokens', OWNER)).body.tokens as Array<{ tokenId: string }>, ...third.body.tokens as Array<{ tokenId: string }>];
  const ids = all.map((entry) => entry.tokenId);
  assert.deepEqual([ids.includes('id-t001'), ids.includes('id-t002'), ids.includes('id-expired'), ids.includes(tokenId)], [false, false, false, true]);
});

test('a revocation answers 204 for a pending, repeated, or expired token, 404 for an unknown one, 422 token-used for a used one, and 400 for a bad identifier', async (t) => {
  const { call, clock, registry, issued, OWNER } = await fixture(t);
  const { tokenId, secret } = await issued();
  assert.equal((await call('DELETE', `/enrollment-tokens/${tokenId}`, OWNER)).status, 204);
  assert.equal((await call('DELETE', `/enrollment-tokens/${tokenId}`, OWNER)).status, 204);
  assert.equal(value(await registry.unusedToken(new NodeSecrets().hashOf(secret))), undefined, 'the token cannot be redeemed');
  const expiring = await issued();
  clock.advance(TTL);
  assert.equal((await call('DELETE', `/enrollment-tokens/${expiring.tokenId}`, BEARER)).status, 204);
  assert.equal((await call('DELETE', `/enrollment-tokens/${UNKNOWN}`, OWNER)).status, 404);
  const used = await issued();
  value(await registry.enroll(new NodeSecrets().hashOf(used.secret), fleetWorker('w1', 'j1')));
  assert.deepEqual(reasonOf(await call('DELETE', `/enrollment-tokens/${used.tokenId}`, OWNER)), [422, 'token-used']);
  assert.equal((await call('DELETE', '/enrollment-tokens/a%20b', OWNER)).status, 400);
});

test('a rotation answers 201 with a new token of the same constraints and TTL, after which the old one is rotated and not pending', async (t) => {
  const { call, clock, registry, issued, OWNER } = await fixture(t);
  const old = await issued({ architecture: 'arm64' });
  clock.advance(5 * 60_000);
  const rotated = await call('POST', `/enrollment-tokens/${old.tokenId}/rotation`, OWNER);
  assert.equal(rotated.status, 201, 'the token is rotated');
  assert.equal(rotated.headers.get('cache-control'), 'no-store');
  assert.ok(checkHttpSchema('IssuedEnrollmentToken', rotated.body).ok, 'the rotated token keeps its schema');
  const { token, secret } = rotated.body as { token: Record<string, unknown>; secret: string };
  assert.notEqual(token.tokenId, old.tokenId);
  assert.ok(secret !== old.secret, 'the replacement has its own secret');
  assert.deepEqual(token, { tokenId: token.tokenId, issuedAt: clock.now(), expiresAt: later(clock.now(), TTL), constraints: { architecture: 'arm64' } });
  const listed = await call('GET', '/enrollment-tokens', OWNER);
  assert.deepEqual((listed.body.tokens as Array<{ tokenId: string }>).map((entry) => entry.tokenId), [token.tokenId]);
  assert.equal(value(await registry.unusedToken(new NodeSecrets().hashOf(old.secret))), undefined, 'the old secret cannot be redeemed');
  assert.deepEqual(reasonOf(await call('POST', `/enrollment-tokens/${old.tokenId}/rotation`, OWNER)), [422, 'token-not-pending']);
  clock.advance(TTL);
  const revoked = await call('DELETE', `/enrollment-tokens/${old.tokenId}`, OWNER);
  assert.deepEqual([revoked.status, revoked.body.details], [422, { reason: 'token-rotated', replacementTokenId: token.tokenId }]);
  assert.deepEqual(reasonOf(await call('POST', `/enrollment-tokens/${token.tokenId}/rotation`, BEARER)), [422, 'token-not-pending'], 'expired');
  assert.equal((await call('POST', `/enrollment-tokens/${UNKNOWN}/rotation`, OWNER)).status, 404);
  assert.equal((await call('POST', '/enrollment-tokens/a%20b/rotation', OWNER)).status, 400);
  const used = await issued();
  value(await registry.enroll(new NodeSecrets().hashOf(used.secret), fleetWorker('w1', 'j1')));
  assert.deepEqual(reasonOf(await call('POST', `/enrollment-tokens/${used.tokenId}/rotation`, OWNER)), [422, 'token-not-pending'], 'used');
});

test('a token secret reaches only the 201 bodies of issue and rotate: never a list, a failure, or the request log', async (t) => {
  const { call, registry, issued, sink, OWNER, VERA } = await fixture(t);
  const { tokenId, secret } = await issued();
  const rotated = await call('POST', `/enrollment-tokens/${tokenId}/rotation`, OWNER);
  const replacement = (rotated.body as { token: { tokenId: string }; secret: string });
  value(await registry.enroll(new NodeSecrets().hashOf(replacement.secret), fleetWorker('w1', 'j1')));
  const others = [
    await call('GET', '/enrollment-tokens', OWNER), await call('GET', '/workers', OWNER),
    await call('DELETE', `/enrollment-tokens/${tokenId}`, OWNER), await call('DELETE', `/enrollment-tokens/${replacement.token.tokenId}`, OWNER),
    await call('POST', `/enrollment-tokens/${tokenId}/rotation`, OWNER), await call('POST', '/enrollment-tokens', VERA, {}),
    await call('POST', '/enrollment-tokens', BEARER, { platform: 'windows' }),
  ];
  assert.deepEqual(others.map((answer) => answer.status), [200, 200, 422, 422, 422, 403, 400]);
  // A fixed message: the answer itself is what would carry the secret.
  others.forEach((answer, index) => assert.ok(!answer.text.includes('tken_'), `no secret in answer ${index}, status ${answer.status}`));
  const logged = JSON.stringify(sink.records);
  assert.ok(sink.records.some((record) => record.event === 'api.request'), 'the request log was captured');
  assert.ok(!logged.includes('tken_'), 'no secret in the request log');
  for (const value of [secret, replacement.secret]) assert.ok(!logged.includes(value));
});

test('a secret-shaped hostname of a worker host or a token constraint is redacted on the way out, and only the issue and rotate secret is kept', async (t) => {
  const { call, registry, OWNER } = await fixture(t);
  const secrets = new NodeSecrets();
  const hostSecret = secrets.issue('worker').secret;
  const constraintSecret = secrets.issue('enrollment').secret;
  value(await registry.addToken(fleetToken('t-w1')));
  value(await registry.enroll('t-w1' as SecretHash, fleetWorker('w1', 'j1', { host: { platform: 'linux', architecture: 'x64', hostname: hostSecret } })));
  const view = await call('GET', '/workers', OWNER);
  assert.ok(checkHttpSchema('WorkersView', view.body).ok, 'the redacted view keeps its schema');
  assert.ok((view.body.workers as Array<{ host: { hostname: string } }>)[0]?.host.hostname === REDACTED, 'the host name is redacted');
  assert.ok(!view.text.includes(hostSecret), 'no host secret in the view');
  const issued = await call('POST', '/enrollment-tokens', OWNER, { hostname: constraintSecret });
  assert.equal(issued.status, 201, 'the token is issued');
  const { token, secret } = issued.body as { token: { tokenId: string; constraints: { hostname: string } }; secret: string };
  assert.ok(token.constraints.hostname === REDACTED && secret.startsWith('tken_'), 'the issued constraint is redacted, the secret kept');
  const rotated = await call('POST', `/enrollment-tokens/${token.tokenId}/rotation`, OWNER);
  const replacement = rotated.body as { token: { constraints: { hostname: string } }; secret: string };
  assert.ok(replacement.token.constraints.hostname === REDACTED && replacement.secret.startsWith('tken_'), 'the rotated constraint is redacted, the secret kept');
  const listed = await call('GET', '/enrollment-tokens', OWNER);
  assert.ok(checkHttpSchema('EnrollmentTokenPage', listed.body).ok, 'the redacted page keeps its schema');
  assert.ok((listed.body.tokens as Array<{ constraints: { hostname: string } }>)[0]?.constraints.hostname === REDACTED, 'the listed constraint is redacted');
  for (const answer of [issued, rotated, listed]) assert.ok(!answer.text.includes(constraintSecret), 'no constraint secret in an answer');
  const stored = value(await registry.unusedToken(secrets.hashOf(replacement.secret)));
  assert.ok(stored?.constraints.hostname === constraintSecret, 'the stored constraint still matches the host');
});
