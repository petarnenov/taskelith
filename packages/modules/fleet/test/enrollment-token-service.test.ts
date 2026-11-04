import assert from 'node:assert/strict';
import test from 'node:test';
import type { SecretHash } from '@taskelith/access';
import type { Result } from '@taskelith/kernel';
import { ENROLLMENT_TOKEN_PAGE_SIZE, EnrollmentTokenService, FLEET_LIMITS, fleetWorker } from '@taskelith/fleet';
import { failed, value } from '@taskelith/testing';
import { countingIds, countingSecrets, enrollment, request } from './enrollment-fixtures.ts';

const TTL = FLEET_LIMITS.enrollmentTokenTtlMilliseconds;

// The token service over the registry of an enrollment service, so that a
// redemption and a command see one store.
function tokens() {
  const fixture = enrollment();
  const service = new EnrollmentTokenService({ registry: fixture.registry, secrets: countingSecrets(), ids: countingIds(), clock: fixture.clock });
  return { ...fixture, tokens: service };
}

const reasonOf = (result: Result<unknown>) => [failed(result).code, failed(result).details.reason];
const later = (instant: string, milliseconds: number) => new Date(Date.parse(instant) + milliseconds).toISOString();

test('an issued token is returned with its record and its secret once, and is listed as pending', async () => {
  const { clock, registry, tokens: service } = tokens();
  const issued = value(await service.issue({ platform: 'linux', hostname: 'build-1' }));
  const expected = { tokenId: 'e001', issuedAt: clock.now(), expiresAt: later(clock.now(), TTL), constraints: { platform: 'linux', hostname: 'build-1' } };
  assert.deepEqual(issued, { token: expected, secret: 'enrollment-1' });
  assert.deepEqual(value(await service.list()), { tokens: [expected] });
  assert.deepEqual(value(await registry.tokenById('e001')), expected);
  assert.equal(value(await registry.unusedToken('hash:enrollment-1' as SecretHash))?.tokenId, 'e001');
  assert.equal(value(await registry.tokenById('e999')), undefined);
});

test('the list pages by identifier at the page size and names the next page', async () => {
  const { tokens: service } = tokens();
  for (let n = 0; n < ENROLLMENT_TOKEN_PAGE_SIZE + 1; n++) value(await service.issue({}));
  const first = value(await service.list());
  assert.equal(first.tokens.length, ENROLLMENT_TOKEN_PAGE_SIZE);
  assert.deepEqual([first.tokens[0]?.tokenId, first.tokens.at(-1)?.tokenId, first.next], ['e001', 'e100', 'e100']);
  const second = value(await service.list(first.next));
  assert.deepEqual([second.tokens.map((token) => token.tokenId), second.next], [['e101'], undefined]);
});

test('the list leaves out used, expired, and revoked tokens', async () => {
  const { clock, registry, tokens: service } = tokens();
  value(await service.issue({}));
  clock.advance(TTL);
  const used = value(await service.issue({}));
  value(await service.issue({}));
  const kept = value(await service.issue({}));
  value(await registry.enroll('hash:enrollment-2' as SecretHash, fleetWorker('w1', 'j1')));
  value(await service.revoke('e003'));
  assert.deepEqual(value(await service.list()).tokens.map((token) => token.tokenId), [kept.token.tokenId]);
  assert.equal(used.token.tokenId, 'e002');
});

test('a revocation applies once, repeats, and refuses a used or unknown token', async () => {
  const { registry, tokens: service } = tokens();
  value(await service.issue({}));
  value(await service.issue({}));
  assert.deepEqual(value(await service.revoke('e001')), undefined);
  assert.deepEqual(value(await service.revoke('e001')), undefined);
  assert.equal(value(await registry.unusedToken('hash:enrollment-1' as SecretHash)), undefined);
  value(await registry.enroll('hash:enrollment-2' as SecretHash, fleetWorker('w1', 'j1')));
  assert.deepEqual(reasonOf(await service.revoke('e002')), ['precondition-failed', 'token-used']);
  assert.equal(failed(await service.revoke('e999')).code, 'not-found');
});

