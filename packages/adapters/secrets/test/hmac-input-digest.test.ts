import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { HmacInputDigest, SecretTextRedactor } from '@taskelith/secrets';
import { failed, value } from '@taskelith/testing';

const KEY = Buffer.alloc(32, 7);

test('the input digest is the HMAC-SHA-256 of the UTF-8 input under the key, in hexadecimal', () => {
  const digest = value(HmacInputDigest.fromKey(KEY));
  const expected = createHmac('sha256', KEY).update('turn €', 'utf8').digest('hex');
  assert.equal(digest.digest('turn €'), expected);
  assert.notEqual(digest.digest('turn €'), digest.digest('turn e'));
  assert.notEqual(value(HmacInputDigest.fromKey(Buffer.alloc(32, 8))).digest('turn €'), expected);
});

test('a key of another size is refused with a reason that holds no key byte', () => {
  for (const size of [0, 31, 33]) {
    const key = Buffer.alloc(size, 0xab);
    const refused = failed(HmacInputDigest.fromKey(key));
    assert.equal(refused.code, 'precondition-failed');
    assert.equal(refused.message, `the input digest key has ${size} bytes, not 32`);
  }
});

test('session text is redacted with the shapes of redactSecrets', () => {
  const redacted = new SecretTextRedactor().redact('clone https://user:hunter2@example.com/repo');
  assert.equal(redacted.includes('hunter2'), false);
  assert.equal(redacted.includes('example.com/repo'), true);
});
