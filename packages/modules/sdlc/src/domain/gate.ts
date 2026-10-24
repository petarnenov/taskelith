import { err, failure, ok, parseIdentifier, type Identifier, type Instant, type Result } from '@taskelith/kernel';
import type { ArtifactRevision } from './artifact-revision.js';
import { isDisplayText } from './display-text.js';
import { fieldFailure } from './field-failure.js';
import { isPassingEvidence, parseEvidenceKind, type EvidenceKind, type GateEvidence } from './gate-evidence.js';
import { isSameGateSubject, parseGateSubject, type GateSubject } from './gate-subject.js';
import { FIRST_GENERATION, checkGeneration, nextGeneration, type Generation } from './generation.js';
import type { StageId } from './workflow-definition.js';

export type GateId = Identifier<'GateId'>;

export const GATE_STATES = Object.freeze(['pending', 'passed', 'failed', 'stale', 'blocked'] as const);

export type GateState = (typeof GATE_STATES)[number];

// The only allowed transitions. A decision is never overturned in place: a
// passed gate goes stale when superseded, and other gates reopen as pending.
export const GATE_TRANSITIONS: Readonly<Record<GateState, readonly GateState[]>> = Object.freeze({
  pending: Object.freeze(['passed', 'failed', 'blocked', 'stale'] as const),
  passed: Object.freeze(['stale'] as const),
  failed: Object.freeze(['pending', 'stale'] as const),
  stale: Object.freeze(['pending'] as const),
  blocked: Object.freeze(['pending', 'stale'] as const),
});

declare const blockReasonBrand: unique symbol;

// Why a gate cannot be decided, such as a policy conflict, shown to people
// and never interpreted.
export type BlockReason = string & { readonly [blockReasonBrand]: true };

export const MAX_BLOCK_REASON_LENGTH = 1024;

// A stage gate that requires one evidence kind about an exact subject; its
// decision stays when the gate goes stale and is cleared when it reopens.
export interface Gate {
  readonly id: GateId;
  readonly stageId: StageId;
  readonly requiredEvidence: EvidenceKind;
  readonly subject: GateSubject;
  readonly state: GateState;
  readonly generation: Generation;
  readonly changedAt: Instant;
  readonly decision?: GateEvidence;
  readonly blockReason?: BlockReason;
}

export interface GateInput {
  readonly id: string;
  readonly stageId: string;
  readonly requiredEvidence: string;
  readonly subject: readonly ArtifactRevision[];
}

export function openGate(input: GateInput, openedAt: Instant): Result<Gate> {
  const id = parseIdentifier('GateId', input.id);
  if (!id.ok) return fieldFailure('id', id.error);
  const stageId = parseIdentifier('StageId', input.stageId);
  if (!stageId.ok) return fieldFailure('stageId', stageId.error);
  const requiredEvidence = parseEvidenceKind(input.requiredEvidence);
  if (!requiredEvidence.ok) return fieldFailure('requiredEvidence', requiredEvidence.error);
  const subject = parseGateSubject(input.subject);
  if (!subject.ok) return subject;
  return ok(Object.freeze({
    id: id.value,
    stageId: stageId.value,
    requiredEvidence: requiredEvidence.value,
    subject: subject.value,
    state: 'pending',
    generation: FIRST_GENERATION,
    changedAt: openedAt,
  }));
}

export function parseBlockReason(text: string): Result<BlockReason> {
  if (!isDisplayText(text, MAX_BLOCK_REASON_LENGTH)) {
    return err(failure('invalid', `BlockReason must be 1-${MAX_BLOCK_REASON_LENGTH} characters without control characters`));
  }
  return ok(text as BlockReason);
}

