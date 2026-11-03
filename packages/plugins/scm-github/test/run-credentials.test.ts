import assert from 'node:assert/strict';
import test from 'node:test';
import { parseInstant } from '@taskelith/kernel';
import { basicAuthorization, createGithubSourceControl, GITHUB_API_VERSION } from '@taskelith/scm-github';
import { FOREIGN, githubTestbed, HIDDEN, PROJECT } from './github-fixture.ts';

const READ_ONLY = { runId: 'run-1', repositories: [PROJECT], permissions: ['read-code'] };
const TOKEN_ROUTE = /^\/app\/installations\/5678\/access_tokens$/;

async function value<T>(result: Promise<{ ok: true; value: T } | { ok: false; error: unknown }>): Promise<T> {
  const settled = await result;
  assert.ok(settled.ok, JSON.stringify(settled));
  return settled.value;
}

async function code(result: Promise<{ ok: boolean; error?: { code: string } }>): Promise<string | undefined> {
  const settled = await result;
  return settled.ok ? undefined : settled.error?.code;
}

test('a credential is an installation token narrowed to the run', async () => {
  const { provider, emulator } = githubTestbed();
  const credential = await value(provider.issueRunCredential(READ_ONLY));
  const minted = emulator.requests.find((request) => TOKEN_ROUTE.test(request.path) && request.body !== undefined);
  assert.deepEqual(minted?.body, { repositories: ['project'], permissions: { contents: 'read' } });
  assert.deepEqual([credential.version, credential.repositories, credential.permissions], [1, [PROJECT], ['read-code']]);
  assert.ok(credential.secret.startsWith('ghs_') && emulator.isTokenLive(credential.secret));
  assert.ok(parseInstant(credential.expiresAt).ok);
});

test('the authorization is Basic x-access-token credentials of the secret', async () => {
  const { provider } = githubTestbed();
  const credential = await value(provider.issueRunCredential(READ_ONLY));
  const expected = `Basic ${Buffer.from(`x-access-token:${credential.secret}`).toString('base64')}`;
  assert.equal(credential.authorization, expected);
  assert.equal(basicAuthorization(credential.secret), expected);
});

test('every request names API version 2022-11-28', async () => {
  const { provider, emulator } = githubTestbed();
  const credential = await value(provider.issueRunCredential(READ_ONLY));
  await value(provider.revokeRunCredential(credential));
  assert.equal(await code(provider.issueRunCredential({ ...READ_ONLY, repositories: [HIDDEN] })), 'not-found');
  assert.equal(GITHUB_API_VERSION, '2022-11-28');
  assert.ok(emulator.requests.some((request) => request.path.startsWith('/installation/repositories')));
  assert.ok(emulator.requests.every((request) => request.headers['x-github-api-version'] === '2022-11-28'));
});

test('write-code alone is granted with the read it implies', async () => {
  const { provider } = githubTestbed();
  const credential = await value(provider.issueRunCredential({ ...READ_ONLY, permissions: ['write-code'] }));
  assert.deepEqual(credential.permissions, ['read-code', 'write-code']);
});

test('two runs with the same grant get distinct tokens', async () => {
  const { provider } = githubTestbed();
  const [first, second] = await Promise.all([
    value(provider.issueRunCredential(READ_ONLY)),
    value(provider.issueRunCredential({ ...READ_ONLY, runId: 'run-2' })),
  ]);
  assert.notEqual(first.secret, second.secret);
  assert.notEqual(first.credentialId, second.credentialId);
});

test('a mint lists no installation repositories', async () => {
  const { provider, emulator } = githubTestbed();
  await value(provider.issueRunCredential(READ_ONLY));
  assert.equal(emulator.requests.some((request) => request.path.startsWith('/installation/repositories')), false);
});

test('a repository named in another case is granted under its requested name', async () => {
  const { provider } = githubTestbed();
  const credential = await value(provider.issueRunCredential({ ...READ_ONLY, repositories: ['ACME/Project'] }));
  assert.deepEqual(credential.repositories, ['ACME/Project']);
});

