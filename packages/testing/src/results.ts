import assert from 'node:assert/strict';
import { parseIdentifier, type Identifier, type Result } from '@taskelith/kernel';

// The value of a result that a test expects to succeed; a failure fails it.
export function value<T, E>(result: Result<T, E>): T {
  assert.ok(result.ok, `expected success, got ${JSON.stringify(result.ok ? undefined : result.error)}`);
  return result.value;
}

export function id<Kind extends string>(kind: Kind, text: string): Identifier<Kind> {
  return value(parseIdentifier(kind, text));
}

// The error of a result that a test expects to fail; a success fails it.
export function failed<T, E>(result: Result<T, E>): E {
  assert.ok(!result.ok, 'expected a failure');
  return result.error;
}
