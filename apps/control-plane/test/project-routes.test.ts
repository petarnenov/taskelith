import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { test, type TestContext } from 'node:test';
import {
  AuthorizationService,
  InMemoryAccessStore,
  LoginThrottle,
  OwnerBootstrapService,
  PrincipalAdministration,
  ProjectSetupService,
  SessionService,
  type PrincipalId,
} from '@taskelith/access';
import { ControlPlaneApi, createApiServer, type ApiServices } from '@taskelith/control-plane';
import { err, failure, instantFromEpochMilliseconds, ok } from '@taskelith/kernel';
import { Argon2idPasswordHasher, NodeSecrets } from '@taskelith/secrets';
import { value } from '@taskelith/testing';

const OPERATOR = `tkop_${'D'.repeat(43)}`;
const PASSWORD = 'password of the project route test';
const INVOCATION = { actor: 'root@control-plane-1', reason: 'project route test' };
const BEARER = { authorization: `Bearer ${OPERATOR}` };
const MISSING = `p${'f'.repeat(32)}`;
const hasher = value(Argon2idPasswordHasher.create({ parameters: { memoryKib: 64, passes: 1, parallelism: 1 } }));

const DEFAULTS = {
  framework: { pluginId: 'sdlc-openspec' }, implementers: ['agent-primary', 'agent-secondary'], reviewer: 'agent-secondary',
  specApprover: 'delegated-reviewer', noEligibleSlot: 'wait',
};

interface Answer {
  readonly status: number;
  readonly text: string;
  readonly body: Record<string, unknown>;
}

type Headers = Record<string, string>;

// A clock that a test moves by hand.
class TestClock {
  #now = Date.parse('2026-11-03T09:00:00.000Z');

