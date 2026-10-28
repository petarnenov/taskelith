import assert from 'node:assert/strict';
import test from 'node:test';
import { parseIdentifier, parseInstant, type Instant, type Result } from '@taskelith/kernel';
import {
  isGateOutdatedByCodeHead,
  isSameCodeHead,
  markGateStale,
  markGateStaleByCodeHead,
  openGate,
  parseArtifactRevision,
  parseSemanticApproval,
  recordGateEvidence,
  reopenGate,
  reopenGateAtCodeHead,
  type ArtifactRevision,
  type CodeHeadIdentity,
  type CodeObjectId,
  type Gate,
  type GateEvidence,
  type RepositoryId,
} from '@taskelith/sdlc';
import { value } from '@taskelith/testing';

function instant(text: string): Instant {
  return value(parseInstant(text));
}

function revision(artifactId: string, digestByte: string): ArtifactRevision {
  return value(parseArtifactRevision({ artifactId, digest: `sha256:${digestByte.repeat(32)}`, nativeReference: `${artifactId}.md` }));
}

// The workspace module validates object names; these tests only compare them.
function head(commitByte: string, treeByte: string, repository = 'acme/project'): CodeHeadIdentity {
  return {
    repository: value(parseIdentifier('RepositoryId', repository)) as RepositoryId,
    commit: commitByte.repeat(40) as CodeObjectId,
    tree: treeByte.repeat(40) as CodeObjectId,
  };
}

const OPENED_AT = instant('2026-10-28T09:00:00.000Z');
const LATER = instant('2026-10-28T10:00:00.000Z');
const SPEC = revision('spec', 'aa');
const EDITED_SPEC = revision('spec', 'cc');
const REVIEWED_HEAD = head('1', 'a');
const EDIT_HEAD = head('2', 'b');
const REVERT_HEAD = head('3', 'a');

// `null` opens a gate that is not head-bound.
function reviewGate(codeHead: CodeHeadIdentity | null = REVIEWED_HEAD): Gate {
  const input = { id: 'code-review', stageId: 'review', requiredEvidence: 'semantic-approval', subject: [SPEC] };
  return value(openGate(codeHead === null ? input : { ...input, codeHead }, OPENED_AT));
}

function approvalAt(codeHead: CodeHeadIdentity | undefined, subject: readonly ArtifactRevision[] = [SPEC]): GateEvidence {
  const facts = { approver: 'reviewer-1', verdict: 'approved', subject, recordedAt: LATER, reference: 'review record 9' };
  return value(parseSemanticApproval(codeHead === undefined ? facts : { ...facts, codeHead }));
}

function approved(gate: Gate): Gate {
  return value(recordGateEvidence(gate, gate.generation, approvalAt(gate.codeHead), LATER));
}

function assertRefused(result: Result<Gate>, code: string, message: string): void {
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.error.code, code);
  assert.equal(!result.ok && result.error.message, message);
}

test('a new code head makes head-bound evidence stale', () => {
  const passed = approved(reviewGate());
  const sameTree = head('2', 'a');
  assert.equal(isGateOutdatedByCodeHead(passed, sameTree), true, 'a new commit with the same tree');
  assert.equal(isGateOutdatedByCodeHead(passed, EDIT_HEAD), true);
  assert.equal(isGateOutdatedByCodeHead(passed, head('1', 'a', 'acme/other')), true, 'another repository');
  assert.equal(isGateOutdatedByCodeHead(passed, head('1', 'a')), false);
  const stale = value(markGateStaleByCodeHead(passed, passed.generation, sameTree, LATER));
  assert.equal(stale.state, 'stale');
  assert.deepEqual(stale.decision, passed.decision);
  assert.deepEqual(stale.codeHead, REVIEWED_HEAD);
  assert.ok(Object.isFrozen(stale));
  const undecided = reviewGate();
  assert.equal(value(markGateStaleByCodeHead(undecided, undecided.generation, sameTree, LATER)).decision, undefined);
});

