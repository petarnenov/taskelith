import assert from 'node:assert/strict';
import { inspect } from 'node:util';
import test from 'node:test';
import {
  InMemoryScmIntegrationAudit,
  InMemoryScmIntegrations,
  ScmIntegrationService,
  ScmSecrets,
  StoredScmIntegrationVerifiers,
  normalizeOrigin,
  type ScmIntegrationCreation,
  type ScmIntegrationId,
  type ScmIntegrationUpdate,
  type ScmPluginDefect,
  type SourceControlPlugin,
  type WebhookDelivery,
  type WebhookVerifier,
} from '@taskelith/integrations';
import { err, failure, instantFromEpochMilliseconds, ok, parseIdentifier, type Result } from '@taskelith/kernel';
import { failed, value } from '@taskelith/testing';
import { InMemoryScm } from './in-memory-source-control.ts';

const SECRET = 'synthetic-secret-value';
const OTHER_SECRET = 'other-synthetic-secret';
const SETTINGS = Object.freeze({ 'account-id': '42' });
const INVOCATION = Object.freeze({ actor: `p${'a'.repeat(32)}`, reason: 'control-plane API createScmIntegration' });
const AT = value(instantFromEpochMilliseconds(Date.parse('2026-11-04T09:00:00.000Z')));

// A plugin with one setting and two secrets; a value `bad` is invalid.
class ExamplePlugin implements SourceControlPlugin {
  readonly id = 'scm-example';
  readonly secretNames = Object.freeze(['signing-key', 'webhook-secret']);
  created = 0;

  checkSettings(settings: Readonly<Record<string, string>>): Result<void> {
    const unknown = Object.keys(settings).find((name) => name !== 'account-id');
    if (unknown !== undefined) return err(failure('invalid', `unknown setting ${unknown}`, { setting: unknown }));
    if (settings['account-id'] === undefined || settings['account-id'] === 'bad') {
      return err(failure('invalid', 'account-id is missing or invalid', { setting: 'account-id' }));
    }
    return ok(undefined);
  }

  checkSecret(name: string, secret: string): Result<void> {
    if (!this.secretNames.includes(name) || secret === 'bad') return err(failure('invalid', `secret ${name} is unknown or invalid`, { setting: name }));
    return ok(undefined);
  }

  createProvider() {
    this.created += 1;
    return ok(new InMemoryScm().provider());
  }

  createDecoy(): WebhookVerifier {
    return { verifyWebhookDelivery: async () => err(failure('forbidden', 'decoy')) };
  }

  isEventless(): boolean {
    return false;
  }
}

// A plugin that accepts any secret name, as a plugin may.
class AnySecretPlugin extends ExamplePlugin {
  override checkSecret(): Result<void> {
    return ok(undefined);
  }
}

const IGNORED = { unverifiable: () => undefined };

let minted = 0;
function setup(plugin: ExamplePlugin = new ExamplePlugin()) {
  const audit = new InMemoryScmIntegrationAudit();
  const store = new InMemoryScmIntegrations(audit);
  const plugins = { pluginOf: (pluginId: string) => (pluginId === plugin.id ? plugin : undefined) };
  const ids = { next: () => value(parseIdentifier('ScmIntegrationId', `i${String(++minted).padStart(32, '0')}`)) as ScmIntegrationId };
  const clock = { now: () => AT };
  const defects: ScmPluginDefect[] = [];
  const reported = { defect: (defect: ScmPluginDefect) => { defects.push(defect); } };
  return { store, audit, plugin, plugins, defects, service: new ScmIntegrationService({ store, plugins, ids, clock, defects: reported }) };
}

const CREATION: ScmIntegrationCreation = Object.freeze({
  pluginId: 'scm-example', label: 'Example', allowedOrigin: 'HTTPS://Git.Example.COM', settings: SETTINGS,
  secrets: Object.freeze({ 'signing-key': SECRET, 'webhook-secret': SECRET }),
});

test('an origin is normalized to https, a lower-case host, and an explicit port', () => {
  assert.equal(value(normalizeOrigin('HTTPS://Git.Example.COM')), 'https://git.example.com:443');
  assert.equal(value(normalizeOrigin('https://git.example.com:8443')), 'https://git.example.com:8443');
  for (const origin of [
    'http://git.example.com', 'https://[::1]', 'https://user@git.example.com', 'https://git.example.com/path', 'https://git.example.com?q',
    'https://git.example.com#f', 'https://git.example.com:0', 'https://git.example.com:65536', 'https://-git.example.com', 'https://',
    `https://${'a.'.repeat(148)}a`,
  ]) {
    const refused = failed(normalizeOrigin(origin));
    assert.deepEqual([refused.code, refused.details], ['invalid', { field: 'allowedOrigin' }], origin);
    assert.ok(!refused.message.includes(origin), origin);
  }
});

