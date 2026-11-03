import assert from 'node:assert/strict';
import test from 'node:test';
import { defective } from './conformance-findings.ts';

// A refresh or a revocation of an unknown or revoked credential fails with
// not-found, so it never revives a credential or hides a lost one.

const REVOKED_REFRESH = 'revoked credential outcome: refreshRunCredential of a revoked credential';
const REVOKED_REVOCATION = 'revoked credential outcome: revokeRunCredential of a revoked credential';
const UNKNOWN_REFRESH = 'revoked credential outcome: refreshRunCredential of an unknown credential';
const UNKNOWN_REVOCATION = 'revoked credential outcome: revokeRunCredential of an unknown credential';

test('a refresh that revives a revoked credential is reported', async () => {
  assert.deepEqual(await defective({ refreshesRevokedCredential: true }), [
    `${REVOKED_REFRESH} succeeded, expected failure not-found`,
  ]);
});

test('a refresh of an unknown credential that fails with another code is reported', async () => {
  assert.deepEqual(await defective({ unknownRefreshFailsWith: 'invalid' }), [
    `${UNKNOWN_REFRESH} failed with invalid, expected failure not-found`,
  ]);
});

test('a revocation that succeeds for a revoked or unknown credential is reported', async () => {
  assert.deepEqual(await defective({ revokesMissingCredential: true }), [
    `${REVOKED_REVOCATION} succeeded, expected failure not-found`,
    `${UNKNOWN_REVOCATION} succeeded, expected failure not-found`,
  ]);
});
