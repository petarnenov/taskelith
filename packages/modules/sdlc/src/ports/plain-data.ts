import type { Result } from '@taskelith/kernel';

// Runtime checks of plugin data that types do not prove. They take only
// copies from copyPlainData, which cannot change or run code.

export type PlainShape =
  | { readonly kind: 'string' }
  | { readonly kind: 'boolean' }
  | { readonly kind: 'unknown' }
  | { readonly kind: 'array'; readonly items: PlainShape }
  | { readonly kind: 'dictionary'; readonly values: PlainShape }
  | { readonly kind: 'record'; readonly fields: Readonly<Record<string, PlainShape>>; readonly optional: readonly string[] };

export const STRING_SHAPE: PlainShape = Object.freeze({ kind: 'string' });
export const BOOLEAN_SHAPE: PlainShape = Object.freeze({ kind: 'boolean' });
export const UNKNOWN_SHAPE: PlainShape = Object.freeze({ kind: 'unknown' });

export function arrayOf(items: PlainShape): PlainShape {
  return Object.freeze({ kind: 'array', items });
}

export function dictionaryOf(values: PlainShape): PlainShape {
  return Object.freeze({ kind: 'dictionary', values });
}

// A record has exactly its fields; a field not listed is a problem, so a result
// cannot carry data the port does not define.
export function recordOf(fields: Readonly<Record<string, PlainShape>>, optional: readonly string[] = []): PlainShape {
  return Object.freeze({ kind: 'record', fields: Object.freeze({ ...fields }), optional: Object.freeze([...optional]) });
}

export function plainShapeProblems(path: string, value: unknown, shape: PlainShape): string[] {
  switch (shape.kind) {
    case 'unknown': return [];
    case 'string': return typeof value === 'string' ? [] : [`${path} must be a string`];
    case 'boolean': return typeof value === 'boolean' ? [] : [`${path} must be a boolean`];
    case 'array':
      if (!Array.isArray(value)) return [`${path} must be an array`];
      return value.flatMap((item, index) => plainShapeProblems(`${path}[${index}]`, item, shape.items));
    case 'dictionary':
      if (!isRecord(value)) return [`${path} must be an object`];
      return Object.entries(value).flatMap(([key, item]) => plainShapeProblems(`${path}.${key}`, item, shape.values));
    case 'record':
      if (!isRecord(value)) return [`${path} must be an object`];
      return recordProblems(path, value, shape.fields, shape.optional);
  }
}

// Structural equality of copies. Key order does not matter, and an absent key
// differs from a key holding undefined.
export function isSamePlainData(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((item, index) => isSamePlainData(item, right[index]));
  }
  if (!isRecord(left) || !isRecord(right)) return false;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length
    && keys.every((key) => Object.hasOwn(right, key) && isSamePlainData(left[key], right[key]));
}

// A fresh copy of a value that copyPlainData already produced, so that code
// receiving it cannot change the original.
export function clonePlainCopy(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(clonePlainCopy);
  if (!isRecord(value)) return value;
  const clone: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    Object.defineProperty(clone, key, { value: clonePlainCopy(item), enumerable: true, writable: true, configurable: true });
  }
  return clone;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Copies JSON-like data, reading each property once by descriptor; arrays must
// be dense, objects plain, and anything else, or a cycle, is a problem.
export function copyPlainData(path: string, value: unknown): Result<unknown, readonly string[]> {
  const problems: string[] = [];
  try {
    const copy = copyValue(path, value, new Set(), problems);
    return problems.length === 0 ? { ok: true, value: copy } : { ok: false, error: problems };
  } catch {
    return { ok: false, error: [`${path} could not be read`] };
  }
}

function recordProblems(
  path: string,
  value: Readonly<Record<string, unknown>>,
  fields: Readonly<Record<string, PlainShape>>,
  optional: readonly string[],
): string[] {
  const problems = Object.keys(value)
    .filter((key) => !Object.hasOwn(fields, key))
    .map((key) => `${path}.${key} is not a defined field`);
  for (const [key, shape] of Object.entries(fields)) {
    if (Object.hasOwn(value, key)) problems.push(...plainShapeProblems(`${path}.${key}`, value[key], shape));
    else if (!optional.includes(key)) problems.push(`${path}.${key} is missing`);
  }
  return problems;
}

function copyValue(path: string, value: unknown, ancestors: Set<object>, problems: string[]): unknown {
  if (value === null || ['string', 'number', 'boolean', 'undefined'].includes(typeof value)) return value;
  if (typeof value !== 'object') {
    problems.push(`${path} is a ${typeof value}, not plain data`);
    return undefined;
  }
  if (ancestors.has(value)) {
    problems.push(`${path} refers to itself`);
    return undefined;
  }
  ancestors.add(value);
  const copy = Array.isArray(value) ? copyArray(path, value, ancestors, problems) : copyObject(path, value, ancestors, problems);
  ancestors.delete(value);
  return copy;
}

function copyArray(path: string, value: readonly unknown[], ancestors: Set<object>, problems: string[]): unknown[] {
  if (Object.getPrototypeOf(value) !== Array.prototype) problems.push(`${path} must be a plain array`);
  const length = value.length;
  for (const key of Reflect.ownKeys(value)) {
    if (key !== 'length' && !(typeof key === 'string' && isIndexBelow(key, length))) {
      problems.push(`${path} has the property ${String(key)}, which is not an element`);
    }
  }
  const copy: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, index);
    if (descriptor === undefined) {
      problems.push(`${path} has a hole at ${index}`);
      return copy;
    }
    if (!descriptor.enumerable) problems.push(`${path}[${index}] is not enumerable`);
    copy.push(copyProperty(`${path}[${index}]`, descriptor, ancestors, problems));
  }
  return copy;
}

function copyObject(path: string, value: object, ancestors: Set<object>, problems: string[]): Record<string, unknown> {
  const copy: Record<string, unknown> = {};
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    problems.push(`${path} must be a plain object`);
    return copy;
  }
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key === 'symbol') {
      problems.push(`${path} has a symbol property`);
      continue;
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (!descriptor.enumerable) {
      problems.push(`${path}.${key} is not enumerable`);
      continue;
    }
    // defineProperty, so that a key such as __proto__ stays an ordinary field.
    Object.defineProperty(copy, key, {
      value: copyProperty(`${path}.${key}`, descriptor, ancestors, problems),
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return copy;
}

function copyProperty(path: string, descriptor: PropertyDescriptor, ancestors: Set<object>, problems: string[]): unknown {
  if (!('value' in descriptor)) {
    problems.push(`${path} is an accessor, not a data property`);
    return undefined;
  }
  return copyValue(path, descriptor.value, ancestors, problems);
}

function isIndexBelow(key: string, length: number): boolean {
  return /^(?:0|[1-9]\d*)$/.test(key) && Number(key) < length;
}
