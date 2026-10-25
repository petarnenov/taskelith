import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EVIDENCE_RECORDS_CONFORMANCE,
  InMemoryEvidenceRecords,
  acceptEvidence,
  checkRetentionElapsed,
  isSamePublication,
  parseEvidencePublication,
  retentionEndsAt,
  type EvidenceContext,
  type EvidencePublicationInput,
} from '@taskelith/execution';
import type { ProjectId, WorkflowRunId } from '@taskelith/sdlc';
import { failed, value } from '@taskelith/testing';
import { OTHER_WORKER, T0, T1, WORKER, authorized, instant, ownership, placedTask } from './fixtures.ts';

const INPUT: EvidencePublicationInput = {
  evidenceId: 'evidence-1', projectId: 'project-1', runId: 'run-1', taskId: 'task-1', attemptId: 'attempt-1', ownershipGeneration: 3,
  executionId: 'execution-1', kind: 'execution-log', inputArtifacts: [{ artifactId: 'spec', digest: `sha256:${'aa'.repeat(32)}`, nativeReference: 'spec.md' }],
  codeRevision: 'c0ffee', validator: { name: 'runner', version: '1.0.0' }, outcome: 'exited-0',
  contentDigest: `sha256:${'cd'.repeat(32)}`, contentType: 'text/plain', sizeBytes: 12, capturedAt: T0,
};
const PRODUCER = { kind: 'worker', workerId: WORKER } as const;

function context(overrides: Partial<EvidenceContext> = {}): EvidenceContext {
  return {
    task: authorized().task, projectId: 'project-1' as ProjectId, runId: 'run-1' as WorkflowRunId, heldGenerations: [ownership(3)], ...overrides,
  };
}

test('in-memory evidence records pass the shared suite', async () => {
  for (const conformance of EVIDENCE_RECORDS_CONFORMANCE) assert.deepEqual(await conformance.check(new InMemoryEvidenceRecords()), [], conformance.name);
});

test('a publication parses into frozen values and names its offending field', () => {
  const parsed = value(parseEvidencePublication(INPUT));
  assert.ok(Object.isFrozen(parsed) && Object.isFrozen(parsed.validator));
  assert.equal(parsed.inputArtifacts[0]?.artifactId, 'spec');
  const cases: [Partial<EvidencePublicationInput>, string][] = [
    [{ evidenceId: '' }, 'evidenceId'],
    [{ validator: { name: 'runner', version: 'has space' } }, 'validator.version'],
    [{ executionId: '\u0000' }, 'executionId'],
    [{ ownershipGeneration: 0 }, 'ownershipGeneration'],
    [{ inputArtifacts: [{ artifactId: 'spec', digest: 'md5:00', nativeReference: 'spec.md' }] }, 'inputArtifacts'],
    [{ contentDigest: 'sha256:AB' }, 'contentDigest'],
    [{ capturedAt: '2026-10-25' }, 'capturedAt'],
    [{ contentType: 'Text/Plain' }, 'contentType'],
    [{ contentType: `text/${'x'.repeat(251)}` }, 'contentType'],
    [{ sizeBytes: -1 }, 'sizeBytes'],
    [{ sizeBytes: 1.5 }, 'sizeBytes'],
  ];
  for (const [change, field] of cases) assert.equal(failed(parseEvidencePublication({ ...INPUT, ...change })).details.field, field, field);
  const { executionId: _omitted, ...withoutExecution } = INPUT;
  assert.equal(value(parseEvidencePublication(withoutExecution)).executionId, undefined);
});

test('evidence of the current generation is current, and of an earlier held one is kept for audit', () => {
  const publication = value(parseEvidencePublication(INPUT));
  const current = value(acceptEvidence(publication, PRODUCER, context(), T1));
  assert.deepEqual([current.ownershipCurrent, current.publishedAt, current.producer], [true, T1, PRODUCER]);
  const earlier = value(parseEvidencePublication({ ...INPUT, ownershipGeneration: 2, executionId: undefined as never }));
  const audit = value(acceptEvidence(earlier, PRODUCER, context({ heldGenerations: [ownership(2), ownership(3)] }), T1));
  assert.equal(audit.ownershipCurrent, false);
});

test('a producer that never held the attempt, or a misplaced task, is not authorized', () => {
  const publication = value(parseEvidencePublication(INPUT));
  const refusals = [
    context({ heldGenerations: [] }),
    context({ heldGenerations: [ownership(2)] }),
    context({ projectId: 'project-2' as ProjectId }),
    context({ runId: 'run-2' as WorkflowRunId }),
    context({ task: placedTask() }),
  ];
  for (const refused of refusals.slice(0, 4)) {
    const failure = failed(acceptEvidence(publication, PRODUCER, refused, T1));
    assert.deepEqual([failure.code, failure.details.reason, failure.message],
      ['forbidden', 'producer-not-authorized', 'evidence evidence-1 is not authorized for this producer']);
  }
  assert.equal(failed(acceptEvidence(publication, PRODUCER, refusals[4]!, T1)).details.field, 'executionId');
  const otherAttempt = value(parseEvidencePublication({ ...INPUT, attemptId: 'attempt-9' }));
  assert.equal(failed(acceptEvidence(otherAttempt, PRODUCER, context(), T1)).code, 'forbidden');
  const otherTask = value(parseEvidencePublication({ ...INPUT, taskId: 'task-9' }));
  assert.equal(failed(acceptEvidence(otherTask, PRODUCER, context(), T1)).code, 'forbidden');
});

test('a retry is the same publication only with every value and the producer equal', () => {
  const publication = value(parseEvidencePublication(INPUT));
  const record = value(acceptEvidence(publication, PRODUCER, context(), T1));
  // A stored record comes back from JSON, with its keys in another order.
  const { publishedAt, ...rest } = record;
  const stored = JSON.parse(JSON.stringify({ publishedAt, ...rest }));
  assert.equal(isSamePublication(stored, publication, PRODUCER), true);
  assert.equal(isSamePublication(record, value(parseEvidencePublication({ ...INPUT, outcome: 'exited-1' })), PRODUCER), false);
  assert.equal(isSamePublication(record, publication, { kind: 'worker', workerId: OTHER_WORKER }), false);
});

test('evidence is retained for 365 days after its publication', () => {
  const record = value(acceptEvidence(value(parseEvidencePublication(INPUT)), PRODUCER, context(), T0));
  assert.equal(value(retentionEndsAt(record)), '2027-10-25T09:00:00.000Z');
  const kept = failed(checkRetentionElapsed(record, instant('2027-10-25T08:59:59.999Z')));
  assert.deepEqual([kept.code, kept.details.reason], ['precondition-failed', 'retention-not-elapsed']);
  assert.equal(checkRetentionElapsed(record, instant('2027-10-25T09:00:00.000Z')).ok, true);
  const unreadable = { ...record, publishedAt: 'not an instant' as never };
  assert.equal(checkRetentionElapsed(unreadable, instant('2099-01-01T00:00:00.000Z')).ok, false, 'an unknown end keeps the record');
});
