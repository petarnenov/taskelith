import type { EventMetadata, Result } from '@taskelith/kernel';

export type JsonValue = null | boolean | number | string | readonly JsonValue[] | JsonObject;
export interface JsonObject {
  readonly [key: string]: JsonValue;
}

// A message written in the transaction of the state it reports; a publisher
// sends it later under the same event identity.
export interface OutboxMessage {
  readonly metadata: EventMetadata;
  readonly subject: string;
  readonly payload: JsonObject;
}

// Appends fail with `conflict` for an event identity already in the outbox
// and with `invalid` for a payload that JSON cannot carry unchanged.
export interface Outbox {
  append(message: OutboxMessage): Promise<Result<void>>;
}

// Plain objects and dense arrays of strings, booleans, null, and finite
// numbers other than -0, without cycles: what JSON round-trips unchanged.
export function isJsonObject(value: unknown): value is JsonObject {
  return isPlainObject(value) && isJsonValue(value, new Set());
}

function isJsonValue(value: unknown, ancestors: Set<object>): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value) && !Object.is(value, -0);
  if (typeof value !== 'object' || ancestors.has(value)) return false;
  if (!Array.isArray(value) && !isPlainObject(value)) return false;
  ancestors.add(value);
  const valid = Array.isArray(value)
    ? Array.from({ length: value.length }, (_, index) => index in value && isJsonValue(value[index], ancestors)).every(Boolean)
    : Object.values(value).every((field) => isJsonValue(field, ancestors));
  ancestors.delete(value);
  return valid;
}

function isPlainObject(value: unknown): value is Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
