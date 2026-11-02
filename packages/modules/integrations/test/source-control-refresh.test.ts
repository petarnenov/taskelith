import assert from 'node:assert/strict';
import test from 'node:test';
import { err, ok } from '@taskelith/kernel';
import { defective, headings, issued, patched } from './conformance-findings.ts';

// Port version 0.2.0: a refresh keeps the earlier versions until an
// adoption confirms a later one, and every credential has `authorization`.

function cases(lines: readonly string[]): string[] {
  return [...new Set(headings(lines))];
}

test('a refresh that ends the previous secret before its adoption is reported', async () => {
  const lines = await defective({ refreshEndsPrevious: true });
  assert.deepEqual(cases(lines), ['refreshed credential outcome', 'adopted credential outcome']);
  assert.ok(lines.includes(
    'refreshed credential outcome: read-code to the project repository before the adoption of its successor must succeed',
  ));
});

test('an adoption that leaves the previous secret working is reported', async () => {
  const lines = await defective({ adoptionKeepsPrevious: true });
  assert.deepEqual(cases(lines), ['refreshed credential outcome', 'adopted credential outcome']);
  assert.ok(lines.includes(
    'refreshed credential outcome: read-code to the project repository after the adoption of its successor must fail with forbidden',
  ));
});

test('an adoption that also ends the adopted secret is reported', async () => {
  const lines = await defective({ adoptionEndsAdopted: true });
  assert.deepEqual(cases(lines), ['refreshed credential outcome', 'adopted credential outcome']);
  assert.ok(lines.includes('refreshed credential outcome: read-code to the project repository after its adoption must succeed'));
});

test('an adoption that ends a later version is reported', async () => {
  assert.deepEqual(await defective({ adoptionEndsLater: true }), [
    'adopted credential outcome: read-code to the project repository after the adoption of an earlier version must succeed',
    'adopted credential outcome: read-code to the project repository after its adoption must succeed',
  ]);
});

test('an adoption of a version not yet issued that succeeds is reported', async () => {
  assert.deepEqual(await defective({ adoptsUnissuedVersion: true }), [
    'adopted credential outcome: confirmRunCredentialAdoption of a version not yet issued succeeded, expected failure not-found',
    'adopted credential outcome: read-code to the project repository after its adoption must succeed',
  ]);
});

test('a stale adoption that restores an ended version is reported', async () => {
  assert.deepEqual(await defective({ staleAdoptionRestores: true }), [
    'adopted credential outcome: read-code to the project repository after a stale adoption must fail with forbidden',
  ]);
});

test('a revocation that leaves an earlier version working is reported', async () => {
  const lines = await defective({ revocationKeepsEarlier: true });
  assert.deepEqual(cases(lines), ['revoked credential outcome']);
  assert.ok(lines.every((line) => line.endsWith('after the revocation of its credential must fail with forbidden')));
});

test('a refresh that keeps the version or the credential identifier is reported', async () => {
  const version = await defective({ refreshKeepsVersion: true });
  assert.ok(version.includes('refreshed credential outcome: refreshRunCredential must return the next version'));
  assert.deepEqual(cases(version), ['refreshed credential outcome', 'adopted credential outcome', 'revoked credential outcome']);
  const identifier = await patched((provider) => ({
    refreshRunCredential: async (request) => {
      const refreshed = await provider.refreshRunCredential(request);
      return refreshed.ok ? ok({ ...refreshed.value, credentialId: 'another' }) : refreshed;
    },
  }));
  assert.ok(identifier.includes('refreshed credential outcome: refreshRunCredential returned another credentialId'));
});

test('an issue at a version other than 1 is reported', async () => {
  const lines = await patched((provider) => ({
    issueRunCredential: async (request) => ok({ ...(await issued(provider, request)), version: 2 }),
  }));
  assert.equal(lines.filter((line) => line.endsWith('issueRunCredential must return version 1')).length, 12);
});

test('a version that is not a positive integer is a shape finding', async () => {
  for (const version of [0, 1.5, '1']) {
    const lines = await patched((provider) => ({
      issueRunCredential: async (request) => ok({ ...(await issued(provider, request)), version }) as never,
    }));
    const shapes = lines.filter((line) => line.endsWith('credential.version must be a positive integer'));
    assert.equal(shapes.length, 7, String(version));
  }
});

