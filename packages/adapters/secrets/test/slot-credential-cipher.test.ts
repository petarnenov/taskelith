import assert from 'node:assert/strict';
import { inspect } from 'node:util';
import test from 'node:test';
import { AesGcmSlotCredentialCipher, SLOT_CREDENTIAL_KEY_BYTES } from '@taskelith/secrets';
import { value } from '@taskelith/testing';

const KEY = Buffer.alloc(SLOT_CREDENTIAL_KEY_BYTES, 3);
const TEXT = 'credential-material-without-shape';
const CONTEXT = 'slot-1\n1';

test('a sealed credential opens with its key and context only', () => {
  const cipher = value(AesGcmSlotCredentialCipher.of(KEY));
  const sealed = cipher.seal(TEXT, CONTEXT);
  assert.ok(!Buffer.from(sealed.sealed).toString('latin1').includes(TEXT));
  assert.equal(cipher.open(sealed, CONTEXT), TEXT);
  assert.notDeepEqual(cipher.seal(TEXT, CONTEXT).nonce, sealed.nonce, 'each seal draws a new nonce');
  assert.equal(cipher.open(sealed, 'slot-1\n2'), undefined);
  assert.equal(value(AesGcmSlotCredentialCipher.of(Buffer.alloc(32, 4))).open(sealed, CONTEXT), undefined);
  const tampered = Buffer.from(sealed.sealed);
  tampered[0] = tampered[0]! ^ 1;
  assert.equal(cipher.open({ nonce: sealed.nonce, sealed: tampered }, CONTEXT), undefined);
  assert.equal(cipher.open({ nonce: sealed.nonce.subarray(1), sealed: sealed.sealed }, CONTEXT), undefined);
  assert.equal(cipher.open({ nonce: sealed.nonce, sealed: new Uint8Array(4) }, CONTEXT), undefined);
});

test('a cipher needs a 32-byte key and never shows it', () => {
  for (const length of [0, 16, 33]) assert.equal(AesGcmSlotCredentialCipher.of(Buffer.alloc(length)).ok, false);
  const cipher = value(AesGcmSlotCredentialCipher.of(KEY));
  for (const form of [String(cipher), JSON.stringify({ cipher }), inspect({ cipher })]) {
    assert.ok(form.includes('[redacted]') && !form.includes(KEY.toString('base64')) && !form.includes('3, 3'), form);
  }
});
