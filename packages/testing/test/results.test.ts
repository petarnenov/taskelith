import assert from 'node:assert/strict';
import test from 'node:test';
import { err, failure, ok } from '@taskelith/kernel';
import { id, value } from '@taskelith/testing';

test('a successful result yields its value', () => {
  assert.equal(value(ok(42)), 42);
});

test('a failed result fails the test with the failure', () => {
  assert.throws(() => value(err(failure('invalid', 'bad input'))), /expected success, got .*bad input/);
});

test('an identifier parses from its kind and text', () => {
  assert.equal(id('WorkerId', 'worker-1'), 'worker-1');
});

test('an identifier that the kernel rejects fails the test', () => {
  assert.throws(() => id('WorkerId', 'has space'), /WorkerId must be/);
});