test('an adoption that fails or returns a value is reported', async () => {
  const failing = await patched(() => ({ confirmRunCredentialAdoption: async () => err({ code: 'unavailable', message: 'no', details: {} }) }));
  assert.deepEqual(failing, [
    'refreshed credential outcome: confirmRunCredentialAdoption failed with unavailable, expected success',
    'adopted credential outcome: confirmRunCredentialAdoption failed with unavailable, expected success',
  ]);
  const valued = await patched(() => ({ confirmRunCredentialAdoption: async () => ok({ ended: 1 }) as never }));
  assert.deepEqual(cases(valued), ['refreshed credential shape', 'adopted credential shape']);
});

test('an authorization that grants no code access is reported', async () => {
  const lines = await defective({ unusableAuthorization: true });
  assert.ok(lines.length > 0 && lines.every((line) => /: (read|write)-code to the project repository.* must succeed$/.test(line)));
  assert.ok(cases(lines).includes('refreshed credential outcome'));
});

test('a refresh that keeps the authorization is reported', async () => {
  const lines = await defective({ refreshKeepsAuthorization: true });
  assert.ok(lines.includes('refreshed credential outcome: refreshRunCredential must return a new authorization'));
});

test('one authorization shared between runs is reported', async () => {
  const lines = await patched((provider) => ({
    issueRunCredential: async (request) => ok({ ...(await issued(provider, request)), authorization: 'Bearer shared' }),
  }));
  assert.ok(lines.includes('credential isolation outcome: credentials of two runs must have distinct authorizations'));
});

test('an authorization that is not a scheme and credentials is a shape finding', async () => {
  for (const authorization of ['', 'token-only', 'Bearer a\r\nX-Injected: 1', 'Bearer ', 'B@d x', 'Bearer x ', `Bearer ${'x'.repeat(65536)}`]) {
    const lines = await patched((provider) => ({
      issueRunCredential: async (request) => ok({ ...(await issued(provider, request)), authorization }),
    }));
    const shapes = lines.filter((line) => line.endsWith('credential.authorization must be a scheme, a space, and visible ASCII credentials'));
    assert.equal(shapes.length, 7, JSON.stringify(authorization));
  }
});

test('a remote URL with user information, a query, or a fragment is a shape finding', async () => {
  const remotes = [
    'https://user@scm.example/acme/project.git',
    'https://scm.example/acme/project.git?x=1',
    'https://scm.example/acme/project.git#main',
    'http://scm.example/acme/project.git',
    'https://scm.example/acme/project .git',
    'not a url',
    'https://[::1]/acme/project.git',
    'https://scm.example:0/acme/project.git',
    `https://scm.example/${'p'.repeat(2048)}`,
  ];
  for (const remoteUrl of remotes) {
    const lines = await patched(() => ({ resolveRemoteUrl: async ({ repository }) => ok({ repository, remoteUrl }) }));
    assert.deepEqual(lines, [
      'repository remote shape: resolveRemoteUrl: remote.remoteUrl must be an HTTPS URL without user information, query, or fragment',
    ], remoteUrl);
  }
});

test('a remote URL of another repository is reported', async () => {
  assert.deepEqual(await defective({ remoteOfProjectForAll: true }), [
    'repository remote outcome: resolveRemoteUrl returned the same remoteUrl for two repositories',
  ]);
  const elsewhere = await patched(() => ({
    resolveRemoteUrl: async ({ repository }) => ok({ repository, remoteUrl: `https://elsewhere.example/${repository}.git` }),
  }));
  assert.deepEqual(elsewhere, ['repository remote outcome: resolveRemoteUrl returned another remoteUrl than the fixture names']);
  const echo = await patched((provider) => ({
    resolveRemoteUrl: async (request) => {
      const resolved = await provider.resolveRemoteUrl(request);
      return resolved.ok ? ok({ ...resolved.value, repository: 'acme/third' }) : resolved;
    },
  }));
  assert.deepEqual(headings(echo), ['repository remote outcome', 'repository remote outcome']);
  assert.match(echo[0]!, /resolveRemoteUrl returned another repository than requested$/);
});

test('a remote URL that the plugin cannot resolve is reported', async () => {
  const lines = await patched(() => ({ resolveRemoteUrl: async () => err({ code: 'not-found', message: 'no', details: {} }) }));
  assert.deepEqual(lines, ['repository remote outcome: resolveRemoteUrl failed with not-found, expected success']);
});
