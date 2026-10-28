import {
  LoginThrottle,
  type PasswordHash,
  type PasswordHasher,
  type RandomValues,
  type SecretHash,
  type Secrets,
} from '@taskelith/access';
import { err, failure, instantFromEpochMilliseconds, ok, type Instant } from '@taskelith/kernel';
import { value } from '@taskelith/testing';

// A clock the test moves by hand.
export class ManualClock {
  #now = Date.parse('2026-10-28T09:00:00.000Z');

  now(): Instant {
    return value(instantFromEpochMilliseconds(this.#now));
  }

  advance(milliseconds: number): void {
    this.#now += milliseconds;
  }
}

// Values that count up, so a test can name each one.
export function countingRandom(): RandomValues & { readonly issued: string[] } {
  let count = 0;
  const issued: string[] = [];
  return {
    issued,
    sessionToken: () => {
      count += 1;
      const token = `token${String(count).padStart(38, '0')}`;
      issued.push(token);
      return token;
    },
    principalId: () => {
      count += 1;
      return `u${count.toString(16).padStart(32, '0')}`;
    },
  };
}

export const plainSecrets: Pick<Secrets, 'hashOf' | 'matches'> = {
  hashOf: (secret) => `hash:${secret}` as SecretHash,
  matches: (secret, hash) => hash === `hash:${secret}`,
};

// A fast stand-in: `old:` hashes are due a rehash, and every call is kept.
export function recordingHasher(): PasswordHasher & { readonly verified: Array<PasswordHash | undefined>; down: boolean } {
  const verified: Array<PasswordHash | undefined> = [];
  const hasher = {
    verified,
    down: false,
    hash: async (password: string) => (hasher.down
      ? err(failure('unavailable', 'too many password hashes are waiting'))
      : ok(`new:${password}` as PasswordHash)),
    verify: async (password: string, stored: PasswordHash | undefined) => {
      verified.push(stored);
      if (hasher.down) return err(failure('unavailable', 'too many password hashes are waiting'));
      const matches = stored === `new:${password}` || stored === `old:${password}`;
      return ok({ matches, rehashDue: matches && stored.startsWith('old:') });
    },
  };
  return hasher;
}

// A throttle whose waits are recorded instead of slept.
export function recordingThrottle(clock: ManualClock): { throttle: LoginThrottle; waits: number[] } {
  const waits: number[] = [];
  const throttle = new LoginThrottle({ clock, sleep: async (milliseconds) => { waits.push(milliseconds); } });
  return { throttle, waits };
}
