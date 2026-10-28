import assert from 'node:assert/strict';
import test from 'node:test';
import { parseIdentifier, parseInstant, type Instant } from '@taskelith/kernel';
import {
  EVIDENCE_KINDS,
  MAX_EVIDENCE_REFERENCE_LENGTH,
  isPassingEvidence,
  parseArtifactRevision,
  parseEvidenceKind,
  parseEvidenceReference,
  parsePlatformRecord,
  parseSemanticApproval,
  parseStructuralValidation,
  type ArtifactRevision,
  type CodeHeadIdentity,
  type CodeObjectId,
  type RepositoryId,
  type SemanticApprovalInput,
} from '@taskelith/sdlc';

function instant(text: string): Instant {
  const result = parseInstant(text);
  assert.ok(result.ok);
  return result.value;
}

function revision(artifactId: string): ArtifactRevision {
  const result = parseArtifactRevision({ artifactId, digest: `sha256:${'ab'.repeat(32)}`, nativeReference: `${artifactId}.md` });
  assert.ok(result.ok);
  return result.value;
}

const RECORDED_AT = instant('2026-10-24T10:00:00.000Z');
const SUBJECT = [revision('spec')];
const FACTS = { subject: SUBJECT, recordedAt: RECORDED_AT, reference: 'review record 7' };
const APPROVAL: SemanticApprovalInput = { approver: 'reviewer-1', verdict: 'approved', ...FACTS };
const REPOSITORY = parseIdentifier('RepositoryId', 'acme/project');
assert.ok(REPOSITORY.ok);
const CODE_HEAD: CodeHeadIdentity = {
  repository: REPOSITORY.value as RepositoryId,
  commit: '1'.repeat(40) as CodeObjectId,
  tree: 'a'.repeat(40) as CodeObjectId,
};

test('each evidence kind is a frozen value with its own source and verdict', () => {
  const structural = parseStructuralValidation({ validator: 'schema-check', verdict: 'valid', ...FACTS });
  const semantic = parseSemanticApproval(APPROVAL);
  const platform = parsePlatformRecord({ recorder: 'platform', verdict: 'satisfied', ...FACTS });
  assert.deepEqual(structural, { ok: true, value: { kind: 'structural-validation', validator: 'schema-check', verdict: 'valid', ...FACTS } });
  assert.deepEqual(semantic, { ok: true, value: { kind: 'semantic-approval', ...APPROVAL } });
  assert.deepEqual(platform, { ok: true, value: { kind: 'platform-record', recorder: 'platform', verdict: 'satisfied', ...FACTS } });
  for (const result of [structural, semantic, platform]) {
    assert.ok(result.ok && Object.isFrozen(result.value) && Object.isFrozen(result.value.subject));
  }
});

test('a verdict of one evidence kind is not accepted by another', () => {
  for (const verdict of ['valid', 'satisfied', 'checked', '']) {
    const result = parseSemanticApproval({ ...APPROVAL, verdict });
    assert.equal(!result.ok && result.error.code, 'invalid');
    assert.equal(!result.ok && result.error.message, 'verdict: verdict must be one of approved, rejected');
    assert.deepEqual(!result.ok && result.error.details, { field: 'verdict' });
  }
  assert.equal(parseStructuralValidation({ validator: 'v', verdict: 'approved', ...FACTS }).ok, false);
  assert.equal(parsePlatformRecord({ recorder: 'r', verdict: 'valid', ...FACTS }).ok, false);
});

test('evidence parsers name the invalid field', () => {
  const cases = [
    [parseSemanticApproval({ ...APPROVAL, approver: '' }), 'approver'],
    [parseStructuralValidation({ validator: '', verdict: 'valid', ...FACTS }), 'validator'],
    [parsePlatformRecord({ recorder: '', verdict: 'satisfied', ...FACTS }), 'recorder'],
    [parseSemanticApproval({ ...APPROVAL, subject: [] }), 'subject'],
    [parseSemanticApproval({ ...APPROVAL, reference: '' }), 'reference'],
  ] as const;
  for (const [result, field] of cases) {
    assert.equal(!result.ok && result.error.code, 'invalid');
    assert.equal(!result.ok && result.error.details.field, field);
  }
});

test('evidence keeps the gate, generation, and code head it was recorded for', () => {
  const binding = { gateId: 'specs-approval', gateGeneration: 2, codeHead: CODE_HEAD };
  const result = parseSemanticApproval({ ...APPROVAL, ...binding });
  assert.deepEqual(result, { ok: true, value: { kind: 'semantic-approval', ...APPROVAL, ...binding } });
});

test('evidence parsers reject an invalid gate, generation, or code head repository', () => {
  const otherRepository = { ...CODE_HEAD, repository: 'acme project' } as unknown as CodeHeadIdentity;
  const cases: [SemanticApprovalInput, string][] = [
    [{ ...APPROVAL, gateId: '' }, 'gateId'],
    [{ ...APPROVAL, codeHead: otherRepository }, 'codeHead'],
    ...[0, -1, 1.5].map((gateGeneration): [SemanticApprovalInput, string] => [{ ...APPROVAL, gateGeneration }, 'gateGeneration']),
  ];
  for (const [input, field] of cases) {
    const result = parseSemanticApproval(input);
    assert.equal(!result.ok && result.error.code, 'invalid', field);
    assert.equal(!result.ok && result.error.details.field, field);
  }
});

test('only the passing verdict of each kind passes', () => {
  const passing = [
    parseStructuralValidation({ validator: 'v', verdict: 'valid', ...FACTS }),
    parseSemanticApproval(APPROVAL),
    parsePlatformRecord({ recorder: 'r', verdict: 'satisfied', ...FACTS }),
  ];
  const failing = [
    parseStructuralValidation({ validator: 'v', verdict: 'invalid', ...FACTS }),
    parseSemanticApproval({ ...APPROVAL, verdict: 'rejected' }),
    parsePlatformRecord({ recorder: 'r', verdict: 'unsatisfied', ...FACTS }),
  ];
  for (const result of passing) assert.ok(result.ok && isPassingEvidence(result.value));
  for (const result of failing) assert.ok(result.ok && !isPassingEvidence(result.value));
});

test('parseEvidenceKind accepts the three kinds only', () => {
  assert.deepEqual(EVIDENCE_KINDS, ['structural-validation', 'semantic-approval', 'platform-record']);
  assert.ok(Object.isFrozen(EVIDENCE_KINDS));
  for (const kind of EVIDENCE_KINDS) assert.deepEqual(parseEvidenceKind(kind), { ok: true, value: kind });
  for (const text of ['checkbox', 'agent-exit', '']) assert.equal(parseEvidenceKind(text).ok, false);
});

test('parseEvidenceReference accepts display text and rejects control characters and long text', () => {
  assert.deepEqual(parseEvidenceReference('reviews/pass 1.md'), { ok: true, value: 'reviews/pass 1.md' });
  for (const text of ['', 'a\u0000', 'x'.repeat(MAX_EVIDENCE_REFERENCE_LENGTH + 1)]) {
    assert.equal(parseEvidenceReference(text).ok, false);
  }
});
