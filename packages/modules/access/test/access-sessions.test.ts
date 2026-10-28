import assert from 'node:assert/strict';
import test from 'node:test';
import {
  InMemoryAccessStore,
  SESSION_LIFETIME,
  SessionService,
  type LoginName,
  type PasswordHash,
  type PrincipalId,
} from '@taskelith/access';
import { err, failure } from '@taskelith/kernel';
import { failed, value } from '@taskelith/testing';
import { countingRandom, ManualClock, plainSecrets, recordingHasher, recordingThrottle } from './access-fixtures.ts';

const ALICE = `u${'a'.repeat(32)}` as PrincipalId;
const PASSWORD = 'correct horse battery staple';
const SOURCE = '192.0.2.7';

async function fixture(passwordHash: string = `new:${PASSWORD}`) {
  const store = new InMemoryAccessStore();
  const clock = new ManualClock();
  const hasher = recordingHasher();
  const random = countingRandom();
  const { throttle, waits } = recordingThrottle(clock);
  value(await store.transaction(async (tx) => {
    value(await tx.principals.add({
      principalId: ALICE, kind: 'operator', loginName: 'alice' as LoginName, passwordHash: passwordHash as PasswordHash, createdAt: clock.now(),
    }));
    return tx.principals.grantInstallationOwner(ALICE, clock.now());
  }));
  const sessions = new SessionService({ store, hasher, secrets: plainSecrets, random, clock, throttle });
  return { store, clock, hasher, random, waits, sessions };
}

async function anonymous(sessions: SessionService) {
  const started = value(await sessions.read(undefined));
  assert.equal(started.view.state, 'anonymous');
  return { cookie: started.cookie!, live: value(await sessions.authenticate(started.cookie!)) };
}

