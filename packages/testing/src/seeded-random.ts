import { randomInt } from 'node:crypto';

export const SEED_VARIABLE = 'TASKELITH_TEST_SEED';
const SEED_LIMIT = 2 ** 32;

// Mulberry32: one seed always yields the same sequence, so a run that records
// its seed reruns identically.
export class SeededRandom {
  readonly seed: number;
  #state: number;

  constructor(seed: number) {
    if (!isSeed(seed)) throw new RangeError(`Seed must be an integer from 0 to ${SEED_LIMIT - 1}, got ${seed}`);
    this.seed = seed;
    this.#state = seed;
  }

  nextUint32(): number {
    this.#state = (this.#state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(this.#state ^ (this.#state >>> 15), this.#state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return (mixed ^ (mixed >>> 14)) >>> 0;
  }

  // Rejection sampling keeps every value below the bound equally likely.
  nextInt(bound: number): number {
    if (!Number.isInteger(bound) || bound < 1 || bound > SEED_LIMIT) {
      throw new RangeError(`Bound must be an integer from 1 to ${SEED_LIMIT}, got ${bound}`);
    }
    const unbiasedLimit = SEED_LIMIT - (SEED_LIMIT % bound);
    let value = this.nextUint32();
    while (value >= unbiasedLimit) value = this.nextUint32();
    return value % bound;
  }
}

// The seed the environment names, for a rerun, or a fresh one to record.
export function seedFromEnvironment(env: NodeJS.ProcessEnv = process.env): number {
  const text = env[SEED_VARIABLE];
  if (text === undefined || text === '') return randomInt(SEED_LIMIT);
  const seed = /^\d+$/.test(text) ? Number(text) : Number.NaN;
  if (!isSeed(seed)) throw new RangeError(`${SEED_VARIABLE} must be an integer from 0 to ${SEED_LIMIT - 1}, got "${text}"`);
  return seed;
}

export function rerunHint(seed: number): string {
  return `rerun with ${SEED_VARIABLE}=${seed}`;
}

export function isSeed(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value < SEED_LIMIT;
}
