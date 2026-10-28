import { err, failure, ok, type Result } from '@taskelith/kernel';
import type { LoginName } from './principal.js';

// NIST SP 800-63B revision 4 for a single factor (Q7); the maximum is the
// contract's `Password.maxLength`.
export interface PasswordPolicy {
  readonly minimumCodePoints: number;
  readonly maximumCodePoints: number;
}

export const PASSWORD_POLICY: PasswordPolicy = Object.freeze({ minimumCodePoints: 15, maximumCodePoints: 1024 });

// Every password is NFC before it is counted, hashed, or verified (Q7).
export function normalizePassword(password: string): string {
  return password.normalize('NFC');
}

// The normalized password, if it may be set for the login name.
export function checkNewPassword(password: string, loginName: LoginName, policy: PasswordPolicy = PASSWORD_POLICY): Result<string> {
  const normalized = normalizePassword(password);
  if (!withinBounds(normalized, policy)) {
    const bounds = `${policy.minimumCodePoints}-${policy.maximumCodePoints}`;
    return err(failure('invalid', `a password must be ${bounds} characters`, { field: 'password' }));
  }
  if (normalized.toLowerCase() === loginName) {
    return err(failure('invalid', 'a password must not equal the login name', { field: 'password' }));
  }
  return ok(normalized);
}

// Counted as the schema's `maxLength` counts, in code points; the NFD
// bound lets every equivalent spelling of the password pass at login.
function withinBounds(normalized: string, policy: PasswordPolicy): boolean {
  const length = codePoints(normalized);
  const decomposedLength = codePoints(normalized.normalize('NFD'));
  return length >= policy.minimumCodePoints && decomposedLength <= policy.maximumCodePoints;
}

function codePoints(text: string): number {
  return [...text].length;
}
