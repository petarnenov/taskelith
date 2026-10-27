import assert from 'node:assert/strict';
import test from 'node:test';
import { REDACTED } from '@taskelith/kernel';

test('one redaction text replaces every secret', () => {
  assert.equal(REDACTED, '[redacted]');
});
