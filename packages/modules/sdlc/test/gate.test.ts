import assert from 'node:assert/strict';
import test from 'node:test';
import { parseIdentifier, parseInstant, type Instant } from '@taskelith/kernel';
import {
  GATE_STATES,
  GATE_TRANSITIONS,
  MAX_BLOCK_REASON_LENGTH,
  blockGate,
  isGateOutdatedBy,
  markGateStale,
  openGate,
  parseArtifactRevision,
  parseBlockReason,
  parseGeneration,
  parsePlatformRecord,
  parseSemanticApproval,
  parseStructuralValidation,
  recordGateEvidence,
  reopenGate,
  type ArtifactRevision,
  type Gate,
  type GateEvidence,
  type GateInput,
  type GateState,
  type Generation,
} from '@taskelith/sdlc';
import { value } from '@taskelith/testing';

function instant(text: string): Instant {
  const result = parseInstant(text);
  assert.ok(result.ok);
  return result.value;
}

function generation(value: number): Generation {
  const result = parseGeneration(value);
  assert.ok(result.ok);
  return result.value;
}

function revision(artifactId: string, digestByte: string, nativeReference = `${artifactId}.md@0000000`): ArtifactRevision {
  const result = parseArtifactRevision({ artifactId, digest: `sha256:${digestByte.repeat(32)}`, nativeReference });
  assert.ok(result.ok);
  return result.value;
}

const OPENED_AT = instant('2026-10-24T09:00:00.000Z');
const LATER = instant('2026-10-24T10:00:00.000Z');
const SPEC = revision('spec', 'aa');
const DESIGN = revision('design', 'bb');
const NEW_SPEC = revision('spec', 'cc');
const SUBJECT = [SPEC, DESIGN];

function gateInput(change: Partial<GateInput> = {}): GateInput {
  return { id: 'specs-approval', stageId: 'specs', requiredEvidence: 'semantic-approval', subject: SUBJECT, ...change };
}

function open(change: Partial<GateInput> = {}): Gate {
  const result = openGate(gateInput(change), OPENED_AT);
  assert.ok(result.ok);
  return result.value;
}

function approval(verdict: string, subject: readonly ArtifactRevision[] = SUBJECT): GateEvidence {
  const result = parseSemanticApproval({ approver: 'reviewer-1', verdict, subject, recordedAt: LATER, reference: 'review record 7' });
  assert.ok(result.ok);
  return result.value;
}

function validation(verdict: string): GateEvidence {
  const result = parseStructuralValidation({ validator: 'schema-check', verdict, subject: SUBJECT, recordedAt: LATER, reference: 'validate.log' });
  assert.ok(result.ok);
  return result.value;
}

function platformRecord(verdict: string): GateEvidence {
  const result = parsePlatformRecord({ recorder: 'platform', verdict, subject: SUBJECT, recordedAt: LATER, reference: 'checkbox' });
  assert.ok(result.ok);
  return result.value;
}

// Reaches each state through allowed transitions only.
function gateIn(state: GateState): Gate {
  const pending = open();
  const first = pending.generation;
  switch (state) {
    case 'pending': return pending;
    case 'passed': return value(recordGateEvidence(pending, first, approval('approved'), LATER));
    case 'failed': return value(recordGateEvidence(pending, first, approval('rejected'), LATER));
    case 'blocked': return value(blockGate(pending, first, 'mandatory policy revision missing', LATER));
    case 'stale': return value(markGateStale(pending, first, NEW_SPEC, LATER));
  }
}

// Applies the one operation that moves a gate to the given state.
function moveTo(gate: Gate, state: GateState): ReturnType<typeof openGate> {
  switch (state) {
    case 'pending': return reopenGate(gate, gate.generation, [NEW_SPEC, DESIGN], LATER);
    case 'passed': return recordGateEvidence(gate, gate.generation, approval('approved'), LATER);
    case 'failed': return recordGateEvidence(gate, gate.generation, approval('rejected'), LATER);
    case 'blocked': return blockGate(gate, gate.generation, 'waiting for policy', LATER);
    case 'stale': return markGateStale(gate, gate.generation, NEW_SPEC, LATER);
  }
}

function assertRejected(result: ReturnType<typeof openGate>, code: string, details: Record<string, string>): void {
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.error.code, code);
  assert.deepEqual(!result.ok && result.error.details, details);
}

test('openGate opens a frozen pending gate at the first generation', () => {
  const gate = open();
  assert.deepEqual(gate, {
    id: 'specs-approval',
    stageId: 'specs',
    requiredEvidence: 'semantic-approval',
    subject: SUBJECT,
    state: 'pending',
    generation: 1,
    changedAt: OPENED_AT,
  });
  assert.ok(Object.isFrozen(gate));
  assert.ok(Object.isFrozen(gate.subject));
});

test('openGate does not share the subject array with its input', () => {
  const subject = [SPEC];
  const gate = open({ subject });
  subject.push(DESIGN);
  assert.deepEqual(gate.subject, [SPEC]);
});

