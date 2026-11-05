import assert from 'node:assert/strict';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import '@taskelith/testing';

// node --test runs each file in its own process, so this file sees only the
// import of the package, never a linear-time assertion.
test('importing the package leaves garbage collection unexposed', () => {
  assert.equal(runInNewContext('typeof gc'), 'undefined');
});
