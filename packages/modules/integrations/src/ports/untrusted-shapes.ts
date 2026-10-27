import { isFailureCode, parseIdentifier, type Failure, type Result } from '@taskelith/kernel';

// Readers for untrusted plugin output: each reads a field once and returns a
// frozen copy of the declared fields, or the problems it found.

export type FieldCheck = (value: unknown) => string | undefined;

export type RecordShape = Readonly<Record<string, FieldCheck>>;

export type Reading<Value> = Result<Value, readonly string[]>;

export const text: FieldCheck = (value) => (typeof value === 'string' ? undefined : 'must be a string');

export const nonEmptyText: FieldCheck = (value) =>
  typeof value === 'string' && value.length > 0 ? undefined : 'must be a non-empty string';

export const texts: FieldCheck = (value) =>
  Array.isArray(value) && value.every((item) => typeof item === 'string') ? undefined : 'must be an array of strings';

// An identifier the module issues, such as a run's, in kernel syntax.
export const kernelIdentifier: FieldCheck = (value) =>
  typeof value === 'string' && parseIdentifier('identifier', value).ok ? undefined : 'must be a kernel identifier';

// An identifier the SCM issues, such as a repository's: opaque and bounded.
export const MAX_EXTERNAL_IDENTIFIER_LENGTH = 1024;

function isExternalIdentifier(value: unknown): boolean {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_EXTERNAL_IDENTIFIER_LENGTH;
}

const BOUND = `of at most ${MAX_EXTERNAL_IDENTIFIER_LENGTH} characters`;

export const externalIdentifier: FieldCheck = (value) =>
  isExternalIdentifier(value) ? undefined : `must be a non-empty string ${BOUND}`;

export const externalIdentifiers: FieldCheck = (value) =>
  Array.isArray(value) && value.every(isExternalIdentifier) ? undefined : `must be an array of non-empty strings ${BOUND}`;

const present: FieldCheck = (value) => (value === undefined ? 'is missing' : undefined);

export const flag: FieldCheck = (value) => (typeof value === 'boolean' ? undefined : 'must be a boolean');

// A record of string values; reading an entry may run a plugin getter.
export const textRecord: FieldCheck = (value) => {
  try {
    const isRecord = isObjectRecord(value) && Object.values(value).every((item) => typeof item === 'string');
    return isRecord ? undefined : 'must be a record of strings';
  } catch (error) {
    return `could not be read: ${describeThrown(error)}`;
  }
};

export function oneOf(values: readonly string[]): FieldCheck {
  return (value) =>
    typeof value === 'string' && values.includes(value) ? undefined : `must be one of ${values.join(', ')}`;
}

export function optional(check: FieldCheck): FieldCheck {
  return (value) => (value === undefined ? undefined : check(value));
}

// Array.isArray throws on a revoked Proxy, so callers check inside a try.
function isObjectRecord(value: unknown): value is object {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function readRecord<Value>(label: string, value: unknown, shape: RecordShape): Reading<Value> {
  try {
    if (!isObjectRecord(value)) return { ok: false, error: [`${label} must be an object`] };
  } catch (error) {
    return { ok: false, error: [`${label} could not be read: ${describeThrown(error)}`] };
  }
  const fields = readFields(value as Record<string, unknown>, Object.keys(shape));
  if (!fields.ok) return { ok: false, error: [`${label} could not be read: ${fields.error}`] };
  const problems = Object.entries(shape).flatMap(([name, check]) => {
    const problem = check(fields.value[name]);
    return problem === undefined ? [] : [`${label}.${name} ${problem}`];
  });
  if (problems.length > 0) return { ok: false, error: problems };
  return { ok: true, value: Object.freeze(fields.value) as Value };
}

// A plugin getter may throw; arrays are copied so that later changes by the
// plugin cannot alter what the suite checked.
function readFields(record: Record<string, unknown>, names: readonly string[]): Result<Record<string, unknown>, string> {
  try {
    const entries = names
      .map((name) => [name, record[name]] as const)
      .filter(([, value]) => value !== undefined)
      .map(([name, value]) => [name, Array.isArray(value) ? Object.freeze([...value]) : value]);
    return { ok: true, value: Object.fromEntries(entries) };
  } catch (error) {
    return { ok: false, error: describeThrown(error) };
  }
}

// A kernel Result: `ok` true with a value, or `ok` false with a failure
// whose code is a kernel failure code.
export function readResult(raw: unknown): Reading<Result<unknown>> {
  const envelope = readRecord<{ ok: unknown }>('result', raw, { ok: flag });
  if (!envelope.ok) return envelope;
  if (envelope.value.ok === true) return readValue(raw as { value?: unknown });
  const failed = readRecord<{ error: unknown }>('result', raw, { error: present });
  if (!failed.ok) return failed;
  const error = readRecord<Failure>('result.error', failed.value.error, { code: text, message: text, details: textRecord });
  if (!error.ok) return error;
  if (!isFailureCode(error.value.code)) return { ok: false, error: ['result.error.code is not a kernel failure code'] };
  return { ok: true, value: { ok: false, error: error.value } };
}

function readValue(raw: { value?: unknown }): Reading<Result<unknown>> {
  try {
    return { ok: true, value: { ok: true, value: raw.value } };
  } catch (error) {
    return { ok: false, error: [`result.value could not be read: ${describeThrown(error)}`] };
  }
}

const BUILT_IN_ERRORS: ReadonlyMap<unknown, string> = new Map<unknown, string>([
  [Error.prototype, 'an Error'],
  [TypeError.prototype, 'a TypeError'],
  [RangeError.prototype, 'a RangeError'],
  [ReferenceError.prototype, 'a ReferenceError'],
  [SyntaxError.prototype, 'a SyntaxError'],
  [URIError.prototype, 'a URIError'],
  [EvalError.prototype, 'an EvalError'],
  [AggregateError.prototype, 'an AggregateError'],
]);

const NOT_AN_ERROR = 'a value that is not an Error';

// A thrown value as a fixed category: its message, name, or payload may
// hold a secret, so no part of it reaches a finding.
export function describeThrown(thrown: unknown): string {
  try {
    const builtIn = BUILT_IN_ERRORS.get(Object.getPrototypeOf(thrown));
    if (builtIn !== undefined) return builtIn;
    return thrown instanceof Error ? 'an Error of another class' : NOT_AN_ERROR;
  } catch {
    return NOT_AN_ERROR;
  }
}
