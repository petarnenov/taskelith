import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import {
  AuthorizationService,
  InMemoryAccessStore,
  LoginThrottle,
  OwnerBootstrapService,
  PrincipalAdministration,
  SessionService,
  type PrincipalId,
} from '@taskelith/access';
import {
  ControlPlaneApi,
  ROUTES,
  createApiServer,
  type ApiHandlers,
  type ApiRequest,
  type ApiServices,
  type RouteDefinition,
} from '@taskelith/control-plane';
import { err, failure, instantFromEpochMilliseconds, ok } from '@taskelith/kernel';
import { InMemoryLogSink, Logger } from '@taskelith/observability';
import { Argon2idPasswordHasher, NodeSecrets } from '@taskelith/secrets';
import { value } from '@taskelith/testing';

const OPERATOR = `tkop_${'B'.repeat(43)}`;
const OWNER_PASSWORD = 'owner password of this test';
const ALICE_PASSWORD = 'alice password of this test';
const INVOCATION = { actor: 'root@control-plane-1', reason: 'browser session test' };
const COOKIE_ATTRIBUTES = 'Path=/; HttpOnly; Secure; SameSite=Strict';

// The real session, role, and hashing path over the in-memory store; a
// small Argon2id cost keeps each login fast.
const store = new InMemoryAccessStore();
const secrets = new NodeSecrets();
const clock = { now: () => value(instantFromEpochMilliseconds(Date.parse('2026-10-28T09:00:00.000Z'))) };
const hasher = value(Argon2idPasswordHasher.create({ parameters: { memoryKib: 64, passes: 1, parallelism: 1 } }));
const throttle = new LoginThrottle({ clock, sleep: async () => undefined });
const sessions = new SessionService({ store, hasher, secrets, random: secrets, clock, throttle });
const administration = new PrincipalAdministration({ store, hasher, random: secrets, clock });
const owner = value(await new OwnerBootstrapService({ store, random: secrets, clock }).ensureOwner(INVOCATION)).principalId;
value(await administration.setPassword(owner, 'owner', OWNER_PASSWORD, INVOCATION));
const alice = value(await administration.createPrincipal(owner, 'alice', INVOCATION)).principalId;
value(await administration.setPassword(owner, 'alice', ALICE_PASSWORD, INVOCATION));
value(await administration.assignProjectRole(owner, { projectId: 'alpha', loginName: 'alice', role: 'project-viewer' }, INVOCATION));

// Evidence and runs of two projects; `e-down` fails, and any other
// identifier is unknown.
const EVIDENCE_PROJECTS: Record<string, string> = { 'e-alpha': 'alpha', 'e-beta': 'beta' };
const RUN_PROJECTS: Record<string, string> = { 'r-alpha': 'alpha', 'r-beta': 'beta' };
// Every read of run or project state that a handler makes.
const stateReads: string[] = [];
const sink = new InMemoryLogSink();
const api = new ControlPlaneApi({
  operator: { authenticate: async (secret: string) => (secret === OPERATOR ? ok(owner) : err(failure('forbidden', 'not the operator'))) },
  sessions,
  authorization: new AuthorizationService(store),
  runProjects: { projectOf: async (runId: string) => ok(RUN_PROJECTS[runId]) },
  runs: { createRun: async () => { stateReads.push('createRun'); return err(failure('internal', 'not under test')); } },
  evidence: {
    read: async (evidenceId: string) => {
      if (evidenceId === 'e-down') return err(failure('unavailable', 'the evidence store is down'));
      const projectId = EVIDENCE_PROJECTS[evidenceId];
      return projectId === undefined ? err(failure('not-found', `no evidence ${evidenceId}`)) : ok({ projectId });
    },
  },
  tasks: { readTaskResult: async () => ok('read') },
  logger: new Logger(sink, { now: () => '2026-10-28T09:00:00.000Z' as never }),
} as unknown as ApiServices);