test('openGate names the invalid field', () => {
  const kindMessage = (kind: string): string => {
    const result = parseIdentifier(kind, '');
    assert.ok(!result.ok);
    return result.error.message;
  };
  const cases: [Partial<GateInput>, string, Record<string, string>][] = [
    [{ id: '' }, `id: ${kindMessage('GateId')}`, { kind: 'GateId', field: 'id' }],
    [{ stageId: 'a b' }, `stageId: ${kindMessage('StageId')}`, { kind: 'StageId', field: 'stageId' }],
    [{ requiredEvidence: 'checkbox' }, 'requiredEvidence: EvidenceKind must be one of structural-validation, semantic-approval, platform-record', { field: 'requiredEvidence' }],
    [{ subject: [] }, 'subject: a gate subject needs at least one artifact revision', { field: 'subject' }],
    [{ subject: [SPEC, NEW_SPEC] }, 'subject: artifact spec is listed twice', { field: 'subject' }],
  ];
  for (const [change, message, details] of cases) {
    const result = openGate(gateInput(change), OPENED_AT);
    assert.equal(!result.ok && result.error.code, 'invalid');
    assert.equal(!result.ok && result.error.message, message);
    assert.deepEqual(!result.ok && result.error.details, details);
  }
});

test('the gate transition table allows exactly the documented transitions', () => {
  assert.deepEqual(GATE_TRANSITIONS, {
    pending: ['passed', 'failed', 'blocked', 'stale'],
    passed: ['stale'],
    failed: ['pending', 'stale'],
    stale: ['pending'],
    blocked: ['pending', 'stale'],
  });
  assert.ok(Object.isFrozen(GATE_TRANSITIONS));
  for (const state of GATE_STATES) assert.ok(Object.isFrozen(GATE_TRANSITIONS[state]));
});

test('every gate transition outside the table is rejected and every one in it is accepted', () => {
  for (const from of GATE_STATES) {
    for (const to of GATE_STATES) {
      const gate = gateIn(from);
      const result = moveTo(gate, to);
      if (GATE_TRANSITIONS[from].includes(to)) {
        assert.equal(result.ok && result.value.state, to, `${from} -> ${to}`);
        assert.equal(result.ok && result.value.generation, gate.generation + 1);
        assert.equal(result.ok && result.value.changedAt, LATER);
        assert.ok(result.ok && Object.isFrozen(result.value));
      } else {
        assertRejected(result, 'precondition-failed', { gate: 'specs-approval', from, to });
        assert.equal(!result.ok && result.error.message, `gate specs-approval cannot change from ${from} to ${to}`);
      }
    }
  }
});

test('a writer with an outdated generation is rejected and the gate is unchanged', () => {
  const gate = gateIn('passed');
  const outdated = generation(1);
  for (const result of [
    recordGateEvidence(gate, outdated, approval('approved'), LATER),
    blockGate(gate, outdated, 'reason', LATER),
    reopenGate(gate, outdated, SUBJECT, LATER),
    markGateStale(gate, outdated, NEW_SPEC, LATER),
  ]) {
    assertRejected(result, 'conflict', { expected: '1', actual: '2' });
    assert.equal(!result.ok && result.error.message, 'gate specs-approval is at generation 2, not the expected generation 1');
  }
  assert.equal(gate.state, 'passed');
});

test('approved evidence passes a semantic gate and records the decision', () => {
  const evidence = approval('approved');
  const gate = value(recordGateEvidence(open(), generation(1), evidence, LATER));
  assert.equal(gate.state, 'passed');
  assert.equal(gate.decision, evidence);
});

test('rejected evidence fails a semantic gate', () => {
  assert.equal(gateIn('failed').state, 'failed');
});

test('structural validation and platform records cannot satisfy a semantic gate', () => {
  for (const evidence of [validation('valid'), platformRecord('satisfied')]) {
    assertRejected(recordGateEvidence(open(), generation(1), evidence, LATER), 'precondition-failed', {
      gate: 'specs-approval',
      required: 'semantic-approval',
      provided: evidence.kind,
    });
  }
});

test('a semantic approval cannot satisfy a structural or platform-managed gate', () => {
  const structural = open({ requiredEvidence: 'structural-validation' });
  const result = recordGateEvidence(structural, generation(1), approval('approved'), LATER);
  assert.equal(!result.ok && result.error.message, 'gate specs-approval requires structural-validation evidence, not semantic-approval');
  const platform = open({ requiredEvidence: 'platform-record' });
  assert.equal(!recordGateEvidence(platform, generation(1), approval('approved'), LATER).ok, true);
});

