import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';
import type { WebhookDelivery } from '@taskelith/integrations';
import { GITHUB_PLUGIN_MANIFEST, githubSourceControlPlugin, registerGithubSourceControlPlugin } from '@taskelith/scm-github';
import { failed, value } from '@taskelith/testing';
import { githubTestbed, PROJECT, signedBody, WEBHOOK_SECRET } from './github-fixture.ts';

// The draft plugin descriptor through which the control plane checks and
// builds stored integrations; GitHub itself is never called.
const PRIVATE_KEY = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const SETTINGS = Object.freeze({ 'app-id': '1234', 'installation-id': '5678', 'merge-methods': 'merge-commit,squash,rebase' });
const SECRETS = Object.freeze({ 'private-key': PRIVATE_KEY, 'webhook-secret': WEBHOOK_SECRET });
const plugin = githubSourceControlPlugin();

test('the descriptor carries the manifest identifier and requires the private key and webhook secret', () => {
  assert.equal(plugin.id, GITHUB_PLUGIN_MANIFEST.id);
  assert.deepEqual(plugin.secretNames, ['private-key', 'webhook-secret']);
  assert.ok(Object.isFrozen(plugin));
});

test('registration admits the descriptor for a host that offers the SourceControlProvider port', () => {
  assert.equal(value(registerGithubSourceControlPlugin({ ports: ['SourceControlProvider'] })).id, 'scm-github');
  assert.equal(failed(registerGithubSourceControlPlugin({ ports: ['SdlcFramework'] })).code, 'not-found');
});

test('the settings check names an unknown, missing, or invalid setting and never quotes a value', () => {
  assert.equal(plugin.checkSettings(SETTINGS).ok, true);
  assert.equal(plugin.checkSettings({ ...SETTINGS, 'merge-methods': 'squash' }).ok, true);
  const cases: ReadonlyArray<readonly [Record<string, string>, string]> = [
    [{ ...SETTINGS, region: 'secret-looking-value' }, 'region'],
    [{ 'installation-id': '5678', 'merge-methods': 'squash' }, 'app-id'],
    [{ ...SETTINGS, 'app-id': '0x12' }, 'app-id'],
    [{ ...SETTINGS, 'installation-id': '' }, 'installation-id'],
    [{ ...SETTINGS, 'merge-methods': '' }, 'merge-methods'],
    [{ ...SETTINGS, 'merge-methods': 'merge' }, 'merge-methods'],
    [{ ...SETTINGS, 'merge-methods': 'squash,squash' }, 'merge-methods'],
    [{ ...SETTINGS, 'merge-methods': 'squash, rebase' }, 'merge-methods'],
  ];
  for (const [settings, named] of cases) {
    const refused = failed(plugin.checkSettings(settings));
    assert.deepEqual([refused.code, refused.details], ['invalid', { setting: named }], named);
    assert.ok(!refused.message.includes('secret-looking-value') && !refused.message.includes('0x12'), named);
  }
});

test('the secret check accepts a PEM private key and a webhook secret, and names only the secret it refuses', () => {
  assert.equal(plugin.checkSecret('private-key', PRIVATE_KEY).ok, true);
  assert.equal(plugin.checkSecret('webhook-secret', WEBHOOK_SECRET).ok, true);
  for (const [name, secret] of [['private-key', 'not a key'], ['webhook-secret', ''], ['token', 'synthetic-token']] as const) {
    const refused = failed(plugin.checkSecret(name, secret));
    assert.deepEqual([refused.code, refused.details], ['invalid', { setting: name }], name);
    assert.ok(!refused.message.includes(secret || 'never'), name);
  }
});

test('a provider built from a configuration verifies deliveries with its webhook secret', async () => {
  const { options } = githubTestbed();
  const built = value(githubSourceControlPlugin({ baseUrl: options.baseUrl!, fetch: options.fetch! }).createProvider({ settings: SETTINGS, secrets: SECRETS }));
  assert.deepEqual(built.capabilities.mergeMethods, ['merge-commit', 'squash', 'rebase']);
  const body = new TextEncoder().encode(JSON.stringify({ repository: { full_name: PROJECT } }));
  const verified = await built.verifyWebhookDelivery(signedBody(body, WEBHOOK_SECRET, 'delivery-1', 'push'));
  assert.equal(verified.ok && verified.value.repository, PROJECT);
  assert.equal(failed(plugin.createProvider({ settings: {}, secrets: SECRETS })).code, 'invalid');
});

test('the eventless deliveries are ping, installation, and installation_repositories by their event header', () => {
  const delivery = (event: string): WebhookDelivery => ({ headers: { 'x-github-event': event }, rawBody: new Uint8Array() });
  assert.deepEqual(['ping', 'installation', 'installation_repositories', 'push', 'pull_request'].map((event) => plugin.isEventless(delivery(event))),
    [true, true, true, false, false]);
  assert.equal(plugin.isEventless({ headers: {}, rawBody: new Uint8Array() }), false);
});

test('the decoy refuses even a delivery signed with the webhook secret', async () => {
  const body = new TextEncoder().encode('{}');
  assert.equal(failed(await plugin.createDecoy().verifyWebhookDelivery(signedBody(body, WEBHOOK_SECRET, 'd', 'push'))).code, 'forbidden');
});