// Passes or fails a pending gate. Only evidence of the required kind about
// exactly the gate's subject decides it.
export function recordGateEvidence(
  gate: Gate,
  expectedGeneration: Generation,
  evidence: GateEvidence,
  at: Instant,
): Result<Gate> {
  const allowed = checkTransition(gate, expectedGeneration, isPassingEvidence(evidence) ? 'passed' : 'failed');
  if (!allowed.ok) return allowed;
  if (evidence.kind !== gate.requiredEvidence) {
    return gateFailure(gate, `requires ${gate.requiredEvidence} evidence, not ${evidence.kind}`, {
      required: gate.requiredEvidence,
      provided: evidence.kind,
    });
  }
  if (!isSameGateSubject(evidence.subject, gate.subject)) {
    return gateFailure(gate, 'accepts only evidence about exactly its subject revisions');
  }
  return ok(changedGate(gate, { state: allowed.value, subject: gate.subject, decision: evidence }, at));
}

export function blockGate(gate: Gate, expectedGeneration: Generation, reason: string, at: Instant): Result<Gate> {
  const allowed = checkTransition(gate, expectedGeneration, 'blocked');
  if (!allowed.ok) return allowed;
  const blockReason = parseBlockReason(reason);
  if (!blockReason.ok) return fieldFailure('reason', blockReason.error);
  return ok(changedGate(gate, { state: 'blocked', subject: gate.subject, blockReason: blockReason.value }, at));
}

// Returns a failed, stale, or blocked gate to pending for a new decision about
// the given subject, which replaces the old one.
export function reopenGate(
  gate: Gate,
  expectedGeneration: Generation,
  subject: readonly ArtifactRevision[],
  at: Instant,
): Result<Gate> {
  const allowed = checkTransition(gate, expectedGeneration, 'pending');
  if (!allowed.ok) return allowed;
  const parsedSubject = parseGateSubject(subject);
  if (!parsedSubject.ok) return parsedSubject;
  return ok(changedGate(gate, { state: 'pending', subject: parsedSubject.value }, at));
}

// A revision outdates a gate when it is a different revision of an artifact in
// the gate's subject.
export function isGateOutdatedBy(gate: Gate, revision: ArtifactRevision): boolean {
  return gate.subject.some((judged) => judged.artifactId === revision.artifactId && judged.digest !== revision.digest);
}

export function markGateStale(
  gate: Gate,
  expectedGeneration: Generation,
  revision: ArtifactRevision,
  at: Instant,
): Result<Gate> {
  const allowed = checkTransition(gate, expectedGeneration, 'stale');
  if (!allowed.ok) return allowed;
  if (!isGateOutdatedBy(gate, revision)) {
    return gateFailure(gate, `is not outdated by the revision of artifact ${revision.artifactId}`, { artifact: revision.artifactId });
  }
  const decision = gate.decision === undefined ? {} : { decision: gate.decision };
  return ok(changedGate(gate, { state: 'stale', subject: gate.subject, ...decision }, at));
}

function checkTransition(gate: Gate, expectedGeneration: Generation, to: GateState): Result<GateState> {
  const generation = checkGeneration(`gate ${gate.id}`, gate.generation, expectedGeneration);
  if (!generation.ok) return generation;
  if (!GATE_TRANSITIONS[gate.state].includes(to)) {
    return gateFailure(gate, `cannot change from ${gate.state} to ${to}`, { from: gate.state, to });
  }
  return ok(to);
}

function gateFailure(gate: Gate, message: string, details: Readonly<Record<string, string>> = {}): Result<never> {
  return err(failure('precondition-failed', `gate ${gate.id} ${message}`, { gate: gate.id, ...details }));
}

type GateChange = Pick<Gate, 'state' | 'subject' | 'decision' | 'blockReason'>;

function changedGate(gate: Gate, change: GateChange, at: Instant): Gate {
  return Object.freeze({
    id: gate.id,
    stageId: gate.stageId,
    requiredEvidence: gate.requiredEvidence,
    ...change,
    generation: nextGeneration(gate.generation),
    changedAt: at,
  });
}
