import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_NATIVE_REFERENCE_LENGTH, parseContentDigest, parseNativeReference } from '@taskelith/sdlc';

const DIGEST = `sha256:${'0123456789abcdef'.repeat(4)}`;

test('parseContentDigest accepts a lowercase SHA-256 digest', () => {
  assert.deepEqual(parseContentDigest(DIGEST), { ok: true, value: DIGEST });
});

test('parseContentDigest rejects other algorithms, lengths, and cases', () => {
  for (const text of ['', DIGEST.slice(7), `sha512:${'a'.repeat(64)}`, DIGEST.slice(0, -1), `${DIGEST}0`, DIGEST.toUpperCase(), `sha256:${'g'.repeat(64)}`]) {
    const result = parseContentDigest(text);
    assert.equal(!result.ok && result.error.code, 'invalid');
  }
});

test('parseNativeReference accepts paths with spaces and non-ASCII text', () => {
  for (const text of ['work/feature-12', 'specs/001-photo albums/spec.md@4ad4d2a', 'спецификация', 'x'.repeat(MAX_NATIVE_REFERENCE_LENGTH)]) {
    assert.deepEqual(parseNativeReference(text), { ok: true, value: text });
  }
});

test('parseNativeReference rejects empty, long, and control-character text', () => {
  for (const text of ['', 'x'.repeat(MAX_NATIVE_REFERENCE_LENGTH + 1), 'a\nb', 'tab\t', 'nul\u0000', 'del\u007f', 'next-line\u0085', 'c1\u009f']) {
    const result = parseNativeReference(text);
    assert.equal(!result.ok && result.error.code, 'invalid');
  }
});