test("another owner's repository is not found and leaves no token", async () => {
  const { provider, emulator } = githubTestbed();
  assert.equal(await code(provider.issueRunCredential({ ...READ_ONLY, repositories: ['other/project'] })), 'not-found');
  assert.equal(emulator.liveRunTokens(), 0);
});

test('a refused token request reads the installation across pages', async () => {
  const { provider, emulator } = githubTestbed({}, { pageSize: 1 });
  emulator.refuseNext('POST', TOKEN_ROUTE, 422);
  assert.equal(await code(provider.issueRunCredential({ ...READ_ONLY, repositories: [FOREIGN] })), 'invalid');
});

test('a request outside the installation or malformed mints no token', async () => {
  const { provider, emulator } = githubTestbed();
  assert.equal(await code(provider.issueRunCredential({ ...READ_ONLY, repositories: [HIDDEN] })), 'not-found');
  assert.equal(await code(provider.issueRunCredential({ ...READ_ONLY, repositories: [] })), 'invalid');
  assert.equal(await code(provider.issueRunCredential({ ...READ_ONLY, repositories: ['no-owner'] })), 'invalid');
  assert.equal(await code(provider.issueRunCredential({ ...READ_ONLY, permissions: ['admin'] })), 'invalid');
  assert.equal(emulator.liveRunTokens(), 0);
});

test('a refused token request maps its status, not its message', async () => {
  const { provider, emulator } = githubTestbed();
  emulator.refuseNext('POST', TOKEN_ROUTE, 422);
  assert.equal(await code(provider.issueRunCredential(READ_ONLY)), 'invalid');
  emulator.refuseNext('POST', TOKEN_ROUTE, 503);
  const refused = await provider.issueRunCredential(READ_ONLY);
  assert.deepEqual(refused.ok ? undefined : refused.error.details, { status: '503' });
});

test('a token wider than requested is revoked and not returned', async () => {
  const { provider, emulator } = githubTestbed({}, { alsoGrants: { contents: 'write' } });
  assert.equal(await code(provider.issueRunCredential(READ_ONLY)), 'internal');
  assert.equal(emulator.liveRunTokens(), 0);
});

test('an adoption revokes the earlier tokens at GitHub', async () => {
  const { provider, emulator } = githubTestbed();
  const first = await value(provider.issueRunCredential(READ_ONLY));
  const second = await value(provider.refreshRunCredential(first));
  const third = await value(provider.refreshRunCredential(second));
  await value(provider.confirmRunCredentialAdoption(second));
  assert.deepEqual([first, second, third].map((version) => emulator.isTokenLive(version.secret)), [false, true, true]);
  assert.equal(await code(provider.confirmRunCredentialAdoption({ ...third, version: 4 })), 'not-found');
  assert.equal(await code(provider.confirmRunCredentialAdoption({ ...third, version: 0 })), 'not-found');
});

test('a revocation revokes every live token at GitHub and forgets the credential', async () => {
  const { provider, emulator } = githubTestbed();
  const first = await value(provider.issueRunCredential(READ_ONLY));
  const second = await value(provider.refreshRunCredential(first));
  await value(provider.revokeRunCredential(first));
  assert.equal(emulator.isTokenLive(first.secret) || emulator.isTokenLive(second.secret), false);
  assert.equal(await code(provider.refreshRunCredential(first)), 'not-found');
  assert.equal(await code(provider.confirmRunCredentialAdoption(second)), 'not-found');
});

test('a failed revocation at GitHub is reported and retried, never refreshed', async () => {
  const { provider, emulator } = githubTestbed();
  const credential = await value(provider.issueRunCredential(READ_ONLY));
  emulator.refuseNext('DELETE', /^\/installation\/token$/, 503);
  assert.equal(await code(provider.revokeRunCredential(credential)), 'unavailable');
  assert.ok(emulator.isTokenLive(credential.secret));
  assert.equal(await code(provider.refreshRunCredential(credential)), 'not-found');
  await value(provider.revokeRunCredential(credential));
  assert.equal(emulator.isTokenLive(credential.secret), false);
  assert.equal(await code(provider.revokeRunCredential(credential)), 'not-found');
});