test('an origin whose normalized form exceeds 300 characters is refused', () => {
  const host = `${'a'.repeat(60)}.`.repeat(4) + 'a'.repeat(48);
  assert.equal(`https://${host}`.length, 300);
  assert.equal(failed(normalizeOrigin(`https://${host}`)).code, 'invalid');
});

test('a created integration starts at revision 1 and shows its secrets only by name', async () => {
  const { service } = setup();
  const created = value(await service.create(CREATION, INVOCATION));
  assert.deepEqual({ ...created, integrationId: 'minted' }, {
    integrationId: 'minted', pluginId: 'scm-example', label: 'Example', allowedOrigin: 'https://git.example.com:443', settings: SETTINGS,
    secretNames: ['signing-key', 'webhook-secret'], revision: 1,
  });
  assert.deepEqual(value(await service.read(created.integrationId)), created);
  assert.ok(!JSON.stringify(created).includes(SECRET));
});

test('creation refuses an unknown plugin with not-found and a bad origin, setting, or secret with invalid', async () => {
  const { service, store } = setup();
  assert.equal(failed(await service.create({ ...CREATION, pluginId: 'scm-other' }, INVOCATION)).code, 'not-found');
  const cases: ReadonlyArray<readonly [Partial<ScmIntegrationCreation>, string]> = [
    [{ allowedOrigin: 'http://git.example.com' }, 'allowedOrigin'],
    [{ settings: {} }, 'settings'],
    [{ settings: { 'account-id': 'bad' } }, 'account-id'],
    [{ settings: { ...SETTINGS, region: 'eu' } }, 'region'],
    [{ secrets: { 'signing-key': SECRET } }, 'webhook-secret'],
    [{ secrets: { ...CREATION.secrets, 'webhook-secret': 'bad' } }, 'webhook-secret'],
    [{ secrets: { ...CREATION.secrets, token: SECRET } }, 'token'],
    [{ secrets: { ...CREATION.secrets, 'Bad Name': SECRET } }, 'Bad Name'],
  ];
  for (const [override, named] of cases) {
    const refused = failed(await service.create({ ...CREATION, ...override }, INVOCATION));
    assert.equal(refused.code, 'invalid', named);
    assert.equal(refused.details.setting ?? refused.details.field, named);
    assert.ok(!inspect(refused).includes(SECRET), named);
  }
  assert.deepEqual(value(await store.page(undefined, 100)), []);
});

test('an update replaces the settings, replaces only the named secrets, and moves the revision', async () => {
  const { service, store } = setup();
  const created = value(await service.create(CREATION, INVOCATION));
  const updated = value(await service.update(created.integrationId, {
    expectedRevision: 1, label: 'Renamed', allowedOrigin: 'https://git.example.com:8443', settings: { 'account-id': '43' },
    secrets: { 'webhook-secret': OTHER_SECRET },
  }, INVOCATION));
  assert.deepEqual({ ...updated, integrationId: 'kept' }, {
    integrationId: 'kept', pluginId: 'scm-example', label: 'Renamed', allowedOrigin: 'https://git.example.com:8443', settings: { 'account-id': '43' },
    secretNames: ['signing-key', 'webhook-secret'], revision: 2,
  });
  const stored = value(await store.configurationOf(created.integrationId));
  assert.deepEqual(stored?.secrets.reveal(), { 'signing-key': SECRET, 'webhook-secret': OTHER_SECRET });
  const labelOnly = value(await service.update(created.integrationId, { expectedRevision: 2, label: 'Again' }, INVOCATION));
  assert.deepEqual([labelOnly.settings, labelOnly.allowedOrigin, labelOnly.revision], [{ 'account-id': '43' }, 'https://git.example.com:8443', 3]);
});

