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

// Plain objects and arrays of strings, booleans, null, and finite numbers.
export function isJsonObject(value: unknown): value is JsonObject {
  return isPlainObject(value) && Object.values(value).every(isJsonValue);
}

function isJsonValue(value: unknown): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isJsonObject(value);
}

function isPlainObject(value: unknown): value is Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
