import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_EVENT_TYPE_LENGTH, parseEventMetadata, parseEventType, parseSchemaVersion, type EventMetadataInput,
} from '@taskelith/kernel';

const input: EventMetadataInput = {
  eventId: 'evt-1',
  eventType: 'sdlc.gate.passed',
  schemaVersion: 1,
  occurredAt: '2026-10-24T09:30:00.000Z',
  correlationId: 'corr-1',
};

test('parseEventMetadata accepts metadata without a causation identity', () => {
  const result = parseEventMetadata(input);
  assert.deepEqual(result, { ok: true, value: input });
  assert.ok(result.ok && Object.isFrozen(result.value));
  assert.equal(result.ok && 'causationId' in result.value, false);
});

test('parseEventMetadata keeps a causation identity', () => {
  const result = parseEventMetadata({ ...input, causationId: 'cmd-7' });
  assert.deepEqual(result, { ok: true, value: { ...input, causationId: 'cmd-7' } });
  assert.ok(result.ok && Object.isFrozen(result.value));
});

test('parseEventMetadata names the first invalid field', () => {
  const cases: Array<[Partial<EventMetadataInput>, string]> = [
    [{ eventId: '' }, 'eventId'],
    [{ eventType: 'GatePassed' }, 'eventType'],
    [{ schemaVersion: 0 }, 'schemaVersion'],
    [{ occurredAt: '2026-10-24' }, 'occurredAt'],
    [{ correlationId: 'has space' }, 'correlationId'],
    [{ causationId: '' }, 'causationId'],
  ];
  for (const [override, field] of cases) {
    const result = parseEventMetadata({ ...input, ...override });
    assert.equal(result.ok, false, field);
    assert.equal(!result.ok && result.error.code, 'invalid');
    assert.equal(!result.ok && result.error.details.field, field);
    assert.match(!result.ok ? result.error.message : '', new RegExp(`^${field}: `));
  }
});

test('parseEventMetadata reports only the first invalid field in field order', () => {
  const result = parseEventMetadata({ ...input, eventType: 'GatePassed', occurredAt: '2026-10-24' });
  assert.equal(!result.ok && result.error.details.field, 'eventType');
});

test('parseEventType requires dot-separated lowercase segments', () => {
  const longest = `a.${'b'.repeat(MAX_EVENT_TYPE_LENGTH - 2)}`;
  for (const text of ['sdlc.gate.passed', 'execution.attempt-started', 'a.b', 'v2.gate-1', longest]) {
    assert.deepEqual(parseEventType(text), { ok: true, value: text });
  }
  for (const text of ['', 'sdlc', 'Sdlc.gate', 'sdlc..gate', 'sdlc.gate.', '1sdlc.gate', 'sdlc.gate_passed', 'sdlc.gate-', 'a-.b', 'a.b--c', 'a.-b', `${longest}b`]) {
    assert.equal(parseEventType(text).ok, false, text);
  }
});

test('parseSchemaVersion requires a positive integer', () => {
  assert.deepEqual(parseSchemaVersion(3), { ok: true, value: 3 });
  for (const value of [0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(parseSchemaVersion(value).ok, false, String(value));
  }
});
