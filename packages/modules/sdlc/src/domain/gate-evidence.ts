import { err, failure, ok, parseIdentifier, type Identifier, type Instant, type Result } from '@taskelith/kernel';
import type { ArtifactRevision } from './artifact-revision.js';
import { codeHeadField, type CodeHeadIdentity } from './code-head.js';
import { fieldFailure } from './field-failure.js';
import { isDisplayText } from './display-text.js';
import type { GateId } from './gate.js';
import { parseGateSubject, type GateSubject } from './gate-subject.js';
import { parseGeneration, type Generation } from './generation.js';

// Evidence from a validator, a reviewer, or a platform record (architecture
// section 6); a gate accepts only its kind, so no validator replaces review.
export const EVIDENCE_KINDS = Object.freeze(['structural-validation', 'semantic-approval', 'platform-record'] as const);

export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

export const STRUCTURAL_VERDICTS = Object.freeze(['valid', 'invalid'] as const);
export const SEMANTIC_VERDICTS = Object.freeze(['approved', 'rejected'] as const);
export const PLATFORM_RECORD_VERDICTS = Object.freeze(['satisfied', 'unsatisfied'] as const);

export type StructuralVerdict = (typeof STRUCTURAL_VERDICTS)[number];
export type SemanticVerdict = (typeof SEMANTIC_VERDICTS)[number];
export type PlatformRecordVerdict = (typeof PLATFORM_RECORD_VERDICTS)[number];

export type ValidatorId = Identifier<'ValidatorId'>;
export type ApproverId = Identifier<'ApproverId'>;
export type RecorderId = Identifier<'RecorderId'>;

declare const evidenceReferenceBrand: unique symbol;

// Where the validator output, review record, or platform record is kept, for
// display and traceability; the domain never interprets it.
export type EvidenceReference = string & { readonly [evidenceReferenceBrand]: true };

export const MAX_EVIDENCE_REFERENCE_LENGTH = 1024;

// Evidence names the pending gate and generation it was recorded for, so it
// decides only that cycle, and head-bound evidence its code head.
interface EvidenceFacts<Verdict extends string> {
  readonly verdict: Verdict;
  readonly subject: GateSubject;
  readonly codeHead?: CodeHeadIdentity;
  readonly gateId?: GateId;
  readonly gateGeneration?: Generation;
  readonly recordedAt: Instant;
  readonly reference: EvidenceReference;
}

export interface StructuralValidation extends EvidenceFacts<StructuralVerdict> {
  readonly kind: 'structural-validation';
  readonly validator: ValidatorId;
}

export interface SemanticApproval extends EvidenceFacts<SemanticVerdict> {
  readonly kind: 'semantic-approval';
  readonly approver: ApproverId;
}

export interface PlatformRecord extends EvidenceFacts<PlatformRecordVerdict> {
  readonly kind: 'platform-record';
  readonly recorder: RecorderId;
}

export type GateEvidence = StructuralValidation | SemanticApproval | PlatformRecord;

interface EvidenceFactsInput {
  readonly verdict: string;
  readonly subject: readonly ArtifactRevision[];
  readonly codeHead?: CodeHeadIdentity;
  readonly gateId?: string;
  readonly gateGeneration?: number;
  readonly recordedAt: Instant;
  readonly reference: string;
}

export interface StructuralValidationInput extends EvidenceFactsInput {
  readonly validator: string;
}

export interface SemanticApprovalInput extends EvidenceFactsInput {
  readonly approver: string;
}

export interface PlatformRecordInput extends EvidenceFactsInput {
  readonly recorder: string;
}

const PASSING_VERDICTS: Readonly<Record<EvidenceKind, string>> = Object.freeze({
  'structural-validation': 'valid',
  'semantic-approval': 'approved',
  'platform-record': 'satisfied',
});

export function parseEvidenceKind(text: string): Result<EvidenceKind> {
  if (!(EVIDENCE_KINDS as readonly string[]).includes(text)) {
    return err(failure('invalid', `EvidenceKind must be one of ${EVIDENCE_KINDS.join(', ')}`));
  }
  return ok(text as EvidenceKind);
}

