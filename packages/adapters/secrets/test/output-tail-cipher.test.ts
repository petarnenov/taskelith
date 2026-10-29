import assert from 'node:assert/strict';
import test from 'node:test';
import { OUTPUT_TAIL_KEY_BYTES, outputTailCipher } from '@taskelith/secrets';
import { failed, value } from '@taskelith/testing';

const KEY = Buffer.alloc(OUTPUT_TAIL_KEY_BYTES, 9);
const CONTEXT = JSON.stringify(['session-output-tail', 'session-1', 'turn-1', 1]);

test('a held tail sealed under the tail key opens only for its context, and a changed byte opens nothing', () => {
  const cipher = value(outputTailCipher(KEY));
  const sealed = cipher.seal('half a secret', CONTEXT);
  assert.equal(Buffer.from(sealed.sealed).includes('half a secret'), false);
  assert.equal(cipher.open(sealed, CONTEXT), 'half a secret');
  assert.equal(cipher.open(sealed, JSON.stringify(['session-output-tail', 'session-1', 'turn-2', 1])), undefined);
  const changed = Uint8Array.from(sealed.sealed);
  changed[0]! ^= 1;
  assert.equal(cipher.open({ ...sealed, sealed: changed }, CONTEXT), undefined);
});

test('a tail key of another size is refused with a reason that names only its size', () => {
  const key = Buffer.from('sentinel-tail-key');
  const refused = failed(outputTailCipher(key));
  assert.deepEqual([refused.code, refused.message], ['precondition-failed', `the session output tail key has ${key.length} bytes, not 32`]);
  for (const form of [key.toString('base64'), key.toString('hex'), 'sentinel']) assert.equal(JSON.stringify(refused).includes(form), false);
});
