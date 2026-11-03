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
  assert.equal(GITHUB_API_VERSION, '2022-11-28');
  assert.ok(emulator.requests.length >= 3);
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

test('the installation repositories are read across pages', async () => {
  const { provider } = githubTestbed({}, { pageSize: 1 });
  const credential = await value(provider.issueRunCredential({ ...READ_ONLY, repositories: [FOREIGN] }));
  assert.deepEqual(credential.repositories, [FOREIGN]);
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
