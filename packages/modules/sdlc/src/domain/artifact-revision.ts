import { ok, parseIdentifier, type Identifier, type Result } from '@taskelith/kernel';
import { parseContentDigest, type ContentDigest } from './content-digest.js';
import { fieldFailure } from './field-failure.js';
import { parseNativeReference, type NativeReference } from './native-reference.js';

export type ArtifactId = Identifier<'ArtifactId'>;

// An immutable revision of a workflow output, such as a specification; the
// native reference locates the content, and the digest identifies it.
export interface ArtifactRevision {
  readonly artifactId: ArtifactId;
  readonly digest: ContentDigest;
  readonly nativeReference: NativeReference;
}

export type ArtifactRevisionInput = { readonly [Field in keyof ArtifactRevision]: string };

export function parseArtifactRevision(input: ArtifactRevisionInput): Result<ArtifactRevision> {
  const artifactId = parseIdentifier('ArtifactId', input.artifactId);
  if (!artifactId.ok) return fieldFailure('artifactId', artifactId.error);
  const digest = parseContentDigest(input.digest);
  if (!digest.ok) return fieldFailure('digest', digest.error);
  const nativeReference = parseNativeReference(input.nativeReference);
  if (!nativeReference.ok) return fieldFailure('nativeReference', nativeReference.error);
  return ok(Object.freeze({ artifactId: artifactId.value, digest: digest.value, nativeReference: nativeReference.value }));
}

// Two revisions are the same when they are of the same artifact and have the
// same content, even if the content was read from a different location.
export function isSameArtifactRevision(left: ArtifactRevision, right: ArtifactRevision): boolean {
  return left.artifactId === right.artifactId && left.digest === right.digest;
}
