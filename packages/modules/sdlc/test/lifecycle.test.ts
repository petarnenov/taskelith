import assert from 'node:assert/strict';
import test from 'node:test';
import { LIFECYCLE_OBLIGATIONS, STAGE_ORIGINS, parseLifecycleObligation, parseStageOrigin } from '@taskelith/sdlc';

test('the lifecycle obligations are the six the architecture requires', () => {
  assert.deepEqual(LIFECYCLE_OBLIGATIONS, ['intake', 'specification', 'implementation', 'review', 'verification', 'closure']);
});

test('parseLifecycleObligation accepts each obligation and rejects other text', () => {
  for (const obligation of LIFECYCLE_OBLIGATIONS) assert.deepEqual(parseLifecycleObligation(obligation), { ok: true, value: obligation });
  for (const text of ['', 'Intake', 'planning', 'release']) {
    const result = parseLifecycleObligation(text);
    assert.equal(!result.ok && result.error.code, 'invalid');
  }
});

test('parseStageOrigin accepts native and platform-managed stages only', () => {
  for (const origin of STAGE_ORIGINS) assert.deepEqual(parseStageOrigin(origin), { ok: true, value: origin });
  for (const text of ['', 'Native', 'platform']) {
    const result = parseStageOrigin(text);
    assert.equal(!result.ok && result.error.code, 'invalid');
  }
});

test('the obligation and origin lists cannot be changed at run time', () => {
  assert.ok(Object.isFrozen(LIFECYCLE_OBLIGATIONS));
  assert.ok(Object.isFrozen(STAGE_ORIGINS));
});