test('a failed revocation during an adoption is reported and retried', async () => {
  const { provider, emulator } = githubTestbed();
  const first = await value(provider.issueRunCredential(READ_ONLY));
  const second = await value(provider.refreshRunCredential(first));
  emulator.refuseNext('DELETE', /^\/installation\/token$/, 500);
  assert.equal(await code(provider.confirmRunCredentialAdoption(second)), 'unavailable');
  assert.ok(emulator.isTokenLive(first.secret));
  await value(provider.confirmRunCredentialAdoption(second));
  assert.equal(emulator.isTokenLive(first.secret), false);
});

test('a token that already expired counts as ended', async () => {
  const { provider, emulator } = githubTestbed();
  const credential = await value(provider.issueRunCredential(READ_ONLY));
  emulator.advance(60 * 60 * 1000);
  await value(provider.revokeRunCredential(credential));
});

test('a refresh that a revocation overtakes revokes its new token', async () => {
  const { provider, emulator } = githubTestbed();
  const credential = await value(provider.issueRunCredential(READ_ONLY));
  const refreshing = provider.refreshRunCredential(credential);
  const revoking = provider.revokeRunCredential(credential);
  assert.equal(await code(refreshing), 'not-found');
  await value(revoking);
  assert.equal(emulator.liveRunTokens(), 0);
});

// Credential state is in memory: after a restart nothing is known, and
// the earlier tokens end at their own expiry.
test('after a restart every earlier credential is unknown', async () => {
  const { provider, emulator, options } = githubTestbed();
  const credential = await value(provider.issueRunCredential(READ_ONLY));
  const restarted = createGithubSourceControl(options);
  assert.ok(restarted.ok);
  const after = restarted.value;
  assert.equal(await code(after.refreshRunCredential(credential)), 'not-found');
  assert.equal(await code(after.confirmRunCredentialAdoption(credential)), 'not-found');
  assert.equal(await code(after.revokeRunCredential(credential)), 'not-found');
  assert.ok(emulator.isTokenLive(credential.secret));
  emulator.advance(60 * 60 * 1000);
  assert.equal(emulator.isTokenLive(credential.secret), false);
});

const REVOCATION_ROUTE = /^\/installation\/token$/;

test('a refresh overtaken by a revocation whose cleanup fails is retried', async () => {
  const { provider, emulator } = githubTestbed();
  const credential = await value(provider.issueRunCredential(READ_ONLY));
  const held = emulator.holdNext('POST', TOKEN_ROUTE);
  const refreshing = provider.refreshRunCredential(credential);
  await held.reached;
  emulator.refuseRevocations(503);
  const revoking = provider.revokeRunCredential(credential);
  held.release();
  assert.equal(await code(refreshing), 'not-found');
  assert.equal(await code(revoking), 'unavailable');
  emulator.refuseRevocations(undefined);
  await value(provider.revokeRunCredential(credential));
  assert.equal(emulator.liveRunTokens(), 0);
});

test('a rejected grant whose revocation fails is revoked by the next call', async () => {
  const { provider, emulator } = githubTestbed({}, { alsoGrants: { contents: 'write' } });
  emulator.refuseNext('DELETE', REVOCATION_ROUTE, 503);
  assert.equal(await code(provider.issueRunCredential(READ_ONLY)), 'internal');
  assert.equal(emulator.liveRunTokens(), 1);
  assert.equal(await code(provider.issueRunCredential(READ_ONLY)), 'internal');
  assert.equal(emulator.liveRunTokens(), 0);
});

test('a token answer without an expiry is revoked', async () => {
  const { provider, emulator } = githubTestbed({}, { omitsExpiry: true });
  assert.equal(await code(provider.issueRunCredential(READ_ONLY)), 'internal');
  assert.equal(emulator.liveRunTokens(), 0);
});

