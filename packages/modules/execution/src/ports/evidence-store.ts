import type { Result } from '@taskelith/kernel';
import type { ContentDigest } from '@taskelith/sdlc';

// Immutable evidence content named only by its SHA-256 digest.
export interface EvidenceStore {
  // Content that does not match the digest is `invalid`; a stored copy that
  // is corrupt is replaced, and an intact one is kept.
  put(digest: ContentDigest, content: Uint8Array): Promise<Result<void>>;
  // `not-found` when absent, `internal` with reason `evidence-corrupt` when
  // the stored bytes no longer match the digest; such content is not served.
  read(digest: ContentDigest): Promise<Result<Uint8Array>>;
  // Removing absent content succeeds.
  remove(digest: ContentDigest): Promise<Result<void>>;
}
