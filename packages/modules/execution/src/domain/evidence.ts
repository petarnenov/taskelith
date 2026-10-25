import { err, failure, instantFromEpochMilliseconds, ok, parseIdentifier, parseInstant, type Identifier, type Instant, type Result } from '@taskelith/kernel';
import {
  parseArtifactRevision,
  parseContentDigest,
  parseOwnershipGeneration,
  type ArtifactRevision,
  type ArtifactRevisionInput,
  type ContentDigest,
  type OwnershipGeneration,
  type ProjectId,
  type TaskId,
  type WorkflowRunId,
} from '@taskelith/sdlc';
import type { AttemptId, ExecutionId, WorkerId } from './identifiers.js';
import type { Task } from './task.js';

export type EvidenceId = Identifier<'EvidenceId'>;

// Accepted evidence is kept at least this long (operational targets 2).
export const EVIDENCE_RETENTION_DAYS = 365;

const DAY_MILLISECONDS = 86_400_000;
const CONTENT_TYPE = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/;
const MAX_CONTENT_TYPE_LENGTH = 255;

// An evidence record as its producer publishes it: the fields of
// architecture section 8 and the generation it held the attempt at.
export interface EvidencePublication {
  readonly evidenceId: EvidenceId;
  readonly projectId: ProjectId;
  readonly runId: WorkflowRunId;
  readonly taskId: TaskId;
  readonly attemptId: AttemptId;
  readonly ownershipGeneration: OwnershipGeneration;
  readonly executionId?: ExecutionId;
  readonly kind: Identifier<'EvidenceKind'>;
  readonly inputArtifacts: readonly ArtifactRevision[];
  readonly codeRevision: Identifier<'CodeRevision'>;
  readonly validator: EvidenceValidator;
  readonly outcome: Identifier<'EvidenceOutcome'>;
  readonly contentDigest: ContentDigest;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly capturedAt: Instant;
}

export interface EvidenceValidator {
  readonly name: Identifier<'ValidatorName'>;
  readonly version: Identifier<'ValidatorVersion'>;
}

export interface EvidenceProducer {
  readonly kind: 'worker';
  readonly workerId: WorkerId;
}

// A stored record; one of an older generation is kept for audit and never
// counts as current evidence (launch authorization contract, section 5).
export interface EvidenceRecord extends EvidencePublication {
  readonly producer: EvidenceProducer;
  readonly ownershipCurrent: boolean;
  readonly publishedAt: Instant;
}

export interface EvidencePublicationInput {
  readonly evidenceId: string;
  readonly projectId: string;
  readonly runId: string;
  readonly taskId: string;
  readonly attemptId: string;
  readonly ownershipGeneration: number;
  readonly executionId?: string;
  readonly kind: string;
  readonly inputArtifacts: readonly ArtifactRevisionInput[];
  readonly codeRevision: string;
  readonly validator: { readonly name: string; readonly version: string };
  readonly outcome: string;
  readonly contentDigest: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly capturedAt: string;
}

// What the control plane knows when a producer publishes: the task, where
// it belongs, and the generations at which this producer held the attempt.
export interface EvidenceContext {
  readonly task: Task;
  readonly projectId: ProjectId;
  readonly runId: WorkflowRunId;
  readonly heldGenerations: readonly OwnershipGeneration[];
}

export function parseEvidencePublication(input: EvidencePublicationInput): Result<EvidencePublication> {
  const identifiers = parseIdentifiers(input);
  if (!identifiers.ok) return identifiers;
  const ownershipGeneration = parseOwnershipGeneration(input.ownershipGeneration);
  if (!ownershipGeneration.ok) return fieldError('ownershipGeneration', ownershipGeneration.error.message);
  const inputArtifacts = parseArtifacts(input.inputArtifacts);
  if (!inputArtifacts.ok) return inputArtifacts;
  const contentDigest = parseContentDigest(input.contentDigest);
  if (!contentDigest.ok) return fieldError('contentDigest', contentDigest.error.message);
  const capturedAt = parseInstant(input.capturedAt);
  if (!capturedAt.ok) return fieldError('capturedAt', capturedAt.error.message);
  if (input.contentType.length > MAX_CONTENT_TYPE_LENGTH || !CONTENT_TYPE.test(input.contentType)) {
    return fieldError('contentType', 'contentType must be a lowercase media type of at most 255 characters');
  }
  if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes < 0) return fieldError('sizeBytes', 'sizeBytes must be a non-negative integer');
  return ok(Object.freeze({
    ...identifiers.value,
    ownershipGeneration: ownershipGeneration.value,
    inputArtifacts: inputArtifacts.value,
    contentDigest: contentDigest.value,
    contentType: input.contentType,
    sizeBytes: input.sizeBytes,
    capturedAt: capturedAt.value,
  }));
}

