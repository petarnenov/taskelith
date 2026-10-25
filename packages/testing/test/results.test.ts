import assert from 'node:assert/strict';
import test from 'node:test';
import { err, failure, ok } from '@taskelith/kernel';
import { failed, id, value } from '@taskelith/testing';

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

test('a failed result yields its error', () => {
  assert.equal(failed(err(failure('invalid', 'bad input'))).code, 'invalid');
});

test('a successful result fails a test that expects a failure', () => {
  assert.throws(() => failed(ok(42)), /expected a failure/);
});
