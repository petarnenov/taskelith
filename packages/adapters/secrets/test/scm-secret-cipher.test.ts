import assert from 'node:assert/strict';
import test from 'node:test';
import { SCM_SECRET_KEY_BYTES, scmSecretCipher } from '@taskelith/secrets';
import { failed, value } from '@taskelith/testing';

const KEY = Buffer.alloc(SCM_SECRET_KEY_BYTES, 7);
const CONTEXT = 'taskelith-scm-integration-secret\ni1\nwebhook-secret\n1';

test('an SCM secret sealed under its key opens only for its context, and not under another key', () => {
  const cipher = value(scmSecretCipher(KEY));
  const sealed = cipher.seal('synthetic webhook secret', CONTEXT);
  assert.equal(Buffer.from(sealed.sealed).includes('synthetic webhook secret'), false);
  assert.equal(cipher.open(sealed, CONTEXT), 'synthetic webhook secret');
  assert.equal(cipher.open(sealed, CONTEXT.replace(/1$/, '2')), undefined);
  assert.equal(value(scmSecretCipher(Buffer.alloc(SCM_SECRET_KEY_BYTES, 8))).open(sealed, CONTEXT), undefined);
});

test('an SCM secret key of another size is refused with a reason that names only its size', () => {
  const key = Buffer.from('sentinel-scm-key');
  const refused = failed(scmSecretCipher(key));
  assert.deepEqual([refused.code, refused.message], ['precondition-failed', `the SCM integration secret key has ${key.length} bytes, not 32`]);
  for (const form of [key.toString('base64'), key.toString('hex'), 'sentinel']) assert.equal(JSON.stringify(refused).includes(form), false);
});
