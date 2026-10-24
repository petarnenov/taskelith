import { err, failure, ok, type Result } from '@taskelith/kernel';
import { isSameArtifactRevision, type ArtifactId, type ArtifactRevision } from './artifact-revision.js';

// The exact artifact revisions a gate judges and its evidence cites, at most
// one revision per artifact, so that a newer revision of an artifact
// identifies exactly the revision it replaces.
export type GateSubject = readonly ArtifactRevision[];

export function parseGateSubject(revisions: readonly ArtifactRevision[]): Result<GateSubject> {
  if (revisions.length === 0) return subjectFailure('a gate subject needs at least one artifact revision');
  const artifacts = new Set<ArtifactId>();
  for (const revision of revisions) {
    if (artifacts.has(revision.artifactId)) return subjectFailure(`artifact ${revision.artifactId} is listed twice`);
    artifacts.add(revision.artifactId);
  }
  return ok(Object.freeze([...revisions]));
}

export function isSameGateSubject(left: GateSubject, right: GateSubject): boolean {
  return left.length === right.length
    && left.every((revision) => right.some((other) => isSameArtifactRevision(revision, other)));
}

function subjectFailure(message: string): Result<never> {
  return err(failure('invalid', `subject: ${message}`, { field: 'subject' }));
}