// Routes of the probes below: one that accepts a session or the bearer,
// and one whose operation no requirement rule names.
const PROBES: readonly RouteDefinition[] = [
  {
    operationId: 'createProject', method: 'POST', pattern: /^\/probe$/, security: ['browserSession', 'operatorToken'], body: 'LoginRequest',
    writeOnlyBody: true, response: 'empty', success: 204, statuses: { invalid: 400, forbidden: 401, unavailable: 503, internal: 500 },
  },
  {
    operationId: 'operationOfNoRule', method: 'GET', pattern: /^\/unruled$/, security: ['browserSession'], response: 'empty', success: 204,
    statuses: { forbidden: 401, internal: 500 },
  },
];
const handlers: ApiHandlers = {
  authenticateOperator: (secret) => api.authenticateOperator(secret),
  authenticateWorker: (secret) => api.authenticateWorker(secret),
  authenticateSession: (sessionId) => api.authenticateSession(sessionId),
  authorize: (principalId, requirement) => api.authorize(principalId, requirement),
  handle: async (operationId, request, bearer) => (PROBES.some((probe) => probe.operationId === operationId)
    ? ok(undefined)
    : api.handle(operationId, request, bearer)),
};
// `createRun` as a session would reach it, with the 403 that item 11 adds to
// its document; its role check follows its body.
const SESSION_RUN_PROBE: RouteDefinition = {
  ...ROUTES.find((route) => route.operationId === 'createRun')!, pattern: /^\/session-runs$/,
  security: ['browserSession', 'operatorToken'], reasons: { 'role-required': 403 },
};
const server = createApiServer(handlers, { routes: [...ROUTES, ...PROBES, SESSION_RUN_PROBE], logger: new Logger(sink, { now: () => '2026-10-28T09:00:00.000Z' as never }) });
let base: string;

before(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => new Promise<void>((resolve) => server.close(() => resolve())));

interface Answer {
  readonly status: number;
  readonly text: string;
  readonly body: Record<string, unknown>;
  readonly setCookie: string | null;
  readonly cacheControl: string | null;
}

