import { createHash } from 'node:crypto';
import type { KeyPair } from '@nats-io/nkeys';

// The NATS JWT v2 claims that decentralized authentication needs (D9 (a)),
// encoded here by the owner's exception O1 (b) instead of a JWT library.
export interface UserPermissions {
  readonly publish: readonly string[];
  readonly subscribe: readonly string[];
}

// Seconds since the epoch, as NATS claims carry times.
export type ClaimTime = number;

const HEADER = { typ: 'JWT', alg: 'ed25519-nkey' };
const UNLIMITED = -1;
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function operatorJwt(operator: KeyPair, name: string, systemAccount: string, issuedAt: ClaimTime): string {
  const subject = operator.getPublicKey();
  return sign(operator, { iat: issuedAt, name, sub: subject, nats: { type: 'operator', version: 2, system_account: systemAccount } });
}

// `revocations` maps a user key to the time before which its JWTs are void.
export function accountJwt(
  operator: KeyPair,
  account: string,
  name: string,
  issuedAt: ClaimTime,
  options: { readonly jetstream: boolean; readonly revocations?: Readonly<Record<string, ClaimTime>> },
): string {
  const storage = options.jetstream ? UNLIMITED : 0;
  const limits = {
    subs: UNLIMITED, data: UNLIMITED, payload: UNLIMITED, imports: UNLIMITED, exports: UNLIMITED,
    wildcards: true, conn: UNLIMITED, leaf: UNLIMITED,
    mem_storage: storage, disk_storage: storage, streams: storage, consumer: storage,
  };
  const revocations = options.revocations ?? {};
  const nats = { type: 'account', version: 2, limits, ...(Object.keys(revocations).length === 0 ? {} : { revocations }) };
  return sign(operator, { iat: issuedAt, name, sub: account, nats });
}

// A user without `permissions` may publish and subscribe on any subject.
export function userJwt(account: KeyPair, user: string, name: string, issuedAt: ClaimTime, permissions?: UserPermissions): string {
  const limits = { subs: UNLIMITED, data: UNLIMITED, payload: UNLIMITED };
  const allowed = permissions === undefined ? {} : {
    pub: { allow: [...permissions.publish] },
    sub: { allow: [...permissions.subscribe] },
  };
  return sign(account, { iat: issuedAt, name, sub: user, nats: { type: 'user', version: 2, ...limits, ...allowed } });
}

// The text of a `.creds` file, which nats.js reads with credsAuthenticator.
export function credsFile(jwt: string, seed: Uint8Array): string {
  return [
    '-----BEGIN NATS USER JWT-----', jwt, '------END NATS USER JWT------', '',
    '-----BEGIN USER NKEY SEED-----', new TextDecoder().decode(seed), '------END USER NKEY SEED------', '',
  ].join('\n');
}

function sign(issuer: KeyPair, claims: Record<string, unknown>): string {
  const body = { ...claims, iss: issuer.getPublicKey() };
  const withId = { jti: claimsId(body), ...body };
  const signingInput = `${base64url(JSON.stringify(HEADER))}.${base64url(JSON.stringify(withId))}`;
  const signature = issuer.sign(new TextEncoder().encode(signingInput));
  return `${signingInput}.${Buffer.from(signature).toString('base64url')}`;
}

// The claims' identity, as the Go library derives it: base32 of their hash.
function claimsId(claims: Record<string, unknown>): string {
  const digest = createHash('sha512-256').update(JSON.stringify(claims)).digest();
  let bits = 0;
  let value = 0;
  let encoded = '';
  for (const byte of digest) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      encoded += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return bits > 0 ? encoded + BASE32[(value << (5 - bits)) & 31] : encoded;
}

function base64url(text: string): string {
  return Buffer.from(text).toString('base64url');
}
