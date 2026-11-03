import assert from 'node:assert/strict';
import test from 'node:test';
import {
  InMemoryRepositoryBindings,
  InMemoryScmIntegrations,
  RepositoryBindingService,
  ScmSecrets,
  normalizeOrigin,
  type RepositoryBindingUpdate,
  type ScmIntegration,
  type ScmIntegrationId,
  type ScmPluginDefect,
  type SourceControlPlugin,
  type SourceControlProvider,
} from '@taskelith/integrations';
import { err, failure, ok, parseIdentifier, type FailureCode, type Result } from '@taskelith/kernel';
import { failed, value } from '@taskelith/testing';
import { InMemoryScm, PROJECT } from './in-memory-source-control.ts';

const PROJECT_ID = `p${'1'.repeat(32)}`;
const MISSING_PROJECT = `p${'f'.repeat(32)}`;
const INTEGRATION_ID = value(parseIdentifier('ScmIntegrationId', `i${'1'.repeat(32)}`)) as ScmIntegrationId;
const REMOTE_URL = `https://scm.example/${PROJECT}.git`;
const SECRET = 'synthetic-binding-secret';

const INTEGRATION: ScmIntegration = Object.freeze({
  integrationId: INTEGRATION_ID, pluginId: 'scm-example', label: 'Example', allowedOrigin: value(normalizeOrigin('https://SCM.example')),
  settings: Object.freeze({}), secretNames: Object.freeze(['webhook-secret']), revision: 1,
});

const REQUEST = Object.freeze({ integrationId: INTEGRATION_ID, repository: PROJECT, integrationBranch: 'dev', mergeMethod: 'squash' as const });

type Provider = SourceControlProvider;

// A plugin whose provider is the in-memory SCM, with any part replaced.
function pluginOf(provider: () => Result<Provider>): SourceControlPlugin {
  return {
    id: 'scm-example', secretNames: ['webhook-secret'], checkSettings: () => ok(undefined), checkSecret: () => ok(undefined),
    createProvider: provider, createDecoy: () => ({ verifyWebhookDelivery: async () => err(failure('forbidden', 'decoy')) }),
    isEventless: () => false,
  };
}

interface FixtureOptions {
  readonly provider?: (scm: Provider) => Provider;
  readonly createProvider?: () => Result<Provider>;
  readonly registered?: boolean;
  readonly allowedOrigin?: string;
}

async function fixture(options: FixtureOptions = {}) {
  const integrations = new InMemoryScmIntegrations();
  const allowedOrigin = options.allowedOrigin === undefined ? INTEGRATION.allowedOrigin : value(normalizeOrigin(options.allowedOrigin));
  value(await integrations.add({ ...INTEGRATION, allowedOrigin }, value(ScmSecrets.of({ 'webhook-secret': SECRET }))));
  const bindings = new InMemoryRepositoryBindings(integrations);
  const scm = new InMemoryScm().provider();
  const provider = options.provider?.(scm) ?? scm;
  const plugin = pluginOf(options.createProvider ?? (() => ok(provider)));
  const plugins = { pluginOf: (pluginId: string) => (options.registered !== false && pluginId === plugin.id ? plugin : undefined) };
  const projects = { exists: async (projectId: string) => ok(projectId === PROJECT_ID) };
  const defects: ScmPluginDefect[] = [];
  const service = new RepositoryBindingService({ bindings, integrations, plugins, projects, defects: { defect: (defect) => defects.push(defect) } });
  return { integrations, bindings, service, defects };
}

const first = (binding: Partial<RepositoryBindingUpdate['binding']> = {}): RepositoryBindingUpdate => ({ binding: { ...REQUEST, ...binding } });

function refusal(result: Result<unknown>): [FailureCode, string | undefined] {
  const failing = failed(result);
  return [failing.code, failing.details.reason];
}