test('a rotation replaces a pending token by one with its constraints and a new TTL, and the old one is rotated', async () => {
  const { clock, tokens: service } = tokens();
  const first = value(await service.issue({ architecture: 'arm64' }));
  clock.advance(5 * 60_000);
  const rotated = value(await service.rotate('e001'));
  assert.deepEqual(rotated, {
    token: { tokenId: 'e002', issuedAt: clock.now(), expiresAt: later(clock.now(), TTL), constraints: { architecture: 'arm64' } },
    secret: 'enrollment-2',
  });
  assert.notEqual(rotated.token.expiresAt, first.token.expiresAt);
  assert.deepEqual(value(await service.list()).tokens.map((token) => token.tokenId), ['e002']);
  clock.advance(TTL);
  const revoked = failed(await service.revoke('e001'));
  assert.deepEqual([revoked.code, revoked.details], ['precondition-failed', { reason: 'token-rotated', replacementTokenId: 'e002' }]);
  assert.deepEqual(reasonOf(await service.rotate('e001')), ['precondition-failed', 'token-not-pending']);
  assert.equal(failed(await service.rotate('e999')).code, 'not-found');
});

test('a rotation refuses a used, expired, or revoked token as not pending', async () => {
  const { clock, registry, tokens: service } = tokens();
  value(await service.issue({}));
  clock.advance(TTL);
  value(await service.issue({}));
  value(await service.issue({}));
  value(await registry.enroll('hash:enrollment-2' as SecretHash, fleetWorker('w1', 'j1')));
  value(await service.revoke('e003'));
  for (const tokenId of ['e001', 'e002', 'e003']) {
    assert.deepEqual(reasonOf(await service.rotate(tokenId)), ['precondition-failed', 'token-not-pending'], tokenId);
  }
  assert.deepEqual(value(await service.list()).tokens, []);
});

test('a revoked or rotated token enrolls nothing, and the replacement enrolls', async () => {
  const { registry, service: enrollment, tokens: service } = tokens();
  const revoked = value(await service.issue({}));
  value(await service.revoke(revoked.token.tokenId));
  assert.deepEqual(reasonOf(await enrollment.enroll(revoked.secret, request())), ['forbidden', 'token-invalid']);
  const rotated = value(await service.issue({}));
  const replacement = value(await service.rotate(rotated.token.tokenId));
  assert.deepEqual(reasonOf(await enrollment.enroll(rotated.secret, request())), ['forbidden', 'token-invalid']);
  value(await enrollment.enroll(replacement.secret, request()));
  assert.equal(value(await registry.activeWorkerIds()).length, 1);
});

test('a revocation and a redemption of one token have exactly one winner, in either order', async () => {
  for (const revokeFirst of [true, false]) {
    const { registry, service: enrollment, tokens: service } = tokens();
    const issued = value(await service.issue({}));
    const revoke = () => service.revoke(issued.token.tokenId);
    const redeem = () => enrollment.enroll(issued.secret, request());
    const [revoked, enrolled] = revokeFirst ? await Promise.all([revoke(), redeem()]) : (await Promise.all([redeem(), revoke()])).reverse() as [Result<void>, Result<unknown>];
    const workers = value(await registry.activeWorkerIds()).length;
    if (revoked.ok) {
      assert.deepEqual([reasonOf(enrolled), workers], [['forbidden', 'token-invalid'], 0], `revoke first ${revokeFirst}`);
    } else {
      assert.deepEqual([failed(revoked).details.reason, enrolled.ok, workers], ['token-used', true, 1], `revoke first ${revokeFirst}`);
    }
  }
});

test('no refusal of a token command names a secret', async () => {
  const { registry, tokens: service } = tokens();
  const issued = value(await service.issue({}));
  value(await registry.enroll('hash:enrollment-1' as SecretHash, fleetWorker('w1', 'j1')));
  const refusals: Result<unknown>[] = [await service.revoke('e001'), await service.rotate('e001'), await service.rotate('e999')];
  for (const refusal of refusals) assert.ok(!JSON.stringify(failed(refusal)).includes(issued.secret));
});

test('EnrollmentService.issueToken still returns only the secret and stores the token with an identifier', async () => {
  const { registry, service: enrollment } = tokens();
  const secret = await enrollment.issueToken({ platform: 'darwin' });
  assert.deepEqual(secret, { ok: true, value: 'enrollment-1' });
  assert.deepEqual(value(await registry.tokenById('e001'))?.constraints, { platform: 'darwin' });
});
