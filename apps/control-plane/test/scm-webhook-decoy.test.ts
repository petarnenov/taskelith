import assert from 'node:assert/strict';
import crypto, { createHmac, generateKeyPairSync } from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';
import { mock, test } from 'node:test';
import { ScmWebhookReceiver, type WebhookDelivery } from '@taskelith/integrations';
import { ok } from '@taskelith/kernel';
import { createGithubSourceControl, githubSourceControlPlugin } from '@taskelith/scm-github';
import { value } from '@taskelith/testing';

// The GitHub plugin's decoy for an unknown integration does the crypto work
// of its verification for the same headers, counted through node:crypto.
const KNOWN = `i${'a'.repeat(32)}`;
const UNKNOWN = `i${'b'.repeat(32)}`;
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const github = value(createGithubSourceControl({
  appId: '1234', installationId: '5678', privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  mergeMethods: ['squash'], webhookSecret: 'synthetic-decoy-secret',
}));
const plugin = githubSourceControlPlugin();
const receiver = new ScmWebhookReceiver({
  verifiers: { verifierOf: async (integrationId) => ok(integrationId === KNOWN ? github : undefined) },
  deliveries: { record: async () => ok('recorded') },
  decoy: plugin.createDecoy(),
  eventless: plugin,
});

const BODY = new Uint8Array(Buffer.from('{"repository":{"full_name":"acme/project"}}'));
const WRONG_DIGEST = createHmac('sha256', 'another-secret').update(BODY).digest('hex');
const WRONG = `sha256=${WRONG_DIGEST}`;
const SIGNATURES: Readonly<Record<string, string | undefined>> = {
  missing: undefined,
  malformed: 'sha256=not-hexadecimal',
  'short digest': 'sha256=abcd',
  'well-formed and wrong': WRONG,
  'upper-case and wrong': `sha256=${WRONG_DIGEST.toUpperCase()}`,
};

function delivery(signature: string | undefined): WebhookDelivery {
  const headers = { 'x-github-event': 'push', 'x-github-delivery': 'decoy-1' };
  return { headers: signature === undefined ? headers : { ...headers, 'x-hub-signature-256': signature }, rawBody: BODY };
}

interface Work {
  readonly hmacs: number;
  readonly comparisons: number;
}

// The HMAC and constant-time comparison calls of one receipt.
async function workOf(integrationId: string, signed: WebhookDelivery): Promise<Work> {
  const hmac = mock.method(crypto, 'createHmac');
  const comparison = mock.method(crypto, 'timingSafeEqual');
  syncBuiltinESMExports();
  try {
    const answer = await receiver.receive(integrationId, signed);
    assert.equal(!answer.ok && answer.error.details.reason, 'signature-invalid');
    return { hmacs: hmac.mock.callCount(), comparisons: comparison.mock.callCount() };
  } finally {
    mock.restoreAll();
    syncBuiltinESMExports();
  }
}

for (const [name, signature] of Object.entries(SIGNATURES)) {
  test(`an unknown integration and a known one do the same crypto work for the signature case "${name}"`, async () => {
    const known = await workOf(KNOWN, delivery(signature));
    const unknown = await workOf(UNKNOWN, delivery(signature));
    assert.deepEqual(unknown, known);
  });
}

test('the GitHub plugin hashes only a well-formed signature, so the cases above differ in work', async () => {
  assert.deepEqual(await workOf(KNOWN, delivery(undefined)), { hmacs: 0, comparisons: 0 });
  assert.deepEqual(await workOf(KNOWN, delivery(WRONG)), { hmacs: 1, comparisons: 1 });
});