test('a first bind resolves the remote URL through the plugin and stores revision 1, which a read returns as stored', async () => {
  const { service } = await fixture();
  const bound = value(await service.bind(PROJECT_ID, first()));
  assert.deepEqual(bound, { projectId: PROJECT_ID, ...REQUEST, remoteUrl: REMOTE_URL, revision: 1 });
  assert.deepEqual(value(await service.read(PROJECT_ID)), bound);
});

test('an unknown project or integration is not-found, and an unbound project reads as not-found', async () => {
  const { service } = await fixture();
  assert.equal(failed(await service.read(MISSING_PROJECT)).code, 'not-found');
  assert.equal(failed(await service.read(PROJECT_ID)).code, 'not-found');
  assert.equal(failed(await service.bind(MISSING_PROJECT, first())).code, 'not-found');
  assert.equal(failed(await service.bind(PROJECT_ID, first({ integrationId: `i${'2'.repeat(32)}` }))).code, 'not-found');
  assert.equal(failed(await service.bind(PROJECT_ID, first({ integrationId: 'not an identifier' }))).code, 'not-found');
});

test('a rebind by compare-and-set changes any field, keeps the revision for the same binding, and refuses a stale one', async () => {
  const { service } = await fixture();
  value(await service.bind(PROJECT_ID, first()));
  assert.equal(failed(await service.bind(PROJECT_ID, first())).code, 'conflict');
  const same = value(await service.bind(PROJECT_ID, { expectedRevision: 1, binding: REQUEST }));
  assert.equal(same.revision, 1);
  const moved = value(await service.bind(PROJECT_ID, { expectedRevision: 1, binding: { ...REQUEST, integrationBranch: 'main', mergeMethod: 'merge-commit' } }));
  assert.deepEqual([moved.revision, moved.integrationBranch, moved.mergeMethod], [2, 'main', 'merge-commit']);
  assert.equal(failed(await service.bind(PROJECT_ID, { expectedRevision: 1, binding: REQUEST })).code, 'conflict');
  assert.equal(value(await service.read(PROJECT_ID)).revision, 2);
});

test('each resolver failure maps to its typed answer and stores nothing', async () => {
  const cases: ReadonlyArray<readonly [FailureCode, [FailureCode, string | undefined]]> = [
    ['not-found', ['precondition-failed', 'repository-not-visible']],
    ['forbidden', ['precondition-failed', 'integration-credential-refused']],
    ['unavailable', ['unavailable', undefined]],
    ['invalid', ['invalid', undefined]],
    ['internal', ['internal', undefined]],
    ['conflict', ['internal', undefined]],
    ['precondition-failed', ['internal', undefined]],
  ];
  for (const [code, expected] of cases) {
    const resolveRemoteUrl = async () => err(failure(code, `the service said ${SECRET}`));
    const { service } = await fixture({ provider: (scm) => ({ ...scm, resolveRemoteUrl }) });
    const refused = await service.bind(PROJECT_ID, first());
    assert.deepEqual(refusal(refused), expected, code);
    assert.ok(!failed(refused).message.includes(SECRET), code);
    assert.equal(failed(await service.read(PROJECT_ID)).code, 'not-found', code);
  }
});

test('a resolved value that is not a remote URL of the requested repository is internal and never quoted', async () => {
  const resolved: readonly unknown[] = [
    { repository: PROJECT, remoteUrl: `https://agent:${SECRET}@scm.example/${PROJECT}.git` },
    { repository: PROJECT, remoteUrl: `http://scm.example/${PROJECT}.git` },
    { repository: PROJECT, remoteUrl: `https://scm.example/${PROJECT}.git?token=${SECRET}` },
    { repository: PROJECT, remoteUrl: `https://scm.example/${PROJECT}.git#${SECRET}` },
    { repository: 'acme/other', remoteUrl: 'https://scm.example/acme/other.git' },
    undefined,
  ];
  for (const remote of resolved) {
    const resolveRemoteUrl = async () => ok(remote) as Result<never>;
    const { service } = await fixture({ provider: (scm) => ({ ...scm, resolveRemoteUrl }) });
    const refused = failed(await service.bind(PROJECT_ID, first()));
    assert.equal(refused.code, 'internal', JSON.stringify(remote));
    assert.ok(!JSON.stringify(refused).includes(SECRET));
  }
});

