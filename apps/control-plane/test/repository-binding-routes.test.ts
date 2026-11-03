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
} from '@taskelith/access';
import { checkHttpSchema } from '@taskelith/contracts';
import { ControlPlaneApi, bindableProjects, createApiServer, repositoryBindingService, singlePlugin, type ApiServices } from '@taskelith/control-plane';
import {
  InMemoryRepositoryBindings,
  InMemoryScmIntegrations,
  ScmSecrets,
  normalizeOrigin,
  type RepositoryRemote,
  type ScmIntegrationId,
  type SourceControlPlugin,
  type SourceControlProvider,
} from '@taskelith/integrations';
import { err, failure, instantFromEpochMilliseconds, ok, parseIdentifier, type FailureCode, type Result } from '@taskelith/kernel';
import { InMemoryLogSink, Logger } from '@taskelith/observability';
import { Argon2idPasswordHasher, NodeSecrets } from '@taskelith/secrets';
import { value } from '@taskelith/testing';

// The two binding operations over HTTP, over in-memory stores and a fake
// SCM plugin whose resolver a test replaces; no live service is called.
const OPERATOR = `tkop_${'F'.repeat(43)}`;
const PASSWORD = 'password of the repository binding route test';
const INVOCATION = { actor: 'root@control-plane-1', reason: 'repository binding route test' };
const BEARER = { authorization: `Bearer ${OPERATOR}` };
const MISSING = `p${'f'.repeat(32)}`;
const INTEGRATION_ID = value(parseIdentifier('ScmIntegrationId', `i${'1'.repeat(32)}`)) as ScmIntegrationId;
const SECRET = 'synthetic-binding-route-secret';
const hasher = value(Argon2idPasswordHasher.create({ parameters: { memoryKib: 64, passes: 1, parallelism: 1 } }));
const DEFAULTS = {
  framework: { pluginId: 'sdlc-openspec' }, implementers: ['agent-primary'], reviewer: 'agent-primary',
  specApprover: 'delegated-reviewer', noEligibleSlot: 'wait',
};
const BINDING = Object.freeze({ integrationId: INTEGRATION_ID, repository: 'acme/project', integrationBranch: 'main', mergeMethod: 'squash' });
const REMOTE_URL = 'https://scm.example/acme/project.git';

interface Answer {
  readonly status: number;
  readonly text: string;
  readonly body: Record<string, unknown>;
}

type Headers = Record<string, string>;
type Resolver = (repository: string) => Promise<Result<RepositoryRemote>>;

function unsupported(): Promise<Result<never>> {
  return Promise.resolve(err(failure('unavailable', 'not part of this fake')));
}

// A fake SCM whose provider resolves through `resolver` and declares the
// `merge-commit` and `squash` methods.
class FakeScm {
  resolver: Resolver = async (repository) => ok({ repository, remoteUrl: `https://scm.example/${repository}.git` });
  factory: (provider: SourceControlProvider) => Result<SourceControlProvider> = ok;