// Authorizes the producer and stamps the record. A producer may publish
// only for an attempt it held at the stated generation (R31).
export function acceptEvidence(
  publication: EvidencePublication,
  producer: EvidenceProducer,
  context: EvidenceContext,
  at: Instant,
): Result<EvidenceRecord> {
  const { task } = context;
  const placed = publication.taskId === task.id && publication.runId === context.runId && publication.projectId === context.projectId;
  if (!placed) return notAuthorized(publication, 'the task is not in the stated run and project');
  const attempt = task.attempts.find((candidate) => candidate.id === publication.attemptId);
  if (attempt === undefined) return notAuthorized(publication, 'the task has no such attempt');
  if (!context.heldGenerations.includes(publication.ownershipGeneration)) {
    return notAuthorized(publication, `the producer never held the attempt at generation ${publication.ownershipGeneration}`);
  }
  const { executionId } = publication;
  if (executionId !== undefined && !attempt.executions.some((execution) => execution.id === executionId)) {
    return fieldError('executionId', `the attempt has no execution ${executionId}`);
  }
  const ownershipCurrent = publication.ownershipGeneration === task.ownershipGeneration;
  return ok(Object.freeze({ ...publication, producer: Object.freeze({ ...producer }), ownershipCurrent, publishedAt: at }));
}

// A retried publication is the same when every published value and the
// producer match; the stored stamps do not take part.
export function isSamePublication(record: EvidenceRecord, publication: EvidencePublication, producer: EvidenceProducer): boolean {
  const { producer: stored, ownershipCurrent: _current, publishedAt: _published, ...published } = record;
  return stored.kind === producer.kind && stored.workerId === producer.workerId && canonical(published) === canonical(publication);
}

export function retentionEndsAt(record: EvidenceRecord): Instant {
  const ends = instantFromEpochMilliseconds(Date.parse(record.publishedAt) + EVIDENCE_RETENTION_DAYS * DAY_MILLISECONDS);
  // A parsed instant plus 365 days stays far inside the Date range.
  return ends.ok ? ends.value : record.publishedAt;
}

// A record may be removed only once its minimum retention has passed.
export function checkRetentionElapsed(record: EvidenceRecord, now: Instant): Result<void> {
  const ends = retentionEndsAt(record);
  if (Date.parse(now) >= Date.parse(ends)) return ok(undefined);
  return err(failure('precondition-failed', `evidence ${record.evidenceId} is retained until ${ends}`, {
    evidence: record.evidenceId,
    reason: 'retention-not-elapsed',
  }));
}

type ParsedIdentifiers = Pick<
  EvidencePublication,
  'evidenceId' | 'projectId' | 'runId' | 'taskId' | 'attemptId' | 'executionId' | 'kind' | 'codeRevision' | 'validator' | 'outcome'
>;

function parseIdentifiers(input: EvidencePublicationInput): Result<ParsedIdentifiers> {
  const fields = [
    ['evidenceId', 'EvidenceId', input.evidenceId],
    ['projectId', 'ProjectId', input.projectId],
    ['runId', 'RunId', input.runId],
    ['taskId', 'TaskId', input.taskId],
    ['attemptId', 'AttemptId', input.attemptId],
    ['kind', 'EvidenceKind', input.kind],
    ['codeRevision', 'CodeRevision', input.codeRevision],
    ['outcome', 'EvidenceOutcome', input.outcome],
    ['validator.name', 'ValidatorName', input.validator.name],
    ['validator.version', 'ValidatorVersion', input.validator.version],
    ...(input.executionId === undefined ? [] : [['executionId', 'ExecutionId', input.executionId]]),
  ] as const;
  const parsed: Record<string, string> = {};
  for (const [field, kind, text] of fields) {
    const identifier = parseIdentifier(kind, text);
    if (!identifier.ok) return fieldError(field, identifier.error.message);
    parsed[field] = identifier.value;
  }
  const { 'validator.name': name, 'validator.version': version, ...rest } = parsed;
  return ok({ ...rest, validator: Object.freeze({ name, version }) } as unknown as ParsedIdentifiers);
}

function parseArtifacts(inputs: readonly ArtifactRevisionInput[]): Result<readonly ArtifactRevision[]> {
  const parsed: ArtifactRevision[] = [];
  for (const input of inputs) {
    const revision = parseArtifactRevision(input);
    if (!revision.ok) return fieldError('inputArtifacts', revision.error.message);
    parsed.push(revision.value);
  }
  return ok(Object.freeze(parsed));
}

// Key order does not matter, so both sides are compared with sorted keys.
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, part: unknown) => {
    if (part === null || typeof part !== 'object' || Array.isArray(part)) return part;
    return Object.fromEntries(Object.entries(part).sort(([left], [right]) => left.localeCompare(right)));
  });
}

function notAuthorized(publication: EvidencePublication, reason: string): Result<never> {
  return err(failure('forbidden', `evidence ${publication.evidenceId} is not authorized: ${reason}`, {
    evidence: publication.evidenceId,
    reason: 'producer-not-authorized',
  }));
}

function fieldError(field: string, message: string): Result<never> {
  return err(failure('invalid', `${field}: ${message}`, { field }));
}
