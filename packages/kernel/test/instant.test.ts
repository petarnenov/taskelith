import assert from 'node:assert/strict';
import test from 'node:test';
import { instantFromEpochMilliseconds, parseInstant } from '@taskelith/kernel';

test('parseInstant accepts canonical UTC timestamps', () => {
  for (const text of ['2026-10-24T09:30:00.000Z', '1970-01-01T00:00:00.000Z', '2024-02-29T23:59:59.999Z']) {
    assert.deepEqual(parseInstant(text), { ok: true, value: text });
  }
});

test('parseInstant rejects non-canonical and impossible timestamps', () => {
  for (const text of [
    '', '2026-10-24', '2026-10-24T09:30:00Z', '2026-10-24T09:30:00.000+02:00',
    '2026-10-24t09:30:00.000z', '2026-02-30T00:00:00.000Z', '2026-10-24T24:00:00.000Z', 'not a time',
  ]) {
    const result = parseInstant(text);
    assert.equal(result.ok, false, text);
    assert.equal(!result.ok && result.error.code, 'invalid');
  }
});

test('instantFromEpochMilliseconds converts a given time without reading a clock', () => {
  assert.deepEqual(instantFromEpochMilliseconds(0), { ok: true, value: '1970-01-01T00:00:00.000Z' });
  assert.deepEqual(instantFromEpochMilliseconds(Date.UTC(2026, 9, 24, 9, 30)), { ok: true, value: '2026-10-24T09:30:00.000Z' });
});

test('instantFromEpochMilliseconds rejects values without a canonical form', () => {
  for (const milliseconds of [1.5, Number.NaN, Number.POSITIVE_INFINITY, 8.64e15 + 1, Date.UTC(10000, 0, 1), Date.UTC(-1, 0, 1)]) {
    const result = instantFromEpochMilliseconds(milliseconds);
    assert.equal(result.ok, false, String(milliseconds));
    assert.equal(!result.ok && result.error.code, 'invalid');
  }
});
