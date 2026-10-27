import assert from 'node:assert/strict';
import test from 'node:test';
import { createAccount, createUser } from '@nats-io/nkeys';
import { parseInstallationId, parseWorkerId } from '@taskelith/fleet';
import { failure } from '@taskelith/kernel';
import { assertLinearOnRuns } from '@taskelith/testing';
import { NodeSecrets, RandomIdentifiers, REDACTED, redactFailure, redactSecrets, scrubEnvironment } from '@taskelith/secrets';

test('issued secrets carry their kind, differ, and match only their own hash', () => {
  const secrets = new NodeSecrets();
  const first = secrets.issue('operator');
  const second = secrets.issue('operator');
  assert.match(first.secret, /^tkop_[A-Za-z0-9_-]{43}$/);
  assert.match(secrets.issue('enrollment').secret, /^tken_/);
  assert.match(secrets.issue('worker').secret, /^tkwk_/);
  assert.notEqual(first.secret, second.secret);
  assert.match(first.hash, /^[0-9a-f]{64}$/);
  assert.equal(secrets.hashOf(first.secret), first.hash);
  assert.ok(secrets.matches(first.secret, first.hash));
  assert.ok(!secrets.matches(second.secret, first.hash));
  assert.ok(!secrets.matches(first.secret, 'abcd' as typeof first.hash));
});

test('random identifiers are valid subject tokens', () => {
  const ids = new RandomIdentifiers();
  assert.ok(parseInstallationId(ids.newInstallationId()).ok);
  assert.ok(parseWorkerId(ids.newWorkerId()).ok);
  assert.notEqual(ids.newWorkerId(), ids.newWorkerId());
});

test('text loses bearer secrets, seeds, user JWTs, and creds blocks', () => {
  const secret = new NodeSecrets().issue('worker').secret;
  const seed = new TextDecoder().decode(createUser().getSeed());
  const accountSeed = new TextDecoder().decode(createAccount().getSeed());
  const jwt = 'eyJ0eXAiOiJKV1QifQ.eyJzdWIiOiJVIn0.c2lnbmF0dXJl';
  const creds = `-----BEGIN NATS USER JWT-----\n${jwt}\n------END NATS USER JWT------\n\n-----BEGIN USER NKEY SEED-----\n${seed}\n------END USER NKEY SEED------`;

  assert.equal(redactSecrets(`token ${secret} failed`), `token ${REDACTED} failed`);
  assert.equal(redactSecrets(`x${secret}`), `x${REDACTED}`, 'a prefix glued in front hides nothing');
  assert.equal(redactSecrets(`9${seed}`), `9${REDACTED}`);
  assert.equal(redactSecrets(`seeds ${seed} ${accountSeed}`), `seeds ${REDACTED} ${REDACTED}`);
  assert.equal(redactSecrets(`jwt ${jwt}`), `jwt ${REDACTED}`);
  assert.equal(redactSecrets(`creds:\n${creds}\nend`), `creds:\n${REDACTED}\nend`);
  assert.equal(redactSecrets('workerId w0123 and tkop_short stay'), 'workerId w0123 and tkop_short stay');
  const redacted = redactFailure(failure('forbidden', `bad ${secret}`, { presented: secret, worker: 'w1' }));
  assert.deepEqual([redacted.message, redacted.details], [`bad ${REDACTED}`, { presented: REDACTED, worker: 'w1' }]);
});

test('the user information of a URL is redacted, percent-encoded or not', () => {
  assert.equal(redactSecrets('postgres://owner:example-password@localhost/taskelith'), `postgres://${REDACTED}@localhost/taskelith`);
  assert.equal(redactSecrets('connect nats://s3cr%40t:p%2Fw@127.0.0.1:4222 failed'), `connect nats://${REDACTED}@127.0.0.1:4222 failed`);
  assert.equal(redactSecrets('nats://token-only@host'), `nats://${REDACTED}@host`);
  assert.equal(redactSecrets('postgres://owner:p@ssword@db/taskelith'), `postgres://${REDACTED}@db/taskelith`);
  assert.equal(redactSecrets('postgres://a@b:c@d@e@db:5432/x?y=z@w'), `postgres://${REDACTED}@db:5432/x?y=z@w`);
  const failed = redactFailure(failure('unavailable', 'cannot reach postgres://owner:p@ssword@db', { url: 'nats://u:p@q@host' }));
  assert.deepEqual([failed.message, failed.details.url], [`cannot reach postgres://${REDACTED}@db`, `nats://${REDACTED}@host`]);
  assert.equal(redactSecrets('https://example.org/path?q=a@b'), 'https://example.org/path?q=a@b');
  assert.equal(redactSecrets('mail owner@example.org'), 'mail owner@example.org');
});

test('text is redacted in linear time on long runs', () => {
  const units = ['a.', '.a', 'A.', 'a.b', 'a-', 'a+', 'eyJ.', 'eyJ', 'eyJ_', 'eyJa', 'eyJa.b.', 'proxy-', 'x.eyJ'];
  assertLinearOnRuns(redactSecrets, [...units, 'tkop_', 'SA', 'a://', 'a://b@']);
  const begin = '-----BEGIN NATS USER JWT-----';
  assertLinearOnRuns(redactSecrets, [begin, `${begin}a`], 400_000);
});

test('a creds block without its end stays, and a URL may have empty user information', () => {
  const begin = '-----BEGIN NATS USER JWT-----';
  assert.equal(redactSecrets(`${begin} no end`), `${begin} no end`);
  assert.equal(redactSecrets('nats://@host'), `nats://${REDACTED}@host`);
});

