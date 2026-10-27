import type { FailureCode, Result } from '@taskelith/kernel';
import { describeThrown, readResult, type Reading } from './untrusted-shapes.js';

export type SourceControlConformanceCheck = 'threw' | 'result' | 'shape' | 'outcome' | 'bypass' | 'fixture';

export interface SourceControlConformanceFinding {
  readonly caseName: string;
  readonly check: SourceControlConformanceCheck;
  readonly message: string;
}

// Ends a case early when a later step would only repeat the same failure.
// Known by identity, as a thrown value's prototype may run plugin code.
const abortions = new WeakSet<object>();

// One running case: it collects the case's findings.
export class ConformanceCase {
  readonly findings: SourceControlConformanceFinding[] = [];

  constructor(readonly name: string) {}

  report(check: SourceControlConformanceCheck, message: string): void {
    this.findings.push(Object.freeze({ caseName: this.name, check, message }));
  }

  expect(condition: boolean, message: string): void {
    if (!condition) this.report('outcome', message);
  }

  abort(check: SourceControlConformanceCheck, message: string): never {
    this.report(check, message);
    const abortion = Object.freeze({ check });
    abortions.add(abortion);
    throw abortion;
  }

  async run(body: (run: ConformanceCase) => Promise<void>): Promise<readonly SourceControlConformanceFinding[]> {
    try {
      await body(this);
    } catch (error) {
      if (!isAbortion(error)) this.report('threw', `the case stopped: ${describeThrown(error)}`);
    }
    return this.findings;
  }
}

function isAbortion(thrown: unknown): boolean {
  return typeof thrown === 'object' && thrown !== null && abortions.has(thrown);
}

export type ValueReader<Value> = (value: unknown) => Reading<Value>;

export const nothing: ValueReader<void> = (value) =>
  value === undefined ? { ok: true, value: undefined } : { ok: false, error: ['value must be undefined'] };

// Calls a plugin operation that must succeed and returns its checked value.
export async function succeeds<Value>(
  run: ConformanceCase,
  operation: string,
  call: () => Promise<unknown>,
  read: ValueReader<Value>,
): Promise<Value> {
  const result = await settle(run, operation, call);
  if (!result.ok) run.abort('outcome', `${operation} failed with ${result.error.code}, expected success`);
  const value = read(result.value);
  if (!value.ok) run.abort('shape', `${operation}: ${value.error.join('; ')}`);
  return value.value;
}

// Calls a plugin operation that must fail with the given code.
export async function failsWith(
  run: ConformanceCase,
  operation: string,
  call: () => Promise<unknown>,
  code: FailureCode,
): Promise<void> {
  const result = await settle(run, operation, call);
  const outcome = result.ok ? 'succeeded' : `failed with ${result.error.code}`;
  run.expect(!result.ok && result.error.code === code, `${operation} ${outcome}, expected failure ${code}`);
}

async function settle(run: ConformanceCase, operation: string, call: () => Promise<unknown>): Promise<Result<unknown>> {
  let raw: unknown;
  try {
    raw = await call();
  } catch (error) {
    run.abort('threw', `${operation} threw instead of returning a Result: ${describeThrown(error)}`);
  }
  const result = readResult(raw);
  if (!result.ok) run.abort('result', `${operation}: ${result.error.join('; ')}`);
  return result.value;
}

// Fixture steps are the test author's own code; a throw ends the case.
export async function fixtureStep<Value>(run: ConformanceCase, step: string, call: () => Promise<Value>): Promise<Value> {
  try {
    return await call();
  } catch (error) {
    return run.abort('fixture', `${step} threw: ${describeThrown(error)}`);
  }
}

// A fixture step that returns a Result, read as untrusted as a plugin's.
export async function fixtureResult(run: ConformanceCase, step: string, call: () => Promise<unknown>): Promise<Result<unknown>> {
  const raw = await fixtureStep(run, step, call);
  const result = readResult(raw);
  if (!result.ok) run.abort('fixture', `${step}: ${result.error.join('; ')}`);
  return result.value;
}