  plugin(): SourceControlPlugin {
    return {
      id: 'scm-fake', secretNames: ['webhook-secret'], checkSettings: () => ok(undefined), checkSecret: () => ok(undefined),
      createProvider: () => this.factory(this.#provider()), createDecoy: () => ({ verifyWebhookDelivery: unsupported }), isEventless: () => false,
    };
  }

  #provider(): SourceControlProvider {
    return {
      capabilities: { mergeMethods: ['merge-commit', 'squash'], reviewEvidence: ['required-status'] },
      resolveRemoteUrl: ({ repository }) => this.resolver(repository),
      issueRunCredential: unsupported, refreshRunCredential: unsupported, confirmRunCredentialAdoption: unsupported,
      revokeRunCredential: unsupported, ensureMergeProtection: unsupported, openChangeRequest: unsupported,
      readChangeRequest: unsupported, setCommitStatus: unsupported, mergeChangeRequest: unsupported, verifyWebhookDelivery: unsupported,
    };
  }
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

// Each test's own stores and server, with the project ALPHA, its members
// maria (maintainer), otto (operator), and vera (viewer), and nora outside.
async function fixture(t: TestContext) {
  const store = new InMemoryAccessStore();
  const secrets = new NodeSecrets();
  const clock = { now: () => value(instantFromEpochMilliseconds(Date.parse('2026-11-03T09:00:00.000Z'))) };
  const sessions = new SessionService({ store, hasher, secrets, random: secrets, clock, throttle: new LoginThrottle({ clock, sleep: async () => undefined }) });
  const administration = new PrincipalAdministration({ store, hasher, random: secrets, clock });
  const setup = new ProjectSetupService({ store, random: secrets, clock });
  const owner = value(await new OwnerBootstrapService({ store, random: secrets, clock }).ensureOwner(INVOCATION)).principalId;
  value(await administration.setPassword(owner, 'owner', PASSWORD, INVOCATION));
  const ALPHA = value(await setup.createProject(owner, { name: 'Alpha', defaults: projectDefaults() }, INVOCATION)).projectId;
  for (const [loginName, role] of [['maria', 'project-maintainer'], ['otto', 'project-operator'], ['vera', 'project-viewer'], ['nora', undefined]] as const) {
    const { principalId } = value(await administration.createPrincipal(owner, loginName, INVOCATION));
    value(await administration.setPassword(owner, loginName, PASSWORD, INVOCATION));
    if (role !== undefined) value(await administration.assignProjectMember(owner, { projectId: ALPHA, principalId, role }, INVOCATION));
  }
  const integrations = new InMemoryScmIntegrations();
  const integration = {
    integrationId: INTEGRATION_ID, pluginId: 'scm-fake', label: 'Fake', allowedOrigin: value(normalizeOrigin('https://scm.example')),
    settings: {}, secretNames: ['webhook-secret'], revision: 1,
  };
  value(await integrations.add(integration, value(ScmSecrets.of({ 'webhook-secret': SECRET }))));
  const scm = new FakeScm();
  const bindings = new InMemoryRepositoryBindings(integrations);
  const sink = new InMemoryLogSink();
  const ports = { bindings, integrations, plugins: singlePlugin(scm.plugin()), projects: bindableProjects(setup) };
  const service = repositoryBindingService(ports, new Logger(sink, clock));
  const server = createApiServer(new ControlPlaneApi({
    operator: { authenticate: async (secret: string) => (secret === OPERATOR ? ok(owner) : err(failure('forbidden', 'not the operator'))) },
    sessions, authorization: new AuthorizationService(store), repositoryBindings: service,
  } as unknown as ApiServices), { logger: new Logger(sink, clock) });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const call = async (method: string, path: string, headers: Headers = {}, body?: unknown): Promise<Answer> => {
    const response = await fetch(`${base}${path}`, {
      method, headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    return { status: response.status, text, body: text === '' ? {} : JSON.parse(text) as Record<string, unknown> };
  };
  const [OWNER, MARIA, OTTO, VERA, NORA] = await Promise.all(['owner', 'maria', 'otto', 'vera', 'nora'].map((name) => browser(base, name)));
  const path = `/projects/${ALPHA}/repository`;
  const stored = async () => value(await bindings.get(ALPHA));
  return { call, scm, integrations, path, stored, sink, ALPHA, OWNER: OWNER!, MARIA: MARIA!, OTTO: OTTO!, VERA: VERA!, NORA: NORA! };
}

function projectDefaults() {
  return {
    frameworkPluginId: DEFAULTS.framework.pluginId, implementers: DEFAULTS.implementers, reviewer: DEFAULTS.reviewer,
    specApprover: 'delegated-reviewer' as const, noEligibleSlot: 'wait' as const,
  };
}

const denialOf = (answer: Answer) => [answer.status, answer.body.details];
const refusalOf = (answer: Answer) => [answer.status, (answer.body.details as Record<string, string> | undefined)?.reason];

test('both binding operations answer 401 without a credential, and nothing is stored', async (t) => {
  const { call, path, stored } = await fixture(t);
  assert.equal((await call('GET', path)).status, 401);
  assert.equal((await call('PUT', path, {}, { binding: BINDING })).status, 401);
  assert.equal(await stored(), undefined);
});

test('a principal without a role gets the same 403 for an existing and a missing project, before the body', async (t) => {
  const { call, path, stored, NORA, ALPHA } = await fixture(t);
  for (const projectId of [ALPHA, MISSING]) {
    const read = await call('GET', `/projects/${projectId}/repository`, NORA);
    assert.deepEqual(denialOf(read), [403, { reason: 'role-required', requiredRole: 'project-viewer' }]);
    const bind = await call('PUT', `/projects/${projectId}/repository`, NORA, { not: 'a valid body' });
    assert.deepEqual(denialOf(bind), [403, { reason: 'role-required', requiredRole: 'project-maintainer' }]);
  }
  const [existing, missing] = [await call('PUT', path, NORA, { binding: BINDING }), await call('PUT', `/projects/${MISSING}/repository`, NORA, { binding: BINDING })];
  assert.equal(existing.text, missing.text);
  assert.equal(await stored(), undefined);
});

test('only a maintainer binds: a viewer, an operator, and an owner without the role are refused; a browser needs its CSRF header', async (t) => {
  const { call, path, stored, OWNER, MARIA, OTTO, VERA } = await fixture(t);
  for (const headers of [VERA, OTTO, OWNER, BEARER]) {
    assert.deepEqual(denialOf(await call('PUT', path, headers, { binding: BINDING })), [403, { reason: 'role-required', requiredRole: 'project-maintainer' }]);
  }
  const withoutCsrf = await call('PUT', path, { cookie: MARIA.cookie! }, { binding: BINDING });
  assert.deepEqual(denialOf(withoutCsrf), [403, { reason: 'csrf-token-invalid' }]);
  assert.equal(await stored(), undefined);
});

test('a maintainer binds with the remote URL the plugin resolves, and every reader gets it as stored', async (t) => {
  const { call, path, OWNER, MARIA, OTTO, VERA } = await fixture(t);
  for (const headers of [VERA, OWNER, BEARER]) assert.equal((await call('GET', path, headers)).status, 404, 'unbound');
  const bound = await call('PUT', path, MARIA, { binding: BINDING });
  assert.equal(bound.status, 200, bound.text);
  const expected = { ...BINDING, remoteUrl: REMOTE_URL, revision: 1 };
  assert.deepEqual(bound.body, expected);
  assert.ok(checkHttpSchema('RepositoryBinding', bound.body).ok);
  for (const headers of [VERA, OTTO, MARIA, OWNER, BEARER]) assert.deepEqual((await call('GET', path, headers)).body, expected);
  assert.equal((await call('GET', `/projects/${MISSING}/repository`, OWNER)).status, 404);
});

test('a rebind is compare-and-set: the same binding keeps its revision, a change moves it, and a stale or first bind is 409', async (t) => {
  const { call, path, stored, MARIA } = await fixture(t);
  assert.equal((await call('PUT', path, MARIA, { binding: BINDING })).status, 200);
  assert.equal((await call('PUT', path, MARIA, { binding: BINDING })).status, 409, 'a first bind of a bound project');
  const same = await call('PUT', path, MARIA, { expectedRevision: 1, binding: BINDING });
  assert.deepEqual([same.status, same.body.revision], [200, 1]);
  const changed = await call('PUT', path, MARIA, { expectedRevision: 1, binding: { ...BINDING, repository: 'acme/renamed', mergeMethod: 'merge-commit' } });
  assert.deepEqual([changed.status, changed.body.revision, changed.body.remoteUrl], [200, 2, 'https://scm.example/acme/renamed.git']);
  assert.equal((await call('PUT', path, MARIA, { expectedRevision: 1, binding: BINDING })).status, 409);
  assert.equal((await stored())?.revision, 2);
});

test('a client that still sends a remote URL is refused with 400, and nothing is stored', async (t) => {
  const { call, path, stored, MARIA } = await fixture(t);
  const refused = await call('PUT', path, MARIA, { binding: { ...BINDING, remoteUrl: REMOTE_URL } });
  assert.deepEqual([refused.status, refused.body.code], [400, 'invalid']);
  assert.equal(await stored(), undefined);
});

test('each resolver failure answers its declared status and stores nothing', async (t) => {
  const { call, path, stored, scm, MARIA } = await fixture(t);
  const cases: ReadonlyArray<readonly [FailureCode, number, string | undefined]> = [
    ['not-found', 422, 'repository-not-visible'], ['forbidden', 422, 'integration-credential-refused'],
    ['unavailable', 503, undefined], ['invalid', 400, undefined], ['internal', 500, undefined], ['conflict', 500, undefined],
  ];
  for (const [code, status, reason] of cases) {
    scm.resolver = async () => err(failure(code, `the service said ${SECRET}`));
    const answer = await call('PUT', path, MARIA, { binding: BINDING });
    assert.deepEqual(refusalOf(answer), [status, reason], code);
    if (status === 422) assert.ok(checkHttpSchema('BindingRefusal', answer.body).ok, code);
    assert.ok(!answer.text.includes(SECRET), code);
  }
  scm.resolver = async (repository) => ok({ repository, remoteUrl: `https://agent:${SECRET}@scm.example/${repository}.git` });
  const malformed = await call('PUT', path, MARIA, { binding: BINDING });
  assert.equal(malformed.status, 500);
  assert.ok(!malformed.text.includes(SECRET));
  scm.resolver = async () => ok({ repository: 'acme/other', remoteUrl: 'https://scm.example/acme/other.git' });
  const foreign = await call('PUT', path, MARIA, { binding: BINDING });
  assert.deepEqual([foreign.status, foreign.body.code], [500, 'internal']);
  assert.ok(!foreign.text.includes('acme/other'));
  scm.resolver = async () => {
    throw new Error(`the plugin leaked ${SECRET}`);
  };
  const thrown = await call('PUT', path, MARIA, { binding: BINDING });
  assert.deepEqual([thrown.status, thrown.body.code], [500, 'internal']);
  assert.ok(!thrown.text.includes(SECRET));
  assert.equal(await stored(), undefined);
});

test('an origin outside the integration and an undeclared merge method are typed 422s; an unknown integration is 404', async (t) => {
  const { call, path, stored, scm, MARIA } = await fixture(t);
  const undeclared = await call('PUT', path, MARIA, { binding: { ...BINDING, mergeMethod: 'rebase' } });
  assert.deepEqual(refusalOf(undeclared), [422, 'merge-method-undeclared']);
  scm.resolver = async (repository) => ok({ repository, remoteUrl: `https://elsewhere.example/${repository}.git` });
  const elsewhere = await call('PUT', path, MARIA, { binding: BINDING });
  assert.deepEqual(refusalOf(elsewhere), [422, 'remote-origin-mismatch']);
  for (const answer of [undeclared, elsewhere]) assert.ok(checkHttpSchema('BindingRefusal', answer.body).ok);
  assert.equal((await call('PUT', path, MARIA, { binding: { ...BINDING, integrationId: `i${'2'.repeat(32)}` } })).status, 404);
  assert.equal(await stored(), undefined);
});

test('an integration whose plugin is not registered answers 503', async (t) => {
  const { call, path, integrations, MARIA } = await fixture(t);
  const other = value(parseIdentifier('ScmIntegrationId', `i${'3'.repeat(32)}`)) as ScmIntegrationId;
  value(await integrations.add({
    integrationId: other, pluginId: 'scm-gone', label: 'Gone', allowedOrigin: value(normalizeOrigin('https://scm.example')),
    settings: {}, secretNames: [], revision: 1,
  }, value(ScmSecrets.of({}))));
  assert.equal((await call('PUT', path, MARIA, { binding: { ...BINDING, integrationId: other } })).status, 503);
});

test('a bind whose integration changes while the plugin resolves answers 409 and stores nothing', async (t) => {
  const { call, path, stored, scm, integrations, MARIA } = await fixture(t);
  scm.resolver = async (repository) => {
    value(await integrations.update(INTEGRATION_ID, { expectedRevision: 1, label: 'Renamed' }));
    return ok({ repository, remoteUrl: REMOTE_URL });
  };
  assert.equal((await call('PUT', path, MARIA, { binding: BINDING })).status, 409);
  assert.equal(await stored(), undefined);
});

// A result envelope whose `ok` getter throws with a synthetic secret.
function throwingEnvelope(): never {
  return Object.defineProperty({}, 'ok', { enumerable: true, get: () => { throw new Error(`the getter leaked ${SECRET}`); } }) as never;
}

test('a plugin envelope whose getter throws answers 500 and its message reaches neither the answer nor the logs', async (t) => {
  const { call, path, stored, scm, sink, MARIA } = await fixture(t);
  scm.resolver = async () => throwingEnvelope();
  const resolving = await call('PUT', path, MARIA, { binding: BINDING });
  scm.resolver = async (repository) => ok({ repository, remoteUrl: `https://scm.example/${repository}.git` });
  scm.factory = () => throwingEnvelope();
  const building = await call('PUT', path, MARIA, { binding: BINDING });
  for (const answer of [resolving, building]) {
    assert.deepEqual([answer.status, answer.body.code], [500, 'internal']);
    assert.ok(!answer.text.includes(SECRET));
  }
  assert.ok(sink.records.length > 0);
  assert.ok(!JSON.stringify(sink.records).includes(SECRET));
  const defects = sink.records.filter((record) => record.event === 'scm.plugin.defect');
  assert.deepEqual(defects.map(({ level, fields }) => [level, fields]), ['resolveRemoteUrl', 'createProvider'].map((operation) => [
    'error', { integrationId: INTEGRATION_ID, pluginId: 'scm-fake', operation, kind: 'threw' },
  ]));
  assert.equal(await stored(), undefined);
});

test('an integration whose plugin cannot build a provider from its stored configuration answers 503 without the plugin message', async (t) => {
  const { call, path, stored, scm, sink, MARIA } = await fixture(t);
  scm.factory = () => err(failure('invalid', `the plugin refused ${SECRET}`));
  const answer = await call('PUT', path, MARIA, { binding: BINDING });
  assert.deepEqual(refusalOf(answer), [503, 'integration-configuration-unusable']);
  assert.ok(checkHttpSchema('Failure', answer.body).ok);
  assert.ok(!answer.text.includes(SECRET));
  assert.ok(!JSON.stringify(sink.records).includes(SECRET));
  assert.equal(await stored(), undefined);
});
