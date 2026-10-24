import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_IDENTIFIER_LENGTH, parseIdentifier } from '@taskelith/kernel';

test('parseIdentifier accepts opaque printable identifiers', () => {
  for (const text of ['a', '0f8e2c1a-7b3d-4e5f-9a10-2b3c4d5e6f70', 'add-shared-kernel', 'owner/repo#12', 'x'.repeat(MAX_IDENTIFIER_LENGTH)]) {
    assert.deepEqual(parseIdentifier('TaskId', text), { ok: true, value: text });
  }
});

test('parseIdentifier rejects empty, long, spaced, and non-ASCII text', () => {
  for (const text of ['', 'x'.repeat(MAX_IDENTIFIER_LENGTH + 1), 'a b', ' a', 'a\n', 'tab\t', 'ид']) {
    const result = parseIdentifier('TaskId', text);
    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.error.code, 'invalid');
    assert.deepEqual(!result.ok && result.error.details, { kind: 'TaskId' });
  }
});
