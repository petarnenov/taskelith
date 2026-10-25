import assert from 'node:assert/strict';
import test from 'node:test';
import { createAccount, createUser } from '@nats-io/nkeys';
import { parseInstallationId, parseWorkerId } from '@taskelith/fleet';
import { failure } from '@taskelith/kernel';
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
  assert.equal(redactSecrets(`seeds ${seed} ${accountSeed}`), `seeds ${REDACTED} ${REDACTED}`);
  assert.equal(redactSecrets(`jwt ${jwt}`), `jwt ${REDACTED}`);
  assert.equal(redactSecrets(`creds:\n${creds}\nend`), `creds:\n${REDACTED}\nend`);
  assert.equal(redactSecrets('workerId w0123 and tkop_short stay'), 'workerId w0123 and tkop_short stay');
  const redacted = redactFailure(failure('forbidden', `bad ${secret}`, { presented: secret, worker: 'w1' }));
  assert.deepEqual([redacted.message, redacted.details], [`bad ${REDACTED}`, { presented: REDACTED, worker: 'w1' }]);
});

test('a child environment keeps no secret variable or value', () => {
  const secret = new NodeSecrets().issue('worker').secret;
  assert.deepEqual(scrubEnvironment({
    PATH: '/usr/bin', HOME: '/home/w', TASKELITH_WORKER_CREDENTIAL: 'x', NATS_CREDS: '/x.creds', GITHUB_TOKEN: 'ghp',
    OTHER: `uses ${secret}`, AWS_SECRET_ACCESS_KEY: 'k', UNSET: undefined,
  }), { PATH: '/usr/bin', HOME: '/home/w' });
});