test('an update at a stale revision fails with conflict and changes nothing', async () => {
  const { service } = setup();
  const created = value(await service.create(CREATION, INVOCATION));
  value(await service.update(created.integrationId, { expectedRevision: 1, label: 'First' }, INVOCATION));
  assert.equal(failed(await service.update(created.integrationId, { expectedRevision: 1, label: 'Second' }, INVOCATION)).code, 'conflict');
  assert.equal(value(await service.read(created.integrationId)).label, 'First');
});

test('an update checks what it changes and refuses an unknown integration with not-found', async () => {
  const { service } = setup();
  const created = value(await service.create(CREATION, INVOCATION));
  const id = created.integrationId;
  assert.equal(failed(await service.update(`i${'f'.repeat(32)}`, { expectedRevision: 1, label: 'x' }, INVOCATION)).code, 'not-found');
  assert.equal(failed(await service.update('not an identifier', { expectedRevision: 1, label: 'x' }, INVOCATION)).code, 'not-found');
  assert.equal(failed(await service.read(`i${'f'.repeat(32)}`)).code, 'not-found');
  const changes: ReadonlyArray<Partial<ScmIntegrationUpdate>> = [
    { settings: {} }, { secrets: { token: SECRET } }, { secrets: { 'webhook-secret': 'bad' } }, { allowedOrigin: 'https://[::1]' },
  ];
  for (const change of changes) {
    assert.equal(failed(await service.update(id, { expectedRevision: 1, ...change }, INVOCATION)).code, 'invalid', JSON.stringify(change));
  }
  assert.equal(value(await service.read(id)).revision, 1);
});

test('integrations are listed in identifier order, at most 100 a page, with the key of the next page', async () => {
  const { service } = setup();
  for (let index = 0; index < 101; index += 1) value(await service.create(CREATION, INVOCATION));
  const first = value(await service.list(undefined));
  assert.equal(first.items.length, 100);
  assert.equal(first.next, first.items[99]!.integrationId);
  const second = value(await service.list(first.next));
  assert.deepEqual([second.items.length, second.next], [1, undefined]);
  assert.ok(first.items.every((item, index) => index === 0 || first.items[index - 1]!.integrationId < item.integrationId));
});

test('secrets never show their values in a string, JSON, or inspection', () => {
  const secrets = value(ScmSecrets.of({ 'webhook-secret': SECRET }));
  assert.ok(![String(secrets), JSON.stringify({ secrets }), inspect(secrets)].some((text) => text.includes(SECRET)));
  assert.deepEqual(secrets.names(), ['webhook-secret']);
});

test('stored verifiers serve the integration plugin, cached by revision, and none for an unknown integration', async () => {
  const { service, store, plugin, plugins } = setup();
  const created = value(await service.create(CREATION, INVOCATION));
  const verifiers = new StoredScmIntegrationVerifiers(store, plugins, IGNORED);
  const delivery: WebhookDelivery = { headers: {}, rawBody: new Uint8Array() };
  assert.ok(value(await verifiers.verifierOf(created.integrationId)) !== undefined);
  assert.ok(value(await verifiers.verifierOf(created.integrationId)) !== undefined);
  assert.equal(plugin.created, 1, 'the second delivery reused the verifier of the same revision');
  value(await service.update(created.integrationId, { expectedRevision: 1, secrets: { 'webhook-secret': OTHER_SECRET } }, INVOCATION));
  const verifier = value(await verifiers.verifierOf(created.integrationId));
  assert.equal(plugin.created, 2, 'a new revision builds a new verifier at once');
  assert.ok(verifier !== undefined && (await verifier.verifyWebhookDelivery(delivery)) !== undefined);
  assert.equal(value(await verifiers.verifierOf(value(parseIdentifier('ScmIntegrationId', `i${'f'.repeat(32)}`)))), undefined);
});

test('stored verifiers answer none when the plugin is gone or cannot be built', async () => {
  const { service, store } = setup();
  const created = value(await service.create(CREATION, INVOCATION));
  assert.equal(value(await new StoredScmIntegrationVerifiers(store, { pluginOf: () => undefined }, IGNORED).verifierOf(created.integrationId)), undefined);
  const broken = { ...new ExamplePlugin(), createProvider: () => err(failure('invalid', 'cannot build')) } as unknown as SourceControlPlugin;
  assert.equal(value(await new StoredScmIntegrationVerifiers(store, { pluginOf: () => broken }, IGNORED).verifierOf(created.integrationId)), undefined);
});

