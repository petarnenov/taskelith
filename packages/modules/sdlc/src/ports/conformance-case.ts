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

// Equal as plain data: what a store returns must be the record it stored.
export function expectSame(problems: string[], label: string, actual: unknown, expected: unknown): void {
  if (JSON.stringify(canonical(actual)) !== JSON.stringify(canonical(expected))) {
    problems.push(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value === null || typeof value !== 'object') return value;
  const entries = Object.entries(value).filter(([, field]) => field !== undefined).sort(([a], [b]) => a.localeCompare(b));
  return Object.fromEntries(entries.map(([key, field]) => [key, canonical(field)]));
}