  now() {
    return value(instantFromEpochMilliseconds(this.#now));
  }

  set(text: string): void {
    this.#now = Date.parse(text);
  }
}

async function listening(t: TestContext, api: ControlPlaneApi): Promise<string> {
  const server = createApiServer(api);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

async function fetched(base: string, method: string, path: string, headers: Headers = {}, body?: unknown): Promise<Answer> {
  const response = await fetch(`${base}${path}`, {
    method, headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  return { status: response.status, text, body: text === '' ? {} : JSON.parse(text) as Record<string, unknown> };
}

// A logged-in browser's headers, with the CSRF header of its session.
async function browser(base: string, loginName: string): Promise<Headers> {
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

// Each test's own store, clock, and server: the real session, role, and
// project path over the in-memory access store, with the project ALPHA.
async function fixture(t: TestContext) {
  const store = new InMemoryAccessStore();
  const secrets = new NodeSecrets();
  const clock = new TestClock();
  const sessions = new SessionService({ store, hasher, secrets, random: secrets, clock, throttle: new LoginThrottle({ clock, sleep: async () => undefined }) });
  const administration = new PrincipalAdministration({ store, hasher, random: secrets, clock });
  const setup = new ProjectSetupService({ store, random: secrets, clock });
  const owner = value(await new OwnerBootstrapService({ store, random: secrets, clock }).ensureOwner(INVOCATION)).principalId;
  value(await administration.setPassword(owner, 'owner', PASSWORD, INVOCATION));
  const principals: Record<string, PrincipalId> = {};
  for (const loginName of ['maria', 'otto', 'vera', 'nora']) {
    principals[loginName] = value(await administration.createPrincipal(owner, loginName, INVOCATION)).principalId;
    value(await administration.setPassword(owner, loginName, PASSWORD, INVOCATION));
  }
  const projects = { setup, members: administration };
  const base = await listening(t, new ControlPlaneApi({
    operator: { authenticate: async (secret: string) => (secret === OPERATOR ? ok(owner) : err(failure('forbidden', 'not the operator'))) },
    sessions, authorization: new AuthorizationService(store), projects,
  } as unknown as ApiServices));
  const call = (method: string, path: string, headers: Headers = {}, body?: unknown) => fetched(base, method, path, headers, body);
  const created = async (name: string, headers: Headers = BEARER): Promise<string> => {
    const answer = await call('POST', '/projects', headers, { name, defaults: DEFAULTS });
    assert.equal(answer.status, 201, answer.text);
    return String(answer.body.projectId);
  };
  const browsers: Headers[] = [];
  for (const loginName of ['owner', 'maria', 'otto', 'vera', 'nora']) browsers.push(await browser(base, loginName));
  const [OWNER, MARIA, OTTO, VERA, NORA] = browsers;
  const ALPHA = await created('Alpha');
  for (const [loginName, role] of [['maria', 'project-maintainer'], ['otto', 'project-operator'], ['vera', 'project-viewer']] as const) {
    const assigned = await call('PUT', `/projects/${ALPHA}/members/${principals[loginName]}`, OWNER!, { role });
    assert.equal(assigned.status, 200, assigned.text);
  }
  const state = (): Promise<unknown> => store.transaction(async (tx) => ok([
    await tx.projects.page({ limit: 1000 }), await tx.projectRoles.members(ALPHA, undefined, 1000), await tx.projects.defaults(ALPHA),
    await tx.audit.trail(),
  ]));
  const unchanged = async (work: () => Promise<Answer>): Promise<Answer> => {
    const before = await state();
    const answered = await work();
    assert.deepEqual(await state(), before, 'nothing is recorded');
    return answered;
  };
  return {
    clock, owner, principals, administration, sessions, projects, call, created, state, unchanged, ALPHA,
    OWNER: OWNER!, MARIA: MARIA!, OTTO: OTTO!, VERA: VERA!, NORA: NORA!,
  };
}

const projectReads = (projectId: string) => [
  ['GET', `/projects/${projectId}`], ['GET', `/projects/${projectId}/members`],
  ['GET', `/projects/${projectId}/defaults`], ['GET', `/projects/${projectId}/auto-merge`],
] as const;
const maintainerCommands = (projectId: string) => [
  ['PATCH', `/projects/${projectId}`, { expectedRevision: 1, name: 'Refused' }],
  ['PUT', `/projects/${projectId}/defaults`, { expectedRevision: 1, defaults: DEFAULTS }],
] as const;
const ownerCommands = (projectId: string, principals: Record<string, PrincipalId>) => [
  ['POST', '/projects', { name: 'Refused', defaults: DEFAULTS }],
  ['PUT', `/projects/${projectId}/members/${principals.nora}`, { role: 'project-viewer' }],
  ['DELETE', `/projects/${projectId}/members/${principals.vera}`, undefined],
] as const;

const denialOf = (answer: Answer) => [answer.status, answer.body.details];

test('every project operation answers 401 without a credential', async (t) => {
  const { call, unchanged, principals, ALPHA } = await fixture(t);
  assert.equal((await call('GET', '/projects')).status, 401);
  for (const [method, path] of projectReads(ALPHA)) assert.equal((await call(method, path)).status, 401, path);
  for (const [method, path, body] of [...maintainerCommands(ALPHA), ...ownerCommands(ALPHA, principals)]) {
    assert.equal((await unchanged(() => call(method, path, {}, body))).status, 401, path);
  }
});

test('a principal without a role on the project gets the same 403 for an existing and a missing project, before the body', async (t) => {
  const { call, unchanged, NORA, ALPHA } = await fixture(t);
  for (const projectId of [ALPHA, MISSING]) {
    for (const [method, path] of projectReads(projectId)) {
      assert.deepEqual(denialOf(await call(method, path, NORA)), [403, { reason: 'role-required', requiredRole: 'project-viewer' }], path);
    }
    for (const [method, path] of maintainerCommands(projectId)) {
      const denied = await unchanged(() => call(method, path, NORA, { not: 'a valid body' }));
      assert.deepEqual(denialOf(denied), [403, { reason: 'role-required', requiredRole: 'project-maintainer' }], path);
    }
  }
  const [existing, missing] = [await call('GET', `/projects/${ALPHA}`, NORA), await call('GET', `/projects/${MISSING}`, NORA)];
  assert.equal(existing.text, missing.text);
});

test('only an installation-owner creates projects and manages members; a maintainer is refused before the body', async (t) => {
  const { call, unchanged, principals, ALPHA, MARIA, OTTO, VERA, NORA } = await fixture(t);
  for (const headers of [MARIA, OTTO, VERA, NORA]) {
    for (const [method, path] of ownerCommands(ALPHA, principals)) {
      const denied = await unchanged(() => call(method, path, headers, method === 'DELETE' ? undefined : { not: 'a valid body' }));
      assert.deepEqual(denialOf(denied), [403, { reason: 'role-required', requiredRole: 'installation-owner' }], path);
    }
  }
});

test('a viewer and an operator read the project, and only the maintainer changes it; the owner reads but changes nothing', async (t) => {
  const { call, unchanged, ALPHA, MARIA, OTTO, VERA, OWNER } = await fixture(t);
  for (const headers of [VERA, OTTO, MARIA, OWNER, BEARER]) {
    for (const [method, path] of projectReads(ALPHA)) assert.equal((await call(method, path, headers)).status, 200, path);
  }
  for (const headers of [VERA, OTTO, OWNER, BEARER]) {
    for (const [method, path, body] of maintainerCommands(ALPHA)) {
      const denied = await unchanged(() => call(method, path, headers, body));
      assert.deepEqual(denialOf(denied), [403, { reason: 'role-required', requiredRole: 'project-maintainer' }], path);
    }
  }
});

test('a created project answers as the document declares, with no member, the creator included, and auto-merge on', async (t) => {
  const { call, clock, OWNER } = await fixture(t);
  clock.set('2026-11-03T10:00:00.000Z');
  const answer = await call('POST', '/projects', OWNER, { name: 'Beta', defaults: DEFAULTS });
  assert.equal(answer.status, 201);
  const projectId = String(answer.body.projectId);
  assert.match(projectId, /^p[0-9a-f]{32}$/);
  assert.deepEqual(answer.body, { projectId, name: 'Beta', createdAt: '2026-11-03T10:00:00.000Z', revision: 1 });
  assert.deepEqual((await call('GET', `/projects/${projectId}`, BEARER)).body, answer.body);
  assert.deepEqual((await call('GET', `/projects/${projectId}/members`, BEARER)).body, { members: [] });
  assert.deepEqual((await call('GET', `/projects/${projectId}/defaults`, BEARER)).body, { ...DEFAULTS, revision: 1 });
  assert.deepEqual((await call('GET', `/projects/${projectId}/auto-merge`, BEARER)).body, { enabled: true, revision: 1 });
});

test('a project name of 1024 supplementary characters is created and renamed over HTTP; one more is 400', async (t) => {
  const { call, administration, owner, principals, MARIA } = await fixture(t);
  const longest = '\u{1F600}'.repeat(1024);
  const answer = await call('POST', '/projects', BEARER, { name: longest, defaults: DEFAULTS });
  assert.deepEqual([answer.status, answer.body.name], [201, longest], answer.text);
  const projectId = String(answer.body.projectId);
  value(await administration.assignProjectMember(owner, { projectId, principalId: principals.maria!, role: 'project-maintainer' }, INVOCATION));
  const renamed = await call('PATCH', `/projects/${projectId}`, MARIA, { expectedRevision: 1, name: `x${longest.slice(2)}` });
  assert.deepEqual([renamed.status, renamed.body.revision], [200, 2], renamed.text);
  assert.equal((await call('PATCH', `/projects/${projectId}`, MARIA, { expectedRevision: 2, name: `x${longest}` })).status, 400);
});

test('defaults that name plugins no registry knows are stored and read as given', async (t) => {
  const { call, MARIA, ALPHA } = await fixture(t);
  const unregistered = { ...DEFAULTS, framework: { pluginId: 'sdlc-unregistered' }, implementers: ['harness-unregistered'], reviewer: 'reviewer-unregistered' };
  const created = await call('POST', '/projects', BEARER, { name: 'Unregistered', defaults: unregistered });
  assert.equal(created.status, 201, created.text);
  assert.deepEqual((await call('GET', `/projects/${String(created.body.projectId)}/defaults`, BEARER)).body, { ...unregistered, revision: 1 });
  const replaced = await call('PUT', `/projects/${ALPHA}/defaults`, MARIA, { expectedRevision: 1, defaults: unregistered });
  assert.equal(replaced.status, 200, replaced.text);
  const { revision, changedBy, changedAt, ...stored } = (await call('GET', `/projects/${ALPHA}/defaults`, MARIA)).body;
  assert.deepEqual([stored, revision, changedBy !== undefined, changedAt !== undefined], [unregistered, 2, true, true]);
});

test('an installation-owner learns 404 for a missing project; the operations it may run on one answer 404 too', async (t) => {
  const { call, unchanged, principals, ALPHA } = await fixture(t);
  for (const [method, path] of projectReads(MISSING)) {
    const missing = await call(method, path, BEARER);
    assert.deepEqual([missing.status, missing.body.code], [404, 'not-found'], path);
  }
  for (const [method, path, body] of ownerCommands(MISSING, principals).slice(1)) {
    assert.equal((await unchanged(() => call(method, path, BEARER, body))).status, 404, path);
  }
  const unknownPrincipal = await call('PUT', `/projects/${ALPHA}/members/u${'e'.repeat(32)}`, BEARER, { role: 'project-viewer' });
  assert.deepEqual([unknownPrincipal.status, unknownPrincipal.body.code], [404, 'not-found']);
});

test('a maintainer renames the project and replaces its defaults by compare-and-set; a stale revision is 409', async (t) => {
  const { call, unchanged, created, clock, administration, owner, principals, MARIA } = await fixture(t);
  const projectId = await created('Gamma');
  value(await administration.assignProjectMember(owner, { projectId, principalId: principals.maria!, role: 'project-maintainer' }, INVOCATION));
  const renamed = await call('PATCH', `/projects/${projectId}`, MARIA, { expectedRevision: 1, name: 'Gamma 2' });
  assert.deepEqual([renamed.status, renamed.body.name, renamed.body.revision], [200, 'Gamma 2', 2]);
  const stale = await unchanged(() => call('PATCH', `/projects/${projectId}`, MARIA, { expectedRevision: 1, name: 'Gamma 3' }));
  assert.deepEqual([stale.status, stale.body.code], [409, 'conflict']);
  clock.set('2026-11-03T11:00:00.000Z');
  const changed = { ...DEFAULTS, implementers: ['agent-secondary'], specApprover: 'project-maintainer', noEligibleSlot: 'reject' };
  const replaced = await call('PUT', `/projects/${projectId}/defaults`, MARIA, { expectedRevision: 1, defaults: changed });
  assert.deepEqual(replaced.body, { ...changed, revision: 2, changedBy: principals.maria, changedAt: '2026-11-03T11:00:00.000Z' });
  assert.deepEqual((await call('GET', `/projects/${projectId}/defaults`, BEARER)).body, replaced.body);
  const staleDefaults = await unchanged(() => call('PUT', `/projects/${projectId}/defaults`, MARIA, { expectedRevision: 1, defaults: DEFAULTS }));
  assert.deepEqual([staleDefaults.status, staleDefaults.body.code], [409, 'conflict']);
  const concurrent = await Promise.all(['A', 'B'].map((name) => call('PATCH', `/projects/${projectId}`, MARIA, { expectedRevision: 2, name })));
  assert.deepEqual(concurrent.map((answer) => answer.status).sort(), [200, 409], 'of two concurrent updates exactly one wins');
});

test('listProjects returns every project to an owner and to others only the projects they are members of', async (t) => {
  const { call, created, ALPHA, VERA, NORA } = await fixture(t);
  const BETA = await created('Beta');
  const all = await call('GET', '/projects', BEARER);
  const ids = (all.body.projects as Array<{ projectId: string }>).map((project) => project.projectId);
  assert.deepEqual(ids, [ALPHA, BETA].sort(), 'every project, in identifier order');
  assert.deepEqual((await call('GET', '/projects', VERA)).body, { projects: [(await call('GET', `/projects/${ALPHA}`, VERA)).body] });
  assert.deepEqual((await call('GET', '/projects', NORA)).body, { projects: [] });
  const rest = (await call('GET', `/projects?after=${ids[0]}`, BEARER)).body.projects as Array<{ projectId: string }>;
  assert.deepEqual(rest.map((project) => project.projectId), [ids[1]]);
  assert.equal((await call('GET', '/projects?after=has%20space', BEARER)).status, 400);
});

test('members are assigned, replaced, listed with their login names, and removed, also a principal that is no member', async (t) => {
  const { call, created, principals, OWNER, NORA } = await fixture(t);
  const projectId = await created('Delta');
  const path = `/projects/${projectId}/members/${principals.nora}`;
  const assigned = await call('PUT', path, OWNER, { role: 'project-operator' });
  assert.deepEqual(assigned.body, { principal: { principalId: principals.nora, loginName: 'nora' }, role: 'project-operator' });
  assert.equal((await call('PUT', path, BEARER, { role: 'project-viewer' })).status, 200);
  assert.deepEqual((await call('GET', `/projects/${projectId}/members`, BEARER)).body, {
    members: [{ principal: { principalId: principals.nora, loginName: 'nora' }, role: 'project-viewer' }],
  });
  assert.equal((await call('GET', `/projects/${projectId}`, NORA)).status, 200, 'the role applies to the next request');
  assert.equal((await call('DELETE', path, OWNER)).status, 204);
  assert.equal((await call('DELETE', path, OWNER)).status, 204);
  assert.equal((await call('DELETE', `/projects/${projectId}/members/u${'e'.repeat(32)}`, OWNER)).status, 204);
  assert.equal((await call('GET', `/projects/${projectId}`, NORA)).status, 403, 'a removal applies to the next request');
  assert.equal((await call('PUT', path, OWNER, { role: 'admin' })).status, 400);
});

test('a cookie command without its CSRF header is 403 csrf-token-invalid and records nothing', async (t) => {
  const { call, unchanged, principals, ALPHA, MARIA, OWNER } = await fixture(t);
  const commands = [
    ...maintainerCommands(ALPHA).map((command) => [...command, MARIA.cookie!] as const),
    ...ownerCommands(ALPHA, principals).map((command) => [...command, OWNER.cookie!] as const),
  ];
  for (const [method, path, body, cookie] of commands) {
    const denied = await unchanged(() => call(method, path, { cookie }, body));
    assert.deepEqual([denied.status, (denied.body.details as Record<string, string>).reason], [403, 'csrf-token-invalid'], path);
  }
});

test('a body that breaks its schema is 400 after the role check, and nothing is recorded', async (t) => {
  const { call, unchanged, ALPHA, MARIA } = await fixture(t);
  const invalid = [
    ['POST', '/projects', { name: 'X', defaults: { ...DEFAULTS, implementers: [] } }, BEARER],
    ['POST', '/projects', { name: '', defaults: DEFAULTS }, BEARER],
    ['PATCH', `/projects/${ALPHA}`, { expectedRevision: 0, name: 'X' }, MARIA],
    ['PUT', `/projects/${ALPHA}/defaults`, { expectedRevision: 1, defaults: { ...DEFAULTS, specApprover: 'council' } }, MARIA],
  ] as const;
  for (const [method, path, body, headers] of invalid) {
    assert.equal((await unchanged(() => call(method, path, headers, body))).status, 400, `${method} ${path}`);
  }
});

test('a denial by the command\'s own role check, after the server passed the caller, answers 403, never 401', async (t) => {
  const { sessions, projects, state, principals, ALPHA, VERA } = await fixture(t);
  // The server's check passes everyone, as if the role was removed after it.
  const lenientBase = await listening(t, new ControlPlaneApi({
    operator: { authenticate: async () => err(failure('forbidden', 'no bearer in this test')) },
    sessions, authorization: { authorize: async () => ok(undefined) }, projects,
  } as unknown as ApiServices));
  for (const [method, path, body] of [...maintainerCommands(ALPHA), ...ownerCommands(ALPHA, principals)]) {
    const before = await state();
    const answer = await fetched(lenientBase, method, path, VERA, body);
    assert.deepEqual([answer.status, (answer.body.details as Record<string, string>).reason], [403, 'role-required'], `${method} ${path}`);
    assert.deepEqual(await state(), before, 'nothing is recorded');
  }
});

test('a project handler passes a service failure on and refuses a request without a principal', async () => {
  const owner = `u${'a'.repeat(32)}`;
  const project = `p${'a'.repeat(32)}`;
  const down = async () => err(failure('unavailable', 'the access store is down'));
  const failing = new ControlPlaneApi({
    projects: {
      setup: {
        createProject: down, listProjects: down, readProject: down, renameProject: down, readDefaults: down, replaceDefaults: down,
        readAutoMergeSetting: down, listMembers: down,
      },
      members: { assignProjectMember: down, removeProjectMember: down },
    },
  } as unknown as ApiServices);
  const bodies: Record<string, unknown> = {
    createProject: { name: 'X', defaults: DEFAULTS }, updateProject: { expectedRevision: 1, name: 'X' },
    assignProjectMember: { role: 'project-viewer' }, updateProjectDefaults: { expectedRevision: 1, defaults: DEFAULTS },
  };
  const operations = ['listProjects', 'createProject', 'readProject', 'updateProject', 'listProjectMembers', 'assignProjectMember',
    'removeProjectMember', 'readProjectDefaults', 'updateProjectDefaults', 'readAutoMergeSetting'];
  for (const operationId of operations) {
    const request = { parameters: [project, owner], body: bodies[operationId], query: new URLSearchParams(), correlationId: 'c' as never };
    const failed = await failing.handle(operationId, { ...request, principalId: owner as PrincipalId }, '');
    assert.deepEqual(!failed.ok && failed.error.code, 'unavailable', operationId);
    const anonymous = await failing.handle(operationId, request, '');
    const needsCaller = !['readProject', 'listProjectMembers', 'readProjectDefaults', 'readAutoMergeSetting'].includes(operationId);
    assert.equal(!anonymous.ok && anonymous.error.code, needsCaller ? 'internal' : 'unavailable', operationId);
  }
  const badAfter = await failing.handle('listProjectMembers', {
    parameters: [project], body: undefined, query: new URLSearchParams({ after: 'has space' }), correlationId: 'c' as never,
    principalId: owner as PrincipalId,
  }, '');
  assert.equal(!badAfter.ok && badAfter.error.code, 'invalid');
});
