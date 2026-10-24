import { err, failure, ok, type Result } from '@taskelith/kernel';

declare const contentDigestBrand: unique symbol;

// An algorithm-prefixed digest of exact content, such as a workflow schema;
// only SHA-256 is accepted until another algorithm is needed.
export type ContentDigest = string & { readonly [contentDigestBrand]: true };

const SHA256_DIGEST = /^sha256:[0-9a-f]{64}$/;

export function parseContentDigest(text: string): Result<ContentDigest> {
  if (!SHA256_DIGEST.test(text)) {
    return err(failure('invalid', 'ContentDigest must be sha256: followed by 64 lowercase hexadecimal characters'));
  }
  return ok(text as ContentDigest);
}