test('a plugin that throws is internal, without its message', async () => {
  const resolveRemoteUrl = async () => {
    throw new Error(`the plugin leaked ${SECRET}`);
  };
  const throwing = await fixture({ provider: (scm) => ({ ...scm, resolveRemoteUrl }) });
  const refused = failed(await throwing.service.bind(PROJECT_ID, first()));
  assert.equal(refused.code, 'internal');
  assert.ok(!JSON.stringify(refused).includes(SECRET));
  const building = await fixture({ createProvider: () => { throw new Error(SECRET); } });
  assert.equal(failed(await building.service.bind(PROJECT_ID, first())).code, 'internal');
});

// Result envelopes whose reading throws or breaks the kernel Result shape.
function hostileEnvelopes(): readonly unknown[] {
  const throwing = (fields: object, name: string) => Object.defineProperty({ ...fields }, name, {
    enumerable: true, get: () => { throw new Error(`the getter leaked ${SECRET}`); },
  });
  return [
    throwing({}, 'ok'),
    throwing({ ok: true }, 'value'),
    throwing({ ok: false }, 'error'),
    { ok: false, error: throwing({ message: SECRET }, 'code') },
    { ok: false, error: { code: 'not-a-kernel-code', message: SECRET } },
    { ok: 'yes', value: SECRET },
    undefined,
  ];
}

test('a resolver envelope whose getter throws or that breaks its shape is internal and never quoted', async () => {
  for (const [index, envelope] of hostileEnvelopes().entries()) {
    const resolveRemoteUrl = async () => envelope as Result<never>;
    const { service } = await fixture({ provider: (scm) => ({ ...scm, resolveRemoteUrl }) });
    const refused = failed(await service.bind(PROJECT_ID, first()));
    assert.equal(refused.code, 'internal', `envelope ${index}`);
    assert.ok(!JSON.stringify(refused).includes(SECRET), `envelope ${index}`);
  }
});

test('a provider factory envelope whose getter throws or that breaks its shape is internal and never quoted', async () => {
  for (const [index, envelope] of hostileEnvelopes().entries()) {
    const { service } = await fixture({ createProvider: () => envelope as Result<Provider> });
    const refused = failed(await service.bind(PROJECT_ID, first()));
    assert.equal(refused.code, 'internal', `envelope ${index}`);
    assert.ok(!JSON.stringify(refused).includes(SECRET), `envelope ${index}`);
  }
});

test('an integration without a registered plugin, or whose plugin cannot build it, is unavailable', async () => {
  const unregistered = await fixture({ registered: false });
  assert.equal(failed(await unregistered.service.bind(PROJECT_ID, first())).code, 'unavailable');
  const refusing = await fixture({ createProvider: () => err(failure('invalid', `the configuration is refused: ${SECRET}`)) });
  const unusable = failed(await refusing.service.bind(PROJECT_ID, first()));
  assert.deepEqual(unusable, failure('unavailable', "the integration's stored configuration is unusable", { reason: 'integration-configuration-unusable' }));
});

test('a remote URL outside the allowed origin, and then an undeclared merge method, are typed refusals', async () => {
  const elsewhere = async ({ repository }: { repository: string }) => ok({ repository, remoteUrl: `https://scm.example:8443/${repository}.git` });
  const { service } = await fixture({ provider: (scm) => ({ ...scm, resolveRemoteUrl: elsewhere }) });
  assert.deepEqual(refusal(await service.bind(PROJECT_ID, first({ mergeMethod: 'rebase' }))), ['precondition-failed', 'remote-origin-mismatch']);
  const declared = await fixture();
  assert.deepEqual(refusal(await declared.service.bind(PROJECT_ID, first({ mergeMethod: 'rebase' }))), ['precondition-failed', 'merge-method-undeclared']);
  const upperCase = async ({ repository }: { repository: string }) => ok({ repository, remoteUrl: `https://SCM.Example:443/${repository}.git` });
  const normalized = await fixture({ provider: (scm) => ({ ...scm, resolveRemoteUrl: upperCase }) });
  assert.equal(value(await normalized.service.bind(PROJECT_ID, first())).revision, 1);
});

