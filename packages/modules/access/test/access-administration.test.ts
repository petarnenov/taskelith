import assert from 'node:assert/strict';
import test from 'node:test';
import {
  anonymousSession,
  checkNewPassword,
  csrfTokenMatches,
  expiresAt,
  includesRole,
  InMemoryAccessStore,
  isLive,
  normalizePassword,
  OwnerBootstrapService,
  parseLoginName,
  parsePrincipalId,
  parseProjectRole,
  plus,
  PrincipalAdministration,
  renewal,
  SESSION_LIFETIME,
  type PrincipalId,
  type SecretHash,
} from '@taskelith/access';
import { failed, value } from '@taskelith/testing';
import { countingRandom, ManualClock, recordingHasher } from './access-fixtures.ts';

const INVOCATION = { actor: 'root@control-plane-1', reason: 'onboarding' };

async function administration() {
  const store = new InMemoryAccessStore();
  const clock = new ManualClock();
  const random = countingRandom();
  const owner = value(await new OwnerBootstrapService({ store, random, clock }).ensureOwner(INVOCATION)).principalId;
  const admin = new PrincipalAdministration({ store, hasher: recordingHasher(), random, clock });
  return { store, clock, owner, admin };
}

const trailKinds = async (store: InMemoryAccessStore) => value(await store.transaction((tx) => tx.audit.trail())).map((event) => event.kind);

test('the owner creates a principal, sets its password, and assigns and removes its roles, each audited', async () => {
  const { store, owner, admin } = await administration();
  const bob = value(await admin.createPrincipal(owner, 'Bob', INVOCATION));
  assert.deepEqual(bob.loginName, 'bob');
  assert.equal(failed(await admin.createPrincipal(owner, 'bob', INVOCATION)).code, 'conflict');
  const set = value(await admin.setPassword(owner, 'bob', 'a long enough passphrase', INVOCATION));
  assert.deepEqual(set, { principalId: bob.principalId, loginName: 'bob', sessionsEnded: 0 });
  assert.equal(value(await store.transaction((tx) => tx.principals.get(bob.principalId)))?.passwordHash, 'new:a long enough passphrase');
  const assigned = value(await admin.assignProjectRole(owner, { projectId: 'project-1', loginName: 'bob', role: 'project-operator' }, INVOCATION));
  assert.deepEqual(assigned, { principalId: bob.principalId, loginName: 'bob', projectId: 'project-1', role: 'project-operator' });
  value(await admin.removeProjectRole(owner, { projectId: 'project-1', loginName: 'bob' }, INVOCATION));
  value(await admin.removeProjectRole(owner, { projectId: 'project-1', loginName: 'bob' }, INVOCATION));
  assert.deepEqual(await trailKinds(store), [
    'access.owner-created', 'access.principal-created', 'access.password-set', 'access.project-role-assigned', 'access.project-role-removed',
  ], 'a removal of no role is not audited');
  const trail = value(await store.transaction((tx) => tx.audit.trail()));
  assert.deepEqual(trail.at(-1), {
    kind: 'access.project-role-removed', principalId: bob.principalId, projectId: 'project-1', role: 'project-operator',
    actor: INVOCATION.actor, reason: INVOCATION.reason, occurredAt: trail.at(-1)!.occurredAt,
  });
});

test('a password change ends every session of the principal in the same write', async () => {
  const { store, clock, owner, admin } = await administration();
  const bob = value(await admin.createPrincipal(owner, 'bob', INVOCATION));
  value(await store.transaction(async (tx) => {
    value(await tx.sessions.add({ ...anonymousSession('s1' as SecretHash, 'c1', clock.now(), SESSION_LIFETIME), principalId: bob.principalId }));
    return tx.sessions.add({ ...anonymousSession('s2' as SecretHash, 'c2', clock.now(), SESSION_LIFETIME), principalId: bob.principalId });
  }));
  assert.equal(value(await admin.setPassword(owner, 'bob', 'another long passphrase', INVOCATION)).sessionsEnded, 2);
});

test('only the installation-owner administers, and nothing is written for a refused command', async () => {
  const { store, owner, admin } = await administration();
  const bob = value(await admin.createPrincipal(owner, 'bob', INVOCATION));
  const denied = failed(await admin.createPrincipal(bob.principalId, 'carol', INVOCATION));
  assert.deepEqual([denied.code, denied.details], ['forbidden', { reason: 'role-required', requiredRole: 'installation-owner' }]);
  assert.equal(failed(await admin.setPassword(bob.principalId, 'bob', 'a long enough passphrase', INVOCATION)).details.reason, 'role-required');
  assert.equal(failed(await admin.assignProjectRole(bob.principalId, { projectId: 'p', loginName: 'bob', role: 'project-viewer' }, INVOCATION)).code, 'forbidden');
  assert.deepEqual(await trailKinds(store), ['access.owner-created', 'access.principal-created']);
});