test('a read without a valid cookie starts an anonymous session with its own CSRF token', async () => {
  const { sessions, clock } = await fixture();
  const first = value(await sessions.read(undefined));
  assert.equal(first.view.state, 'anonymous');
  assert.match(first.view.csrfToken, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(first.cookie, first.view.csrfToken);
  assert.deepEqual(value(await sessions.read(first.cookie)), { view: first.view }, 'a live cookie keeps its session');
  const unknown = value(await sessions.read('no-such-session'));
  assert.notEqual(unknown.cookie, first.cookie);
  clock.advance(SESSION_LIFETIME.anonymousMilliseconds);
  assert.equal(failed(await sessions.authenticate(first.cookie!)).details.reason, 'unauthenticated', 'anonymous sessions expire');
  assert.ok(value(await sessions.read(first.cookie)).cookie !== undefined, 'an expired cookie gets a new session');
});

test('a login rotates the identifier and CSRF token, and the old cookie is refused', async () => {
  const { sessions } = await fixture();
  const { cookie, live } = await anonymous(sessions);
  const loggedIn = value(await sessions.logIn(live, { loginName: 'Alice', password: PASSWORD, sourceAddress: SOURCE }));
  assert.equal(loggedIn.view.state, 'authenticated');
  assert.notEqual(loggedIn.cookie, cookie);
  assert.notEqual(loggedIn.view.csrfToken, live.session.csrfToken);
  assert.equal(failed(await sessions.authenticate(cookie)).details.reason, 'unauthenticated');
  const view = value(await sessions.read(loggedIn.cookie)).view;
  assert.deepEqual(view, loggedIn.view);
  if (view.state !== 'authenticated') throw new Error('expected an authenticated session');
  assert.deepEqual([view.principal, view.installationRoles], [{ principalId: ALICE, loginName: 'alice' }, ['installation-owner']]);
  assert.equal(failed(await sessions.logIn(live, { loginName: 'alice', password: PASSWORD, sourceAddress: SOURCE })).details.reason, 'unauthenticated',
    'a rotated session cannot log in again');
});

test('an unknown login name and a wrong password both fail alike, after one verification each', async () => {
  const { sessions, hasher } = await fixture();
  const { live } = await anonymous(sessions);
  const unknown = failed(await sessions.logIn(live, { loginName: 'mallory', password: PASSWORD, sourceAddress: SOURCE }));
  const wrong = failed(await sessions.logIn(live, { loginName: 'alice', password: 'wrong password!!', sourceAddress: SOURCE }));
  const invalidName = failed(await sessions.logIn(live, { loginName: '-bad', password: PASSWORD, sourceAddress: SOURCE }));
  assert.deepEqual(unknown, wrong);
  assert.deepEqual(invalidName, wrong);
  assert.deepEqual([wrong.code, wrong.details.reason], ['forbidden', 'login-failed']);
  assert.deepEqual(hasher.verified, [undefined, `new:${PASSWORD}`, undefined], 'unknown names verify against the dummy');
});

test('a password in another normalization form logs in, and a weaker hash is replaced', async () => {
  const decomposed = 'café au lait, sans sucre';
  const { sessions, store } = await fixture(`old:${decomposed.normalize('NFC')}`);
  const { live } = await anonymous(sessions);
  value(await sessions.logIn(live, { loginName: 'alice', password: decomposed, sourceAddress: SOURCE }));
  const stored = value(await store.transaction((tx) => tx.principals.get(ALICE)));
  assert.equal(stored?.passwordHash, `new:${decomposed.normalize('NFC')}`);
});

test('failures beyond the limit slow further attempts without locking out the right password', async () => {
  const { sessions, waits } = await fixture();
  const { live } = await anonymous(sessions);
  for (let attempt = 0; attempt < 5; attempt++) {
    failed(await sessions.logIn(live, { loginName: 'alice', password: `wrong ${attempt} password`, sourceAddress: SOURCE }));
  }
  assert.deepEqual(waits, []);
  const loggedIn = value(await sessions.logIn(live, { loginName: 'alice', password: PASSWORD, sourceAddress: SOURCE }));
  assert.equal(loggedIn.view.state, 'authenticated');
  assert.deepEqual(waits, [1_000]);
  const other = await anonymous(sessions);
  failed(await sessions.logIn(other.live, { loginName: 'bob', password: PASSWORD, sourceAddress: SOURCE }));
  assert.deepEqual(waits, [1_000, 1_000], 'the source address stays throttled');
  failed(await sessions.logIn(other.live, { loginName: 'bob', password: PASSWORD, sourceAddress: '198.51.100.1' }));
  assert.equal(waits.length, 2, 'another address and name are not slowed');
});

// A hasher whose verifications wait until the test lets the next one go.
function steppedHasher(base: ReturnType<typeof recordingHasher>) {
  const waiting: Array<() => void> = [];
  let arrived: (() => void) | undefined;
  let running = 0;
  let mostRunning = 0;
  const verify: typeof base.verify = async (password, stored) => {
    running += 1;
    mostRunning = Math.max(mostRunning, running);
    await new Promise<void>((resolve) => {
      waiting.push(resolve);
      arrived?.();
    });
    running -= 1;
    return base.verify(password, stored);
  };
  const releaseNext = async () => {
    while (waiting.length === 0) await new Promise<void>((resolve) => { arrived = resolve; });
    waiting.shift()!();
  };
  return { hasher: { ...base, verify }, releaseNext, mostRunning: () => mostRunning };
}

test('parallel attempts from one address run one at a time, and the excess answers 503 at once', { timeout: 60_000 }, async () => {
  const base = await fixture();
  const { hasher, releaseNext, mostRunning } = steppedHasher(base.hasher);
  const { throttle } = recordingThrottle(base.clock);
  const sessions = new SessionService({ store: base.store, hasher, secrets: plainSecrets, random: countingRandom(), clock: base.clock, throttle });
  const { live } = await anonymous(sessions);
  const attempts = ['alice', 'bob', 'carol', 'dave', 'erin', 'frank'].map((loginName) =>
    sessions.logIn(live, { loginName, password: 'wrong password!!', sourceAddress: SOURCE }));
  const excess = await Promise.all(attempts.slice(4));
  assert.deepEqual(excess.map((answer) => failed(answer).code), ['unavailable', 'unavailable'], 'beyond four waiting');
  for (let step = 0; step < 4; step++) await releaseNext();
  const answers = await Promise.all(attempts.slice(0, 4));
  assert.deepEqual(answers.map((answer) => failed(answer).details.reason), Array(4).fill('login-failed'));
  assert.equal(mostRunning(), 1, 'one verification of the address at a time');
});

test('filling the throttle with other keys neither resets a target nor frees a new key', async () => {
  const base = await fixture();
  const settings = { failures: 1, windowMilliseconds: 1_000, delayMilliseconds: 7, maxKeys: 4, pendingPerSource: 4 };
  const { throttle, waits } = recordingThrottle(base.clock, settings);
  const sessions = new SessionService({ store: base.store, hasher: base.hasher, secrets: plainSecrets, random: countingRandom(), clock: base.clock, throttle });
  const { live } = await anonymous(sessions);
  const wrong = (loginName: string, sourceAddress: string) => sessions.logIn(live, { loginName, password: 'wrong password!!', sourceAddress });
  failed(await wrong('alice', '192.0.2.1'));
  failed(await wrong('xavier', '192.0.2.2'));
  assert.deepEqual(waits, [], 'the table is full after two failures');
  failed(await wrong('yolanda', '192.0.2.3'));
  assert.deepEqual(waits, [7], 'a key that does not fit is delayed');
  failed(await wrong('alice', '198.51.100.9'));
  assert.deepEqual(waits, [7, 7], 'the target keeps its failures');
  base.clock.advance(1_000);
  failed(await wrong('walter', '192.0.2.4'));
  failed(await wrong('alice', '198.51.100.11'));
  assert.deepEqual(waits, [7, 7], 'expired keys make room');
});

test('an authenticated session renews its idle expiry at most once per interval and ends at its absolute expiry', async () => {
  const { sessions, clock } = await fixture();
  const { live } = await anonymous(sessions);
  const cookie = value(await sessions.logIn(live, { loginName: 'alice', password: PASSWORD, sourceAddress: SOURCE })).cookie!;
  const first = value(await sessions.authenticate(cookie)).session;
  clock.advance(SESSION_LIFETIME.renewalMilliseconds - 1);
  assert.equal(value(await sessions.authenticate(cookie)).session.idleExpiresAt, first.idleExpiresAt, 'not yet due');
  clock.advance(1);
  const renewed = value(await sessions.authenticate(cookie)).session;
  assert.ok(renewed.idleExpiresAt > first.idleExpiresAt);
  for (let hour = 0; hour < 24; hour++) {
    clock.advance(60 * 60_000);
    if (hour < 23) value(await sessions.authenticate(cookie));
  }
  assert.equal(failed(await sessions.authenticate(cookie)).details.reason, 'unauthenticated');
});

test('a logout ends only this session, and a repeat is unauthenticated', async () => {
  const { sessions } = await fixture();
  const one = value(await sessions.logIn((await anonymous(sessions)).live, { loginName: 'alice', password: PASSWORD, sourceAddress: SOURCE })).cookie!;
  const two = value(await sessions.logIn((await anonymous(sessions)).live, { loginName: 'alice', password: PASSWORD, sourceAddress: SOURCE })).cookie!;
  const live = value(await sessions.authenticate(one));
  value(await sessions.logOut(live));
  assert.equal(failed(await sessions.authenticate(one)).details.reason, 'unauthenticated');
  assert.equal(failed(await sessions.logOut(live)).details.reason, 'unauthenticated');
  assert.ok((await sessions.authenticate(two)).ok, 'another browser session stays');
});

test('a disabled or removed principal authenticates nothing, and the purge drops dead sessions', async () => {
  const { sessions, store, clock } = await fixture();
  const cookie = value(await sessions.logIn((await anonymous(sessions)).live, { loginName: 'alice', password: PASSWORD, sourceAddress: SOURCE })).cookie!;
  const principal = value(await store.transaction((tx) => tx.principals.get(ALICE)))!;
  const disabled = new InMemoryAccessStore();
  const session = value(await store.transaction((tx) => tx.sessions.get(plainSecrets.hashOf(cookie))))!;
  value(await disabled.transaction(async (tx) => {
    value(await tx.principals.add({ ...principal, disabledAt: clock.now() }));
    return tx.sessions.add(session);
  }));
  const other = new SessionService({ store: disabled, hasher: recordingHasher(), secrets: plainSecrets, random: countingRandom(), clock, throttle: recordingThrottle(clock).throttle });
  assert.equal(failed(await other.authenticate(cookie)).details.reason, 'unauthenticated');
  const { live } = await anonymous(other);
  assert.equal(failed(await other.logIn(live, { loginName: 'alice', password: PASSWORD, sourceAddress: SOURCE })).details.reason, 'login-failed');
  clock.advance(SESSION_LIFETIME.absoluteMilliseconds);
  assert.equal(value(await sessions.purgeExpired()), 1, 'the expired login is gone');
  assert.equal(value(await sessions.purgeExpired()), 0);
});

test('store and hasher failures are passed on, never answered as a login', async () => {
  const { sessions, hasher } = await fixture(`old:${PASSWORD}`);
  const { live } = await anonymous(sessions);
  hasher.down = true;
  assert.equal(failed(await sessions.logIn(live, { loginName: 'alice', password: PASSWORD, sourceAddress: SOURCE })).code, 'unavailable');
  const clock = new ManualClock();
  const down = new SessionService({
    store: { transaction: async () => err(failure('unavailable', 'down')) }, hasher, secrets: plainSecrets, random: countingRandom(), clock,
    throttle: recordingThrottle(clock).throttle,
  });
  assert.equal(failed(await down.read('cookie')).code, 'unavailable');
  assert.equal(failed(await down.read(undefined)).code, 'unavailable');
  assert.equal(failed(await down.logOut(live)).code, 'unavailable');
  assert.equal(failed(await down.purgeExpired()).code, 'unavailable');
  assert.equal(failed(await down.logIn(live, { loginName: 'alice', password: PASSWORD, sourceAddress: SOURCE })).code, 'unavailable');
  hasher.down = false;
  const verifyOnly = { ...hasher, hash: async () => err(failure('unavailable', 'queue full')) };
  const rehashing = new SessionService({ store: (await fixture(`old:${PASSWORD}`)).store, hasher: verifyOnly, secrets: plainSecrets, random: countingRandom(), clock, throttle: recordingThrottle(clock).throttle });
  const fresh = await anonymous(rehashing);
  assert.equal(failed(await rehashing.logIn(fresh.live, { loginName: 'alice', password: PASSWORD, sourceAddress: SOURCE })).code, 'unavailable');
});

// A hasher whose verifications wait until the test opens the gate.
function gatedHasher(hasher: ReturnType<typeof recordingHasher>) {
  let open!: () => void;
  let entered!: () => void;
  const gate = new Promise<void>((resolve) => { open = resolve; });
  const waiting = new Promise<void>((resolve) => { entered = resolve; });
  const verify: typeof hasher.verify = async (password, stored) => {
    entered();
    await gate;
    return hasher.verify(password, stored);
  };
  return { gated: { ...hasher, verify }, waiting, open };
}

async function gatedFixture(passwordHash: string) {
  const base = await fixture(passwordHash);
  const { gated, waiting, open } = gatedHasher(base.hasher);
  const { throttle } = recordingThrottle(base.clock);
  const sessions = new SessionService({ store: base.store, hasher: gated, secrets: plainSecrets, random: countingRandom(), clock: base.clock, throttle });
  return { ...base, sessions, waiting, open };
}

for (const stored of [`new:${PASSWORD}`, `old:${PASSWORD}`]) {
  test(`a login verified against ${stored.split(':')[0]} hash fails when the password changes before its rotation`, async () => {
    const { sessions, store, clock, waiting, open } = await gatedFixture(stored);
    const { cookie, live } = await anonymous(sessions);
    const login = sessions.logIn(live, { loginName: 'alice', password: PASSWORD, sourceAddress: SOURCE });
    await waiting;
    const changed = 'new:another long passphrase' as PasswordHash;
    value(await store.transaction(async (tx) => {
      value(await tx.principals.setPasswordHash(ALICE, changed));
      return tx.sessions.endAllOf(ALICE, clock.now());
    }));
    open();
    assert.equal(failed(await login).details.reason, 'login-failed');
    assert.equal(value(await store.transaction((tx) => tx.principals.get(ALICE)))?.passwordHash, changed, 'the new password stays');
    assert.equal(value(await sessions.authenticate(cookie)).principal, undefined, 'no login');
  });
}

test('a login fails when its anonymous session expires before its rotation', async () => {
  const { sessions, clock, waiting, open } = await gatedFixture(`new:${PASSWORD}`);
  const { cookie, live } = await anonymous(sessions);
  const login = sessions.logIn(live, { loginName: 'alice', password: PASSWORD, sourceAddress: SOURCE });
  await waiting;
  clock.advance(SESSION_LIFETIME.anonymousMilliseconds);
  open();
  assert.equal(failed(await login).details.reason, 'unauthenticated');
  assert.equal(failed(await sessions.authenticate(cookie)).details.reason, 'unauthenticated');
});
