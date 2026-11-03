import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, test } from 'node:test';
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

// The real session, role, and project path over the in-memory access store.
const store = new InMemoryAccessStore();
const secrets = new NodeSecrets();
let now = Date.parse('2026-11-03T09:00:00.000Z');
const clock = { now: () => value(instantFromEpochMilliseconds(now)) };
const hasher = value(Argon2idPasswordHasher.create({ parameters: { memoryKib: 64, passes: 1, parallelism: 1 } }));
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

const api = new ControlPlaneApi({
  operator: { authenticate: async (secret: string) => (secret === OPERATOR ? ok(owner) : err(failure('forbidden', 'not the operator'))) },
  sessions,
  authorization: new AuthorizationService(store),
  projects: { setup, members: administration },
} as unknown as ApiServices);
const server = createApiServer(api);
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
after(() => new Promise<void>((resolve) => server.close(() => resolve())));

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
const OWNER = await browser('owner');
const MARIA = await browser('maria');
const OTTO = await browser('otto');
const VERA = await browser('vera');
const NORA = await browser('nora');

const DEFAULTS = {
  framework: { pluginId: 'sdlc-openspec' }, implementers: ['agent-primary', 'agent-secondary'], reviewer: 'agent-secondary',
  specApprover: 'delegated-reviewer', noEligibleSlot: 'wait',
};

async function created(name: string, headers: Record<string, string> = BEARER): Promise<string> {
  const answer = await call('POST', '/projects', headers, { name, defaults: DEFAULTS });
  assert.equal(answer.status, 201, answer.text);
  return String(answer.body.projectId);
}

const ALPHA = await created('Alpha');
for (const [loginName, role] of [['maria', 'project-maintainer'], ['otto', 'project-operator'], ['vera', 'project-viewer']] as const) {
  const assigned = await call('PUT', `/projects/${ALPHA}/members/${principals[loginName]}`, OWNER, { role });
  assert.equal(assigned.status, 200, assigned.text);
}
const MISSING = `p${'f'.repeat(32)}`;

const projectReads = (projectId: string) => [
  ['GET', `/projects/${projectId}`], ['GET', `/projects/${projectId}/members`],
  ['GET', `/projects/${projectId}/defaults`], ['GET', `/projects/${projectId}/auto-merge`],
] as const;
const maintainerCommands = (projectId: string) => [
  ['PATCH', `/projects/${projectId}`, { expectedRevision: 1, name: 'Refused' }],
  ['PUT', `/projects/${projectId}/defaults`, { expectedRevision: 1, defaults: DEFAULTS }],
] as const;
const ownerCommands = (projectId: string) => [
  ['POST', '/projects', { name: 'Refused', defaults: DEFAULTS }],
  ['PUT', `/projects/${projectId}/members/${principals.nora}`, { role: 'project-viewer' }],
  ['DELETE', `/projects/${projectId}/members/${principals.vera}`, undefined],
] as const;

async function state(): Promise<unknown> {
  return store.transaction(async (tx) => ok([
    await tx.projects.page({ limit: 1000 }), await tx.projectRoles.members(ALPHA, undefined, 1000), await tx.projects.defaults(ALPHA),
    await tx.audit.trail(),
  ]));
}

async function unchanged(work: () => Promise<Answer>): Promise<Answer> {
  const before = await state();
  const answered = await work();
  assert.deepEqual(await state(), before, 'nothing is recorded');
  return answered;
}

const denialOf = (answer: Answer) => [answer.status, answer.body.details];

test('every project operation answers 401 without a credential', async () => {
  assert.equal((await call('GET', '/projects')).status, 401);
  for (const [method, path] of projectReads(ALPHA)) assert.equal((await call(method, path)).status, 401, path);
  for (const [method, path, body] of [...maintainerCommands(ALPHA), ...ownerCommands(ALPHA)]) {
    assert.equal((await unchanged(() => call(method, path, {}, body))).status, 401, path);
  }
});

