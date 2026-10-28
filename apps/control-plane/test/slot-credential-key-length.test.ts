import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SLOT_CREDENTIAL_KEY_LENGTH } from '@taskelith/control-plane-store';
import { SLOT_CREDENTIAL_KEY_BYTES } from '@taskelith/secrets';

// The two adapters share no dependency; the composition root joins them.
test('the stored slot credential key has the length the cipher takes', () => {
  assert.equal(SLOT_CREDENTIAL_KEY_LENGTH, SLOT_CREDENTIAL_KEY_BYTES);
});
