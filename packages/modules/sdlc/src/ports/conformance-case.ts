import type { Result } from '@taskelith/kernel';

// One check of a port's shared suite. It returns the problems it found, so an
// adapter's tests run it under their own runner.
export interface ConformanceCase<Port> {
  readonly name: string;
  check(port: Port): Promise<readonly string[]>;
}

export function expectCode(problems: string[], label: string, result: Result<unknown>, code: string): void {
  if (result.ok) problems.push(`${label}: expected ${code}, got success`);
  else if (result.error.code !== code) problems.push(`${label}: expected ${code}, got ${result.error.code}`);
}

export function expectSuccess(problems: string[], label: string, result: Result<unknown>): void {
  if (!result.ok) problems.push(`${label}: expected success, got ${result.error.message}`);
}

export function expectSame(problems: string[], label: string, actual: unknown, expected: unknown): void {
  if (!isSameData(actual, expected)) problems.push(`${label}: expected ${describe(expected)}, got ${describe(actual)}`);
}

// A read must succeed and return the record as it was stored.
export function expectRead(problems: string[], label: string, result: Result<unknown>, expected: unknown): void {
  if (!result.ok) problems.push(`${label}: expected the stored record, got ${result.error.message}`);
  else expectSame(problems, label, result.value, expected);
}

// Of concurrent writers exactly one wins, and every other one is a conflict.
export function expectOneWinner(problems: string[], label: string, results: readonly Result<unknown>[]): void {
  const winners = results.filter((result) => result.ok).length;
  if (winners !== 1) problems.push(`${label}: expected one success, got ${winners}`);
  results.forEach((result, index) => {
    if (!result.ok) expectCode(problems, `${label} loser ${index + 1}`, result, 'conflict');
  });
}

// Equal as data: a field set to undefined counts as absent, as an optional
// field does, and numbers compare exactly, so NaN never equals null.
export function isSameData(actual: unknown, expected: unknown): boolean {
  if (typeof actual === 'number' || typeof expected === 'number') return Object.is(actual, expected);
  if (Array.isArray(actual) || Array.isArray(expected)) {
    return Array.isArray(actual) && Array.isArray(expected) && actual.length === expected.length
      && actual.every((item, index) => isSameData(item, expected[index]));
  }
  if (!isObject(actual) || !isObject(expected)) return actual === expected;
  const keys = definedKeys(actual);
  const expectedKeys = definedKeys(expected);
  return keys.length === expectedKeys.length && keys.every((key, index) => key === expectedKeys[index] && isSameData(actual[key], expected[key]));
}

function isObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null;
}

function definedKeys(value: Readonly<Record<string, unknown>>): string[] {
  return Object.keys(value).filter((key) => value[key] !== undefined).sort();
}

function describe(value: unknown): string {
  return JSON.stringify(value, (_, field: unknown) => (typeof field === 'number' && !Number.isFinite(field) ? String(field) : field));
}