// Resolves every repository under `origin`, as written.
const resolvingUnder = (origin: string) => (scm: Provider): Provider => ({
  ...scm, resolveRemoteUrl: async ({ repository }) => ok({ repository, remoteUrl: `${origin}/${repository}.git` }),
});

test('both origins are normalized as written, so numeric hosts that URL parsing rewrites or refuses still match', async () => {
  for (const origin of ['https://127.1', 'https://999.1', 'https://0x7f.1:8443']) {
    const { service } = await fixture({ allowedOrigin: origin, provider: resolvingUnder(origin) });
    const bound = value(await service.bind(PROJECT_ID, first()));
    assert.equal(bound.remoteUrl, `${origin}/${PROJECT}.git`, origin);
  }
  const bare = async ({ repository }: { repository: string }) => ok({ repository, remoteUrl: 'https://SCM.example' });
  const pathless = await fixture({ provider: (scm) => ({ ...scm, resolveRemoteUrl: bare }) });
  assert.equal(value(await pathless.service.bind(PROJECT_ID, first())).remoteUrl, 'https://SCM.example');
  const { service } = await fixture({ allowedOrigin: 'https://127.0.0.1', provider: resolvingUnder('https://127.1') });
  assert.deepEqual(refusal(await service.bind(PROJECT_ID, first())), ['precondition-failed', 'remote-origin-mismatch']);
});

test('a resolved remote URL whose origin does not normalize is internal and never quoted', async () => {
  const host = Array.from({ length: 5 }, () => 'a'.repeat(63)).join('.');
  const { service } = await fixture({ provider: resolvingUnder(`https://${host}`) });
  const refused = failed(await service.bind(PROJECT_ID, first()));
  assert.equal(refused.code, 'internal');
  assert.ok(!JSON.stringify(refused).includes(host));
});

test('capabilities that break their shape are internal', async () => {
  const { service } = await fixture({ provider: (scm) => ({ ...scm, capabilities: { mergeMethods: 'squash' } as never }) });
  assert.equal(failed(await service.bind(PROJECT_ID, first())).code, 'internal');
});

test('a bind whose integration changed while the plugin resolved is a conflict and stores nothing', async () => {
  let integrations: InMemoryScmIntegrations | undefined;
  const resolveRemoteUrl = async ({ repository }: { repository: string }) => {
    value(await integrations!.update(INTEGRATION_ID, { expectedRevision: 1, label: 'Renamed' }));
    return ok({ repository, remoteUrl: REMOTE_URL });
  };
  const racing = await fixture({ provider: (scm) => ({ ...scm, resolveRemoteUrl }) });
  integrations = racing.integrations;
  assert.equal(failed(await racing.service.bind(PROJECT_ID, first())).code, 'conflict');
  assert.equal(failed(await racing.service.read(PROJECT_ID)).code, 'not-found');
});

test('a store failure is passed on', async () => {
  const broken = new RepositoryBindingService({
    bindings: { get: async () => err(failure('unavailable', 'down')), put: async () => err(failure('unavailable', 'down')) },
    integrations: { configurationOf: async () => err(failure('internal', 'sealed')) },
    plugins: { pluginOf: () => undefined },
    projects: { exists: async () => err(failure('unavailable', 'down')) },
    defects: { defect: () => undefined },
  });
  assert.equal(failed(await broken.read(PROJECT_ID)).code, 'unavailable');
  assert.equal(failed(await broken.bind(PROJECT_ID, first())).code, 'unavailable');
  const sealed = new RepositoryBindingService({
    bindings: { get: async () => err(failure('unavailable', 'down')), put: async () => err(failure('unavailable', 'down')) },
    integrations: { configurationOf: async () => err(failure('internal', 'sealed')) },
    plugins: { pluginOf: () => undefined },
    projects: { exists: async () => ok(true) },
    defects: { defect: () => undefined },
  });
  assert.equal(failed(await sealed.read(PROJECT_ID)).code, 'unavailable');
  assert.equal(failed(await sealed.bind(PROJECT_ID, first())).code, 'internal');
});

