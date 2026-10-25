// A secret's stored form; the secret itself is shown once and never stored.
export type SecretHash = string & { readonly secretHash: unique symbol };

export type SecretKind = 'operator' | 'enrollment' | 'worker';

export interface IssuedSecret {
  readonly secret: string;
  readonly hash: SecretHash;
}

// High-entropy opaque bearer secrets (decision D10 (a)): an adapter makes
// them with a qualified random source and compares hashes in constant time.
export interface Secrets {
  issue(kind: SecretKind): IssuedSecret;
  // The stored form of a presented secret, for looking its record up.
  hashOf(secret: string): SecretHash;
  matches(secret: string, hash: SecretHash): boolean;
}
