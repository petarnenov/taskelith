import { err, failure, ok, type Result } from '@taskelith/kernel';

// The PHC string of an argon2id hash: formatting and parsing only, no
// cryptography. Anything but the one exact form is refused.

export interface Argon2idParameters {
  readonly memoryKib: number;
  readonly passes: number;
  readonly parallelism: number;
}

export interface PhcHash {
  readonly parameters: Argon2idParameters;
  readonly salt: Buffer;
  readonly tag: Buffer;
}

// Bounds a stored hash cannot exceed, so a hostile row cannot make one
// verification cost more than these.
export const PHC_LIMITS = Object.freeze({
  maxMemoryKib: 262_144, maxPasses: 16, maxParallelism: 16, minSaltBytes: 8, maxSaltBytes: 64, minTagBytes: 16, maxTagBytes: 64,
});

const VERSION = 'v=19';
const PARAMETERS = /^m=([1-9][0-9]{0,9}),t=([1-9][0-9]{0,9}),p=([1-9][0-9]{0,9})$/;
const BASE64 = /^[A-Za-z0-9+/]+$/;

export function formatPhc({ parameters, salt, tag }: PhcHash): string {
  const { memoryKib, passes, parallelism } = parameters;
  return `$argon2id$${VERSION}$m=${memoryKib},t=${passes},p=${parallelism}$${unpadded(salt)}$${unpadded(tag)}`;
}

export function parsePhc(text: string): Result<PhcHash> {
  const fields = text.split('$');
  if (fields.length !== 6 || fields[0] !== '' || fields[1] !== 'argon2id' || fields[2] !== VERSION) {
    return invalid('is not an argon2id version 19 PHC string');
  }
  const parameters = parseParameters(fields[3]!);
  if (!parameters.ok) return parameters;
  const salt = decode(fields[4]!, PHC_LIMITS.minSaltBytes, PHC_LIMITS.maxSaltBytes);
  if (salt === undefined) return invalid('has a salt that is not 8-64 bytes of unpadded base64');
  const tag = decode(fields[5]!, PHC_LIMITS.minTagBytes, PHC_LIMITS.maxTagBytes);
  if (tag === undefined) return invalid('has a tag that is not 16-64 bytes of unpadded base64');
  return ok({ parameters: parameters.value, salt, tag });
}

function parseParameters(text: string): Result<Argon2idParameters> {
  const match = PARAMETERS.exec(text);
  if (match === null) return invalid('has parameters other than m, t, and p in that order');
  const [memoryKib, passes, parallelism] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const inBounds = memoryKib <= PHC_LIMITS.maxMemoryKib && passes <= PHC_LIMITS.maxPasses && parallelism <= PHC_LIMITS.maxParallelism;
  // Argon2 needs at least 8 KiB of memory per lane.
  if (!inBounds || memoryKib < 8 * parallelism) return invalid('has parameters outside the accepted bounds');
  return ok({ memoryKib, passes, parallelism });
}

// Only the canonical encoding: it must re-encode to the same text.
function decode(text: string, minBytes: number, maxBytes: number): Buffer | undefined {
  if (!BASE64.test(text)) return undefined;
  const bytes = Buffer.from(text, 'base64');
  const canonical = unpadded(bytes) === text;
  return canonical && bytes.length >= minBytes && bytes.length <= maxBytes ? bytes : undefined;
}

function unpadded(bytes: Buffer): string {
  return bytes.toString('base64').replace(/=+$/, '');
}

function invalid(problem: string): Result<never> {
  return err(failure('invalid', `the stored password hash ${problem}`, { field: 'passwordHash' }));
}
