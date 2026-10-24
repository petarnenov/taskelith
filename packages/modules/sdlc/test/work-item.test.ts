import assert from 'node:assert/strict';
import test from 'node:test';
import { parseWorkItem } from '@taskelith/sdlc';

test('parseWorkItem pairs a stable identifier with the native reference', () => {
  const input = { id: '7d1c0e9a-1111-4a2b-8c3d-0e1f2a3b4c5d', nativeReference: 'specs/001-photo-albums' };
  const result = parseWorkItem(input);
  assert.deepEqual(result, { ok: true, value: input });
  assert.ok(result.ok && Object.isFrozen(result.value));
});

test('parseWorkItem names the invalid field', () => {
  for (const [field, input] of [
    ['id', { id: '', nativeReference: 'change' }],
    ['nativeReference', { id: 'work-1', nativeReference: '' }],
  ] as const) {
    const result = parseWorkItem(input);
    assert.equal(!result.ok && result.error.code, 'invalid');
    assert.equal(!result.ok && result.error.details.field, field);
  }
});
