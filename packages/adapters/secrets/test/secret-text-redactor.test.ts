import assert from 'node:assert/strict';
import test from 'node:test';
import { SecretTextRedactor } from '@taskelith/secrets';

test('session text is redacted with the shapes of redactSecrets', () => {
  const redacted = new SecretTextRedactor().redact('clone https://user:hunter2@example.com/repo');
  assert.equal(redacted.includes('hunter2'), false);
  assert.equal(redacted.includes('example.com/repo'), true);
});