const defectOf = (operation: ScmPluginDefect['operation'], kind: ScmPluginDefect['kind']): ScmPluginDefect => ({
  integrationId: INTEGRATION_ID, pluginId: 'scm-example', operation, kind,
});

const leaking = () => {
  throw new Error(`the plugin leaked ${SECRET}`);
};

test('each plugin defect is reported once by its operation and kind, never with a plugin message or value', async () => {
  const host = Array.from({ length: 5 }, () => 'a'.repeat(63)).join('.');
  const resolving = (resolveRemoteUrl: Provider['resolveRemoteUrl']) => ({ provider: (scm: Provider) => ({ ...scm, resolveRemoteUrl }) });
  const throwingCapabilities = (scm: Provider) => Object.defineProperty({ ...scm }, 'capabilities', { get: leaking });
  const capabilities = Object.defineProperty({}, 'mergeMethods', { enumerable: true, get: leaking });
  const cases: ReadonlyArray<readonly [FixtureOptions, ScmPluginDefect]> = [
    [{ createProvider: leaking }, defectOf('createProvider', 'threw')],
    [{ createProvider: () => ({ ok: 'yes', value: SECRET }) as never }, defectOf('createProvider', 'malformed-envelope')],
    [{ createProvider: () => ok(SECRET as never) }, defectOf('createProvider', 'malformed-value')],
    [resolving(async () => leaking()), defectOf('resolveRemoteUrl', 'threw')],
    [resolving(async () => ({ ok: 'yes', value: SECRET }) as never), defectOf('resolveRemoteUrl', 'malformed-envelope')],
    [resolving(async () => ok({ repository: PROJECT, remoteUrl: `https://a:${SECRET}@scm.example/x.git` })), defectOf('resolveRemoteUrl', 'malformed-value')],
    [resolving(async () => ok({ repository: 'acme/other', remoteUrl: 'https://scm.example/acme/other.git' })), defectOf('resolveRemoteUrl', 'foreign-repository')],
    [resolving(async () => err(failure('conflict', SECRET))), defectOf('resolveRemoteUrl', 'unexpected-failure-code')],
    [{ provider: resolvingUnder(`https://${host}`) }, defectOf('resolveRemoteUrl', 'unnormalizable-origin')],
    [{ provider: throwingCapabilities }, defectOf('capabilities', 'threw')],
    [{ provider: (scm) => ({ ...scm, capabilities: capabilities as never }) }, defectOf('capabilities', 'malformed-value')],
    [{ provider: (scm) => ({ ...scm, capabilities: { mergeMethods: SECRET } as never }) }, defectOf('capabilities', 'malformed-value')],
  ];
  for (const [options, expected] of cases) {
    const { service, defects } = await fixture(options);
    assert.equal(failed(await service.bind(PROJECT_ID, first())).code, 'internal', expected.kind);
    assert.deepEqual(defects, [expected], `${expected.operation} ${expected.kind}`);
    assert.ok(!JSON.stringify(defects).includes(SECRET) && !JSON.stringify(defects).includes(host));
  }
});

test('a typed refusal, an unusable configuration, and a bind report no plugin defect', async () => {
  const notFound = async () => err(failure('not-found', SECRET));
  const cases: readonly FixtureOptions[] = [
    {}, { provider: (scm) => ({ ...scm, resolveRemoteUrl: notFound }) },
    { createProvider: () => err(failure('invalid', SECRET)) }, { registered: false },
  ];
  for (const options of cases) {
    const { service, defects } = await fixture(options);
    await service.bind(PROJECT_ID, first());
    assert.deepEqual(defects, []);
  }
});