for (const extra of [{ statuses: 'write' }, { administration: 'write' }] as Record<string, string>[]) {
  test(`a token granted ${JSON.stringify(extra)} beyond the request is revoked`, async () => {
    const { provider, emulator } = githubTestbed({}, { alsoGrants: extra });
    assert.equal(await code(provider.issueRunCredential(READ_ONLY)), 'internal');
    assert.equal(emulator.liveRunTokens(), 0);
  });
}

test('a refresh in the same second as its version waits for a later expiry', async () => {
  const { provider, emulator } = githubTestbed();
  const credential = await value(provider.issueRunCredential(READ_ONLY));
  const refreshed = await value(provider.refreshRunCredential(credential));
  assert.ok(Date.parse(refreshed.expiresAt) > Date.parse(credential.expiresAt));
  assert.equal(refreshed.version, 2);
  assert.equal(emulator.liveRunTokens(), 2);
});

test('a refresh that waiting does not make later fails and leaves no token', async () => {
  const clock = { now: () => Date.now(), sleep: async () => {} };
  const { provider, emulator } = githubTestbed({ clock });
  const credential = await value(provider.issueRunCredential(READ_ONLY));
  assert.equal(await code(provider.refreshRunCredential(credential)), 'unavailable');
  assert.equal(emulator.liveRunTokens(), 1);
  assert.equal(emulator.requests.filter((request) => TOKEN_ROUTE.test(request.path) && request.body !== undefined).length, 3);
});

test('two concurrent refreshes in one second both get later versions', async () => {
  const { provider, emulator } = githubTestbed();
  const credential = await value(provider.issueRunCredential(READ_ONLY));
  emulator.advance(1000);
  const results = await Promise.all([provider.refreshRunCredential(credential), provider.refreshRunCredential(credential)]);
  assert.deepEqual(results.map((result) => (result.ok ? result.value.version : undefined)).sort(), [2, 3]);
  assert.equal(emulator.liveRunTokens(), 3);
});

const PAST_EXPIRY_MS = 61 * 60 * 1000 + 1;

test('a credential whose versions all expired is forgotten without GitHub', async () => {
  const { provider, emulator } = githubTestbed();
  const credential = await value(provider.issueRunCredential(READ_ONLY));
  emulator.advance(PAST_EXPIRY_MS);
  assert.equal(await code(provider.revokeRunCredential(credential)), 'not-found');
  assert.equal(emulator.requests.some((request) => REVOCATION_ROUTE.test(request.path)), false);
});

test('an expired earlier version ends without a revocation request', async () => {
  const { provider, emulator } = githubTestbed();
  const first = await value(provider.issueRunCredential(READ_ONLY));
  emulator.advance(30 * 60 * 1000);
  const second = await value(provider.refreshRunCredential(first));
  emulator.advance(PAST_EXPIRY_MS - 30 * 60 * 1000);
  await value(provider.confirmRunCredentialAdoption(second));
  assert.equal(emulator.requests.some((request) => REVOCATION_ROUTE.test(request.path)), false);
  assert.ok(emulator.isTokenLive(second.secret));
});

for (const status of [403, 404, 422, 500]) {
  test(`an unconfirmed revocation with status ${status} is unavailable and kept`, async () => {
    const { provider, emulator } = githubTestbed();
    const first = await value(provider.issueRunCredential(READ_ONLY));
    const second = await value(provider.refreshRunCredential(first));
    emulator.refuseNext('DELETE', REVOCATION_ROUTE, status);
    assert.equal(await code(provider.confirmRunCredentialAdoption(second)), 'unavailable');
    emulator.refuseNext('DELETE', REVOCATION_ROUTE, status);
    assert.equal(await code(provider.revokeRunCredential(second)), 'unavailable');
    await value(provider.revokeRunCredential(second));
    assert.equal(emulator.liveRunTokens(), 0);
  });
}
