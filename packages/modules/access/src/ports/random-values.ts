// A qualified random source for the values the module mints.
export interface RandomValues {
  // 256 random bits in base64url: a session identifier or a CSRF token.
  sessionToken(): string;
  // `u` and 32 lowercase hexadecimal digits from 128 random bits.
  principalId(): string;
}
