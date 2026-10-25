import assert from 'node:assert/strict';
import test from 'node:test';
import {
  InMemoryOperatorCredentials,
  OPERATOR_CREDENTIALS_CONFORMANCE,
  OperatorCredentialService,
  type SecretHash,
  type Secrets,
} from '@taskelith/access';
import { parseInstant } from '@taskelith/kernel';
import { failed, value } from '@taskelith/testing';

// Secrets that count up, so a test can name each issued one.
function countingSecrets(): Secrets {
  let issued = 0;
  return {
    issue: (kind) => {
      issued += 1;
      return { secret: `${kind}-secret-${issued}`, hash: `hash:${kind}-secret-${issued}` as SecretHash };
    },
    hashOf: (secret) => `hash:${secret}` as SecretHash,
    matches: (secret, hash) => hash === `hash:${secret}`,
  };
}

const clock = { now: () => value(parseInstant('2026-10-25T09:00:00.000Z')) };
const ADMIN = { actor: 'root@control-plane-1', reason: 'initial installation' };

function service() {
  const credentials = new InMemoryOperatorCredentials();
  return { credentials, service: new OperatorCredentialService({ credentials, secrets: countingSecrets(), clock }) };
}

for (const conformance of OPERATOR_CREDENTIALS_CONFORMANCE) {
  test(`in-memory operator credentials: ${conformance.name}`, async () => {
    assert.deepEqual(await conformance.check(new InMemoryOperatorCredentials()), []);
  });
}

test('the bootstrap credential is issued once and authenticates', async () => {
  const { service: operator } = service();
  const secret = value(await operator.bootstrap(ADMIN));
  assert.equal(secret, 'operator-secret-1');
  assert.equal(failed(await operator.bootstrap(ADMIN)).code, 'conflict');
  assert.ok((await operator.authenticate(secret)).ok);
  assert.equal(failed(await operator.authenticate('operator-secret-9')).code, 'forbidden');
});

test('a reset replaces the credential, invalidates the old one, and is audited', async () => {
  const { credentials, service: operator } = service();
  assert.equal(failed(await operator.reset({ actor: 'root', reason: 'lost' })).code, 'precondition-failed');
  assert.equal(failed(await operator.authenticate('anything')).code, 'forbidden');
  const first = value(await operator.bootstrap(ADMIN));

  const second = value(await operator.reset({ actor: 'root@control-plane-1', reason: 'the token was lost' }));
  assert.equal(failed(await operator.authenticate(first)).code, 'forbidden');
  assert.ok((await operator.authenticate(second)).ok);
  assert.deepEqual(value(await credentials.auditTrail()).map((e) => [e.kind, e.generation, e.actor, e.reason]), [
    ['operator-credential.bootstrapped', 1, ADMIN.actor, ADMIN.reason],
    ['operator-credential.reset', 2, 'root@control-plane-1', 'the token was lost'],
  ]);
});

test('a reset needs an actor and a reason', async () => {
  const { service: operator } = service();
  value(await operator.bootstrap(ADMIN));
  assert.equal(failed(await operator.reset({ actor: ' ', reason: 'lost' })).details.field, 'actor');
  assert.equal(failed(await operator.reset({ actor: 'root', reason: 'x'.repeat(513) })).details.field, 'reason');
});
