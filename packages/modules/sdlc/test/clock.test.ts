import assert from 'node:assert/strict';
import test from 'node:test';
import { parseInstant, type Instant } from '@taskelith/kernel';
import type { Clock } from '@taskelith/sdlc';
import { SimulatedHost } from '@taskelith/testing';

const START = '2026-10-25T12:00:00.000Z' as Instant;

test('the simulated wall clock serves as the SDLC module Clock port', () => {
  const clock: Clock = new SimulatedHost(START).wallClock;
  assert.deepEqual(parseInstant(clock.now()), { ok: true, value: START });
});