test('each evidence kind decides a gate that requires it', () => {
  const cases: [string, GateEvidence, GateEvidence][] = [
    ['structural-validation', validation('valid'), validation('invalid')],
    ['platform-record', platformRecord('satisfied'), platformRecord('unsatisfied')],
  ];
  for (const [requiredEvidence, passing, failing] of cases) {
    assert.equal(value(recordGateEvidence(open({ requiredEvidence }), generation(1), passing, LATER)).state, 'passed');
    assert.equal(value(recordGateEvidence(open({ requiredEvidence }), generation(1), failing, LATER)).state, 'failed');
  }
});

test('evidence about other revisions cannot decide a gate', () => {
  for (const subject of [[SPEC], [NEW_SPEC, DESIGN], [SPEC, DESIGN, revision('tasks', 'dd')]]) {
    const result = recordGateEvidence(open(), generation(1), approval('approved', subject), LATER);
    assertRejected(result, 'precondition-failed', { gate: 'specs-approval' });
    assert.equal(!result.ok && result.error.message, 'gate specs-approval accepts only evidence about exactly its subject revisions');
  }
});

test('evidence listing the subject revisions in another order decides the gate', () => {
  assert.equal(value(recordGateEvidence(open(), generation(1), approval('approved', [DESIGN, SPEC]), LATER)).state, 'passed');
});

test('evidence about the same content read elsewhere decides the gate', () => {
  const readElsewhere = [revision('spec', 'aa', 'worktree/spec.md@1111111'), DESIGN];
  assert.equal(value(recordGateEvidence(open(), generation(1), approval('approved', readElsewhere), LATER)).state, 'passed');
});

test('a new revision of a subject artifact outdates the gate; the same content or another artifact does not', () => {
  const gate = open();
  assert.equal(isGateOutdatedBy(gate, NEW_SPEC), true);
  assert.equal(isGateOutdatedBy(gate, revision('spec', 'aa', 'worktree/spec.md@1111111')), false);
  assert.equal(isGateOutdatedBy(gate, revision('tasks', 'dd')), false);
});

test('markGateStale keeps the superseded decision and rejects a revision that does not outdate the gate', () => {
  const passed = gateIn('passed');
  const stale = value(markGateStale(passed, passed.generation, NEW_SPEC, LATER));
  assert.equal(stale.state, 'stale');
  assert.equal(stale.decision, passed.decision);
  assert.equal(gateIn('stale').decision, undefined);
  assertRejected(markGateStale(passed, passed.generation, revision('tasks', 'dd'), LATER), 'precondition-failed', { gate: 'specs-approval', artifact: 'tasks' });
});

test('reopenGate replaces the subject and clears the decision and block reason', () => {
  for (const state of ['failed', 'stale', 'blocked'] as const) {
    const gate = gateIn(state);
    const reopened = value(reopenGate(gate, gate.generation, [NEW_SPEC, DESIGN], LATER));
    assert.equal(reopened.state, 'pending');
    assert.deepEqual(reopened.subject, [NEW_SPEC, DESIGN]);
    assert.equal(reopened.decision, undefined);
    assert.equal(reopened.blockReason, undefined);
  }
  const failed = gateIn('failed');
  assertRejected(reopenGate(failed, failed.generation, [], LATER), 'invalid', { field: 'subject' });
});

test('blockGate records a reason and rejects an invalid one', () => {
  assert.equal(gateIn('blocked').blockReason, 'mandatory policy revision missing');
  for (const reason of ['', 'line\nbreak', 'x'.repeat(MAX_BLOCK_REASON_LENGTH + 1)]) {
    const result = blockGate(open(), generation(1), reason, LATER);
    assertRejected(result, 'invalid', { field: 'reason' });
    assert.equal(!result.ok && result.error.message, `reason: BlockReason must be 1-${MAX_BLOCK_REASON_LENGTH} characters without control characters`);
  }
  assert.deepEqual(parseBlockReason('policy conflict'), { ok: true, value: 'policy conflict' });
});

test('parseGeneration accepts positive integers only', () => {
  assert.deepEqual(parseGeneration(7), { ok: true, value: 7 });
  for (const number of [0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(parseGeneration(number).ok, false);
  }
});

test('a gate made stale by a new specification passes again only after reopening and new evidence', () => {
  const passed = gateIn('passed');
  const stale = value(markGateStale(passed, passed.generation, NEW_SPEC, LATER));
  const newSubject = [NEW_SPEC, DESIGN];
  assert.equal(recordGateEvidence(stale, stale.generation, approval('approved', newSubject), LATER).ok, false);
  const reopened = value(reopenGate(stale, stale.generation, newSubject, LATER));
  assert.equal(recordGateEvidence(reopened, reopened.generation, approval('approved'), LATER).ok, false);
  const approved = value(recordGateEvidence(reopened, reopened.generation, approval('approved', newSubject), LATER));
  assert.equal(approved.state, 'passed');
  assert.equal(approved.generation, 5);
});

test('the same transition applied twice gives equal results', () => {
  const gate = open();
  const evidence = approval('approved');
  assert.deepEqual(recordGateEvidence(gate, gate.generation, evidence, LATER), recordGateEvidence(gate, gate.generation, evidence, LATER));
});
