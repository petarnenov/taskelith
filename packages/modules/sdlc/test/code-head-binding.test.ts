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
  type Generation,
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
function reviewGate(codeHead: CodeHeadIdentity | null = REVIEWED_HEAD, id = 'code-review'): Gate {
  const input = { id, stageId: 'review', requiredEvidence: 'semantic-approval', subject: [SPEC] };
  return value(openGate(codeHead === null ? input : { ...input, codeHead }, OPENED_AT));
}

// What an approval names beyond its subject: the head, gate, and generation.
interface EvidenceBinding {
  readonly codeHead?: CodeHeadIdentity | undefined;
  readonly gateId?: string;
  readonly gateGeneration?: Generation;
}

function approval(binding: EvidenceBinding): GateEvidence {
  const facts = { approver: 'reviewer-1', verdict: 'approved', subject: [SPEC], recordedAt: LATER, reference: 'review 9' };
  return value(parseSemanticApproval({ ...facts, ...binding }));
}

function bindingOf(gate: Gate): EvidenceBinding {
  return { codeHead: gate.codeHead, gateId: gate.id, gateGeneration: gate.generation };
}

function approved(gate: Gate): Gate {
  return value(recordGateEvidence(gate, gate.generation, approval(bindingOf(gate)), LATER));
}

function reopenedAt(gate: Gate, codeHead: CodeHeadIdentity): Gate {
  return value(reopenGateAtCodeHead(gate, gate.generation, { subject: [SPEC], codeHead }, LATER));
}

const OTHER_GENERATION = 'gate code-review accepts only evidence recorded for its current generation';

function assertSupersededRefused(gate: Gate, superseded: GateEvidence | undefined): void {
  assert.ok(superseded !== undefined);
  assertRefused(recordGateEvidence(gate, gate.generation, superseded, LATER), 'precondition-failed', OTHER_GENERATION);
  assert.equal(approved(gate).state, 'passed');
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
  const edited = value(markGateStale(passed, passed.generation, EDITED_SPEC, LATER));
  assertRefused(reopenGate(edited, edited.generation, [SPEC], LATER), 'precondition-failed',
    'gate code-review is head-bound and reopens only at a code head');
  assertSupersededRefused(reopenedAt(edited, REVIEWED_HEAD), superseded);
  const moved = value(markGateStaleByCodeHead(passed, passed.generation, EDIT_HEAD, LATER));
  const reverted = reopenedAt(moved, REVERT_HEAD);
  assert.equal(reverted.state, 'pending');
  assert.equal(reverted.decision, undefined);
  assertRefused(recordGateEvidence(reverted, reverted.generation, superseded, LATER), 'precondition-failed',
    'gate code-review accepts only evidence recorded at its code head');
  assert.equal(approved(reverted).state, 'passed');
});

test('a gate without a code head does not take a superseded approval after an edit and its revert', () => {
  const passed = approved(reviewGate(null));
  const edited = value(markGateStale(passed, passed.generation, EDITED_SPEC, LATER));
  assertSupersededRefused(value(reopenGate(edited, edited.generation, [SPEC], LATER)), passed.decision);
});

test('an approval for one gate does not pass another gate with the same kind, subject, and head', () => {
  const first = reviewGate();
  const forFirst = approval(bindingOf(first));
  const parallel = reviewGate(REVIEWED_HEAD, 'second-review');
  assertRefused(recordGateEvidence(parallel, parallel.generation, forFirst, LATER), 'precondition-failed',
    'gate second-review accepts only evidence recorded for it');
  const passed = value(recordGateEvidence(first, first.generation, forFirst, LATER));
  value(markGateStaleByCodeHead(passed, passed.generation, EDIT_HEAD, LATER));
  const later = reviewGate(REVIEWED_HEAD, 'second-review');
  assertRefused(recordGateEvidence(later, later.generation, forFirst, LATER), 'precondition-failed',
    'gate second-review accepts only evidence recorded for it');
  assert.equal(approved(later).state, 'passed');
});