test('stored verifiers report once per revision an integration that cannot verify, never with a value', async () => {
  const { service, store } = setup();
  const created = value(await service.create(CREATION, INVOCATION));
  const reports: unknown[] = [];
  const reporter = { unverifiable: (...report: unknown[]) => { reports.push(report); } };
  const broken = { ...new ExamplePlugin(), createProvider: () => err(failure('invalid', `cannot build with ${SECRET}`)) } as unknown as SourceControlPlugin;
  for (const plugin of [undefined, broken]) {
    const verifiers = new StoredScmIntegrationVerifiers(store, { pluginOf: () => plugin }, reporter);
    assert.equal(value(await verifiers.verifierOf(created.integrationId)), undefined);
    assert.equal(value(await verifiers.verifierOf(created.integrationId)), undefined, 'the next delivery reports nothing new');
  }
  assert.deepEqual(reports, [[created.integrationId, 1, 'plugin-missing'], [created.integrationId, 1, 'provider-refused']]);
  assert.ok(!JSON.stringify(reports).includes(SECRET));
});

test('an update refuses a secret that would take the integration past 32 secrets and names it', async () => {
  const { service } = setup(new AnySecretPlugin());
  const created = value(await service.create(CREATION, INVOCATION));
  const extra = Object.fromEntries(Array.from({ length: 30 }, (_, index) => [`extra-${String(index).padStart(2, '0')}`, SECRET]));
  assert.equal(value(await service.update(created.integrationId, { expectedRevision: 1, secrets: extra }, INVOCATION)).secretNames.length, 32);
  const refused = failed(await service.update(created.integrationId, { expectedRevision: 2, secrets: { 'extra-98': SECRET, 'extra-99': SECRET } }, INVOCATION));
  assert.deepEqual([refused.code, refused.details], ['invalid', { setting: 'extra-98' }]);
  assert.ok(!refused.message.includes(SECRET));
  assert.equal(value(await service.update(created.integrationId, { expectedRevision: 2, secrets: { 'extra-00': OTHER_SECRET } }, INVOCATION)).revision, 3);
});

test('a creation and an update are audited with the caller, its reason, and the clock time', async () => {
  const { service, audit } = setup();
  const created = value(await service.create(CREATION, INVOCATION));
  const updating = { actor: `p${'b'.repeat(32)}`, reason: 'control-plane API updateScmIntegration' };
  value(await service.update(created.integrationId, { expectedRevision: 1, label: 'Renamed', secrets: { 'webhook-secret': SECRET } }, updating));
  const { integrationId } = created;
  assert.deepEqual(value(await audit.trail()), [
    {
      integrationId, kind: 'created', ...INVOCATION, revision: 1, occurredAt: AT,
      changedFields: ['pluginId', 'label', 'allowedOrigin', 'settings.account-id', 'secrets.signing-key', 'secrets.webhook-secret'],
    },
    { integrationId, kind: 'updated', ...updating, changedFields: ['label', 'secrets.webhook-secret'], revision: 2, occurredAt: AT },
  ]);
  assert.ok(!JSON.stringify(value(await audit.trail())).includes(SECRET));
});

test('a refused creation or update is not audited', async () => {
  const { service, audit } = setup();
  failed(await service.create({ ...CREATION, settings: {} }, INVOCATION));
  const created = value(await service.create(CREATION, INVOCATION));
  failed(await service.update(created.integrationId, { expectedRevision: 1, secrets: { token: SECRET } }, INVOCATION));
  failed(await service.update(`i${'f'.repeat(32)}`, { expectedRevision: 1, label: 'Missing' }, INVOCATION));
  failed(await service.update(created.integrationId, { expectedRevision: 2, label: 'Stale' }, INVOCATION));
  assert.deepEqual(value(await audit.trail()).map((event) => [event.kind, event.revision]), [['created', 1]]);
});

const QUOTED = 'synthetic-quoted-by-the-plugin';
const MISBEHAVIOURS = ['throws', 'throwing-ok', 'throwing-error', 'no-envelope'] as const;
type Misbehaviour = (typeof MISBEHAVIOURS)[number];

// An answer of a check outside the result contract, each quoting a value.
function misbehavingAnswer(misbehaviour: Misbehaviour): unknown {
  switch (misbehaviour) {
    case 'throws': throw new Error(QUOTED);
    case 'throwing-ok': return { get ok(): boolean { throw new Error(QUOTED); } };
    case 'throwing-error': return { ok: false, get error(): unknown { throw new Error(QUOTED); } };
    case 'no-envelope': return QUOTED;
  }
}