export function parseEvidenceReference(text: string): Result<EvidenceReference> {
  if (!isDisplayText(text, MAX_EVIDENCE_REFERENCE_LENGTH)) {
    return err(failure(
      'invalid',
      `EvidenceReference must be 1-${MAX_EVIDENCE_REFERENCE_LENGTH} characters without control characters`,
    ));
  }
  return ok(text as EvidenceReference);
}

export function parseStructuralValidation(input: StructuralValidationInput): Result<StructuralValidation> {
  const validator = parseIdentifier('ValidatorId', input.validator);
  if (!validator.ok) return fieldFailure('validator', validator.error);
  const facts = parseEvidenceFacts(STRUCTURAL_VERDICTS, input);
  if (!facts.ok) return facts;
  return ok(Object.freeze({ kind: 'structural-validation', validator: validator.value, ...facts.value }));
}

export function parseSemanticApproval(input: SemanticApprovalInput): Result<SemanticApproval> {
  const approver = parseIdentifier('ApproverId', input.approver);
  if (!approver.ok) return fieldFailure('approver', approver.error);
  const facts = parseEvidenceFacts(SEMANTIC_VERDICTS, input);
  if (!facts.ok) return facts;
  return ok(Object.freeze({ kind: 'semantic-approval', approver: approver.value, ...facts.value }));
}

export function parsePlatformRecord(input: PlatformRecordInput): Result<PlatformRecord> {
  const recorder = parseIdentifier('RecorderId', input.recorder);
  if (!recorder.ok) return fieldFailure('recorder', recorder.error);
  const facts = parseEvidenceFacts(PLATFORM_RECORD_VERDICTS, input);
  if (!facts.ok) return facts;
  return ok(Object.freeze({ kind: 'platform-record', recorder: recorder.value, ...facts.value }));
}

export function isPassingEvidence(evidence: GateEvidence): boolean {
  return evidence.verdict === PASSING_VERDICTS[evidence.kind];
}

function parseEvidenceFacts<Verdict extends string>(
  verdicts: readonly Verdict[],
  input: EvidenceFactsInput,
): Result<EvidenceFacts<Verdict>> {
  if (!(verdicts as readonly string[]).includes(input.verdict)) {
    return err(failure('invalid', `verdict: verdict must be one of ${verdicts.join(', ')}`, { field: 'verdict' }));
  }
  const subject = parseGateSubject(input.subject);
  if (!subject.ok) return subject;
  const reference = parseEvidenceReference(input.reference);
  if (!reference.ok) return fieldFailure('reference', reference.error);
  const binding = parseEvidenceBinding(input);
  if (!binding.ok) return binding;
  return ok({
    verdict: input.verdict as Verdict,
    subject: subject.value,
    ...binding.value,
    recordedAt: input.recordedAt,
    reference: reference.value,
  });
}

type EvidenceBinding = Pick<EvidenceFacts<string>, 'codeHead' | 'gateId' | 'gateGeneration'>;

function parseEvidenceBinding(input: EvidenceFactsInput): Result<EvidenceBinding> {
  if (input.codeHead !== undefined) {
    const repository = parseIdentifier('RepositoryId', input.codeHead.repository);
    if (!repository.ok) return fieldFailure('codeHead', repository.error);
  }
  const gateId = input.gateId === undefined ? undefined : parseIdentifier('GateId', input.gateId);
  if (gateId !== undefined && !gateId.ok) return fieldFailure('gateId', gateId.error);
  const generation = input.gateGeneration === undefined ? undefined : parseGeneration(input.gateGeneration);
  if (generation !== undefined && !generation.ok) return fieldFailure('gateGeneration', generation.error);
  return ok({
    ...codeHeadField(input.codeHead),
    ...(gateId === undefined ? {} : { gateId: gateId.value }),
    ...(generation === undefined ? {} : { gateGeneration: generation.value }),
  });
}
