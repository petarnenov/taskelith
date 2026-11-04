import assert from 'node:assert/strict';
import { createHmac, generateKeyPairSync } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { test, type TestContext } from 'node:test';
import {
  AuthorizationService,
  InMemoryAccessStore,
  LoginThrottle,
  OwnerBootstrapService,
  PrincipalAdministration,
  SessionService,
} from '@taskelith/access';
import { ControlPlaneApi, createApiServer, scmIntegrationServices, singlePlugin, type ApiServices, type ScmIntegrationPorts } from '@taskelith/control-plane';
import {
  InMemoryScmIntegrationAudit, InMemoryScmIntegrations, ScmSecrets, normalizeOrigin,
  type DeliveryRecording, type ScmIntegrationId, type ScmIntegrations, type ScmWebhookDeliveries,
} from '@taskelith/integrations';
import { err, failure, instantFromEpochMilliseconds, ok, parseIdentifier, type Instant } from '@taskelith/kernel';
import { InMemoryLogSink, Logger } from '@taskelith/observability';
import { githubSourceControlPlugin } from '@taskelith/scm-github';
import { Argon2idPasswordHasher, NodeSecrets } from '@taskelith/secrets';
import { value } from '@taskelith/testing';

// The four SCM integration operations over HTTP with the GitHub plugin's
// checks, over in-memory stores; every secret here is synthetic.
const OPERATOR = `tkop_${'E'.repeat(43)}`;
const PASSWORD = 'password of the scm integration route test';
const INVOCATION = { actor: 'root@control-plane-1', reason: 'scm integration route test' };
const BEARER = { authorization: `Bearer ${OPERATOR}` };
const MISSING = `i${'f'.repeat(32)}`;
const WEBHOOK_SECRET = 'synthetic-route-webhook-secret';
const ROTATED_SECRET = 'synthetic-rotated-webhook-secret';
const PRIVATE_KEY = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const PEM_LINE = PRIVATE_KEY.split('\n')[1]!;
const AT = value(instantFromEpochMilliseconds(Date.parse('2026-11-03T09:00:00.000Z')));
const CLOCK = { now: (): Instant => AT };
const hasher = value(Argon2idPasswordHasher.create({ parameters: { memoryKib: 64, passes: 1, parallelism: 1 } }));
const CREATION = Object.freeze({
  pluginId: 'scm-github', label: 'GitHub', allowedOrigin: 'HTTPS://GitHub.COM',
  settings: { 'app-id': '1234', 'installation-id': '5678', 'merge-methods': 'squash' },
  secrets: { 'private-key': PRIVATE_KEY, 'webhook-secret': WEBHOOK_SECRET },
});

interface Answer {
  readonly status: number;
  readonly text: string;
  readonly body: Record<string, unknown>;
}

type Headers = Record<string, string>;

