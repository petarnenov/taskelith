import crypto, { randomBytes, timingSafeEqual, type Argon2Parameters } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { setTimeout as wait } from 'node:timers/promises';
import type { PasswordHash, PasswordHasher, PasswordVerification } from '@taskelith/access';
import { err, failure, ok, type Result } from '@taskelith/kernel';
import { HashSlots } from './hash-slots.js';
import { formatPhc, parsePhc, type Argon2idParameters } from './phc.js';

// The OWASP minimum that item 1 qualified (docs/g3-dependencies.md).
export const ARGON2ID_PARAMETERS: Argon2idParameters = Object.freeze({ memoryKib: 19_456, passes: 2, parallelism: 1 });
export const SALT_BYTES = 16;
export const TAG_BYTES = 32;
export const MAX_CONCURRENT_HASHES = 2;
export const MAX_QUEUED_HASHES = 32;

export type Argon2Function = (
  algorithm: 'argon2id',
  parameters: Argon2Parameters,
  callback: (error: Error | null, derivedKey: Buffer) => void,
) => void;

export const ARGON2_MISSING = 'crypto.argon2 is not available; Node 24.7.0 or later with OpenSSL 3.2 or later is required';

// Read at run time: a named import of a missing export fails to link.
const NODE_ARGON2 = (crypto as { readonly argon2?: Argon2Function }).argon2;

// The start check: fails closed on a Node built without crypto.argon2.
export function checkArgon2Available(argon2: Argon2Function | undefined): Result<Argon2Function> {
  return typeof argon2 === 'function' ? ok(argon2) : err(failure('precondition-failed', ARGON2_MISSING));
}

// One argon2id computation on the libuv pool; parameters that Node refuses
// before it starts are a failure too.
export function argon2idTag(argon2: Argon2Function, parameters: Argon2Parameters): Promise<Result<Buffer>> {
  const failed = (error: Error) => err(failure('internal', `argon2id failed: ${error.message}`));
  return new Promise((resolve) => {
    try {
      argon2('argon2id', parameters, (error, tag) => resolve(error === null ? ok(tag) : failed(error)));
    } catch (error) {
      resolve(failed(error as Error));
    }
  });
}

export interface Argon2idHasherOptions {
  // Node's crypto.argon2 unless given; tests pass undefined for a missing one.
  readonly argon2?: Argon2Function | undefined;
  readonly parameters?: Argon2idParameters;
  readonly concurrent?: number;
  readonly queued?: number;
  readonly timing?: HashTiming;
}

// Monotonic milliseconds and a wait; tests replace both.
export interface HashTiming {
  now(): number;
  wait(milliseconds: number): Promise<void>;
}

const SYSTEM_TIMING: HashTiming = { now: () => performance.now(), wait: (milliseconds) => wait(milliseconds) };

// Unknown login names verify against this, so they cost one computation.
const DUMMY_SALT = Buffer.alloc(SALT_BYTES);

export class Argon2idPasswordHasher implements PasswordHasher {
  readonly #argon2: Argon2Function;
  readonly #parameters: Argon2idParameters;
  readonly #slots: HashSlots;
  readonly #timing: HashTiming;
  // How long the last computation at the current parameters took.
  #currentCost: number | undefined;

  private constructor(argon2: Argon2Function, options: Argon2idHasherOptions) {
    this.#argon2 = argon2;
    this.#parameters = options.parameters ?? ARGON2ID_PARAMETERS;
    this.#slots = new HashSlots(options.concurrent ?? MAX_CONCURRENT_HASHES, options.queued ?? MAX_QUEUED_HASHES);
    this.#timing = options.timing ?? SYSTEM_TIMING;
  }

  static create(options: Argon2idHasherOptions = {}): Result<Argon2idPasswordHasher> {
    const argon2 = checkArgon2Available('argon2' in options ? options.argon2 : NODE_ARGON2);
    return argon2.ok ? ok(new Argon2idPasswordHasher(argon2.value, options)) : argon2;
  }

  async hash(password: string): Promise<Result<PasswordHash>> {
    const salt = randomBytes(SALT_BYTES);
    const tag = await this.#tag(password, this.#parameters, salt, TAG_BYTES);
    return tag.ok ? ok(formatPhc({ parameters: this.#parameters, salt, tag: tag.value }) as PasswordHash) : tag;
  }

  // A failure takes at least what one at the current parameters takes, so
  // an unknown name and a legacy hash cost what a current hash does.
  async verify(password: string, stored: PasswordHash | undefined): Promise<Result<PasswordVerification>> {
    const started = this.#timing.now();
    const verification = await this.#verify(password, stored);
    if (verification.ok && !verification.value.matches) {
      const padded = await this.#padToCurrentCost(password, started);
      if (!padded.ok) return padded;
    }
    return verification;
  }

  async #verify(password: string, stored: PasswordHash | undefined): Promise<Result<PasswordVerification>> {
    if (stored === undefined) {
      const dummy = await this.#tag(password, this.#parameters, DUMMY_SALT, TAG_BYTES);
      return dummy.ok ? ok({ matches: false, rehashDue: false }) : dummy;
    }
    const parsed = parsePhc(stored);
    if (!parsed.ok) return err(failure('internal', parsed.error.message));
    const { parameters, salt, tag } = parsed.value;
    const computed = await this.#tag(password, parameters, salt, tag.length);
    if (!computed.ok) return computed;
    const matches = timingSafeEqual(computed.value, tag);
    return ok({ matches, rehashDue: matches && this.#weaker(parameters, salt.length, tag.length) });
  }

  async #padToCurrentCost(password: string, started: number): Promise<Result<void>> {
    if (this.#currentCost === undefined) {
      const measured = await this.#tag(password, this.#parameters, DUMMY_SALT, TAG_BYTES);
      return measured.ok ? ok(undefined) : measured;
    }
    const remaining = started + this.#currentCost - this.#timing.now();
    if (remaining > 0) await this.#timing.wait(remaining);
    return ok(undefined);
  }

  #weaker(parameters: Argon2idParameters, saltBytes: number, tagBytes: number): boolean {
    const current = this.#parameters;
    return parameters.memoryKib < current.memoryKib || parameters.passes < current.passes
      || parameters.parallelism < current.parallelism || saltBytes < SALT_BYTES || tagBytes < TAG_BYTES;
  }

  #tag(password: string, parameters: Argon2idParameters, salt: Buffer, tagLength: number): Promise<Result<Buffer>> {
    return this.#slots.run(async () => {
      const started = this.#timing.now();
      const tag = await argon2idTag(this.#argon2, {
        message: Buffer.from(password, 'utf8'), nonce: salt, tagLength,
        memory: parameters.memoryKib, passes: parameters.passes, parallelism: parameters.parallelism,
      });
      if (tag.ok && sameParameters(parameters, this.#parameters)) this.#currentCost = this.#timing.now() - started;
      return tag;
    });
  }
}

function sameParameters(one: Argon2idParameters, other: Argon2idParameters): boolean {
  return one.memoryKib === other.memoryKib && one.passes === other.passes && one.parallelism === other.parallelism;
}