test('a child environment keeps no secret variable or value', () => {
  const secret = new NodeSecrets().issue('worker').secret;
  assert.deepEqual(scrubEnvironment({
    PATH: '/usr/bin', HOME: '/home/w', TASKELITH_WORKER_CREDENTIAL: 'x', NATS_CREDS: '/x.creds', GITHUB_TOKEN: 'ghp',
    OTHER: `uses ${secret}`, AWS_SECRET_ACCESS_KEY: 'k', UNSET: undefined,
    TASKELITH_POSTGRES_URL: 'postgres://owner:p%40ss@db/taskelith', TASKELITH_NATS_URL: 'nats://127.0.0.1:4222',
    DATABASE_LINK: 'postgres://owner:p@ssword@db/taskelith',
  }), { PATH: '/usr/bin', HOME: '/home/w', TASKELITH_NATS_URL: 'nats://127.0.0.1:4222' });
});

// A subscription token shape that no rule knows (account pool section 7.4).
const SLOT_TOKEN = 'q8Rz3vLmN2pXw7Kd';

test('a revealed credential without a known prefix is redacted by value', () => {
  assert.equal(redactSecrets(`harness said ${SLOT_TOKEN}`), `harness said ${SLOT_TOKEN}`, 'no shape matches it');
  const output = `auth ${SLOT_TOKEN} failed;x${SLOT_TOKEN}y\n${SLOT_TOKEN}`;
  assert.equal(redactSecrets(output, [SLOT_TOKEN]), `auth ${REDACTED} failed;x${REDACTED}y\n${REDACTED}`);
  const worker = new NodeSecrets().issue('worker').secret;
  assert.equal(redactSecrets(`${SLOT_TOKEN} ${worker}`, [SLOT_TOKEN]), `${REDACTED} ${REDACTED}`, 'shapes still apply');
});

test('a failure of a run is redacted by the value of its credentials', () => {
  const failed = failure('internal', `harness exited: ${SLOT_TOKEN}`, { stderr: `token=${SLOT_TOKEN}x`, slot: 'slot-a' });
  const redacted = redactFailure(failed, [SLOT_TOKEN]);
  assert.deepEqual([redacted.message, redacted.details], [`harness exited: ${REDACTED}`, { stderr: `token=${REDACTED}x`, slot: 'slot-a' }]);
});

test('a credential inside another and an empty value leave nothing visible', () => {
  const longer = `${SLOT_TOKEN}-tail`;
  assert.equal(redactSecrets(`a ${longer} b ${SLOT_TOKEN}`, [SLOT_TOKEN, longer, '']), `a ${REDACTED} b ${REDACTED}`);
  assert.equal(redactSecrets('plain text', ['']), 'plain text');
});

test('a failure key that holds a credential is redacted too', () => {
  const failed = failure('internal', 'failed', { [SLOT_TOKEN]: 'rejected', slot: 'slot-a' });
  assert.deepEqual(redactFailure(failed, [SLOT_TOKEN]).details, { [REDACTED]: 'rejected', slot: 'slot-a' });
  const worker = new NodeSecrets().issue('worker').secret;
  assert.deepEqual(redactFailure(failure('internal', 'failed', { [worker]: 'x' })).details, { [REDACTED]: 'x' });
});

test('keys that become equal keep every value in order', () => {
  const other = 'Zt5pWq2Lm9Xr';
  const entries = [[SLOT_TOKEN, 'one'], [other, 'two'], ['__proto__', 'three'], ['toString', 'four']];
  const failed = failure('internal', 'failed', Object.fromEntries(entries));
  const details = redactFailure(failed, [SLOT_TOKEN, other]).details;
  const expected = [[REDACTED, 'one, two'], ['__proto__', 'three'], ['toString', 'four']];
  assert.deepEqual(Object.entries(details), expected);
});

test('overlapping and touching occurrences become one marker', () => {
  assert.equal(redactSecrets('abcde', ['abc', 'cde']), REDACTED);
  assert.equal(redactSecrets('ababa', ['aba']), REDACTED);
  assert.equal(redactSecrets('x abcabc y', ['abc']), `x ${REDACTED} y`);
  assert.equal(redactSecrets('one abc-cde two', ['abc', 'cde']), `one ${REDACTED}-${REDACTED} two`);
});

test('a marker is never redacted again and never grows', () => {
  assert.equal(redactSecrets('secret', ['secret', 'e']), REDACTED);
  assert.equal(redactSecrets('one secret', ['e', 'secret']), `on${REDACTED} ${REDACTED}`);
  assert.equal(redactSecrets('e', Array.from({ length: 15 }, () => 'e')), REDACTED);
});

test('a credential that touches a shape secret leaves no part of either', () => {
  const worker = new NodeSecrets().issue('worker').secret;
  assert.equal(redactSecrets(`x ${worker} y`, [worker.slice(0, 9)]), `x ${REDACTED} y`);
  assert.equal(redactSecrets(`x ${SLOT_TOKEN}${worker} y`, [SLOT_TOKEN]), `x ${REDACTED} y`);
  assert.equal(redactSecrets(`x q8Rz${worker} y`, [`q8Rz${worker.slice(0, 9)}`]), `x ${REDACTED} y`);
  assert.equal(redactSecrets(`${SLOT_TOKEN} ${worker}`, [SLOT_TOKEN]), `${REDACTED} ${REDACTED}`);
});

test('value redaction takes linear time on long runs', () => {
  assertLinearOnRuns((text) => redactSecrets(text, ['ab', 'aba']), ['a', 'ab', 'aba']);
  assertLinearOnRuns((text) => redactSecrets(text, ['a'.repeat(64), 'b']), ['a', 'ab', 'a b']);
});
