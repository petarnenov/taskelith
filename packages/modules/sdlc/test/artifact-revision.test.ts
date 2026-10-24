import assert from 'node:assert/strict';
import test from 'node:test';
import { isSameArtifactRevision, parseArtifactRevision, type ArtifactRevision, type ArtifactRevisionInput } from '@taskelith/sdlc';

const REVISION: ArtifactRevisionInput = {
  artifactId: 'proposal-1',
  digest: `sha256:${'cd'.repeat(32)}`,
  nativeReference: 'work/feature-12/proposal.md@aeb0470',
};

function revision(change: Partial<ArtifactRevisionInput> = {}): ArtifactRevision {
  const result = parseArtifactRevision({ ...REVISION, ...change });
  assert.ok(result.ok);
  return result.value;
}

test('parseArtifactRevision records the artifact, its digest, and its native location', () => {
  assert.deepEqual(revision(), REVISION);
  assert.ok(Object.isFrozen(revision()));
});

test('parseArtifactRevision names the invalid field', () => {
  for (const field of Object.keys(REVISION) as (keyof ArtifactRevisionInput)[]) {
    const result = parseArtifactRevision({ ...REVISION, [field]: '' });
    assert.equal(!result.ok && result.error.code, 'invalid');
    assert.equal(!result.ok && result.error.details.field, field);
  }
});

test('revisions with the same artifact and content are the same wherever they were read', () => {
  assert.ok(isSameArtifactRevision(revision(), revision({ nativeReference: 'proposal.md@0000000' })));
});

test('a different artifact or different content is a different revision', () => {
  assert.ok(!isSameArtifactRevision(revision(), revision({ artifactId: 'proposal-2' })));
  assert.ok(!isSameArtifactRevision(revision(), revision({ digest: `sha256:${'ef'.repeat(32)}` })));
});