test('a principal without a role on the project gets the same 403 for an existing and a missing project, before the body', async () => {
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

test('only an installation-owner creates projects and manages members; a maintainer is refused before the body', async () => {
  for (const headers of [MARIA, OTTO, VERA, NORA]) {
    for (const [method, path] of ownerCommands(ALPHA)) {
      const denied = await unchanged(() => call(method, path, headers, method === 'DELETE' ? undefined : { not: 'a valid body' }));
      assert.deepEqual(denialOf(denied), [403, { reason: 'role-required', requiredRole: 'installation-owner' }], path);
    }
  }
});

test('a viewer and an operator read the project, and only the maintainer changes it; the owner reads but changes nothing', async () => {
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

test('a created project answers as the document declares, with no member, the creator included, and auto-merge on', async () => {
  now = Date.parse('2026-11-03T10:00:00.000Z');
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

test('an installation-owner learns 404 for a missing project; the operations it may run on one answer 404 too', async () => {
  for (const [method, path] of projectReads(MISSING)) {
    const missing = await call(method, path, BEARER);
    assert.deepEqual([missing.status, missing.body.code], [404, 'not-found'], path);
  }
  for (const [method, path, body] of ownerCommands(MISSING).slice(1)) {
    assert.equal((await unchanged(() => call(method, path, BEARER, body))).status, 404, path);
  }
  const unknownPrincipal = await call('PUT', `/projects/${ALPHA}/members/u${'e'.repeat(32)}`, BEARER, { role: 'project-viewer' });
  assert.deepEqual([unknownPrincipal.status, unknownPrincipal.body.code], [404, 'not-found']);
});

test('a maintainer renames the project and replaces its defaults by compare-and-set; a stale revision is 409', async () => {
  const projectId = await created('Gamma');
  value(await administration.assignProjectMember(owner, { projectId, principalId: principals.maria!, role: 'project-maintainer' }, INVOCATION));
  const renamed = await call('PATCH', `/projects/${projectId}`, MARIA, { expectedRevision: 1, name: 'Gamma 2' });
  assert.deepEqual([renamed.status, renamed.body.name, renamed.body.revision], [200, 'Gamma 2', 2]);
  const stale = await unchanged(() => call('PATCH', `/projects/${projectId}`, MARIA, { expectedRevision: 1, name: 'Gamma 3' }));
  assert.deepEqual([stale.status, stale.body.code], [409, 'conflict']);
  now = Date.parse('2026-11-03T11:00:00.000Z');
  const changed = { ...DEFAULTS, implementers: ['agent-secondary'], specApprover: 'project-maintainer', noEligibleSlot: 'reject' };
  const replaced = await call('PUT', `/projects/${projectId}/defaults`, MARIA, { expectedRevision: 1, defaults: changed });
  assert.deepEqual(replaced.body, { ...changed, revision: 2, changedBy: principals.maria, changedAt: '2026-11-03T11:00:00.000Z' });
  assert.deepEqual((await call('GET', `/projects/${projectId}/defaults`, BEARER)).body, replaced.body);
  const staleDefaults = await unchanged(() => call('PUT', `/projects/${projectId}/defaults`, MARIA, { expectedRevision: 1, defaults: DEFAULTS }));
  assert.deepEqual([staleDefaults.status, staleDefaults.body.code], [409, 'conflict']);
  const concurrent = await Promise.all(['A', 'B'].map((name) => call('PATCH', `/projects/${projectId}`, MARIA, { expectedRevision: 2, name })));
  assert.deepEqual(concurrent.map((answer) => answer.status).sort(), [200, 409], 'of two concurrent updates exactly one wins');
});

test('listProjects returns every project to an owner and to others only the projects they are members of', async () => {
  const all = await call('GET', '/projects', BEARER);
  const ids = (all.body.projects as Array<{ projectId: string }>).map((project) => project.projectId);
  assert.deepEqual(ids, [...ids].sort(), 'in identifier order');
  assert.ok(ids.includes(ALPHA) && ids.length >= 2);
  assert.deepEqual((await call('GET', '/projects', VERA)).body, { projects: [(await call('GET', `/projects/${ALPHA}`, VERA)).body] });
  assert.deepEqual((await call('GET', '/projects', NORA)).body, { projects: [] });
  assert.deepEqual((await call('GET', `/projects?after=${ids.at(-1)}`, BEARER)).body, { projects: [] });
  assert.equal((await call('GET', '/projects?after=has%20space', BEARER)).status, 400);
});

test('members are assigned, replaced, listed with their login names, and removed, also a principal that is no member', async () => {
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

test('a cookie command without its CSRF header is 403 csrf-token-invalid and records nothing', async () => {
  const commands = [
    ...maintainerCommands(ALPHA).map((command) => [...command, MARIA.cookie!] as const),
    ...ownerCommands(ALPHA).map((command) => [...command, OWNER.cookie!] as const),
  ];
  for (const [method, path, body, cookie] of commands) {
    const denied = await unchanged(() => call(method, path, { cookie }, body));
    assert.deepEqual([denied.status, (denied.body.details as Record<string, string>).reason], [403, 'csrf-token-invalid'], path);
  }
});

test('a body that breaks its schema is 400 after the role check, and nothing is recorded', async () => {
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

test('a denial by the command\'s own role check, after the server passed the caller, answers 403, never 401', async () => {
  // The server's check passes everyone, as if the role was removed after it.
  const lenient = createApiServer(new ControlPlaneApi({
    operator: { authenticate: async () => err(failure('forbidden', 'no bearer in this test')) },
    sessions, authorization: { authorize: async () => ok(undefined) }, projects: { setup, members: administration },
  } as unknown as ApiServices));
  await new Promise<void>((resolve) => lenient.listen(0, '127.0.0.1', () => resolve()));
  after(() => new Promise<void>((resolve) => lenient.close(() => resolve())));
  const lenientBase = `http://127.0.0.1:${(lenient.address() as AddressInfo).port}`;
  const commands = [...maintainerCommands(ALPHA), ...ownerCommands(ALPHA)];
  for (const [method, path, body] of commands) {
    const before = await state();
    const response = await fetch(`${lenientBase}${path}`, {
      method, headers: { ...VERA, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const answer = await response.json() as { details: Record<string, string> };
    assert.deepEqual([response.status, answer.details.reason], [403, 'role-required'], `${method} ${path}`);
    assert.deepEqual(await state(), before, 'nothing is recorded');
  }
});