test('a superseded approval does not pass a gate reopened at its head after an artifact edit', () => {
  const passed = approved(reviewGate());
  const edited = value(markGateStale(passed, passed.generation, EDITED_SPEC, LATER));
  assertSupersededRefused(reopenedAt(edited, REVIEWED_HEAD), passed.decision);
});

test('a superseded approval does not pass a gate reopened at its head after another head', () => {
  const passed = approved(reviewGate());
  const moved = value(markGateStaleByCodeHead(passed, passed.generation, EDIT_HEAD, LATER));
  assertSupersededRefused(reopenedAt(moved, REVIEWED_HEAD), passed.decision);
  const passedAtEdit = approved(reopenedAt(moved, EDIT_HEAD));
  const returned = value(markGateStaleByCodeHead(passedAtEdit, passedAtEdit.generation, REVIEWED_HEAD, LATER));
  assertSupersededRefused(reopenedAt(returned, REVIEWED_HEAD), passed.decision);
});

test('every gate needs evidence recorded for it at its current generation', () => {
  for (const pending of [reviewGate(), reviewGate(null)]) {
    const bound = bindingOf(pending);
    const other = (pending.generation + 1) as Generation;
    for (const forAnother of [{ ...bound, gateId: undefined }, { ...bound, gateId: 'second-review' }]) {
      assertRefused(recordGateEvidence(pending, pending.generation, approval(forAnother), LATER), 'precondition-failed',
        'gate code-review accepts only evidence recorded for it');
    }
    for (const unbound of [{ ...bound, gateGeneration: undefined }, { ...bound, gateGeneration: other }]) {
      assertRefused(recordGateEvidence(pending, pending.generation, approval(unbound), LATER), 'precondition-failed',
        OTHER_GENERATION);
    }
  }
});

test('evidence from another code head is rejected', () => {
  const pending = reviewGate();
  for (const codeHead of [EDIT_HEAD, head('1', 'a', 'acme/other'), undefined]) {
    const foreign = approval({ ...bindingOf(pending), codeHead });
    assertRefused(recordGateEvidence(pending, pending.generation, foreign, LATER), 'precondition-failed',
      'gate code-review accepts only evidence recorded at its code head');
  }
  assert.equal(approved(pending).state, 'passed');
});

test('a gate without a code head ignores code heads', () => {
  const pending = reviewGate(null);
  assert.equal(pending.codeHead, undefined);
  assert.equal(isGateOutdatedByCodeHead(pending, EDIT_HEAD), false);
  assertRefused(markGateStaleByCodeHead(pending, pending.generation, EDIT_HEAD, LATER), 'precondition-failed',
    'gate code-review is not outdated by that code head');
  for (const codeHead of [EDIT_HEAD, undefined]) {
    const anyHead = approval({ ...bindingOf(pending), codeHead });
    assert.equal(value(recordGateEvidence(pending, pending.generation, anyHead, LATER)).state, 'passed');
  }
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
  const evidence = approval({ codeHead });
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

test('reopening checks the transition before the head binding', () => {
  for (const passed of [approved(reviewGate()), approved(reviewGate(null))]) {
    const target = { subject: [SPEC], codeHead: EDIT_HEAD };
    for (const result of [
      reopenGate(passed, passed.generation, [SPEC], LATER),
      reopenGateAtCodeHead(passed, passed.generation, target, LATER),
    ]) {
      assertRefused(result, 'precondition-failed', 'gate code-review cannot change from passed to pending');
    }
  }
});

test('isSameCodeHead needs the repository, the commit, and the tree to match', () => {
  assert.ok(isSameCodeHead(head('1', 'a'), head('1', 'a')));
  assert.ok(!isSameCodeHead(head('1', 'a'), head('2', 'a')));
  assert.ok(!isSameCodeHead(head('1', 'a'), head('1', 'b')));
  assert.ok(!isSameCodeHead(head('1', 'a'), head('1', 'a', 'acme/other')));
});
