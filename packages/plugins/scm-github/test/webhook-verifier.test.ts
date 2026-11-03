import assert from 'node:assert/strict';
import test from 'node:test';
import { githubTestbed, PROJECT, signedBody, signedDelivery, WEBHOOK_SECRET } from './github-fixture.ts';

const { provider } = githubTestbed();
const EVENT = { kind: 'change-request', repository: PROJECT, changeRequest: '7' } as const;

async function code(result: Promise<{ ok: boolean; error?: { code: string } }>): Promise<string | undefined> {
  const settled = await result;
  return settled.ok ? undefined : settled.error?.code;
}

test('a signed pull request delivery becomes a change-request event', async () => {
  const verified = await provider.verifyWebhookDelivery(signedDelivery(EVENT, WEBHOOK_SECRET, 'guid-1'));
  assert.deepEqual(verified, {
    ok: true,
    value: { deliveryId: 'guid-1', kind: 'change-request', repository: PROJECT, changeRequest: '7', commit: 'abc123' },
  });
});

test('a delivery identifier beyond 2^53 stays exact', async () => {
  const deliveryId = '18446744073709551615';
  const verified = await provider.verifyWebhookDelivery(signedDelivery(EVENT, WEBHOOK_SECRET, deliveryId));
  assert.equal(verified.ok && verified.value.deliveryId, deliveryId);
});

test('status, push, and other events map to their kinds', async () => {
  const body = (payload: unknown) => Buffer.from(JSON.stringify({ repository: { full_name: PROJECT }, ...(payload as object) }));
  const status = await provider.verifyWebhookDelivery(signedBody(body({ sha: 'c1' }), WEBHOOK_SECRET, 'd1', 'status'));
  const push = await provider.verifyWebhookDelivery(signedBody(body({ after: 'c2' }), WEBHOOK_SECRET, 'd2', 'push'));
  const other = await provider.verifyWebhookDelivery(signedBody(body({}), WEBHOOK_SECRET, 'd3', 'issues'));
  assert.deepEqual([status, push, other].map((result) => result.ok && result.value), [
    { deliveryId: 'd1', kind: 'commit-status', repository: PROJECT, commit: 'c1' },
    { deliveryId: 'd2', kind: 'push', repository: PROJECT, commit: 'c2' },
    { deliveryId: 'd3', kind: 'other', repository: PROJECT },
  ]);
});

// Decoding these bytes as text and encoding them again would change them,
// so a valid signature shows that the bytes themselves were checked.
test('the signature covers the raw bytes, which need not be text', async () => {
  const bytes = Buffer.from([0x7b, 0xff, 0xfe, 0x7d]);
  assert.equal(await code(provider.verifyWebhookDelivery(signedBody(bytes, WEBHOOK_SECRET, 'd4', 'push'))), 'invalid');
  const reencoded = Buffer.from(new TextDecoder().decode(bytes));
  const signed = signedBody(bytes, WEBHOOK_SECRET, 'd5', 'push');
  assert.equal(await code(provider.verifyWebhookDelivery({ ...signed, rawBody: new Uint8Array(reencoded) })), 'forbidden');
});

test('a missing, malformed, or foreign signature is forbidden', async () => {
  const signed = signedDelivery(EVENT, WEBHOOK_SECRET, 'd6');
  const signature = signed.headers['x-hub-signature-256'];
  const variants: readonly Record<string, string>[] = [
    {},
    { 'x-hub-signature-256': signature.slice(0, -2) },
    { 'x-hub-signature-256': signature.replace('sha256=', 'sha1=') },
    { 'x-hub-signature-256': signedDelivery(EVENT, 'another-secret', 'd6').headers['x-hub-signature-256'] },
  ];
  for (const headers of variants) {
    const delivery = { headers: { 'x-github-delivery': 'd6', 'x-github-event': 'pull_request', ...headers }, rawBody: signed.rawBody };
    assert.equal(await code(provider.verifyWebhookDelivery(delivery)), 'forbidden', JSON.stringify(Object.keys(headers)));
  }
});

test('an upper-case hexadecimal signature is accepted', async () => {
  const signed = signedDelivery(EVENT, WEBHOOK_SECRET, 'd7');
  const headers = { ...signed.headers, 'x-hub-signature-256': `sha256=${signed.headers['x-hub-signature-256'].slice(7).toUpperCase()}` };
  assert.equal((await provider.verifyWebhookDelivery({ ...signed, headers })).ok, true);
});

test('a signed delivery without its headers or a repository is invalid', async () => {
  const signed = signedDelivery(EVENT, WEBHOOK_SECRET, 'd8');
  const { 'x-github-delivery': _delivery, ...withoutDelivery } = signed.headers;
  assert.equal(await code(provider.verifyWebhookDelivery({ ...signed, headers: withoutDelivery })), 'invalid');
  const long = { ...signed.headers, 'x-github-delivery': 'd'.repeat(1025) };
  assert.equal(await code(provider.verifyWebhookDelivery({ ...signed, headers: long })), 'invalid');
  const anonymous = signedBody(Buffer.from('{"action":"opened"}'), WEBHOOK_SECRET, 'd9', 'pull_request');
  assert.equal(await code(provider.verifyWebhookDelivery(anonymous)), 'invalid');
});