// Cookies are sent by hand: fetch keeps no jar.
async function call(method: string, path: string, headers: Record<string, string> = {}, body?: unknown): Promise<Answer> {
  const response = await fetch(`${base}${path}`, {
    method, headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  return {
    status: response.status, text, body: text === '' ? {} : JSON.parse(text) as Record<string, unknown>,
    setCookie: response.headers.get('set-cookie'), cacheControl: response.headers.get('cache-control'),
  };
}

interface Browser {
  readonly cookie: string;
  readonly sessionId: string;
  readonly csrfToken: string;
}

function browserOf(answer: Answer): Browser {
  const sessionId = /^__Host-taskelith-session=([^;]*);/.exec(answer.setCookie ?? '')?.[1];
  assert.ok(sessionId, `no session cookie in ${answer.setCookie}`);
  return { cookie: `__Host-taskelith-session=${sessionId}`, sessionId, csrfToken: String(answer.body.csrfToken) };
}

async function anonymous(): Promise<Browser> {
  return browserOf(await call('GET', '/session'));
}

async function logIn(browser: Browser, loginName: string, password: string): Promise<Answer> {
  return call('POST', '/session', { cookie: browser.cookie, 'x-csrf-token': browser.csrfToken }, { loginName, password });
}

async function loggedIn(loginName: string, password: string): Promise<Browser> {
  const answered = await logIn(await anonymous(), loginName, password);
  assert.equal(answered.status, 200, answered.text);
  return browserOf(answered);
}

const issued: string[] = [];
function remember(browser: Browser): Browser {
  issued.push(browser.sessionId, browser.csrfToken);
  return browser;
}

test('readSession starts an anonymous session with the exact cookie, and is never cached', async () => {
  const started = await call('GET', '/session');
  assert.equal(started.status, 200);
  assert.match(started.setCookie ?? '', new RegExp(`^__Host-taskelith-session=[A-Za-z0-9_-]{43}; ${COOKIE_ATTRIBUTES}$`));
  assert.equal(started.cacheControl, 'no-store');
  assert.equal(started.body.state, 'anonymous');
  const browser = remember(browserOf(started));
  const again = await call('GET', '/session', { cookie: browser.cookie });
  assert.deepEqual([again.status, again.setCookie, again.body], [200, null, { state: 'anonymous', csrfToken: browser.csrfToken }]);
  const unknown = await call('GET', '/session', { cookie: '__Host-taskelith-session=unknown' });
  assert.notEqual(browserOf(unknown).sessionId, 'unknown', 'an unknown cookie starts a new session');
});

test('logIn rotates the identifier and the CSRF token, and the old cookie authenticates nothing', async () => {
  const before = remember(await anonymous());
  const answered = await logIn(before, 'alice', ALICE_PASSWORD);
  assert.equal(answered.status, 200, answered.text);
  assert.equal(answered.cacheControl, 'no-store');
  assert.match(answered.setCookie ?? '', new RegExp(`; ${COOKIE_ATTRIBUTES}$`));
  const after = remember(browserOf(answered));
  assert.notEqual(after.sessionId, before.sessionId);
  assert.notEqual(after.csrfToken, before.csrfToken);
  assert.deepEqual(
    { state: answered.body.state, principal: answered.body.principal, roles: answered.body.installationRoles },
    { state: 'authenticated', principal: { principalId: alice, loginName: 'alice' }, roles: [] },
  );
  const old = await call('GET', '/session', { cookie: before.cookie });
  assert.equal(old.body.state, 'anonymous');
  assert.notEqual(old.setCookie, null, 'the rotated-out cookie starts a new session');
  assert.equal((await call('DELETE', '/session', { cookie: before.cookie, 'x-csrf-token': before.csrfToken })).status, 401);
  assert.equal((await call('GET', '/session', { cookie: after.cookie })).body.state, 'authenticated');
});

test('a session mutation without its own CSRF token is 403 before the body is read', async () => {
  const browser = remember(await anonymous());
  const other = remember(await anonymous());
  const tokens: Array<Record<string, string>> = [{}, { 'x-csrf-token': 'wrong' }, { 'x-csrf-token': other.csrfToken }];
  for (const token of tokens) {
    const refused = await call('POST', '/session', { cookie: browser.cookie, ...token }, { not: 'a login request' });
    assert.deepEqual([refused.status, refused.body.code, (refused.body.details as Record<string, string>).reason], [403, 'forbidden', 'csrf-token-invalid']);
  }
});

test('the session operations refuse a bearer, and a second session cookie names none', async () => {
  const browser = remember(await anonymous());
  const bearer = { authorization: `Bearer ${OPERATOR}`, cookie: browser.cookie, 'x-csrf-token': browser.csrfToken };
  assert.equal((await call('POST', '/session', bearer, { loginName: 'alice', password: ALICE_PASSWORD })).status, 401);
  assert.equal((await call('DELETE', '/session', bearer)).status, 401);
  assert.equal((await call('GET', '/session', bearer)).setCookie, null, 'readSession ignores the bearer');
  const doubled = { cookie: `${browser.cookie}; __Host-taskelith-session=planted`, 'x-csrf-token': browser.csrfToken };
  assert.equal((await call('POST', '/session', doubled, { loginName: 'alice', password: ALICE_PASSWORD })).status, 401);
});

test('a wrong password and an unknown login name fail alike, and are logged without the password', async () => {
  const wrong = await logIn(remember(await anonymous()), 'alice', 'not the password of alice');
  const unknown = await logIn(remember(await anonymous()), 'nobody', ALICE_PASSWORD);
  assert.equal(wrong.status, 401);
  assert.deepEqual(unknown.body, wrong.body);
  assert.equal((wrong.body.details as Record<string, string>).reason, 'login-failed');
  const failures = sink.records.filter((record) => record.event === 'access.login.failed');
  assert.deepEqual(failures.map((record) => record.fields.loginName).slice(-2), ['alice', 'nobody']);
  assert.doesNotMatch(JSON.stringify(sink.records), /not the password of alice/);
});

test('a body that breaks the login schema names no password', async () => {
  const browser = remember(await anonymous());
  const long = `secret-${'x'.repeat(1_024)}`;
  for (const body of [{ loginName: 'alice', password: long }, { loginName: 'alice', password: ALICE_PASSWORD, [ALICE_PASSWORD]: 1 }]) {
    const refused = await call('POST', '/session', { cookie: browser.cookie, 'x-csrf-token': browser.csrfToken }, body);
    assert.equal(refused.status, 400);
    assert.doesNotMatch(refused.text, /secret-x|alice password/);
  }
});

test('a login name that is not lowercase is 400, which names the rule but not the value', async () => {
  const browser = remember(await anonymous());
  const refused = await call('POST', '/session', { cookie: browser.cookie, 'x-csrf-token': browser.csrfToken }, { loginName: 'Alice', password: ALICE_PASSWORD });
  assert.deepEqual([refused.status, refused.body.code], [400, 'invalid']);
  assert.match(String(refused.body.message), /^the LoginRequest body is not valid at \/loginName; the login name must be lowercase: /);
  assert.doesNotMatch(refused.text, /Alice|alice password/);
});

test('logOut ends only its session with an expired cookie, and a repeat is 401', async () => {
  const browser = remember(await loggedIn('alice', ALICE_PASSWORD));
  const other = remember(await loggedIn('alice', ALICE_PASSWORD));
  const ended = await call('DELETE', '/session', { cookie: browser.cookie, 'x-csrf-token': browser.csrfToken });
  assert.deepEqual([ended.status, ended.text], [204, '']);
  assert.equal(ended.setCookie, `__Host-taskelith-session=; Max-Age=0; ${COOKIE_ATTRIBUTES}`);
  assert.equal((await call('DELETE', '/session', { cookie: browser.cookie, 'x-csrf-token': browser.csrfToken })).status, 401);
  assert.equal((await call('GET', '/session', { cookie: other.cookie })).body.state, 'authenticated');
});

test('a bearer wins over a cookie, and a session is checked for its CSRF token, then its role, then the body', async () => {
  const browser = remember(await loggedIn('alice', ALICE_PASSWORD));
  const invalid = { not: 'a login request' };
  const owned = await call('POST', '/probe', { authorization: `Bearer ${OPERATOR}`, cookie: browser.cookie }, { loginName: 'a', password: 'p' });
  assert.equal(owned.status, 204, 'the bearer authenticates; no CSRF token is needed');
  assert.equal((await call('POST', '/probe', {}, invalid)).status, 401);
  const unsigned = await call('POST', '/probe', { cookie: browser.cookie }, invalid);
  assert.equal((unsigned.body.details as Record<string, string>).reason, 'csrf-token-invalid');
  const denied = await call('POST', '/probe', { cookie: browser.cookie, 'x-csrf-token': browser.csrfToken }, invalid);
  assert.deepEqual([denied.status, denied.body.details], [403, { reason: 'role-required', requiredRole: 'installation-owner' }]);
  const ownerBrowser = remember(await loggedIn('owner', OWNER_PASSWORD));
  const malformed = await call('POST', '/probe', { cookie: ownerBrowser.cookie, 'x-csrf-token': ownerBrowser.csrfToken }, invalid);
  assert.equal(malformed.status, 400, 'the owner passes, so the body is read');
});

test('an operation that no requirement rule names requires the installation-owner', async () => {
  const aliceBrowser = remember(await loggedIn('alice', ALICE_PASSWORD));
  const denied = await call('GET', '/unruled', { cookie: aliceBrowser.cookie });
  assert.deepEqual([denied.status, denied.body.details], [403, { reason: 'role-required', requiredRole: 'installation-owner' }]);
  const ownerBrowser = remember(await loggedIn('owner', OWNER_PASSWORD));
  assert.equal((await call('GET', '/unruled', { cookie: ownerBrowser.cookie })).status, 204);
});

const BINDING = {
  pluginId: 'p', pluginVersion: '1', upstreamToolVersion: '1', workflowId: 'w', workflowVersion: '1',
  workflowDigest: `sha256:${'0'.repeat(64)}`, configurationRevision: 'c', policyRevision: 'r',
};

test('createRun checks CSRF before its body, validates it without storage, then checks the role before any state', async () => {
  const browser = remember(await loggedIn('alice', ALICE_PASSWORD));
  const signed = { cookie: browser.cookie, 'x-csrf-token': browser.csrfToken };
  const unsigned = await call('POST', '/session-runs', { cookie: browser.cookie }, { not: 'a run' });
  assert.deepEqual([unsigned.status, (unsigned.body.details as Record<string, string>).reason], [403, 'csrf-token-invalid']);
  const invalid = await call('POST', '/session-runs', signed, { runId: 'r-1', projectId: 'beta' });
  assert.equal(invalid.status, 400);
  assert.doesNotMatch(invalid.text, /beta/, 'the schema check names no project');
  const denials: Answer[] = [];
  for (const projectId of ['alpha', 'beta', 'project-that-does-not-exist']) {
    denials.push(await call('POST', '/session-runs', signed, { runId: 'r-1', projectId, binding: BINDING }));
  }
  const [viewed] = denials;
  assert.deepEqual([viewed?.status, viewed?.body.details], [403, { reason: 'role-required', requiredRole: 'project-operator' }]);
  assert.deepEqual(denials.map((denied) => [denied.status, denied.text]), denials.map(() => [viewed?.status, viewed?.text]),
    'an existing and a missing project are denied alike');
  assert.deepEqual(stateReads, [], 'no state is read before the role passes');
});

function request(principalId: PrincipalId, ...parameters: string[]): ApiRequest {
  return { principalId, parameters, body: undefined, query: new URLSearchParams(), correlationId: 'c-test' as never };
}

test('a foreign evidence record and an unknown one answer the same 404, to a session and to the bearer', async () => {
  const browser = remember(await loggedIn('alice', ALICE_PASSWORD));
  const answers: Answer[] = [];
  for (const path of ['/evidence/e-beta', '/evidence/e-none', '/evidence/e-beta/content', '/evidence/e-none/content']) {
    answers.push(await call('GET', path, { cookie: browser.cookie }));
  }
  answers.push(await call('GET', '/evidence/e-none', { authorization: `Bearer ${OPERATOR}` }));
  const [foreign] = answers;
  assert.deepEqual([foreign?.status, foreign?.body.code], [404, 'not-found']);
  assert.doesNotMatch(foreign?.text ?? '', /e-beta|beta/, 'the body names neither the record nor its project');
  assert.deepEqual(answers.map((answer) => [answer.status, answer.text]), answers.map(() => [foreign?.status, foreign?.text]),
    'a missing and a foreign record are answered alike');
  assert.equal((await call('GET', '/evidence/e-alpha', { cookie: (await anonymous()).cookie })).status, 401);
  assert.equal((await call('GET', '/evidence/e-down', { cookie: browser.cookie })).status, 503, 'a store failure is no 404');
  assert.ok((await api.handle('readEvidence', request(alice, 'e-alpha'), '')).ok, 'a project-viewer reads its project');
  assert.ok((await api.handle('readEvidence', request(owner, 'e-beta'), '')).ok, 'an installation-owner reads every project');
});

test('a foreign run and an unknown one are denied alike, and the G2 bridge passes the owner', async () => {
  const foreignRun = await api.handle('readTaskResult', request(alice, 'r-beta', 't'), '');
  const unknownRun = await api.handle('readTaskResult', request(alice, 'r-none', 't'), '');
  assert.ok(!foreignRun.ok && !unknownRun.ok);
  assert.deepEqual([foreignRun.error.code, foreignRun.error.details], ['forbidden', { reason: 'role-required', requiredRole: 'project-viewer' }]);
  assert.deepEqual(unknownRun.error, foreignRun.error);
  assert.deepEqual(value(await api.handle('readTaskResult', request(alice, 'r-alpha', 't'), '')), 'read');
  assert.deepEqual(value(await api.handle('readTaskResult', request(owner, 'r-none', 't'), '')), 'read', 'the G2 bridge passes the owner');
});

test('no log line, failure body, or audit event holds a password, session identifier, or CSRF token', async () => {
  const trail = value(await store.transaction((tx) => tx.audit.trail()));
  const written = JSON.stringify([sink.records, trail]);
  assert.ok(issued.length > 10);
  for (const secret of [...issued, OWNER_PASSWORD, ALICE_PASSWORD, OPERATOR]) assert.equal(written.includes(secret), false, secret);
});