async function fixture(t: TestContext) {
  const store = new InMemoryAccessStore();
  const secrets = new NodeSecrets();
  const clock = CLOCK;
  const sessions = new SessionService({ store, hasher, secrets, random: secrets, clock, throttle: new LoginThrottle({ clock, sleep: async () => undefined }) });
  const administration = new PrincipalAdministration({ store, hasher, random: secrets, clock });
  const owner = value(await new OwnerBootstrapService({ store, random: secrets, clock }).ensureOwner(INVOCATION)).principalId;
  value(await administration.setPassword(owner, 'owner', PASSWORD, INVOCATION));
  value(await administration.createPrincipal(owner, 'vera', INVOCATION));
  value(await administration.setPassword(owner, 'vera', PASSWORD, INVOCATION));
  const recorded: string[] = [];
  const deliveries = { record: async (_id: string, event: { deliveryId: string }) => { recorded.push(event.deliveryId); return ok<DeliveryRecording>('recorded'); } };
  const sink = new InMemoryLogSink();
  const audit = new InMemoryScmIntegrationAudit();
  const scm = scmIntegrationServices(githubPorts(new InMemoryScmIntegrations(audit), deliveries), new Logger(sink, clock));
  const server = createApiServer(new ControlPlaneApi({
    operator: { authenticate: async (secret: string) => (secret === OPERATOR ? ok(owner) : err(failure('forbidden', 'not the operator'))) },
    sessions, authorization: new AuthorizationService(store), scmIntegrations: scm.integrations, scmWebhooks: scm.webhooks,
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
  const created = async (): Promise<string> => {
    const answer = await call('POST', '/scm-integrations', BEARER, CREATION);
    assert.equal(answer.status, 201, answer.text);
    return String(answer.body.integrationId);
  };
  return { base, call, created, sink, recorded, audit, owner, VERA: await browser(base, 'vera'), OWNER: await browser(base, 'owner') };
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

const holdsNoSecret = (text: string) => ![WEBHOOK_SECRET, ROTATED_SECRET, PEM_LINE].some((secret) => text.includes(secret));

function githubPorts(store: ScmIntegrations, deliveries: ScmWebhookDeliveries): ScmIntegrationPorts {
  const plugin = githubSourceControlPlugin();
  return { store, deliveries, plugin, plugins: singlePlugin(plugin), clock: CLOCK };
}

test('an owner creates and reads an integration, with its origin normalized and its secrets only by name', async (t) => {
  const { call, created, VERA } = await fixture(t);
  const integrationId = await created();
  const read = await call('GET', `/scm-integrations/${integrationId}`, VERA);
  assert.equal(read.status, 200);
  assert.deepEqual(read.body, {
    integrationId, pluginId: 'scm-github', label: 'GitHub', allowedOrigin: 'https://github.com:443', settings: CREATION.settings,
    secretNames: ['private-key', 'webhook-secret'], revision: 1,
  });
  assert.match(integrationId, /^i[0-9a-f]{32}$/);
  assert.ok(holdsNoSecret(read.text));
  assert.equal((await call('GET', `/scm-integrations/${MISSING}`, VERA)).status, 404);
});

test('any authenticated principal lists the integrations in pages; a request without a credential answers 401', async (t) => {
  const { call, created, VERA } = await fixture(t);
  const ids = [await created(), await created()].sort();
  const listed = await call('GET', '/scm-integrations', VERA);
  assert.deepEqual([listed.status, (listed.body.integrations as Array<{ integrationId: string }>).map((found) => found.integrationId)], [200, ids]);
  const after = await call('GET', `/scm-integrations?after=${ids[0]}`, VERA);
  assert.deepEqual((after.body.integrations as Array<{ integrationId: string }>).map((found) => found.integrationId), [ids[1]]);
  assert.equal((await call('GET', '/scm-integrations?after=not%20an%20identifier', VERA)).status, 400);
  assert.equal((await call('GET', '/scm-integrations')).status, 401);
  assert.equal((await call('POST', '/scm-integrations', {}, CREATION)).status, 401);
});

test('only an installation-owner creates or updates, a browser needs the CSRF header, and nothing changes otherwise', async (t) => {
  const { call, created, VERA, OWNER } = await fixture(t);
  const integrationId = await created();
  const denied = await call('POST', '/scm-integrations', VERA, CREATION);
  assert.deepEqual([denied.status, denied.body.details], [403, { reason: 'role-required', requiredRole: 'installation-owner' }]);
  const update = { expectedRevision: 1, label: 'Refused' };
  assert.equal((await call('PATCH', `/scm-integrations/${integrationId}`, VERA, update)).status, 403);
  const withoutCsrf = await call('PATCH', `/scm-integrations/${integrationId}`, { cookie: OWNER.cookie! }, update);
  assert.deepEqual([withoutCsrf.status, withoutCsrf.body.details], [403, { reason: 'csrf-token-invalid' }]);
  assert.equal((await call('POST', '/scm-integrations', OWNER, CREATION)).status, 201);
  const listed = await call('GET', '/scm-integrations', OWNER);
  assert.equal((listed.body.integrations as unknown[]).length, 2);
  assert.equal((await call('GET', `/scm-integrations/${integrationId}`, OWNER)).body.revision, 1);
});

test('an unknown plugin answers 404, and a bad origin, setting, or secret 400 naming it but never its value', async (t) => {
  const { call } = await fixture(t);
  assert.equal((await call('POST', '/scm-integrations', BEARER, { ...CREATION, pluginId: 'scm-forgejo' })).status, 404);
  const cases: ReadonlyArray<readonly [Record<string, unknown>, Record<string, string>]> = [
    [{ allowedOrigin: 'https://github.com/acme' }, {}],
    [{ allowedOrigin: 'https://localhost.' }, {}],
    [{ settings: { ...CREATION.settings, 'app-id': 'twelve' } }, { setting: 'app-id' }],
    [{ settings: { ...CREATION.settings, 'api-url': 'https://ghe.example.com' } }, { setting: 'api-url' }],
    [{ secrets: { 'private-key': PRIVATE_KEY } }, { setting: 'webhook-secret' }],
    [{ secrets: { ...CREATION.secrets, 'private-key': `not a key ${WEBHOOK_SECRET}` } }, { setting: 'private-key' }],
  ];
  for (const [override, details] of cases) {
    const refused = await call('POST', '/scm-integrations', BEARER, { ...CREATION, ...override });
    assert.equal(refused.status, 400, refused.text);
    if (Object.keys(details).length > 0) assert.deepEqual(refused.body.details, details);
    assert.ok(holdsNoSecret(refused.text), refused.text);
  }
  assert.equal(((await call('GET', '/scm-integrations', BEARER)).body.integrations as unknown[]).length, 0);
});

test('a body that the schema refuses names the setting or secret at fault on create and update, never its value', async (t) => {
  const { call, created } = await fixture(t);
  const integrationId = await created();
  const faults: ReadonlyArray<readonly [Record<string, unknown>, string | undefined]> = [
    [{ secrets: { ...CREATION.secrets, 'Bad Name': ROTATED_SECRET } }, 'Bad Name'],
    [{ secrets: { ...CREATION.secrets, 'webhook-secret': '' } }, 'webhook-secret'],
    [{ settings: { ...CREATION.settings, 'app-id': 1234 } }, 'app-id'],
    [{ secrets: { ...CREATION.secrets, 'private-key': ['not', 'a', 'string'] } }, 'private-key'],
    [{ settings: ['app-id'] }, undefined],
  ];
  for (const [override, setting] of faults) {
    const refusals = [
      await call('POST', '/scm-integrations', BEARER, { ...CREATION, ...override }),
      await call('PATCH', `/scm-integrations/${integrationId}`, BEARER, { expectedRevision: 1, ...override }),
    ];
    for (const refused of refusals) {
      assert.deepEqual([refused.status, refused.body.code, (refused.body.details as Record<string, unknown>).setting], [400, 'invalid', setting], refused.text);
      assert.ok(holdsNoSecret(refused.text), refused.text);
    }
  }
  const notAnObject = await call('POST', '/scm-integrations', BEARER, [CREATION]);
  assert.deepEqual([notAnObject.status, (notAnObject.body.details as Record<string, unknown>).setting], [400, undefined]);
  assert.equal((await call('GET', `/scm-integrations/${integrationId}`, BEARER)).body.revision, 1);
});

test('an update replaces the settings and the named secrets, and a stale revision answers 409', async (t) => {
  const { call, created } = await fixture(t);
  const integrationId = await created();
  const changed = await call('PATCH', `/scm-integrations/${integrationId}`, BEARER, {
    expectedRevision: 1, allowedOrigin: 'https://github.example.com:8443', settings: { ...CREATION.settings, 'merge-methods': 'rebase' },
    secrets: { 'webhook-secret': ROTATED_SECRET },
  });
  assert.equal(changed.status, 200, changed.text);
  assert.deepEqual([changed.body.allowedOrigin, changed.body.settings, changed.body.secretNames, changed.body.revision],
    ['https://github.example.com:8443', { ...CREATION.settings, 'merge-methods': 'rebase' }, ['private-key', 'webhook-secret'], 2]);
  assert.ok(holdsNoSecret(changed.text));
  const stale = await call('PATCH', `/scm-integrations/${integrationId}`, BEARER, { expectedRevision: 1, label: 'Stale' });
  assert.deepEqual([stale.status, stale.body.code], [409, 'conflict']);
  assert.equal((await call('PATCH', `/scm-integrations/${MISSING}`, BEARER, { expectedRevision: 1, label: 'Missing' })).status, 404);
});

test('of two concurrent updates at one revision exactly one wins and the other answers 409', async (t) => {
  const { call, created } = await fixture(t);
  const integrationId = await created();
  const answers = await Promise.all(['First', 'Second'].map((label) => call('PATCH', `/scm-integrations/${integrationId}`, BEARER, { expectedRevision: 1, label })));
  assert.deepEqual(answers.map((answer) => answer.status).sort(), [200, 409]);
  assert.equal((await call('GET', `/scm-integrations/${integrationId}`, BEARER)).body.revision, 2);
});

test('no secret value reaches a response or the request log', async (t) => {
  const { call, created, sink } = await fixture(t);
  const integrationId = await created();
  await call('PATCH', `/scm-integrations/${integrationId}`, BEARER, { expectedRevision: 1, secrets: { 'webhook-secret': ROTATED_SECRET } });
  await call('POST', '/scm-integrations', BEARER, { ...CREATION, secrets: { ...CREATION.secrets, 'private-key': WEBHOOK_SECRET } });
  await call('POST', '/scm-integrations', BEARER, { ...CREATION, secrets: { ...CREATION.secrets, extra: 42 } });
  assert.ok(holdsNoSecret(JSON.stringify(sink.records)));
});

test('a stored integration verifies its webhooks, and a changed webhook secret applies to the next delivery', async (t) => {
  const { base, call, created, recorded } = await fixture(t);
  const integrationId = await created();
  const body = JSON.stringify({ repository: { full_name: 'acme/project' } });
  const deliver = async (target: string, secret: string, deliveryId: string) => (await fetch(`${base}/scm-integrations/${target}/webhooks`, {
    method: 'POST', body, headers: {
      'content-type': 'application/json', 'x-github-event': 'push', 'x-github-delivery': deliveryId,
      'x-hub-signature-256': `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`,
    },
  })).status;
  assert.equal(await deliver(integrationId, WEBHOOK_SECRET, 'd-1'), 202);
  assert.equal(await deliver(MISSING, WEBHOOK_SECRET, 'd-2'), 401);
  assert.equal((await call('PATCH', `/scm-integrations/${integrationId}`, BEARER, { expectedRevision: 1, secrets: { 'webhook-secret': ROTATED_SECRET } })).status, 200);
  assert.equal(await deliver(integrationId, WEBHOOK_SECRET, 'd-3'), 401);
  assert.equal(await deliver(integrationId, ROTATED_SECRET, 'd-4'), 202);
  assert.deepEqual(recorded, ['d-1', 'd-4']);
});

test('the composition logs an integration that cannot verify its webhooks, without a secret', async () => {
  const store = new InMemoryScmIntegrations();
  const sink = new InMemoryLogSink();
  const clock = { now: () => value(instantFromEpochMilliseconds(Date.parse('2026-11-03T09:00:00.000Z'))) };
  const deliveries = { record: async () => ok<DeliveryRecording>('recorded') };
  const scm = scmIntegrationServices(githubPorts(store, deliveries), new Logger(sink, clock));
  const integrationId = value(parseIdentifier('ScmIntegrationId', MISSING)) as ScmIntegrationId;
  value(await store.add({
    integrationId, pluginId: 'scm-retired', label: 'Retired', allowedOrigin: value(normalizeOrigin('https://git.example.com')),
    settings: {}, secretNames: ['webhook-secret'], revision: 1,
  }, value(ScmSecrets.of({ 'webhook-secret': WEBHOOK_SECRET })), { actor: 'test', reason: 'unverifiable test', at: AT }));
  assert.equal((await scm.webhooks.receive(integrationId, { headers: {}, rawBody: new Uint8Array() })).ok, false);
  const warnings = sink.records.map((record) => [record.level, record.event, record.fields]);
  assert.deepEqual(warnings, [['warn', 'scm.integration.unverifiable', { integrationId, revision: 1, reason: 'plugin-missing' }]]);
  assert.ok(!JSON.stringify(sink.records).includes(WEBHOOK_SECRET));
});

test('each committed create and update is audited with the caller as actor and its operation as reason', async (t) => {
  const { call, created, audit, owner, OWNER } = await fixture(t);
  const integrationId = await created();
  const changed = await call('PATCH', `/scm-integrations/${integrationId}`, OWNER, {
    expectedRevision: 1, label: 'Renamed', settings: { ...CREATION.settings, 'merge-methods': 'rebase' },
  });
  assert.equal(changed.status, 200, changed.text);
  const rotated = await call('PATCH', `/scm-integrations/${integrationId}`, BEARER, { expectedRevision: 2, secrets: { 'webhook-secret': WEBHOOK_SECRET } });
  assert.equal(rotated.status, 200, rotated.text);
  const creating = { actor: owner, reason: 'control-plane API createScmIntegration', occurredAt: AT };
  const updating = { actor: owner, reason: 'control-plane API updateScmIntegration', occurredAt: AT };
  assert.deepEqual(value(await audit.trail()), [
    {
      integrationId, kind: 'created', ...creating, revision: 1,
      changedFields: ['pluginId', 'label', 'allowedOrigin', 'settings.app-id', 'settings.installation-id', 'settings.merge-methods', 'secrets.private-key', 'secrets.webhook-secret'],
    },
    { integrationId, kind: 'updated', ...updating, changedFields: ['label', 'settings.merge-methods'], revision: 2 },
    { integrationId, kind: 'secret-changed', ...updating, changedFields: ['secrets.webhook-secret'], revision: 3 },
  ]);
});

test('a refused create or update, 400, 403, 404, or 409, writes no audit row', async (t) => {
  const { call, created, audit, VERA } = await fixture(t);
  const integrationId = await created();
  const refusals = [
    await call('POST', '/scm-integrations', BEARER, { ...CREATION, settings: { ...CREATION.settings, 'app-id': 'twelve' } }),
    await call('PATCH', `/scm-integrations/${integrationId}`, BEARER, { expectedRevision: 1, secrets: { token: ROTATED_SECRET } }),
    await call('POST', '/scm-integrations', VERA, CREATION),
    await call('PATCH', `/scm-integrations/${integrationId}`, VERA, { expectedRevision: 1, label: 'Refused' }),
    await call('POST', '/scm-integrations', BEARER, { ...CREATION, pluginId: 'scm-forgejo' }),
    await call('PATCH', `/scm-integrations/${MISSING}`, BEARER, { expectedRevision: 1, label: 'Missing' }),
    await call('PATCH', `/scm-integrations/${integrationId}`, BEARER, { expectedRevision: 2, label: 'Stale' }),
  ];
  assert.deepEqual(refusals.map((answer) => answer.status), [400, 400, 403, 403, 404, 404, 409]);
  assert.deepEqual(value(await audit.trail()).map((event) => [event.kind, event.revision]), [['created', 1]]);
});

test('no secret value of a create, an update, or a secret change reaches the request log or the audit trail', async (t) => {
  const { call, created, sink, audit } = await fixture(t);
  const integrationId = await created();
  const answers = [
    await call('PATCH', `/scm-integrations/${integrationId}`, BEARER, { expectedRevision: 1, label: 'Renamed', secrets: { 'webhook-secret': ROTATED_SECRET } }),
    await call('PATCH', `/scm-integrations/${integrationId}`, BEARER, { expectedRevision: 2, secrets: { 'private-key': PRIVATE_KEY } }),
  ];
  assert.deepEqual(answers.map((answer) => answer.status), [200, 200]);
  const trail = value(await audit.trail());
  assert.deepEqual(trail.map((event) => event.kind), ['created', 'updated', 'secret-changed']);
  assert.ok(sink.records.length > 0, 'the request log was captured');
  assert.ok(holdsNoSecret(JSON.stringify(sink.records)));
  assert.ok(holdsNoSecret(JSON.stringify(trail)));
});

test('a create or update handler without a principal fails as internal and never reaches the service', async () => {
  const reached: string[] = [];
  const reach = (operation: string) => async () => { reached.push(operation); return err(failure('unavailable', 'reached')); };
  const api = new ControlPlaneApi({
    scmIntegrations: { list: reach('list'), read: reach('read'), create: reach('create'), update: reach('update') },
  } as unknown as ApiServices);
  const request = { parameters: [MISSING], body: { expectedRevision: 1 }, query: new URLSearchParams(), correlationId: 'c' as never };
  for (const operationId of ['createScmIntegration', 'updateScmIntegration']) {
    const anonymous = await api.handle(operationId, request, '');
    assert.deepEqual(!anonymous.ok && [anonymous.error.code, anonymous.error.message],
      ['internal', 'an SCM integration command reached its handler without a principal'], operationId);
  }
  assert.deepEqual(reached, []);
});
