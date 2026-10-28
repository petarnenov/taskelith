import { err, failure, ok, type Instant, type Result } from '@taskelith/kernel';

export type PrincipalId = string & { readonly principalId: unique symbol };
export type LoginName = string & { readonly loginName: unique symbol };
// A password's stored form, an argon2id PHC string; never the password.
export type PasswordHash = string & { readonly passwordHash: unique symbol };

// Only human operators in G3; a delegated kind is an added value (ADR 0014).
export type PrincipalKind = 'operator';

export interface Principal {
  readonly principalId: PrincipalId;
  readonly kind: PrincipalKind;
  readonly loginName: LoginName;
  readonly passwordHash?: PasswordHash;
  readonly createdAt: Instant;
  readonly disabledAt?: Instant;
}

// The login name of the first installation-owner (decision Q1).
export const OWNER_LOGIN_NAME = 'owner' as LoginName;

const PRINCIPAL_ID = /^u[0-9a-f]{32}$/;
const LOGIN_NAME = /^[a-z0-9][a-z0-9._-]{0,63}$/;

// `u` and 32 lowercase hexadecimal digits (wire contracts section 6).
export function parsePrincipalId(text: string): Result<PrincipalId> {
  if (PRINCIPAL_ID.test(text)) return ok(text as PrincipalId);
  return err(failure('invalid', 'a principal identifier is u and 32 lowercase hexadecimal digits', { field: 'principalId' }));
}

// Login names compare case-insensitively: NFC, then lower case (Q7).
export function parseLoginName(text: string): Result<LoginName> {
  const normalized = text.normalize('NFC').toLowerCase();
  if (LOGIN_NAME.test(normalized)) return ok(normalized as LoginName);
  return err(failure('invalid', 'a login name is 1-64 letters, digits, ., _, or -, starting with a letter or digit', { field: 'loginName' }));
}
