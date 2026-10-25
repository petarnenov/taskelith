import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { IssuedSecret, SecretHash, SecretKind, Secrets } from '@taskelith/access';
import type { IdentifierSource } from '@taskelith/fleet';

// 256 random bits make a bearer secret that cannot be guessed, so a plain
// SHA-256 is its stored form (decision D10 (a)); no slow hash is needed.
const SECRET_BYTES = 32;
const IDENTIFIER_BYTES = 16;

// The prefix names the kind, so a leaked secret is recognizable and the
// scrubber can find it in text.
export const SECRET_PREFIXES: Readonly<Record<SecretKind, string>> = Object.freeze({
  operator: 'tkop',
  enrollment: 'tken',
  worker: 'tkwk',
});

export class NodeSecrets implements Secrets {
  issue(kind: SecretKind): IssuedSecret {
    const secret = `${SECRET_PREFIXES[kind]}_${randomBytes(SECRET_BYTES).toString('base64url')}`;
    return { secret, hash: this.hashOf(secret) };
  }

  hashOf(secret: string): SecretHash {
    return createHash('sha256').update(secret, 'utf8').digest('hex') as SecretHash;
  }

  matches(secret: string, hash: SecretHash): boolean {
    const presented = Buffer.from(this.hashOf(secret), 'hex');
    const stored = Buffer.from(hash, 'hex');
    return presented.length === stored.length && timingSafeEqual(presented, stored);
  }
}

// Hexadecimal, so an identifier is a valid NATS subject token and stream name.
export class RandomIdentifiers implements IdentifierSource {
  newInstallationId(): string {
    return randomBytes(IDENTIFIER_BYTES).toString('hex');
  }

  newWorkerId(): string {
    return `w${randomBytes(IDENTIFIER_BYTES).toString('hex')}`;
  }
}