function misbehave(plugin: ExamplePlugin, check: 'checkSettings' | 'checkSecret', misbehaviour: Misbehaviour): void {
  Object.defineProperty(plugin, check, { value: () => misbehavingAnswer(misbehaviour) });
}

test('a plugin check that throws or breaks its envelope fails a create or update as internal, quoting nothing', async () => {
  for (const check of ['checkSettings', 'checkSecret'] as const) {
    for (const misbehaviour of MISBEHAVIOURS) {
      const named = `${check} ${misbehaviour}`;
      const { service, store, audit, plugin, defects } = setup();
      const { integrationId } = value(await service.create(CREATION, INVOCATION));
      misbehave(plugin, check, misbehaviour);
      const change = { expectedRevision: 1, settings: SETTINGS, secrets: { 'webhook-secret': OTHER_SECRET } };
      const refusals = [failed(await service.create(CREATION, INVOCATION)), failed(await service.update(integrationId, change, INVOCATION))];
      const sanitized = ['internal', 'the SCM plugin answered outside its contract', {}];
      assert.deepEqual(refusals.map(({ code, message, details }) => [code, message, details]), [sanitized, sanitized], named);
      assert.deepEqual(defects.map((defect) => [defect.pluginId, defect.operation]), [['scm-example', check], ['scm-example', check]], named);
      assert.equal(defects[1]!.integrationId, integrationId, named);
      assert.deepEqual(value(await audit.trail()).map((event) => event.kind), ['created'], named);
      assert.equal(value(await store.page(undefined, 100)).length, 1, named);
      assert.equal(value(await store.get(integrationId))?.revision, 1, named);
      assert.ok(![refusals, defects, value(await audit.trail())].some((held) => inspect(held).includes(QUOTED)), named);
    }
  }
});

// Refuses every set of settings, naming in its details what `named` says.
function namingPlugin(named: (settings: Readonly<Record<string, string>>) => unknown): ExamplePlugin {
  const plugin = new ExamplePlugin();
  Object.defineProperty(plugin, 'checkSettings', {
    value: (settings: Readonly<Record<string, string>>) => ({ ok: false, error: { code: 'invalid', message: 'refused', details: named(settings) } }),
  });
  return plugin;
}

test('a refused setting is named only by a name the request or the integration holds, else as settings', async () => {
  const SETTING_VALUE = 'synthetic-setting-value';
  const cases: ReadonlyArray<readonly [string, (settings: Readonly<Record<string, string>>) => unknown, string]> = [
    ['a supplied name', () => ({ setting: 'account-id' }), 'account-id'],
    ['a supplied value', (settings) => ({ setting: settings['account-id'] }), 'settings'],
    ['arbitrary text', () => ({ setting: 'the account id 42 is wrong' }), 'settings'],
    ['no name', () => ({}), 'settings'],
  ];
  for (const [named, details, expected] of cases) {
    const { service } = setup(namingPlugin(details));
    const refused = failed(await service.create({ ...CREATION, settings: { 'account-id': SETTING_VALUE } }, INVOCATION));
    assert.deepEqual([refused.code, refused.details], ['invalid', { setting: expected }], named);
    assert.ok(!inspect(refused).includes(SETTING_VALUE) && !inspect(refused).includes('42'), named);
  }
});

test('an update names a refused setting the integration holds even when the request drops it', async () => {
  const plugin = new ExamplePlugin();
  const { service } = setup(plugin);
  const { integrationId } = value(await service.create(CREATION, INVOCATION));
  const refused = failed(await service.update(integrationId, { expectedRevision: 1, settings: {} }, INVOCATION));
  assert.deepEqual([refused.code, refused.details], ['invalid', { setting: 'account-id' }]);
});

test('a refusal whose details are malformed is a plugin defect, quoting nothing', async () => {
  for (const details of [{ setting: 42 }, 'synthetic-setting-value', null]) {
    const { service, defects } = setup(namingPlugin(() => details));
    const refused = failed(await service.create(CREATION, INVOCATION));
    assert.deepEqual([refused.code, refused.details], ['internal', {}], inspect(details));
    assert.deepEqual(defects.map((defect) => [defect.operation, defect.kind]), [['checkSettings', 'malformed-envelope']], inspect(details));
    assert.ok(!inspect(refused).includes('synthetic-setting-value'));
  }
});
