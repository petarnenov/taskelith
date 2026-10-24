import { failure } from './failure.js';
import { err, ok, type Result } from './result.js';

declare const instantBrand: unique symbol;

// A UTC timestamp in the canonical ISO 8601 form produced by Date#toISOString.
export type Instant = string & { readonly [instantBrand]: true };

const CANONICAL_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export function parseInstant(text: string): Result<Instant> {
  if (!CANONICAL_UTC.test(text) || !isRoundTrip(text)) {
    return err(failure('invalid', 'Instant must be a valid UTC time in the form YYYY-MM-DDTHH:mm:ss.sssZ'));
  }
  return ok(text as Instant);
}

export function instantFromEpochMilliseconds(milliseconds: number): Result<Instant> {
  if (!Number.isSafeInteger(milliseconds)) {
    return err(failure('invalid', 'Instant milliseconds must be a safe integer'));
  }
  const date = new Date(milliseconds);
  if (Number.isNaN(date.getTime())) {
    return err(failure('invalid', 'Instant milliseconds are outside the representable range'));
  }
  return parseInstant(date.toISOString());
}

function isRoundTrip(text: string): boolean {
  const date = new Date(text);
  return !Number.isNaN(date.getTime()) && date.toISOString() === text;
}