test('invalid names, passwords, roles, projects, and invocations are refused before any write', async () => {
  const { owner, admin } = await administration();
  assert.equal(failed(await admin.createPrincipal(owner, '-x', INVOCATION)).details.field, 'loginName');
  assert.equal(failed(await admin.setPassword(owner, 'owner', 'short', INVOCATION)).details.field, 'password');
  assert.equal(failed(await admin.setPassword(owner, '-x', 'a long enough passphrase', INVOCATION)).details.field, 'loginName');
  assert.equal(failed(await admin.setPassword(owner, 'owner', 'a long enough passphrase', { actor: '', reason: 'x' })).details.field, 'actor');
  assert.equal(failed(await admin.setPassword(owner, 'nobody', 'a long enough passphrase', INVOCATION)).code, 'not-found');
  assert.equal(failed(await admin.assignProjectRole(owner, { projectId: 'p', loginName: 'owner', role: 'admin' }, INVOCATION)).details.field, 'role');
  assert.equal(failed(await admin.assignProjectRole(owner, { projectId: 'has space', loginName: 'owner', role: 'project-viewer' }, INVOCATION)).code, 'invalid');
  assert.equal(failed(await admin.removeProjectRole(owner, { projectId: 'p', loginName: '-x' }, INVOCATION)).details.field, 'loginName');
  assert.equal(failed(await admin.createPrincipal(owner, 'carol', { actor: 'a', reason: 'x'.repeat(513) })).details.field, 'reason');
});

test('a password is 15 to 1024 code points after NFC, and never the login name', () => {
  const name = value(parseLoginName('alice'));
  assert.equal(failed(checkNewPassword('x'.repeat(14), name)).details.field, 'password');
  assert.equal(value(checkNewPassword('x'.repeat(15), name)), 'x'.repeat(15));
  assert.ok(checkNewPassword('\u{1F600}'.repeat(15), name).ok, 'an astral character counts once');
  assert.ok(checkNewPassword('x'.repeat(1024), name).ok);
  assert.equal(failed(checkNewPassword('x'.repeat(1025), name)).code, 'invalid');
  assert.equal(value(checkNewPassword('é'.repeat(15), name)), 'é'.repeat(15), 'NFC before the count');
  const long = value(parseLoginName('a-very-long-login-name'));
  assert.match(failed(checkNewPassword('A-Very-Long-Login-Name', long)).message, /login name/);
  assert.equal(normalizePassword('é'), 'é');
});

test('login names and identifiers parse to their one canonical form', () => {
  assert.equal(value(parseLoginName('Owner.Name_1')), 'owner.name_1');
  assert.equal(parseLoginName('o'.repeat(65)).ok, false);
  assert.equal(parseLoginName('').ok, false);
  assert.equal(value(parsePrincipalId(`u${'f'.repeat(32)}`)), `u${'f'.repeat(32)}`);
  assert.equal(failed(parsePrincipalId(`u${'F'.repeat(32)}`)).details.field, 'principalId');
  assert.equal(value(parseProjectRole('project-maintainer')), 'project-maintainer');
  assert.ok(includesRole('project-maintainer', 'project-viewer'));
  assert.ok(!includesRole('project-viewer', 'project-operator'));
});

test('the CSRF comparison needs a value of the same length and the same characters', () => {
  const token = 'A'.repeat(43);
  assert.equal(csrfTokenMatches(token, token), true);
  assert.equal(csrfTokenMatches(token, undefined), false);
  assert.equal(csrfTokenMatches(token, 'A'.repeat(42)), false);
  assert.equal(csrfTokenMatches(token, `${'A'.repeat(42)}B`), false);
  assert.equal(csrfTokenMatches(token, `B${'A'.repeat(42)}`), false);
});

test('a session lives until it ends or either expiry passes, and only an authenticated one renews', () => {
  const clock = new ManualClock();
  const now = clock.now();
  const session = { ...anonymousSession('h' as SecretHash, 'c', now, SESSION_LIFETIME), absoluteExpiresAt: plus(now, 1_000) };
  assert.equal(expiresAt(session), plus(now, 1_000));
  assert.equal(expiresAt({ ...session, absoluteExpiresAt: plus(now, 10 ** 9) }), session.idleExpiresAt);
  assert.ok(isLive(session, now));
  assert.ok(!isLive({ ...session, endedAt: now }, now));
  assert.ok(!isLive(session, plus(now, 1_000)));
  assert.equal(renewal(session, plus(now, 10 ** 6), SESSION_LIFETIME), undefined, 'anonymous sessions never renew');
  const owned = { ...session, principalId: `u${'1'.repeat(32)}` as PrincipalId };
  assert.equal(renewal(owned, plus(now, 59_999), SESSION_LIFETIME), undefined);
  assert.equal(renewal(owned, plus(now, 60_000), SESSION_LIFETIME), plus(now, 60_000 + SESSION_LIFETIME.idleMilliseconds));
  assert.throws(() => plus(now, 10 ** 17), RangeError);
});