test('an artifact edit, even one that restores the content, does not restore an approval', () => {
  const passed = approved(reviewGate());
  const superseded = passed.decision;
  assert.ok(superseded !== undefined);
  const edited = value(markGateStaleByCodeHead(passed, passed.generation, EDIT_HEAD, LATER));
  assertRefused(markGateStale(edited, edited.generation, SPEC, LATER), 'precondition-failed',
    'gate code-review cannot change from stale to stale');
  assertRefused(reopenGate(edited, edited.generation, [SPEC], LATER), 'precondition-failed',
    'gate code-review is head-bound and reopens only at a code head');
  const reverted = value(reopenGateAtCodeHead(edited, edited.generation, { subject: [SPEC], codeHead: REVERT_HEAD }, LATER));
  assert.equal(reverted.state, 'pending');
  assert.equal(reverted.decision, undefined);
  assertRefused(recordGateEvidence(reverted, reverted.generation, superseded, LATER), 'precondition-failed',
    'gate code-review accepts only evidence recorded at its code head');
  const reviewed = value(recordGateEvidence(reverted, reverted.generation, approvalAt(REVERT_HEAD), LATER));
  assert.equal(reviewed.state, 'passed');
});

test('evidence from another code head is rejected', () => {
  const pending = reviewGate();
  for (const foreign of [approvalAt(EDIT_HEAD), approvalAt(head('1', 'a', 'acme/other')), approvalAt(undefined)]) {
    assertRefused(recordGateEvidence(pending, pending.generation, foreign, LATER), 'precondition-failed',
      'gate code-review accepts only evidence recorded at its code head');
  }
  assert.equal(value(recordGateEvidence(pending, pending.generation, approvalAt(REVIEWED_HEAD), LATER)).state, 'passed');
});

test('a gate without a code head ignores code heads', () => {
  const pending = reviewGate(null);
  assert.equal(pending.codeHead, undefined);
  assert.equal(isGateOutdatedByCodeHead(pending, EDIT_HEAD), false);
  assertRefused(markGateStaleByCodeHead(pending, pending.generation, EDIT_HEAD, LATER), 'precondition-failed',
    'gate code-review is not outdated by that code head');
  assert.equal(value(recordGateEvidence(pending, pending.generation, approvalAt(EDIT_HEAD), LATER)).state, 'passed');
  const stale = value(markGateStale(pending, pending.generation, EDITED_SPEC, LATER));
  assertRefused(reopenGateAtCodeHead(stale, stale.generation, { subject: [EDITED_SPEC], codeHead: EDIT_HEAD }, LATER),
    'precondition-failed', 'gate code-review is not head-bound and reopens without a code head');
});

test('a head-bound gate keeps a copy of its head through other changes', () => {
  const codeHead = head('1', 'a');
  const pending = reviewGate(codeHead);
  assert.notEqual(pending.codeHead, codeHead);
  assert.ok(Object.isFrozen(pending.codeHead));
  const stale = value(markGateStale(pending, pending.generation, EDITED_SPEC, LATER));
  assert.deepEqual(stale.codeHead, REVIEWED_HEAD);
  const passed = approved(pending);
  assertRefused(markGateStaleByCodeHead(passed, passed.generation, REVIEWED_HEAD, LATER), 'precondition-failed',
    'gate code-review is not outdated by that code head');
  assertRefused(reopenGateAtCodeHead(stale, stale.generation, { subject: [], codeHead: EDIT_HEAD }, LATER),
    'invalid', 'subject: a gate subject needs at least one artifact revision');
  const evidence = approvalAt(codeHead);
  assert.notEqual(evidence.codeHead, codeHead);
  assert.ok(Object.isFrozen(evidence.codeHead));
});

test('code-head transitions check the generation before any other rule', () => {
  const opened = reviewGate();
  const passed = approved(opened);
  const stale = value(markGateStaleByCodeHead(passed, passed.generation, EDIT_HEAD, LATER));
  assert.equal(stale.generation, passed.generation + 1);
  const target = { subject: [SPEC], codeHead: EDIT_HEAD };
  for (const result of [
    markGateStaleByCodeHead(passed, opened.generation, REVIEWED_HEAD, LATER),
    reopenGateAtCodeHead(stale, opened.generation, target, LATER),
  ]) {
    assert.equal(!result.ok && result.error.code, 'conflict');
  }
});

test('isSameCodeHead needs the repository, the commit, and the tree to match', () => {
  assert.ok(isSameCodeHead(head('1', 'a'), head('1', 'a')));
  assert.ok(!isSameCodeHead(head('1', 'a'), head('2', 'a')));
  assert.ok(!isSameCodeHead(head('1', 'a'), head('1', 'b')));
  assert.ok(!isSameCodeHead(head('1', 'a'), head('1', 'a', 'acme/other')));
});
